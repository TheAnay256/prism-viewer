import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type { ModEntry, ShipHull } from '../src/mods.ts'

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

// Subfolders of `dir` that contain a mod_info.json, with the asset folders each one has.
async function listModFolders(dir: string): Promise<ModEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  // stat follows symlinks, so linked mod folders are included too.
  const candidates = entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
  const hasModInfo = await Promise.all(
    candidates.map((entry) => isFile(path.join(dir, entry.name, 'mod_info.json'))),
  )
  const names = candidates
    .filter((_, i) => hasModInfo[i])
    .map((entry) => entry.name)
    .sort(byName)
  return Promise.all(
    names.map(async (name) => {
      const modDir = path.join(dir, name)
      const graphics = path.join(modDir, 'graphics')
      const [hasShips, hasWeapons, hasPortraits, hulls] = await Promise.all([
        isDirectory(path.join(graphics, 'ships')),
        isDirectory(path.join(graphics, 'weapons')),
        isDirectory(path.join(graphics, 'portraits')),
        findHulls(modDir, 1),
      ])
      return { name, hasShips, hasWeapons, hasPortraits, hasShipHulls: hulls.length > 0 }
    }),
  )
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

const MAX_HULL_FILE_BYTES = 1024 * 1024

// Reads one hull file, returning its name and sprite path (relative to the mod
// folder, forward slashes), or null if it isn't a usable hull definition.
async function readHull(file: string): Promise<ShipHull | null> {
  const info = await stat(file).catch(() => null)
  if (!info?.isFile() || info.size > MAX_HULL_FILE_BYTES) return null
  try {
    const hull = parseLooseJson(await readFile(file, 'utf8')) as Record<string, unknown>
    if (typeof hull?.spriteName !== 'string' || !hull.spriteName) return null
    const sprite = hull.spriteName.replace(/\\/g, '/').replace(/^\/+/, '')
    const name = typeof hull.hullName === 'string' && hull.hullName ? hull.hullName : path.basename(file)
    return { hullName: name, sprite }
  } catch {
    return null // Not JSON (e.g. ship_data.csv).
  }
}

// Hulls from the files in `modDir`/data/hulls, in file name order, keeping only
// those whose sprite is an image file inside the mod (wherever it sits under the
// mod, since not every mod keeps sprites in graphics/ships). Stops once `limit`
// are found.
async function findHulls(modDir: string, limit: number): Promise<ShipHull[]> {
  const hullsDir = path.join(modDir, 'data', 'hulls')
  const names = (await readdir(hullsDir).catch(() => [])).sort(byName)
  const found: ShipHull[] = []
  for (const name of names) {
    if (found.length >= limit) break
    const hull = await readHull(path.join(hullsDir, name))
    if (!hull) continue
    const sprite = path.resolve(modDir, hull.sprite)
    const isImage = path.extname(sprite).toLowerCase() in IMAGE_TYPES
    if (sprite.startsWith(modDir + path.sep) && isImage && (await isFile(sprite))) found.push(hull)
  }
  return found
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

  // GET /api/ship-hulls?path=<mods folder>&mod=<name>&limit=<n | all> -> { hulls: ShipHull[] }
  async '/api/ship-hulls'(params, res) {
    const modDir = await requireModFolder(params)
    const limitParam = params.get('limit')
    const limit =
      limitParam === 'all' ? Infinity : Math.max(1, Math.min(100, Number(limitParam) || 5))
    sendJson(res, 200, { hulls: await findHulls(modDir, limit) })
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
