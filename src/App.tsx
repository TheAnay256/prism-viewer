import { useEffect, useState } from 'react'
import './App.css'
import AssetTabs from './AssetTabs.tsx'
import type { ModEntry } from './mods.ts'

const MODS_PATH_KEY = 'prism-viewer:mods-path'
const LOOKUP_DELAY_MS = 300

type FolderLookup =
  | { path: string; ok: true; mods: ModEntry[] }
  | { path: string; ok: false; error: string }

function loadModsPath(): string {
  try {
    return localStorage.getItem(MODS_PATH_KEY) ?? ''
  } catch {
    return ''
  }
}

function App() {
  const [modsPath, setModsPath] = useState(loadModsPath)
  const [lookup, setLookup] = useState<FolderLookup | null>(null)
  const trimmedPath = modsPath.trim()

  useEffect(() => {
    if (!trimmedPath) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mods?path=${encodeURIComponent(trimmedPath)}`, {
          signal: controller.signal,
        })
        const body = await res.json()
        setLookup(
          res.ok
            ? { path: trimmedPath, ok: true, mods: body.mods }
            : { path: trimmedPath, ok: false, error: body.error },
        )
      } catch (err) {
        if (controller.signal.aborted) return
        setLookup({ path: trimmedPath, ok: false, error: String(err) })
      }
    }, LOOKUP_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmedPath])

  function updateModsPath(path: string) {
    setModsPath(path)
    try {
      localStorage.setItem(MODS_PATH_KEY, path)
    } catch {
      // Storage unavailable (e.g. private mode); keep the value for this session only.
    }
  }

  // Ignore results for a path the user has since edited.
  const current = lookup?.path === trimmedPath ? lookup : null

  return (
    <>
      <section id="center">
        <div>
          <h1>Prism Viewer</h1>
          <p>
            Analyze modded Starsector assets
          </p>
        </div>
        <AssetTabs modsFolder={current?.ok ? { path: current.path, mods: current.mods } : null} />
        <div className="folder-picker">
          <label htmlFor="mods-path">Mods folder</label>
          <input
            id="mods-path"
            type="text"
            value={modsPath}
            onChange={(event) => updateModsPath(event.target.value)}
            placeholder="/path/to/Starsector/mods"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        {current && !current.ok && (
          <p className="folder-status folder-status-error">{current.error}</p>
        )}
      </section>
    </>
  )
}

export default App
