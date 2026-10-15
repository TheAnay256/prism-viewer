import { useState } from 'react'
import ModShips from './ModShips.tsx'

const MODS_PER_PAGE = 10

type ShipsPanelProps = {
  modsPath: string
  // Names of the mods that have a graphics/ships folder.
  mods: string[]
}

// Paginated list of mods, each showing its first few ship sprites.
function ShipsPanel({ modsPath, mods }: ShipsPanelProps) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(mods.length / MODS_PER_PAGE))
  // Clamp in case the mod list shrank while on a later page.
  const currentPage = Math.min(page, pageCount - 1)
  const start = currentPage * MODS_PER_PAGE
  const pageMods = mods.slice(start, start + MODS_PER_PAGE)

  return (
    <div className="ships-panel">
      <ul className="mod-list">
        {pageMods.map((mod) => (
          <li key={mod}>
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
