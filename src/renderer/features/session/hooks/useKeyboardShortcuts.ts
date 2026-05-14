import { useEffect, useRef } from 'react'
import { useStore } from '../../../store/root.store'
import { killSession } from '../session.service'

interface Callbacks {
  onTogglePalette: () => void
  onShowShortcuts: () => void
  onNewNoteDrawer: () => void
  onOpenFileFinder: () => void
}

function match(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.toLowerCase().split('+').map((p) => p.trim())
  const key = parts[parts.length - 1]
  const needsCtrl = parts.includes('ctrl')
  const needsShift = parts.includes('shift')
  const needsAlt = parts.includes('alt')
  const hasExplicitMods = needsCtrl || needsShift || needsAlt
  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === needsCtrl &&
    e.altKey === needsAlt &&
    (hasExplicitMods ? e.shiftKey === needsShift : !e.ctrlKey && !e.altKey)
  )
}

export function useKeyboardShortcuts({ onTogglePalette, onShowShortcuts, onNewNoteDrawer, onOpenFileFinder }: Callbacks): void {
  const removeTab = useStore((s) => s.removeTab)
  const settings = useStore((s) => s.settings)
  const activeSessionId = useStore((s) => s.activeSessionId)

  const settingsRef = useRef(settings)
  const activeSessionIdRef = useRef(activeSessionId)
  const onTogglePaletteRef = useRef(onTogglePalette)
  const onShowShortcutsRef = useRef(onShowShortcuts)
  const onNewNoteDrawerRef = useRef(onNewNoteDrawer)
  const onOpenFileFinderRef = useRef(onOpenFileFinder)

  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { activeSessionIdRef.current = activeSessionId }, [activeSessionId])
  useEffect(() => { onTogglePaletteRef.current = onTogglePalette }, [onTogglePalette])
  useEffect(() => { onShowShortcutsRef.current = onShowShortcuts }, [onShowShortcuts])
  useEffect(() => { onNewNoteDrawerRef.current = onNewNoteDrawer }, [onNewNoteDrawer])
  useEffect(() => { onOpenFileFinderRef.current = onOpenFileFinder }, [onOpenFileFinder])

  useEffect(() => {
    const onQuickNoteEvent = (): void => onNewNoteDrawerRef.current()
    document.addEventListener('acc:quick-note', onQuickNoteEvent)
    return () => {
      document.removeEventListener('acc:quick-note', onQuickNoteEvent)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const hk = settingsRef.current.hotkeys

      if (match(e, hk.quickNote)) {
        e.preventDefault(); e.stopPropagation()
        onNewNoteDrawerRef.current()
      } else if (match(e, hk.newSession)) {
        e.preventDefault(); e.stopPropagation()
        document.dispatchEvent(new CustomEvent('acc:new-session'))
      } else if (match(e, hk.openProject)) {
        e.preventDefault(); e.stopPropagation()
        document.dispatchEvent(new CustomEvent('acc:open-project'))
      } else if (match(e, hk.closeSession)) {
        e.preventDefault(); e.stopPropagation()
        const sid = activeSessionIdRef.current
        if (sid) { killSession(sid); removeTab(sid) }
      } else if (match(e, hk.commandPalette)) {
        e.preventDefault(); e.stopPropagation()
        onTogglePaletteRef.current()
      } else if (match(e, hk.showShortcuts)) {
        e.preventDefault(); e.stopPropagation()
        onShowShortcutsRef.current()
      } else if (match(e, hk.reviewChanges)) {
        e.preventDefault(); e.stopPropagation()
        document.dispatchEvent(new CustomEvent('acc:toggle-git-review'))
      } else if (match(e, hk.openFileFinder)) {
        e.preventDefault(); e.stopPropagation()
        onOpenFileFinderRef.current()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [removeTab])
}
