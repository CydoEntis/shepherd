import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, GripVertical, Pencil, ChevronRight, ArrowRightLeft } from 'lucide-react'
import { useStore } from '../../../store/root.store'
import { killSession } from '../session.service'
import { detachTab, listWindows, moveToWindow } from '../../window/window.service'
import { cn, normalizePath } from '../../../lib/utils'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import { useLayoutDnd } from '../../layout/dnd/LayoutDndContext'
import { findTabForSession } from '../../layout/layout-tree'
import { WindowMoveSubmenu } from '../../window/components/WindowMoveSubmenu'

interface Props {
  activeSessionId: string | null
  onSelectSession: (id: string) => void
}

interface CtxMenu {
  tabId: string
  pos: { x: number; y: number }
}

export function SessionDock({ activeSessionId, onSelectSession }: Props): JSX.Element {
  const tabOrder = useStore((s) => s.tabOrder)
  const sessions = useStore((s) => s.sessions)
  const workspaces = useStore((s) => s.workspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const focusedSessionId = useStore((s) => s.focusedSessionId)
  const reorderTabs = useStore((s) => s.reorderTabs)
  const removeTab = useStore((s) => s.removeTab)
  const windowId = useStore((s) => s.windowId)
  const isMainWindow = useStore((s) => s.isMainWindow)
  const detachPane = useStore((s) => s.detachPane)
  const upsertSession = useStore((s) => s.upsertSession)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [otherWindows, setOtherWindows] = useState<{ windowId: string; windowName: string; windowColor: string }[]>([])
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const [submenuY, setSubmenuY] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const moveTriggerRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { startDrag } = useLayoutDnd()

  useEffect(() => {
    const handler = (e: Event): void => {
      const { sessionId } = (e as CustomEvent<{ sessionId: string }>).detail
      startEdit(sessionId)
    }
    document.addEventListener('acc:start-rename-session', handler)
    return () => document.removeEventListener('acc:start-rename-session', handler)
  }, [sessions])

  useEffect(() => {
    if (!ctxMenu) { setShowMoveSubmenu(false); return }
    listWindows().then((wins) => {
      setOtherWindows(wins
        .filter((w) => w.windowId !== windowId)
        .map((w) => ({ windowId: w.windowId, windowName: w.windowName, windowColor: w.windowColor })))
    }).catch(() => {})
    return () => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current) }
  }, [ctxMenu, windowId])

  const clearHideTimeout = (): void => {
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null }
  }
  const scheduleHideSubmenu = (): void => {
    clearHideTimeout()
    hideTimeoutRef.current = setTimeout(() => setShowMoveSubmenu(false), 150)
  }

  const getSubmenuX = (): number => {
    const menuWidth = menuRef.current?.offsetWidth ?? 164
    const submenuWidth = 160
    const menuX = ctxMenu?.pos.x ?? 0
    const rightX = menuX + menuWidth + 4
    return rightX + submenuWidth > window.innerWidth ? menuX - submenuWidth - 4 : rightX
  }

  const isRootWorkspace = activeWorkspaceId === ROOT_WORKSPACE_ID
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const normalizedActive = activeWorkspace?.rootPath ? normalizePath(activeWorkspace.rootPath) : undefined

  const sessionTabs = tabOrder.filter((id) => {
    if (id === '__root__' || !sessions[id]) return false
    const m = sessions[id]
    if (isRootWorkspace) {
      if (m.workspaceId) return m.workspaceId === ROOT_WORKSPACE_ID
      const sessionPath = normalizePath(m.projectRoot ?? m.cwd)
      return !workspaces.some((w) => {
        if (w.isRoot || !w.rootPath) return false
        const wsPath = normalizePath(w.rootPath)
        return sessionPath === wsPath || sessionPath.startsWith(wsPath + '/')
      })
    }
    if (m.workspaceId) return m.workspaceId === activeWorkspaceId
    if (!normalizedActive) return false
    const root = normalizePath(m.projectRoot ?? m.cwd)
    return root === normalizedActive || root.startsWith(normalizedActive + '/')
  })

  const handleDragStart = (e: React.DragEvent, id: string): void => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('orbit/session-id', id)
    startDrag({ type: 'sidebar-session', sessionId: id })
  }

  const handleDragOver = (e: React.DragEvent, id: string): void => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== draggingId) setDragOverId(id)
  }

  const handleDrop = (targetId: string): void => {
    if (!draggingId || draggingId === targetId) { cleanup(); return }
    const newOrder = [...tabOrder]
    const from = newOrder.indexOf(draggingId)
    const to = newOrder.indexOf(targetId)
    newOrder.splice(from, 1)
    newOrder.splice(to, 0, draggingId)
    reorderTabs(newOrder)
    cleanup()
  }

  const cleanup = (): void => { setDraggingId(null); setDragOverId(null) }

  const handleClose = async (e: React.MouseEvent, tabId: string): Promise<void> => {
    e.stopPropagation()
    const session = sessions[tabId]
    if (!session) return
    try { await killSession(tabId) } catch {}
    removeTab(tabId)
    if (activeSessionId === tabId) {
      const remaining = sessionTabs.filter((id) => id !== tabId)
      onSelectSession(remaining[0] ?? '__root__')
    }
  }

  const openCtxMenu = (e: React.MouseEvent, tabId: string): void => {
    e.preventDefault()
    setCtxMenu({ tabId, pos: { x: e.clientX, y: e.clientY } })
  }

  const startEdit = (tabId: string): void => {
    setCtxMenu(null)
    const session = sessions[tabId]
    if (!session) return
    setEditingId(tabId)
    setEditName(session.name)
  }

  const commitEdit = (tabId: string): void => {
    const session = sessions[tabId]
    if (session && editName.trim()) upsertSession({ ...session, name: editName.trim() })
    setEditingId(null)
    setEditName('')
  }

  const ctxNewWindow = async (tabId: string): Promise<void> => {
    setCtxMenu(null)
    detachPane(tabId, tabId)
    removeTab(tabId)
    const remaining = sessionTabs.filter((id) => id !== tabId)
    if (remaining[0]) onSelectSession(remaining[0])
    if (windowId) await detachTab(tabId, windowId)
  }

  const ctxMoveToWindow = (tabId: string, targetWindowId: string): void => {
    setCtxMenu(null)
    const actualTabId = findTabForSession(useStore.getState().paneTree, tabId) ?? tabId
    detachPane(actualTabId, tabId)
    removeTab(tabId)
    const remaining = sessionTabs.filter((id) => id !== tabId)
    if (remaining[0]) onSelectSession(remaining[0])
    void moveToWindow(tabId, targetWindowId)
  }

  const ctxClose = async (tabId: string): Promise<void> => {
    setCtxMenu(null)
    const session = sessions[tabId]
    if (!session) return
    try { await killSession(tabId) } catch {}
    removeTab(tabId)
    if (activeSessionId === tabId) {
      const remaining = sessionTabs.filter((id) => id !== tabId)
      onSelectSession(remaining[0] ?? '__root__')
    }
  }

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-brand-bg border-b border-brand-panel/40 overflow-x-auto scrollbar-none">
      {sessionTabs.map((tabId) => {
        const meta = sessions[tabId]
        const isActive = (focusedSessionId ?? activeSessionId) === tabId
        const isDragging = draggingId === tabId
        const isOver = dragOverId === tabId && draggingId !== tabId
        const isEditing = editingId === tabId
        const color = meta.color ?? '#6366f1'

        return (
          <div
            key={tabId}
            draggable
            onDragStart={(e) => handleDragStart(e, tabId)}
            onDragOver={(e) => handleDragOver(e, tabId)}
            onDrop={() => handleDrop(tabId)}
            onDragEnd={cleanup}
            onClick={() => {
              if (isEditing) return
              const { paneTree, setFocusedSession } = useStore.getState()
              const actualTabId = findTabForSession(paneTree, tabId) ?? tabId
              onSelectSession(actualTabId)
              setFocusedSession(tabId)
            }}
            onDoubleClick={(e) => { e.stopPropagation(); startEdit(tabId) }}
            onContextMenu={(e) => openCtxMenu(e, tabId)}
            className={cn(
              'group flex items-center gap-1.5 px-2.5 py-1 rounded-md border shadow-sm cursor-pointer transition-all flex-shrink-0 select-none',
              isActive ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200',
              !isActive && !isOver && 'opacity-50 hover:opacity-75',
              isOver && 'opacity-100 border-brand-accent/70',
              isDragging && 'opacity-30'
            )}
            style={{
              background: isOver
                ? undefined
                : `linear-gradient(to right, ${color}${isActive ? '55' : '20'}, transparent)`,
              ...(!isOver && { borderColor: isActive ? color : `${color}55` })
            }}
          >
            <GripVertical size={10} className="text-zinc-700 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity -ml-0.5" />
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: isActive ? color : `${color}99` }}
            />

            {isEditing ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => commitEdit(tabId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(tabId)
                  if (e.key === 'Escape') { setEditingId(null); setEditName('') }
                  e.stopPropagation()
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium bg-transparent outline-none border-b border-zinc-500 max-w-[120px] min-w-[60px]"
              />
            ) : (
              <span className="text-xs font-medium truncate max-w-[120px]">{meta.name}</span>
            )}

            {meta.agentStatus === 'running' && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            )}
            {meta.agentStatus === 'waiting-input' && (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
            )}

            <button
              onClick={(e) => void handleClose(e, tabId)}
              className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all flex-shrink-0 ml-0.5"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}

      <button
        onClick={() => document.dispatchEvent(new CustomEvent('acc:new-session'))}
        className="ml-auto flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-zinc-400 hover:text-zinc-100 bg-brand-panel/50 hover:bg-brand-panel/80 border border-brand-panel shadow-sm transition-colors text-xs"
      >
        <Plus size={12} />
        <span>Terminal</span>
      </button>

      {ctxMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={() => setCtxMenu(null)} />
          <div
            ref={menuRef}
            className="fixed z-[9999] bg-brand-surface border border-brand-panel/60 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: ctxMenu.pos.x, top: ctxMenu.pos.y }}
          >
            <button
              onMouseDown={() => startEdit(ctxMenu.tabId)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
            >
              <Pencil size={11} className="flex-shrink-0" />
              Edit
            </button>
            {sessionTabs.length > 1 && (
              <>
                <div className="my-1 border-t border-brand-panel/60" />
                <button
                  ref={moveTriggerRef}
                  onMouseEnter={() => {
                    clearHideTimeout()
                    const rect = moveTriggerRef.current?.getBoundingClientRect()
                    if (rect) setSubmenuY(rect.top)
                    setShowMoveSubmenu(true)
                  }}
                  onMouseLeave={scheduleHideSubmenu}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <ArrowRightLeft size={11} className="flex-shrink-0" />
                    Move to
                  </span>
                  <ChevronRight size={10} className="text-zinc-600" />
                </button>
              </>
            )}
            <div className="my-1 border-t border-brand-panel/60" />
            <button
              onMouseDown={() => void ctxClose(ctxMenu.tabId)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-brand-panel hover:text-red-300 transition-colors"
            >
              <X size={11} className="flex-shrink-0" />
              Close Terminal
            </button>
          </div>

          {showMoveSubmenu && (
            <WindowMoveSubmenu
              style={{ left: getSubmenuX(), top: submenuY }}
              windows={otherWindows}
              onSelect={(wId) => ctxMoveToWindow(ctxMenu.tabId, wId)}
              onMouseEnter={clearHideTimeout}
              onMouseLeave={scheduleHideSubmenu}
              onNewWindow={isMainWindow ? () => void ctxNewWindow(ctxMenu.tabId) : undefined}
            />
          )}
        </>,
        document.body
      )}
    </div>
  )
}
