import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, ExternalLink, Columns2, Scissors, Trash2, ChevronRight, ArrowRightLeft } from 'lucide-react'
import { collectSessionIds } from '../../layout/layout-tree'
import type { LayoutNode } from '../../layout/layout-tree'
import type { SessionMeta } from '@shared/ipc-types'
import { listWindows } from '../../window/window.service'
import { WindowMoveSubmenu } from '../../window/components/WindowMoveSubmenu'

interface SessionCtxMenuProps {
  ctxMenu: { x: number; y: number; meta: SessionMeta }
  onDismiss: () => void
  onRename: (meta: SessionMeta) => void
  onSplitHere: (sessionId: string) => void
  onDetach: (sessionId: string) => void
  onReattach: (sessionId: string) => void
  onCloseAllSplits: (meta: SessionMeta) => void
  onKill: (meta: SessionMeta) => void
  onMoveToWindow: (sessionId: string, targetWindowId: string) => void
  activeSessionId: string | null
  paneTree: Record<string, LayoutNode>
  isMainWindow: boolean
  windowId: string | null
  projectSessions: SessionMeta[]
}

export function SessionCtxMenu({ ctxMenu, onDismiss, onRename, onSplitHere, onDetach, onReattach, onCloseAllSplits, onKill, onMoveToWindow, activeSessionId, paneTree, isMainWindow, windowId, projectSessions }: SessionCtxMenuProps): JSX.Element {
  const { x, y, meta } = ctxMenu
  const [otherWindows, setOtherWindows] = useState<{ windowId: string; windowName: string; windowColor: string }[]>([])
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const [submenuY, setSubmenuY] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const moveTriggerRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  const scheduleHideSubmenu = () => {
    clearHideTimeout()
    hideTimeoutRef.current = setTimeout(() => setShowMoveSubmenu(false), 150)
  }

  useEffect(() => {
    listWindows().then((wins) => {
      setOtherWindows(wins.map((w) => ({ windowId: w.windowId, windowName: w.windowName, windowColor: w.windowColor })))
    }).catch(() => {})
    return () => { clearHideTimeout() }
  }, [])

  const canSplitHere = !!(
    activeSessionId &&
    activeSessionId !== meta.sessionId &&
    meta.status === 'running' &&
    !collectSessionIds(paneTree[activeSessionId] ?? { type: 'leaf', id: '', panel: 'home' }).includes(meta.sessionId)
  )
  const hasAllSplits = !!(meta.groupId && projectSessions.some((s) => s.groupId === meta.groupId && /^Split #\d+$/.test(s.name)))

  const menuX = Math.min(x, window.innerWidth - 180)
  const menuY = Math.min(y, window.innerHeight - 150)

  const getSubmenuX = () => {
    const menuWidth = menuRef.current?.offsetWidth ?? 164
    const submenuWidth = 160
    const rightX = menuX + menuWidth + 4
    return rightX + submenuWidth > window.innerWidth ? menuX - submenuWidth - 4 : rightX
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onMouseDown={onDismiss}
        onContextMenu={(e) => { e.preventDefault(); onDismiss() }}
      />
      <div
        ref={menuRef}
        className="fixed z-[9999] bg-brand-panel border border-white/10 rounded shadow-2xl shadow-black/60 py-1 min-w-[160px]"
        style={{ left: menuX, top: menuY }}
      >
        <button
          onMouseDown={(e) => { e.stopPropagation(); onRename(meta); onDismiss() }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
        >
          <Pencil size={12} />Edit
        </button>
        {canSplitHere && (
          <>
            <div className="my-1 border-t border-white/10" />
            <button
              onMouseDown={(e) => { e.stopPropagation(); onSplitHere(meta.sessionId); onDismiss() }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
            >
              <Columns2 size={12} />Split Here
            </button>
          </>
        )}
        {hasAllSplits && (
          <>
            <div className="my-1 border-t border-white/10" />
            <button
              onMouseDown={(e) => { e.stopPropagation(); onCloseAllSplits(meta); onDismiss() }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
            >
              <Scissors size={12} />Close All Splits
            </button>
          </>
        )}
        <div className="my-1 border-t border-white/10" />
        <button
          ref={moveTriggerRef}
          onMouseEnter={() => {
            clearHideTimeout()
            const rect = moveTriggerRef.current?.getBoundingClientRect()
            if (rect) setSubmenuY(rect.top)
            setShowMoveSubmenu(true)
          }}
          onMouseLeave={scheduleHideSubmenu}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
        >
          <span className="flex items-center gap-2.5"><ArrowRightLeft size={12} />Move to Window</span>
          <ChevronRight size={10} className="text-zinc-600" />
        </button>
        <div className="my-1 border-t border-white/10" />
        <button
          onMouseDown={(e) => { e.stopPropagation(); onKill(meta); onDismiss() }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 hover:text-red-300 transition-colors"
        >
          <Trash2 size={12} />Kill Session
        </button>
      </div>

      {showMoveSubmenu && (
        <WindowMoveSubmenu
          style={{ left: getSubmenuX(), top: submenuY }}
          windows={otherWindows}
          onSelect={(windowId) => { onMoveToWindow(meta.sessionId, windowId); onDismiss() }}
          onMouseEnter={clearHideTimeout}
          onMouseLeave={scheduleHideSubmenu}
          onNewWindow={() => { onDetach(meta.sessionId); onDismiss() }}
        />
      )}
    </>,
    document.body
  )
}
