import { useState } from 'react'
import type { ShipMod } from './mods.ts'

const SHIP_LIMIT = 5

type ModShipsProps = {
  modsPath: string
  mod: ShipMod
}

function modFileUrl(modsPath: string, mod: string, file: string) {
  const params = new URLSearchParams({ path: modsPath, mod, file })
  return `/api/mod-file?${params}`
}

// One mod's entry in the Ships tab: its name and the sprites of its first few ships.
// Clicking the entry expands it to show every ship, and clicking again collapses it.
function ModShips({ modsPath, mod }: ModShipsProps) {
  const [expanded, setExpanded] = useState(false)
  const ships = expanded ? mod.ships : mod.ships.slice(0, SHIP_LIMIT)

  return (
    // The click handler covers the whole box; the title button gives keyboard
    // and screen reader users the same toggle (its clicks bubble up to here).
    <section
      className={expanded ? 'mod-ships mod-ships-expanded' : 'mod-ships'}
      onClick={() => setExpanded(!expanded)}
    >
      <h3>
        <button type="button" className="mod-toggle" aria-expanded={expanded}>
          {mod.name}
        </button>
      </h3>
      <ul className="ship-grid">
        {ships.map((ship) => (
          <li key={ship.hullId}>
            <img
              src={modFileUrl(modsPath, mod.folder, ship.sprite)}
              alt={ship.hullName}
              title={ship.hullName}
              width={96}
              height={96}
              loading="lazy"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ModShips
