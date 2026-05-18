import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Pencil, ChevronRight, ArrowRightLeft } from 'lucide-react'
import { useStore } from '../../../store/root.store'
import { killSession, patchSession } from '../session.service'
import { detachTab, listWindows, moveToWindow } from '../../window/window.service'
import { renameEntry, moveFileToWindow } from '../../fs/fs.service'
import { EditSessionModal } from './EditSessionModal'
import { cn, normalizePath } from '../../../lib/utils'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import { useLayoutDnd } from '../../layout/dnd/LayoutDndContext'
import { findTabForSession, collectFileEditorLeaves, findLeafById } from '../../layout/layout-tree'
import { WindowMoveSubmenu } from '../../window/components/WindowMoveSubmenu'
import { FileIcon } from '../../fs/components/FileTree'

interface Props {
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  showAddButton?: boolean
}

interface CtxMenu {
  tabId: string
  pos: { x: number; y: number }
}

export function SessionDock({ activeSessionId, onSelectSession, showAddButton = true }: Props): JSX.Element {
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
  const fileTabs = useStore((s) => s.fileTabs)
  const closeFileTab = useStore((s) => s.closeFileTab)
  const renameFileTab = useStore((s) => s.renameFileTab)
  const focusedLeafId = useStore((s) => s.focusedLeafId)
  const paneTree = useStore((s) => s.paneTree)
  const notifications = useStore((s) => s.notifications)
  const markTabNotificationsRead = useStore((s) => s.markTabNotificationsRead)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [editSessionId, setEditSessionId] = useState<string | null>(null)
  const [otherWindows, setOtherWindows] = useState<{ windowId: string; windowName: string; windowColor: string }[]>([])
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const [submenuY, setSubmenuY] = useState(0)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const moveTriggerRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { startDrag } = useLayoutDnd()

  useEffect(() => {
    const handler = (e: Event): void => {
      const { sessionId } = (e as CustomEvent<{ sessionId: string }>).detail
      if (sessions[sessionId]) setEditSessionId(sessionId)
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

  // Which file path is shown in the currently focused leaf (across all tabs)?
  const focusedFilePath = (() => {
    if (!focusedLeafId) return null
    for (const tree of Object.values(paneTree)) {
      if (!tree) continue
      const leaf = findLeafById(tree, focusedLeafId)
      if (leaf?.panel === 'editor-group') {
        const activeTab = leaf.tabs[leaf.activeIndex] ?? leaf.tabs[0]
        const fp = activeTab?.kind === 'file' ? activeTab.path : null
        return fp ? normalizePath(fp).toLowerCase() : null
      }
    }
    return null
  })()

  // Map from normalized file path → ownerTabId for pane trees that contain 2+ file-editor leaves
  const splitFileGroupMap = useMemo(() => {
    const map = new Map<string, string>() // normalizedPath → ownerTabId
    for (const [tabId, tree] of Object.entries(paneTree)) {
      if (!tree) continue
      const leaves = collectFileEditorLeaves(tree)
      if (leaves.length >= 2) {
        for (const leaf of leaves) {
          map.set(normalizePath(leaf.filePath).toLowerCase(), tabId)
        }
      }
    }
    return map
  }, [paneTree])

  const isRootWorkspace = activeWorkspaceId === ROOT_WORKSPACE_ID
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const normalizedActive = activeWorkspace?.rootPath ? normalizePath(activeWorkspace.rootPath) : undefined

  const sessionTabs = tabOrder.filter((id) => {
    if (id === '__root__' || !sessions[id]) return false
    const m = sessions[id]
    if (isRootWorkspace) {
      if (m.workspaceId) return m.workspaceId === ROOT_WORKSPACE_ID
      const sessionPath = normalizePath(m.cwd)
      return !workspaces.some((w) => {
        if (w.isRoot || !w.rootPath) return false
        const wsPath = normalizePath(w.rootPath)
        return sessionPath === wsPath || sessionPath.startsWith(wsPath + '/')
      })
    }
    if (m.workspaceId) return m.workspaceId === activeWorkspaceId
    if (!normalizedActive) return false
    const root = normalizePath(m.cwd)
    return root === normalizedActive || root.startsWith(normalizedActive + '/')
  })

  const sessionTabSet = new Set(sessionTabs)
  const allTabIds = tabOrder.filter((id) => sessionTabSet.has(id))

  const handleDragStart = (e: React.DragEvent, id: string): void => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    const ft = fileTabs[id]
    if (ft) {
      e.dataTransfer.setData('application/orbit-file', ft.path)
      e.dataTransfer.setData('text/plain', ft.path)
      startDrag({ type: 'file-path', filePath: ft.path })
    } else {
      e.dataTransfer.setData('orbit/session-id', id)
      startDrag({ type: 'sidebar-session', sessionId: id })
    }
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
      const idx = sessionTabs.indexOf(tabId)
      const toLeft = sessionTabs.slice(0, idx)
      const next = toLeft.length > 0 ? toLeft[toLeft.length - 1] : sessionTabs[idx + 1]
      onSelectSession(next ?? '__root__')
    }
  }

  const openCtxMenu = (e: React.MouseEvent, tabId: string): void => {
    e.preventDefault()
    setCtxMenu({ tabId, pos: { x: e.clientX, y: e.clientY } })
  }

  const openEdit = (tabId: string): void => {
    setCtxMenu(null)
    if (sessions[tabId]) setEditSessionId(tabId)
  }

  const handleEditSave = async (name: string, color: string): Promise<void> => {
    if (!editSessionId) return
    setEditSessionId(null)
    const updated = await patchSession({ sessionId: editSessionId, name, color })
    upsertSession(updated)
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
      const idx = sessionTabs.indexOf(tabId)
      const toLeft = sessionTabs.slice(0, idx)
      const next = toLeft.length > 0 ? toLeft[toLeft.length - 1] : sessionTabs[idx + 1]
      onSelectSession(next ?? '__root__')
    }
  }

  const startFileTabRename = (tabId: string): void => {
    setCtxMenu(null)
    const name = fileTabs[tabId]?.name ?? ''
    setRenameValue(name)
    setRenamingTabId(tabId)
    setTimeout(() => { renameInputRef.current?.select() }, 0)
  }

  const commitFileTabRename = async (tabId: string): Promise<void> => {
    setRenamingTabId(null)
    const fileMeta = fileTabs[tabId]
    const trimmed = renameValue.trim()
    if (!fileMeta || !trimmed || trimmed === fileMeta.name) return
    const dir = fileMeta.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const newPath = dir + '/' + trimmed
    try {
      await renameEntry(fileMeta.path, trimmed)
      renameFileTab(tabId, newPath)
    } catch {}
  }

  const ctxFileMoveToWindow = async (tabId: string, targetWindowId: string | null): Promise<void> => {
    setCtxMenu(null)
    const fileMeta = fileTabs[tabId]
    if (!fileMeta) return
    try { await moveFileToWindow(fileMeta.path, targetWindowId) } catch {}
    closeFileTab(tabId)
  }

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-transparent overflow-x-auto scrollbar-none w-full min-h-[40px]">
      {allTabIds.map((tabId) => {
        const isFileTab = !!fileTabs[tabId]
        const fileMeta = fileTabs[tabId]
        const meta = sessions[tabId]
        const isActive = isFileTab
          ? focusedFilePath !== null
            ? (fileMeta !== undefined && normalizePath(fileMeta.path).toLowerCase() === focusedFilePath)
            : activeSessionId === tabId
          : (focusedSessionId ?? activeSessionId) === tabId
        const isDragging = draggingId === tabId
        const isOver = dragOverId === tabId && draggingId !== tabId

        if (isFileTab && fileMeta) {
          const inSplitGroup = splitFileGroupMap.has(normalizePath(fileMeta.path).toLowerCase())
          const isRenaming = renamingTabId === tabId
          return (
            <div
              key={tabId}
              draggable={!isRenaming}
              onDragStart={(e) => handleDragStart(e, tabId)}
              onDragOver={(e) => handleDragOver(e, tabId)}
              onDrop={() => handleDrop(tabId)}
              onDragEnd={cleanup}
              onClick={() => {
                if (isRenaming) return
                const { paneTree: tree, setActiveSession, setFocusedLeaf } = useStore.getState()
                const norm = normalizePath(fileMeta.path)
                let focusedElsewhere = false
                for (const [tId, tTree] of Object.entries(tree)) {
                  if (tId === tabId || !tTree) continue
                  const leaf = collectFileEditorLeaves(tTree).find((l) => normalizePath(l.filePath).toLowerCase() === norm.toLowerCase())
                  if (leaf) {
                    onSelectSession(tId)
                    setActiveSession(tId)
                    setFocusedLeaf(leaf.leafId)
                    focusedElsewhere = true
                    break
                  }
                }
                if (!focusedElsewhere) {
                  onSelectSession(tabId)
                  setActiveSession(tabId)
                  setFocusedLeaf(null)
                }
              }}
              onDoubleClick={(e) => { e.stopPropagation(); startFileTabRename(tabId) }}
              onContextMenu={(e) => openCtxMenu(e, tabId)}
              className={cn(
                'relative group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-sm cursor-pointer transition-all flex-shrink-0 select-none',
                isActive
                  ? 'text-zinc-100 bg-brand-accent/10 border-brand-accent/50'
                  : 'text-zinc-400 hover:text-zinc-200 border-brand-panel/40 opacity-50 hover:opacity-75',
                isOver && 'opacity-100 border-brand-accent/70',
                isDragging && 'opacity-30'
              )}
            >
              <span className="flex-shrink-0 w-3.5 flex items-center">
                <FileIcon name={fileMeta.name} />
              </span>
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') void commitFileTabRename(tabId)
                    else if (e.key === 'Escape') setRenamingTabId(null)
                  }}
                  onBlur={() => setRenamingTabId(null)}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-b border-brand-accent text-xs text-zinc-100 outline-none w-[90px] max-w-[120px]"
                />
              ) : (
                <span className="text-xs font-medium truncate max-w-[120px]">{fileMeta.name}</span>
              )}
              {!isRenaming && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeFileTab(tabId) }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all flex-shrink-0 ml-0.5"
                >
                  <X size={10} />
                </button>
              )}
              {inSplitGroup && (
                <div className={cn(
                  'absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all',
                  isActive ? 'bg-brand-accent' : 'bg-brand-accent/30'
                )} />
              )}
            </div>
          )
        }

        if (!meta) return null
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
              const { paneTree, setFocusedSession } = useStore.getState()
              const actualTabId = findTabForSession(paneTree, tabId) ?? tabId
              onSelectSession(actualTabId)
              setFocusedSession(tabId)
              markTabNotificationsRead(tabId)
            }}
            onDoubleClick={(e) => { e.stopPropagation(); openEdit(tabId) }}
            onContextMenu={(e) => openCtxMenu(e, tabId)}
            className={cn(
              'group flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shadow-sm cursor-pointer transition-all flex-shrink-0 select-none min-w-[100px]',
              isActive ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200',
              !isActive && !isOver && 'opacity-50 hover:opacity-75',
              isOver && 'opacity-100 border-brand-accent/70',
              isDragging && 'opacity-30'
            )}
            style={{
              background: isOver
                ? undefined
                : `linear-gradient(to right, ${color}${isActive ? '22' : '0f'}, transparent)`,
              ...(!isOver && { borderColor: isActive ? `${color}99` : `${color}33` })
            }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: isActive ? color : `${color}99` }}
            />

            <span className="text-xs font-medium truncate flex-1 min-w-0">{meta.name}</span>

            {(() => {
              if (meta.agentStatus === 'running') {
                return (
                  <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: color }} />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  </span>
                )
              }
              const hasUnreadWaiting = notifications.some((n) => !n.read && n.tabId === tabId && n.type === 'agent-waiting')
              const hasUnreadDone = notifications.some((n) => !n.read && n.tabId === tabId && n.type === 'agent-done')
              if (meta.agentStatus === 'waiting-input' || hasUnreadWaiting) {
                return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
              }
              if (hasUnreadDone) {
                return <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              }
              return null
            })()}

            <button
              onClick={(e) => void handleClose(e, tabId)}
              className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all flex-shrink-0 ml-0.5"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}

      {showAddButton && (
        <button
          onClick={() => document.dispatchEvent(new CustomEvent('acc:new-session'))}
          className="ml-auto flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg text-zinc-300 hover:text-zinc-100 bg-brand-surface hover:bg-brand-panel border border-brand-panel/60 shadow-sm transition-all text-xs font-medium"
        >
          <Plus size={12} />
          <span>Terminal</span>
        </button>
      )}

      {editSessionId && sessions[editSessionId] && (
        <EditSessionModal
          meta={sessions[editSessionId]}
          onSave={(name, color) => void handleEditSave(name, color)}
          onDismiss={() => setEditSessionId(null)}
        />
      )}

      {ctxMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onMouseDown={() => setCtxMenu(null)} />
          <div
            ref={menuRef}
            className="fixed z-[9999] bg-brand-panel border border-white/10 rounded-lg shadow-2xl shadow-black/60 py-1 min-w-[160px]"
            style={{ left: ctxMenu.pos.x, top: ctxMenu.pos.y }}
          >
            {fileTabs[ctxMenu.tabId] ? (
              <>
                <button
                  onMouseDown={() => startFileTabRename(ctxMenu.tabId)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
                >
                  <Pencil size={11} className="flex-shrink-0" />
                  Rename
                </button>
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
                  <span className="flex items-center gap-2.5">
                    <ArrowRightLeft size={11} className="flex-shrink-0" />
                    Move to
                  </span>
                  <ChevronRight size={10} className="text-zinc-600" />
                </button>
                <div className="my-1 border-t border-white/10" />
                <button
                  onMouseDown={() => { setCtxMenu(null); closeFileTab(ctxMenu.tabId) }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 hover:text-red-300 transition-colors"
                >
                  <X size={11} className="flex-shrink-0" />
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  onMouseDown={() => openEdit(ctxMenu.tabId)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
                >
                  <Pencil size={11} className="flex-shrink-0" />
                  Edit
                </button>
                {sessionTabs.length > 1 && (
                  <>
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
                      <span className="flex items-center gap-2.5">
                        <ArrowRightLeft size={11} className="flex-shrink-0" />
                        Move to
                      </span>
                      <ChevronRight size={10} className="text-zinc-600" />
                    </button>
                  </>
                )}
                <div className="my-1 border-t border-white/10" />
                <button
                  onMouseDown={() => void ctxClose(ctxMenu.tabId)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 hover:text-red-300 transition-colors"
                >
                  <X size={11} className="flex-shrink-0" />
                  Close Terminal
                </button>
              </>
            )}
          </div>

          {showMoveSubmenu && (
            <WindowMoveSubmenu
              style={{ left: getSubmenuX(), top: submenuY }}
              windows={otherWindows}
              onSelect={(wId) => {
                if (fileTabs[ctxMenu.tabId]) {
                  void ctxFileMoveToWindow(ctxMenu.tabId, wId)
                } else {
                  ctxMoveToWindow(ctxMenu.tabId, wId)
                }
              }}
              onMouseEnter={clearHideTimeout}
              onMouseLeave={scheduleHideSubmenu}
              onNewWindow={isMainWindow ? () => {
                if (fileTabs[ctxMenu.tabId]) {
                  void ctxFileMoveToWindow(ctxMenu.tabId, null)
                } else {
                  void ctxNewWindow(ctxMenu.tabId)
                }
              } : undefined}
            />
          )}
        </>,
        document.body
      )}
    </div>
  )
}
