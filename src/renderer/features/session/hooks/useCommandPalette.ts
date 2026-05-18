import { useState, useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../../../store/root.store'

export interface PaletteItem {
  id: string
  label: string
  description?: string
  iconName: string
  section?: string
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

  const settings = useStore((s) => s.settings)

  useEffect(() => {
    if (!open) { setQuery(''); setSelectedIdx(0) }
  }, [open])

  useEffect(() => setSelectedIdx(0), [query])

  const q = query.toLowerCase()

  const items = useMemo<PaletteItem[]>(() => {
    const hk = settings.hotkeys

    return [
      { id: 'new-session',    label: 'New Terminal',       description: hk.newSession,    iconName: 'Plus',      section: 'Commands', action: () => { document.dispatchEvent(new CustomEvent('acc:new-session'));       onClose() } },
      { id: 'open-project',   label: 'Open Folder',        description: hk.openProject,  iconName: 'FolderOpen', section: 'Commands', action: () => { document.dispatchEvent(new CustomEvent('acc:open-project'));     onClose() } },
      { id: 'open-settings',  label: 'Open Settings',      description: '',              iconName: 'Settings',   section: 'Commands', action: () => { document.dispatchEvent(new CustomEvent('acc:open-settings'));    onClose() } },
      { id: 'git-review',     label: 'Review Git Changes', description: hk.reviewChanges, iconName: 'GitBranch', section: 'Commands', action: () => { document.dispatchEvent(new CustomEvent('acc:toggle-git-review')); onClose() } },
      { id: 'show-shortcuts', label: 'Keyboard Shortcuts', description: hk.showShortcuts, iconName: 'Keyboard',  section: 'Commands', action: () => { onShowShortcuts?.(); onClose() } },
    ].filter((a) => !q || a.label.toLowerCase().includes(q))
  }, [settings.hotkeys, q, onClose, onShowShortcuts])

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
