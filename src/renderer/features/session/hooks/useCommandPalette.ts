import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../../../store/root.store'
import { findTabForSession } from '../../layout/layout-tree'

export interface PaletteItem {
  id: string
  label: string
  description?: string
  iconName: string
  action: () => void | Promise<void>
}

export function useCommandPalette(open: boolean, onClose: () => void, onShowShortcuts?: () => void): {
  query: string
  setQuery: (q: string) => void
  selectedIdx: number
  items: PaletteItem[]
} {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)

  const sessions = useStore((s) => s.sessions)
  const settings = useStore((s) => s.settings)
  const paneTree = useStore((s) => s.paneTree)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const setFocusedSession = useStore((s) => s.setFocusedSession)

  useEffect(() => {
    if (!open) { setQuery(''); setSelectedIdx(0) }
  }, [open])

  useEffect(() => setSelectedIdx(0), [query])

  const q = query.toLowerCase()

  const items = useMemo<PaletteItem[]>(() => {
    const result: PaletteItem[] = []
    const hk = settings.hotkeys

    Object.values(sessions)
      .filter((m) => m.status === 'running' && (!q || m.name.toLowerCase().includes(q)))
      .forEach((m) => result.push({
        id: `session-${m.sessionId}`,
        label: m.name,
        description: m.cwd,
        iconName: 'Terminal',
        action: () => {
          const tabId = findTabForSession(paneTree, m.sessionId)
          if (tabId) { setActiveSession(tabId); setFocusedSession(m.sessionId) }
          onClose()
        }
      }))

    const actions: PaletteItem[] = [
      { id: 'new-session',    label: 'New Session',        description: hk.newSession,    iconName: 'Plus',        action: () => { document.dispatchEvent(new CustomEvent('acc:new-session'));      onClose() } },
      { id: 'open-file',      label: 'File Tree',          description: hk.openFileFinder, iconName: 'FolderTree', action: () => { document.dispatchEvent(new CustomEvent('acc:open-file-finder')); onClose() } },
      { id: 'open-project',   label: 'Open Project',       description: hk.openProject,   iconName: 'FolderOpen',  action: () => { document.dispatchEvent(new CustomEvent('acc:open-project'));    onClose() } },
      { id: 'toggle-notes',   label: 'Toggle Notes',       description: hk.quickNote,     iconName: 'NotebookPen', action: () => { document.dispatchEvent(new CustomEvent('acc:quick-note'));   onClose() } },
      { id: 'show-shortcuts', label: 'Keyboard Shortcuts', description: hk.showShortcuts, iconName: 'Keyboard',    action: () => { onShowShortcuts?.(); onClose() } },
    ].filter((a) => !q || a.label.toLowerCase().includes(q))

    actions.forEach((a) => result.push(a))
    return result
  }, [sessions, settings.hotkeys, q, paneTree, setActiveSession, setFocusedSession, onClose, onShowShortcuts])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, items.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && items[selectedIdx]) items[selectedIdx].action()
  }, [open, items, selectedIdx, onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [handleKeyDown])

  return { query, setQuery, selectedIdx, items }
}
