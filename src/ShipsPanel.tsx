import { useEffect, useMemo, useState } from 'react'
import ModShips from './ModShips.tsx'
import type { ShipMod } from './mods.ts'

const MODS_PER_PAGE = 10

type ShipsPanelProps = {
  modsPath: string
}

type ShipsLookup =
  | { path: string; ok: true; mods: ShipMod[] }
  | { path: string; ok: false; error: string }

// Keeps the mods with a ship matching every word of `query` (case-insensitive),
// where a ship matches a word if its mod name, hull name or manufacturer contains
// it. Each kept mod only lists its matching ships.
function filterShips(mods: ShipMod[], query: string): ShipMod[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return mods
  return mods
    .map((mod) => ({
      ...mod,
      ships: mod.ships.filter((ship) => {
        const text = [mod.name, ship.hullName, ship.manufacturer ?? ''].join('\n').toLowerCase()
        return words.every((word) => text.includes(word))
      }),
    }))
    .filter((mod) => mod.ships.length > 0)
}

// Searchable, paginated list of mods, each showing its ship sprites.
function ShipsPanel({ modsPath }: ShipsPanelProps) {
  const [lookup, setLookup] = useState<ShipsLookup | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/ships?${new URLSearchParams({ path: modsPath })}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json()
        setLookup(
          res.ok
            ? { path: modsPath, ok: true, mods: body.mods }
            : { path: modsPath, ok: false, error: body.error },
        )
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLookup({ path: modsPath, ok: false, error: String(err) })
      })
    return () => controller.abort()
  }, [modsPath])

  // Ignore results for a mods folder that is no longer selected.
  const current = lookup?.path === modsPath ? lookup : null
  const allMods = current?.ok ? current.mods : null
  const mods = useMemo(() => (allMods ? filterShips(allMods, query) : []), [allMods, query])

  if (!current) return <p>Loading ships…</p>
  if (!current.ok) return <p className="folder-status-error">{current.error}</p>
  if (current.mods.length === 0) return <p>No mods with ship hulls found.</p>

  const shipCount = mods.reduce((total, mod) => total + mod.ships.length, 0)
  const pageCount = Math.max(1, Math.ceil(mods.length / MODS_PER_PAGE))
  // Clamp in case the mod list shrank while on a later page.
  const currentPage = Math.min(page, pageCount - 1)
  const start = currentPage * MODS_PER_PAGE
  const pageMods = mods.slice(start, start + MODS_PER_PAGE)

  return (
    <div className="ships-panel">
      <div className="ship-search">
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(0)
          }}
          placeholder="Search by mod, ship or manufacturer"
          aria-label="Search ships by mod name, ship name or manufacturer"
          spellCheck={false}
          autoComplete="off"
        />
        {query.trim() && (
          <p role="status">
            {shipCount} {shipCount === 1 ? 'ship' : 'ships'} in {mods.length}{' '}
            {mods.length === 1 ? 'mod' : 'mods'}
          </p>
        )}
      </div>
      <ul className="mod-list">
        {pageMods.map((mod) => (
          <li key={mod.folder}>
            <ModShips modsPath={modsPath} mod={mod} />
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <nav className="pagination" aria-label="Ship mods pages">
          <button
            type="button"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 0}
          >
            Previous
          </button>
          <span>
            Page {currentPage + 1} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === pageCount - 1}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}

export default ShipsPanel
