import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import ShipsPanel from './ShipsPanel.tsx'
import type { ModEntry } from './mods.ts'

const TABS = [
  { id: 'ships', label: 'Ships' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'portraits', label: 'Portraits' },
] as const

type TabId = (typeof TABS)[number]['id']

type AssetTabsProps = {
  // The mods folder and its mods, once a valid folder has been entered.
  modsFolder: { path: string; mods: ModEntry[] } | null
}

function AssetTabs({ modsFolder }: AssetTabsProps) {
  const [active, setActive] = useState<TabId>('ships')
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({})

  function focusTab(index: number) {
    const tab = TABS[(index + TABS.length) % TABS.length]
    setActive(tab.id)
    tabRefs.current[tab.id]?.focus()
  }

  // Arrow/Home/End navigation, per the WAI-ARIA tabs pattern.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((tab) => tab.id === active)
    const next = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: TABS.length - 1,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    focusTab(next)
  }

  const activeTab = TABS.find((tab) => tab.id === active)!

  return (
    <div className="asset-tabs">
      <div role="tablist" aria-label="Asset type" className="tab-list" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el
            }}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            className="tab"
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id={`panel-${activeTab.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.id}`}
        className="tab-panel"
        tabIndex={0}
      >
        {renderPanel(activeTab.id, activeTab.label, modsFolder)}
      </div>
    </div>
  )
}

function renderPanel(id: TabId, label: string, modsFolder: AssetTabsProps['modsFolder']) {
  if (id !== 'ships') return <p>{label} will appear here.</p>
  if (!modsFolder) return <p>Enter a mods folder to see ships.</p>
  // Keyed by path so a different mods folder starts with a fresh search and page 1.
  return <ShipsPanel key={modsFolder.path} modsPath={modsFolder.path} />
}

export default AssetTabs
