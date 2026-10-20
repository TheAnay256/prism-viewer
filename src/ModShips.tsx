import { useEffect, useState } from 'react'
import type { ShipHull } from './mods.ts'

const SHIP_LIMIT = 5

type ModShipsProps = {
  modsPath: string
  // The mod's folder name, used in API requests.
  mod: string
  // The mod's display name.
  title: string
}

type HullLookup =
  | { key: string; ok: true; hulls: ShipHull[]; complete: boolean }
  | { key: string; ok: false; error: string }

function modFileUrl(modsPath: string, mod: string, file: string) {
  const params = new URLSearchParams({ path: modsPath, mod, file })
  return `/api/mod-file?${params}`
}

// One mod's entry in the Ships tab: its name and the sprites of its first few hulls.
// Clicking the entry expands it to show every hull, and clicking again collapses it.
function ModShips({ modsPath, mod, title }: ModShipsProps) {
  const [lookup, setLookup] = useState<HullLookup | null>(null)
  const [expanded, setExpanded] = useState(false)
  // Set on first expand and kept, so the full list is fetched once and reused.
  const [wantAll, setWantAll] = useState(false)
  const key = `${modsPath}\n${mod}`

  useEffect(() => {
    const controller = new AbortController()
    const limit = wantAll ? 'all' : String(SHIP_LIMIT)
    const params = new URLSearchParams({ path: modsPath, mod, limit })
    fetch(`/api/ship-hulls?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json()
        setLookup(
          res.ok
            ? { key, ok: true, hulls: body.hulls, complete: wantAll }
            : { key, ok: false, error: body.error },
        )
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLookup({ key, ok: false, error: String(err) })
      })
    return () => controller.abort()
  }, [key, modsPath, mod, wantAll])

  function toggleExpanded() {
    setExpanded(!expanded)
    setWantAll(true)
  }

  // Ignore results for a mod that is no longer selected.
  const current = lookup?.key === key ? lookup : null
  // The list only includes mods with hulls, but hide the entry if none turn up anyway.
  if (current?.ok && current.hulls.length === 0) return null
  const hulls = current?.ok ? (expanded ? current.hulls : current.hulls.slice(0, SHIP_LIMIT)) : []

  return (
    // The click handler covers the whole box; the title button gives keyboard
    // and screen reader users the same toggle (its clicks bubble up to here).
    <section className={expanded ? 'mod-ships mod-ships-expanded' : 'mod-ships'} onClick={toggleExpanded}>
      <h3>
        <button type="button" className="mod-toggle" aria-expanded={expanded}>
          {title}
        </button>
      </h3>
      {!current ? (
        <p>Loading ships…</p>
      ) : !current.ok ? (
        <p className="folder-status-error">{current.error}</p>
      ) : (
        <div>
          <ul className="ship-grid">
            {hulls.map((hull) => (
              <li key={hull.hullId}>
                <img
                  src={modFileUrl(modsPath, mod, hull.sprite)}
                  alt={hull.hullName}
                  title={hull.hullName}
                  width={96}
                  height={96}
                  loading="lazy"
                />
              </li>
            ))}
          </ul>
          {expanded && !current.complete && <p className="mod-ships-note">Loading all ships…</p>}
        </div>
      )}
    </section>
  )
}

export default ModShips
