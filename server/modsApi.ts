import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { ModEntry, ShipHull, ShipMod } from '../src/mods.ts'

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function isFile(file: string): Promise<boolean> {
  const info = await stat(file).catch(() => null)
  return info?.isFile() ?? false
}

async function isDirectory(dir: string): Promise<boolean> {
  const info = await stat(dir).catch(() => null)
  return info?.isDirectory() ?? false
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

// The `name` from a mod's mod_info.json, or null if it is missing or unreadable.
async function readModName(modDir: string): Promise<string | null> {
  try {
    const info = parseLooseJson(await readFile(path.join(modDir, 'mod_info.json'), 'utf8'))
    const name = (info as Record<string, unknown> | null)?.name
    return typeof name === 'string' && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

const byModName = (a: ModEntry, b: ModEntry) => byName(a.name, b.name) || byName(a.folder, b.folder)

// Subfolders of `dir` that contain a mod_info.json, with each mod's display name,
// sorted by display name.
async function listModFolders(dir: string): Promise<ModEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  // stat follows symlinks, so linked mod folders are included too.
  const candidates = entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
  const hasModInfo = await Promise.all(
    candidates.map((entry) => isFile(path.join(dir, entry.name, 'mod_info.json'))),
  )
  const folders = candidates.filter((_, i) => hasModInfo[i]).map((entry) => entry.name)
  const mods = await Promise.all(
    folders.map(async (folder) => ({
      folder,
      name: (await readModName(path.join(dir, folder))) ?? folder,
    })),
  )
  return mods.sort(byModName)
}

// Every mod in `dir` that has at least one ship, with all of its ships.
async function listShipMods(dir: string): Promise<ShipMod[]> {
  const mods = await listModFolders(dir)
  const withShips = await Promise.all(
    mods.map(async (mod) => ({
      ...mod,
      ships: await findShips(path.join(dir, mod.folder)),
    })),
  )
  return withShips.filter((mod) => mod.ships.length > 0)
}

// Starsector's data files are loose JSON: they may contain `#` or `//` comments
// and trailing commas. Strip those (outside strings), then parse normally.
function parseLooseJson(text: string): unknown {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (ch === '\\') out += text[++i] ?? ''
      else if (ch === '"') inString = false
    } else if (ch === '"') {
      inString = true
      out += ch
    } else if (ch === '#' || (ch === '/' && text[i + 1] === '/')) {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else {
      out += ch
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

// Parses CSV text (RFC 4180: quoted fields may hold commas, newlines and "" escapes)
// into rows of cells.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// One row of a mod's data/hulls/ship_data.csv.
type ShipDataRow = {
  id: string
  name: string | null
  manufacturer: string | null
}

// The rows of `modDir`/data/hulls/ship_data.csv, in file order. Commented-out rows
// (first cell starts with #), rows without an id and repeated ids are skipped.
// Returns no rows if the file is missing or has no `id` column.
async function readShipData(modDir: string): Promise<ShipDataRow[]> {
  const text = await readFile(path.join(modDir, 'data', 'hulls', 'ship_data.csv'), 'utf8').catch(
    () => '',
  )
  const [header = [], ...rows] = parseCsv(text)
  const columns = header.map((name) => name.trim().toLowerCase())
  const idCol = columns.indexOf('id')
  if (idCol === -1) return []
  const cell = (row: string[], name: string) => {
    const value = row[columns.indexOf(name)]?.trim()
    return value || null
  }
  const seen = new Set<string>()
  const result: ShipDataRow[] = []
  for (const row of rows) {
    if (row[0]?.trimStart().startsWith('#')) continue
    const id = row[idCol]?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({ id, name: cell(row, 'name'), manufacturer: cell(row, 'tech/manufacturer') })
  }
  return result
}

const MAX_HULL_FILE_BYTES = 1024 * 1024

// The parts of a .ship file the app uses.
type HullFile = {
  hullId: string | null
  hullName: string | null
  // Sprite path relative to the mod folder, with forward slashes.
  sprite: string
}

// Reads one .ship file, or returns null if it isn't a hull definition with a sprite.
async function readHull(file: string): Promise<HullFile | null> {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile() || info.size > MAX_HULL_FILE_BYTES) return null
  try {
    const hull = parseLooseJson(await readFile(file, 'utf8')) as Record<string, unknown>
    if (typeof hull?.spriteName !== 'string' || !hull.spriteName) return null
    const text = (value: unknown) => (typeof value === 'string' && value ? value : null)
    return {
      hullId: text(hull.hullId),
      hullName: text(hull.hullName),
      sprite: hull.spriteName.replace(/\\/g, '/').replace(/^\/+/, ''),
    }
  } catch {
    return null
  }
}

// Returns a function that finds the .ship file in `hullsDir` whose hullId matches
// an id. It tries `<id>.ship` first (the usual naming) and only falls back to
// reading every .ship file, once, when that file doesn't match.
function createHullFinder(hullsDir: string) {
  let index: Promise<Map<string, HullFile>> | null = null

  async function buildIndex() {
    const byId = new Map<string, HullFile>()
    const names = (await readdir(hullsDir).catch(() => [])).sort(byName)
    for (const name of names) {
      if (path.extname(name).toLowerCase() !== '.ship') continue
      const hull = await readHull(path.join(hullsDir, name))
      if (hull?.hullId && !byId.has(hull.hullId)) byId.set(hull.hullId, hull)
    }
    return byId
  }

  return async (id: string): Promise<HullFile | null> => {
    if (!/[/\\]/.test(id)) {
      const hull = await readHull(path.join(hullsDir, `${id}.ship`))
      if (hull?.hullId === id) return hull
    }
    index ??= buildIndex()
    return (await index).get(id) ?? null
  }
}

// Whether `sprite` (relative to `modDir`) is an image file inside the mod. Sprites
// can sit anywhere in the mod, since not every mod keeps them in graphics/ships.
async function isModImage(modDir: string, sprite: string): Promise<boolean> {
  const file = path.resolve(modDir, sprite)
  const isImage = path.extname(file).toLowerCase() in IMAGE_TYPES
  return file.startsWith(modDir + path.sep) && isImage && (await isFile(file))
}

// The mod's ships, in ship_data.csv order: each row with a name whose id has a
// matching .ship file with a sprite image inside the mod.
async function findShips(modDir: string): Promise<ShipHull[]> {
  const findHull = createHullFinder(path.join(modDir, 'data', 'hulls'))
  const ships: ShipHull[] = []
  for (const row of await readShipData(modDir)) {
    if (!row.name) continue
    const hull = await findHull(row.id)
    if (!hull || !(await isModImage(modDir, hull.sprite))) continue
    ships.push({
      hullId: row.id,
      hullName: row.name,
      sprite: hull.sprite,
      manufacturer: row.manufacturer,
    })
  }
  return ships
}

async function requireFolder(dir: string) {
  if (!path.isAbsolute(dir)) throw new HttpError(400, 'Path must be absolute')
  if (!(await isDirectory(dir))) throw new HttpError(404, 'Folder not found')
}

// Resolves the `path` (mods folder) and `mod` query params to a mod's folder.
async function requireModFolder(params: URLSearchParams): Promise<string> {
  const root = params.get('path')?.trim() ?? ''
  const mod = params.get('mod') ?? ''
  await requireFolder(root)
  if (!mod || mod === '.' || mod === '..' || /[/\\]/.test(mod)) {
    throw new HttpError(400, 'Invalid mod name')
  }
  const modDir = path.join(root, mod)
  if (!(await isFile(path.join(modDir, 'mod_info.json')))) throw new HttpError(404, 'Mod not found')
  return modDir
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

type Handler = (params: URLSearchParams, res: ServerResponse) => Promise<void>

const routes: Record<string, Handler> = {
  // GET /api/mods?path=<mods folder> -> { mods: ModEntry[] }
  async '/api/mods'(params, res) {
    const dir = params.get('path')?.trim() ?? ''
    await requireFolder(dir)
    const mods = await listModFolders(dir).catch(() => {
      throw new HttpError(403, 'Folder could not be read')
    })
    sendJson(res, 200, { mods })
  },

  // GET /api/ships?path=<mods folder> -> { mods: ShipMod[] }
  async '/api/ships'(params, res) {
    const dir = params.get('path')?.trim() ?? ''
    await requireFolder(dir)
    const mods = await listShipMods(dir).catch(() => {
      throw new HttpError(403, 'Folder could not be read')
    })
    sendJson(res, 200, { mods })
  },

  // GET /api/mod-file?path=<mods folder>&mod=<name>&file=<path in mod> -> image bytes
  async '/api/mod-file'(params, res) {
    const modDir = await requireModFolder(params)
    const file = path.resolve(modDir, params.get('file') ?? '')
    if (!file.startsWith(modDir + path.sep)) throw new HttpError(400, 'File is outside the mod')
    const type = IMAGE_TYPES[path.extname(file).toLowerCase()]
    if (!type) throw new HttpError(400, 'Not an image')
    if (!(await isFile(file))) throw new HttpError(404, 'File not found')
    res.statusCode = 200
    res.setHeader('Content-Type', type)
    createReadStream(file)
      .on('error', () => res.destroy())
      .pipe(res)
  },
}

async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '', 'http://localhost')
  const route = routes[url.pathname]
  if (!route) return next()
  try {
    await route(url.searchParams, res)
  } catch (err) {
    if (err instanceof HttpError) sendJson(res, err.status, { error: err.message })
    else sendJson(res, 500, { error: 'Unexpected server error' })
  }
}

// Serves filesystem queries for the app from the Vite dev and preview servers.
export function modsApi(): Plugin {
  return {
    name: 'prism-viewer-mods-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next))
    },
  }
}
