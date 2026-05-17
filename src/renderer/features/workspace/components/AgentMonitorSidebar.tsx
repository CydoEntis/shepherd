import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Plus, ChevronDown, ChevronRight, FolderOpen, X, Users, Terminal, FilePlus2, FolderPlus, ExternalLink, FolderX } from 'lucide-react'
import { useStore } from '../../../store/root.store'
import { patchSession, killSession } from '../../session/session.service'
import { EditSessionModal } from '../../session/components/EditSessionModal'
import { EditGroupModal } from '../../session/components/EditGroupModal'
import { removeWorktree, copyFile, openInEditor } from '../../fs/fs.service'
import { useInstalledEditors } from '../../fs/hooks/useInstalledEditors'
import { createWorkspace, deleteWorkspace } from '../workspace.service'
import { detachTab, reattachTab, moveToWindow } from '../../window/window.service'
import { NewWorkspaceModal } from './NewWorkspaceModal'
import { ConfirmCloseProjectModal } from './ConfirmCloseProjectModal'
import { shortPath } from '../../../lib/utils'
import { findTabForSession, collectSessionIds, makeFileEditorLeaf, collectFileEditorLeaves } from '../../layout/layout-tree'
import { useLayoutDnd } from '../../layout/dnd/LayoutDndContext'
import { useWorktreeStats } from '../hooks/useWorktreeStats'
import { useConfirmClose } from '../../session/hooks/useConfirmClose'
import { toast } from 'sonner'
import { cn, normalizePath } from '../../../lib/utils'
import { Skeleton } from '../../../components/ui/skeleton'
import { SessionRow } from './SessionRow'
import { SessionCtxMenu } from './SessionCtxMenu'
import { GroupCtxMenu } from './GroupCtxMenu'
import { NewGroupModal } from './NewGroupModal'
import { FileTree } from '../../fs/components/FileTree'
import type { SessionMeta, Workspace } from '@shared/ipc-types'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'

interface Props {
  activeWorkspaceId: string
  onWorkspaceChange: (id: string) => void
  activeSessionId: string | null
  onSelectSession: (id: string | null) => void
}

export function AgentMonitorSidebar({ activeWorkspaceId, onWorkspaceChange, activeSessionId, onSelectSession }: Props): JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const tabOrder = useStore((s) => s.tabOrder)
  const isRestoringLayout = useStore((s) => s.isRestoringLayout)
  const isMainWindow = useStore((s) => s.isMainWindow)
  const windowId = useStore((s) => s.windowId)
  const upsertSession = useStore((s) => s.upsertSession)
  const removeTab = useStore((s) => s.removeTab)
  const detachPane = useStore((s) => s.detachPane)
  const paneTree = useStore((s) => s.paneTree)
  const openGroupInSplits = useStore((s) => s.openGroupInSplits)
  const focusedSessionId = useStore((s) => s.focusedSessionId)
  const setFocusedSession = useStore((s) => s.setFocusedSession)
  const addTab = useStore((s) => s.addTab)
  const insertLayoutAtRight = useStore((s) => s.insertLayoutAtRight)
  const sessionGroups = useStore((s) => s.settings.sessionGroups)
  const recentProjects = useStore((s) => s.settings.recentProjects)
  const updateSettings = useStore((s) => s.updateSettings)
  const workspaces = useStore((s) => s.workspaces)
  const addWorkspace = useStore((s) => s.addWorkspace)
  const removeWorkspaceFromStore = useStore((s) => s.removeWorkspaceFromStore)

  const focusedLeafId = useStore((s) => s.focusedLeafId)
  const setFocusedLeaf = useStore((s) => s.setFocusedLeaf)
  const { startDrag, endDrag } = useLayoutDnd()
  const ghostRef = useRef<HTMLImageElement | null>(null)
  const GHOST_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

  const { requestClose, modal: closeModal } = useConfirmClose()

  const [activeView, setActiveView] = useState<'files' | 'sessions'>('sessions')
  const [fileRefreshTick, setFileRefreshTick] = useState(0)
  const [wsOpen, setWsOpen] = useState(false)
  const [showNewWsModal, setShowNewWsModal] = useState(false)
  const [showNewGroupModal, setShowNewGroupModal] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; meta: SessionMeta } | null>(null)
  const [editMeta, setEditMeta] = useState<SessionMeta | null>(null)
  const [groupCtxMenu, setGroupCtxMenu] = useState<{ x: number; y: number; group: { id: string; name: string; color?: string } } | null>(null)
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; color?: string } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null)
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null | 'ungrouped'>('ungrouped')
  const [isDragOver, setIsDragOver] = useState(false)
  const [closingProject, setClosingProject] = useState<Workspace | null>(null)
  const sidebarBodyRef = useRef<HTMLDivElement>(null)
  const installedEditors = useInstalledEditors()

  const isRootWorkspace = activeWorkspaceId === ROOT_WORKSPACE_ID
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null
  const normalizedActive = activeWorkspace?.rootPath ? normalizePath(activeWorkspace.rootPath) : undefined

  // File tree root: named workspace folder (anchored) | home workspace follows session cwd, falls back to rootPath
  const fileTreeRoot = useMemo(() => {
    if (!isRootWorkspace && normalizedActive) return normalizedActive
    // Guard against focusedSessionId pointing to a session in another workspace.
    // A root-workspace session either has workspaceId === ROOT_WORKSPACE_ID or has no
    // workspaceId and its path doesn't match any named workspace.
    const focused = focusedSessionId ? sessions[focusedSessionId] : undefined
    const focusedBelongsHere = focused && (
      focused.workspaceId === ROOT_WORKSPACE_ID ||
      (!focused.workspaceId && !workspaces.some((w) => {
        if (w.isRoot || !w.rootPath) return false
        const wsPath = normalizePath(w.rootPath)
        const sp = normalizePath(focused.projectRoot ?? focused.cwd)
        return sp === wsPath || sp.startsWith(wsPath + '/')
      }))
    )
    const id = focusedBelongsHere ? focusedSessionId : activeSessionId
    const cwd = id ? sessions[id]?.cwd : undefined
    if (cwd) return normalizePath(cwd)
    return normalizedActive ?? ''
  }, [isRootWorkspace, normalizedActive, focusedSessionId, activeSessionId, sessions, workspaces])

  // Switch to Files tab when a project root first appears (project opened or workspace selected)
  const prevRootRef = useRef(fileTreeRoot)
  useEffect(() => {
    if (fileTreeRoot && !prevRootRef.current) setActiveView('files')
    prevRootRef.current = fileTreeRoot
  }, [fileTreeRoot])

  // When switching to a named workspace with a folder: show Files tab
  useEffect(() => {
    if (isRootWorkspace || !normalizedActive || isRestoringLayout) return
    setActiveView('files')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId])

  // Refresh file tree when a file is saved from the editor
  useEffect(() => {
    const handler = (): void => setFileRefreshTick((t) => t + 1)
    document.addEventListener('acc:file-saved', handler)
    return () => document.removeEventListener('acc:file-saved', handler)
  }, [])

  // Refresh file tree when directory changes (cd or workspace switch)
  useEffect(() => {
    setFileRefreshTick((t) => t + 1)
  }, [fileTreeRoot])

  const currentWindowSessionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const tabId of tabOrder) {
      const tree = paneTree[tabId]
      if (tree) collectSessionIds(tree).forEach((id) => ids.add(id))
    }
    return ids
  }, [tabOrder, paneTree])

  const projectSessions: SessionMeta[] = useMemo(() =>
    Object.values(sessions)
      .filter((m) => {
        if (!currentWindowSessionIds.has(m.sessionId)) return false
        if (isRootWorkspace) {
          if (m.workspaceId) return m.workspaceId === ROOT_WORKSPACE_ID
          // Untagged session: only show in Home if its path doesn't match any named workspace
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
      .sort((a, b) => b.createdAt - a.createdAt),
    [sessions, currentWindowSessionIds, isRootWorkspace, activeWorkspaceId, normalizedActive, workspaces]
  )

  const worktreeStats = useWorktreeStats(isRootWorkspace ? [] : projectSessions)

  const grouped = useMemo(() => {
    if (!isRootWorkspace) return null
    const byGroup: Record<string, SessionMeta[]> = {}
    const ungrouped: SessionMeta[] = []
    for (const s of projectSessions) {
      if (s.groupId) (byGroup[s.groupId] ??= []).push(s)
      else ungrouped.push(s)
    }
    return { byGroup, ungrouped }
  }, [isRootWorkspace, projectSessions])

  useEffect(() => {
    setShowNewGroupModal(false)
  }, [activeWorkspaceId])

  useEffect(() => {
    if (projectSessions.length > 0 && (!activeSessionId || activeSessionId === '__root__')) {
      const { paneTree } = useStore.getState()
      const tabId = findTabForSession(paneTree, projectSessions[0].sessionId)
      if (tabId) {
        onSelectSession(tabId)
        useStore.getState().setActiveSession(tabId)
      }
    }
  }, [projectSessions.length, activeSessionId, isRootWorkspace, onSelectSession])


  const handleDrop = useCallback(async (targetGroupId: string | null) => {
    if (!draggedSessionId) return
    setDragOverGroupId(null)
    const session = useStore.getState().sessions[draggedSessionId]
    if (!session || session.groupId === (targetGroupId ?? undefined)) return
    try {
      const patched = await patchSession({ sessionId: draggedSessionId, groupId: targetGroupId })
      upsertSession(patched)
    } catch {}
  }, [draggedSessionId, upsertSession])

  const handleCloseSession = useCallback((meta: SessionMeta) => {
    requestClose(async () => {
      try { await killSession(meta.sessionId) } catch {}
      removeTab(meta.sessionId)
      if (meta.worktreePath && meta.projectRoot) removeWorktree(meta.projectRoot, meta.worktreePath).catch(() => {})
      if (activeSessionId === meta.sessionId) {
        const remaining = Object.values(useStore.getState().sessions)
          .filter((s) => {
            if (s.sessionId === meta.sessionId) return false
            if (isRootWorkspace) {
              if (s.workspaceId) return s.workspaceId === ROOT_WORKSPACE_ID
              const sessionPath = normalizePath(s.projectRoot ?? s.cwd)
              return !workspaces.some((w) => {
                if (w.isRoot || !w.rootPath) return false
                const wsPath = normalizePath(w.rootPath)
                return sessionPath === wsPath || sessionPath.startsWith(wsPath + '/')
              })
            }
            if (s.workspaceId) return s.workspaceId === activeWorkspaceId
            if (!normalizedActive) return false
            const root = normalizePath(s.projectRoot ?? s.cwd)
            return root === normalizedActive || root.startsWith(normalizedActive + '/')
          })
          .sort((a, b) => b.createdAt - a.createdAt)
        onSelectSession(remaining[0]?.sessionId ?? null)
      }
    })
  }, [requestClose, activeSessionId, isRootWorkspace, activeWorkspaceId, normalizedActive, removeTab, onSelectSession])

  const handleCloseAllSplits = useCallback(async (meta: SessionMeta) => {
    if (!meta.groupId) return
    const splits = projectSessions.filter((s) => s.groupId === meta.groupId && /^Split #\d+$/.test(s.name))
    for (const split of splits) {
      try { await killSession(split.sessionId) } catch {}
      removeTab(split.sessionId)
    }
  }, [projectSessions, removeTab])

  const handleEditSave = useCallback(async (meta: SessionMeta, name: string, color: string) => {
    try { const patched = await patchSession({ sessionId: meta.sessionId, name, color }); upsertSession(patched) } catch {}
    setEditMeta(null)
  }, [upsertSession])

  const handleEditGroupSave = useCallback(async (groupId: string, name: string, color: string) => {
    const updated = (sessionGroups ?? []).map((g) => g.id === groupId ? { ...g, name, color } : g)
    try { await updateSettings({ sessionGroups: updated }) } catch {}
    setEditingGroup(null)
  }, [sessionGroups, updateSettings])

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    const sessionsInGroup = projectSessions.filter((s) => s.groupId === groupId)
    await Promise.all(sessionsInGroup.map((s) =>
      patchSession({ sessionId: s.sessionId, groupId: null }).then((p) => upsertSession(p)).catch(() => {})
    ))
    await updateSettings({ sessionGroups: sessionGroups.filter((g) => g.id !== groupId) })
  }, [projectSessions, sessionGroups, updateSettings, upsertSession])

  const handleOpenGroupAsLayout = useCallback((groupId: string): void => {
    const sessionIds = projectSessions.filter((s) => s.groupId === groupId).map((s) => s.sessionId)
    if (sessionIds.length > 0) openGroupInSplits(sessionIds)
  }, [projectSessions, openGroupInSplits])

  const handleCreateGroup = useCallback(async (name: string, color: string): Promise<void> => {
    const id = crypto.randomUUID()
    await updateSettings({ sessionGroups: [...sessionGroups, { id, name, color }] })
    toast.success(`Group "${name}" created`)
  }, [sessionGroups, updateSettings])

  const handleCloseProject = useCallback(async (workspace: Workspace): Promise<void> => {
    const state = useStore.getState()
    const workspaceSessions = Object.values(state.sessions).filter((s) => s.workspaceId === workspace.id)
    await Promise.all(workspaceSessions.map((s) => killSession(s.sessionId).catch(() => {})))
    const tabIds = new Set<string>()
    for (const s of workspaceSessions) {
      const tabId = findTabForSession(state.paneTree, s.sessionId) ?? s.sessionId
      tabIds.add(tabId)
    }
    tabIds.forEach((tabId) => removeTab(tabId))
    try { await deleteWorkspace(workspace.id) } catch {}
    if (workspace.rootPath) {
      const current = useStore.getState().settings.recentProjects ?? []
      if (!current.includes(workspace.rootPath)) {
        await updateSettings({ recentProjects: [workspace.rootPath, ...current].slice(0, 10) })
      }
    }
    removeWorkspaceFromStore(workspace.id)
  }, [removeTab, removeWorkspaceFromStore, updateSettings])

  const handleReopenProject = useCallback(async (rootPath: string): Promise<void> => {
    setWsOpen(false)
    const name = rootPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'project'
    try {
      const workspace = await createWorkspace({ name, rootPath })
      addWorkspace(workspace)
      const updated = (useStore.getState().settings.recentProjects ?? []).filter((p) => p !== rootPath)
      await updateSettings({ recentProjects: updated })
      onWorkspaceChange(workspace.id)
      toast.success(`Opened "${name}"`)
    } catch {
      toast.error('Failed to open project')
    }
  }, [addWorkspace, onWorkspaceChange, updateSettings])

  const handleDetach = useCallback((sessionId: string): void => {
    if (!windowId) return
    const tabId = findTabForSession(useStore.getState().paneTree, sessionId) ?? sessionId
    detachPane(tabId, sessionId)
    void detachTab(sessionId, windowId)
    if (activeSessionId === sessionId) onSelectSession(null)
  }, [detachPane, windowId, activeSessionId, onSelectSession])

  const handleReattach = useCallback((sessionId: string): void => {
    void reattachTab(sessionId, windowId ?? undefined)
  }, [windowId])

  const handleMoveToWindow = useCallback((sessionId: string, targetWindowId: string): void => {
    const tabId = findTabForSession(useStore.getState().paneTree, sessionId) ?? sessionId
    detachPane(tabId, sessionId)
    void moveToWindow(sessionId, targetWindowId)
  }, [detachPane])

  const handleSplitHere = useCallback((sessionId: string): void => {
    if (!activeSessionId) return
    openGroupInSplits([activeSessionId, sessionId])
  }, [activeSessionId, openGroupInSplits])


  const effectiveActiveId = useMemo(() => {
    if (!activeSessionId || !focusedSessionId) return activeSessionId
    const tree = paneTree[activeSessionId]
    if (tree && collectSessionIds(tree).includes(focusedSessionId)) return focusedSessionId
    return activeSessionId
  }, [activeSessionId, focusedSessionId, paneTree])

  // Which file path is shown in the currently focused leaf?
  const activeFilePath = useMemo(() => {
    if (!focusedLeafId) return null
    for (const tabId of Object.keys(paneTree)) {
      const tree = paneTree[tabId]
      if (!tree) continue
      const leaf = collectFileEditorLeaves(tree).find((l) => l.leafId === focusedLeafId)
      if (leaf) return leaf.filePath
    }
    return null
  }, [focusedLeafId, paneTree])

  const navigateToFile = useCallback((filePath: string) => {
    const state = useStore.getState()

    // If file is already visible in the layout, just focus it
    for (const tabId of Object.keys(state.paneTree)) {
      const tree = state.paneTree[tabId]
      if (!tree) continue
      const leaf = collectFileEditorLeaves(tree).find((l) => normalizePath(l.filePath) === normalizePath(filePath))
      if (leaf) {
        if (tabId !== activeSessionId) onSelectSession(tabId)
        setFocusedLeaf(leaf.leafId)
        return
      }
    }

    // Not in layout — open alongside existing panes, never replace
    const tabId = (activeSessionId && state.paneTree[activeSessionId])
      ? activeSessionId
      : (state.tabOrder.find((id) => state.paneTree[id]) ?? '__root__')
    const tree = state.paneTree[tabId]
    if (!tree) return

    const newLeaf = makeFileEditorLeaf(filePath)
    const fileLeaves = collectFileEditorLeaves(tree)
    if (fileLeaves.length > 0) {
      const target = fileLeaves.find((l) => l.leafId === state.focusedLeafId) ?? fileLeaves[0]
      state.replaceLayoutLeaf(tabId, target.leafId, newLeaf)
    } else if (tree.type === 'leaf' && tree.panel === 'home') {
      state.replaceLayoutLeaf(tabId, tree.id, newLeaf)
    } else {
      state.insertLayoutAtRight(tabId, newLeaf)
    }
    state.setFocusedLeaf(newLeaf.id)
  }, [activeSessionId, onSelectSession, setFocusedLeaf])

  const handleSessionSelect = useCallback((sessionId: string): void => {
    const tabId = findTabForSession(paneTree, sessionId)
    if (tabId) {
      onSelectSession(tabId)
      setFocusedSession(sessionId)
    } else {
      // Session exists but has no pane (closed pane, not killed) — re-open it in its own tab.
      addTab(sessionId)
    }
  }, [paneTree, onSelectSession, setFocusedSession, addTab])

  const renderSessionRow = (meta: SessionMeta): JSX.Element => (
    <SessionRow
      key={meta.sessionId}
      meta={meta}
      activeSessionId={effectiveActiveId}
      worktreeStats={worktreeStats}
      isNoWorkspace={isRootWorkspace}
      dragging={draggedSessionId === meta.sessionId}
      onSelectSession={() => handleSessionSelect(meta.sessionId)}
      onEditMeta={setEditMeta}
      onCtxMenu={setCtxMenu}
      onDragStart={setDraggedSessionId}
      onDragEnd={() => setDraggedSessionId(null)}
    />
  )

  const makeDropZone = (groupId: string | null) => ({
    onDragOver: (e: React.DragEvent) => { if (draggedSessionId) { e.preventDefault(); setDragOverGroupId(groupId ?? 'ungrouped') } },
    onDragLeave: () => setDragOverGroupId(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); void handleDrop(groupId) },
  })

  const sessionListContent = (
    <>
      {projectSessions.length === 0 && isRestoringLayout && (
        <div className="flex flex-col gap-0.5 py-1">
          {[0.85, 0.65, 0.75].map((w, i) => (
            <div key={i} className="flex flex-col gap-1 px-3 py-2 border-l-2 border-transparent">
              <div className="flex items-center gap-2">
                <Skeleton className="w-1.5 h-1.5 rounded-full flex-shrink-0" />
                <Skeleton className="h-2.5 rounded" style={{ width: `${w * 100}%` }} />
              </div>
              <Skeleton className="h-2 rounded ml-3.5" style={{ width: `${(w * 0.7) * 100}%` }} />
            </div>
          ))}
        </div>
      )}

      {projectSessions.length === 0 && !isRestoringLayout && (
        <p className="text-xs text-zinc-600 text-center mt-6 px-4">No sessions yet</p>
      )}

      {grouped ? (
        <>
          <div
            {...makeDropZone(null)}
            className={cn('min-h-[4px] transition-colors', dragOverGroupId === 'ungrouped' && draggedSessionId && 'bg-brand-accent/10')}
          >
            {grouped.ungrouped.map(renderSessionRow)}
          </div>

          {sessionGroups.map((g) => {
            const isCollapsed = collapsedGroups.has(g.id)
            const groupSessions = grouped.byGroup[g.id] ?? []
            const splitChildren = groupSessions.filter((s) => /^Split #\d+$/.test(s.name))
            const isSplitGroup = splitChildren.length > 0
            const displaySessions = isSplitGroup
              ? groupSessions.filter((s) => !/^Split #\d+$/.test(s.name))
              : groupSessions
            const splitPaneCount = isSplitGroup ? groupSessions.length : undefined
            const toggleCollapsed = (): void => setCollapsedGroups((prev) => {
              const next = new Set(prev)
              if (next.has(g.id)) next.delete(g.id)
              else next.add(g.id)
              return next
            })
            return (
              <div
                key={g.id}
                {...makeDropZone(g.id)}
                className={cn('transition-colors rounded-sm', dragOverGroupId === g.id && draggedSessionId && 'bg-brand-accent/10')}
              >
                <div
                  className="flex items-center gap-2 px-2 py-2 mx-1 rounded cursor-pointer select-none hover:bg-brand-panel/50 transition-colors"
                  onClick={toggleCollapsed}
                  onContextMenu={(e) => { e.preventDefault(); setGroupCtxMenu({ x: e.clientX, y: e.clientY, group: g }) }}
                >
                  <ChevronRight
                    size={12}
                    className={cn('flex-shrink-0 text-zinc-600 transition-transform duration-150', !isCollapsed && 'rotate-90')}
                  />
                  <span className="w-2.5 h-2.5 flex-shrink-0" style={{ backgroundColor: g.color ?? '#6366f1', borderRadius: '3px' }} />
                  <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider truncate flex-1">{g.name}</span>
                  {isCollapsed && displaySessions.length > 0 && (
                    <span className="text-[10px] text-zinc-600 font-medium tabular-nums flex-shrink-0">{displaySessions.length}</span>
                  )}
                </div>
                {!isCollapsed && (
                  displaySessions.length === 0
                    ? <p className="px-7 pb-1.5 text-[10px] text-zinc-700 italic">Drag sessions here</p>
                    : <div className="ml-5 border-l border-zinc-800">
                        {displaySessions.map((meta) => (
                          <SessionRow
                            key={meta.sessionId}
                            meta={meta}
                            activeSessionId={effectiveActiveId}
                            worktreeStats={worktreeStats}
                            isNoWorkspace={isRootWorkspace}
                            dragging={draggedSessionId === meta.sessionId}
                            onSelectSession={() => handleSessionSelect(meta.sessionId)}
                            onEditMeta={setEditMeta}
                            onCtxMenu={setCtxMenu}
                            onDragStart={setDraggedSessionId}
                            onDragEnd={() => setDraggedSessionId(null)}
                            paneCount={splitPaneCount}
                          />
                        ))}
                      </div>
                )}
              </div>
            )
          })}
        </>
      ) : (
        projectSessions.map(renderSessionRow)
      )}
    </>
  )

  const handleFileDragOver = (e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragOver(true) }
  }

  const handleFileDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (activeView === 'files' && fileTreeRoot) {
      for (const file of files) {
        const srcPath = (file as unknown as { path: string }).path
        if (!srcPath) continue
        const destPath = fileTreeRoot + '/' + file.name
        copyFile(srcPath, destPath)
          .then(() => setFileRefreshTick((t) => t + 1))
          .catch(() => toast.error(`Failed to copy ${file.name}`))
      }
      return
    }
    if (!activeSessionId || activeSessionId === '__root__') return
    for (const file of files) {
      const path = (file as unknown as { path: string }).path
      if (!path) continue
      if (file.type !== '') {
        insertLayoutAtRight(activeSessionId, makeFileEditorLeaf(path))
      }
    }
  }

  return (
    <div
      className={cn('flex flex-col h-full bg-brand-bg w-full transition-colors', isDragOver && 'ring-2 ring-inset ring-brand-accent/50')}
      onDragOver={handleFileDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleFileDrop}
    >
      {/* Workspace switcher */}
      <div className="flex-shrink-0 relative px-2 pt-2 pb-[3px]">
        <div className="flex items-stretch gap-[3px]">
          <button
            onClick={() => setWsOpen((v) => !v)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-left flex-1 min-w-0 bg-brand-surface hover:bg-brand-panel/50 border border-brand-panel/60 border-b-0 transition-colors',
              isRootWorkspace ? 'rounded-t-xl' : 'rounded-tl-xl'
            )}
          >
            <FolderOpen size={14} className="text-zinc-500 flex-shrink-0" />
            <span className="text-sm font-medium text-zinc-300 truncate flex-1">
              {activeWorkspace?.name ?? 'Home'}
            </span>
            <ChevronDown size={12} className={cn('text-zinc-500 transition-transform flex-shrink-0', wsOpen && 'rotate-180')} />
          </button>
          {!isRootWorkspace && installedEditors.length > 0 && (
            <button
              onClick={() => { openInEditor(installedEditors[0].command, fileTreeRoot).catch(() => {}) }}
              title={`Open in ${installedEditors[0].name}`}
              className="flex items-center px-2.5 bg-brand-surface hover:bg-brand-panel/50 border border-brand-panel/60 border-b-0 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
            >
              <ExternalLink size={14} />
            </button>
          )}
          {!isRootWorkspace && (
            <button
              onClick={() => { const w = activeWorkspace; if (w) setClosingProject(w) }}
              title="Close project"
              className="flex items-center px-2.5 bg-brand-surface hover:bg-brand-panel/50 border border-brand-panel/60 border-b-0 rounded-tr-xl text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
            >
              <FolderX size={14} />
            </button>
          )}
        </div>
        {wsOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setWsOpen(false)} />
            <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-brand-surface border border-brand-panel/60 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto">
              <button
                onClick={() => { setWsOpen(false); setShowNewWsModal(true) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 hover:bg-brand-panel hover:text-zinc-300 transition-colors text-left"
              >
                <Plus size={11} /> New Project
              </button>
              <div className="h-px bg-brand-panel my-1" />
              <button
                onClick={() => { onWorkspaceChange(ROOT_WORKSPACE_ID); setWsOpen(false) }}
                className={cn('w-full px-3 py-1.5 text-xs text-left transition-colors hover:bg-brand-panel', isRootWorkspace && 'bg-brand-panel/60 text-zinc-200')}
              >
                <span className={isRootWorkspace ? 'text-zinc-200' : 'text-zinc-400'}>{workspaces.find((w) => w.isRoot)?.name ?? 'Home'}</span>
              </button>
              {workspaces.filter((w) => !w.isRoot).length > 0 && <div className="h-px bg-brand-panel my-1" />}
              {workspaces.filter((w) => !w.isRoot).map((w) => (
                <div key={w.id} className="group relative flex items-center">
                  <button
                    onClick={() => { onWorkspaceChange(w.id); setWsOpen(false) }}
                    className={cn('flex-1 flex flex-col px-3 py-1.5 text-left transition-colors hover:bg-brand-panel pr-8', w.id === activeWorkspaceId && 'bg-brand-panel/60')}
                  >
                    <span className={cn('text-xs', w.id === activeWorkspaceId ? 'text-zinc-200' : 'text-zinc-400')}>{w.name}</span>
                    {w.rootPath && <span className="text-[10px] text-zinc-600">{shortPath(w.rootPath)}</span>}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setWsOpen(false); setClosingProject(w) }}
                    title="Close project"
                    className="absolute right-2 p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              {recentProjects.length > 0 && (
                <>
                  <div className="h-px bg-brand-panel my-1" />
                  <div className="px-3 pt-1 pb-0.5 text-[10px] text-zinc-600 uppercase tracking-wider">Recent</div>
                  {recentProjects.slice(0, 8).map((path) => {
                    const name = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
                    return (
                      <div key={path} className="group relative flex items-center">
                        <button
                          onClick={() => void handleReopenProject(path)}
                          className="flex-1 flex flex-col px-3 py-1.5 text-left hover:bg-brand-panel transition-colors pr-8"
                        >
                          <span className="text-xs text-zinc-400">{name}</span>
                          <span className="text-[10px] text-zinc-600">{shortPath(path)}</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const updated = (useStore.getState().settings.recentProjects ?? []).filter((p) => p !== path)
                            void updateSettings({ recentProjects: updated })
                          }}
                          title="Remove from recent"
                          className="absolute right-2 p-1 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </>
        )}
        {showNewWsModal && (
          <NewWorkspaceModal
            onDismiss={() => setShowNewWsModal(false)}
            onSave={async (name, rootPath) => {
              try {
                const workspace = await createWorkspace({ name, rootPath })
                addWorkspace(workspace)
                onWorkspaceChange(workspace.id)
                toast.success(`Project "${name}" created`)
              } catch {
                toast.error('Failed to create workspace')
              }
              setShowNewWsModal(false)
            }}
          />
        )}
      </div>

      {/* Body — file tree card */}
      <div className="px-2 pb-2 flex flex-col flex-1 min-h-0" ref={sidebarBodyRef}>
        <div className="flex flex-col flex-1 min-h-0 rounded-b-xl border border-brand-panel/60 bg-brand-surface shadow-md shadow-black/20 overflow-hidden">
          {/* Folder header */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-brand-panel/40 flex-shrink-0">
            <span className="text-sm text-zinc-300 truncate flex-1 min-w-0 font-medium">
              {fileTreeRoot ? fileTreeRoot.split('/').filter(Boolean).pop() ?? fileTreeRoot : 'No folder open'}
            </span>
            {fileTreeRoot && (
              <>
                <button
                  onClick={() => document.dispatchEvent(new CustomEvent('acc:new-file-at-root', { detail: { parentDir: fileTreeRoot, type: 'file' } }))}
                  title="New File"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0 p-1"
                >
                  <FilePlus2 size={14} />
                </button>
                <button
                  onClick={() => document.dispatchEvent(new CustomEvent('acc:new-file-at-root', { detail: { parentDir: fileTreeRoot, type: 'folder' } }))}
                  title="New Folder"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0 p-1"
                >
                  <FolderPlus size={14} />
                </button>
              </>
            )}
            <button
              onClick={() => document.dispatchEvent(new CustomEvent('acc:open-project'))}
              title="Open Folder"
              className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0 p-1"
            >
              <FolderOpen size={14} />
            </button>
          </div>
          {fileTreeRoot ? (
            <FileTree
              projectRoot={fileTreeRoot}
              activeFilePath={activeFilePath}
              onFileClick={(path) => navigateToFile(path)}
              refreshTick={fileRefreshTick}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 py-10">
              <FolderOpen size={28} className="text-zinc-700" />
              <p className="text-xs text-zinc-500 text-center leading-relaxed">
                No folder open.<br />Open a project to browse files.
              </p>
              <button
                onClick={() => document.dispatchEvent(new CustomEvent('acc:open-project'))}
                className="text-xs px-3 py-1.5 rounded bg-brand-accent/20 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/30 transition-colors"
              >
                Open Folder
              </button>
            </div>
          )}
        </div>
      </div>

      {ctxMenu && (
        <SessionCtxMenu
          ctxMenu={ctxMenu}
          onDismiss={() => setCtxMenu(null)}
          onRename={setEditMeta}
          onSplitHere={handleSplitHere}
          onDetach={handleDetach}
          onReattach={handleReattach}
          onCloseAllSplits={handleCloseAllSplits}
          onKill={handleCloseSession}
          onMoveToWindow={handleMoveToWindow}
          activeSessionId={activeSessionId}
          paneTree={paneTree}
          isMainWindow={isMainWindow}
          windowId={windowId}
          projectSessions={projectSessions}
        />
      )}

      {editMeta && (
        <EditSessionModal
          meta={editMeta}
          onSave={(name, color) => handleEditSave(editMeta, name, color)}
          onDismiss={() => setEditMeta(null)}
        />
      )}

      {groupCtxMenu && (
        <GroupCtxMenu
          groupCtxMenu={groupCtxMenu}
          onDismiss={() => setGroupCtxMenu(null)}
          onEdit={setEditingGroup}
          onDelete={(id) => void handleDeleteGroup(id)}
          onOpenAsLayout={handleOpenGroupAsLayout}
        />
      )}

      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          onSave={(name, color) => void handleEditGroupSave(editingGroup.id, name, color)}
          onDismiss={() => setEditingGroup(null)}
        />
      )}

      {closeModal}

      {showNewGroupModal && (
        <NewGroupModal
          onDismiss={() => setShowNewGroupModal(false)}
          onSave={handleCreateGroup}
        />
      )}

      {closingProject && (
        <ConfirmCloseProjectModal
          workspaceLabel={closingProject.name}
          onClose={() => setClosingProject(null)}
          onConfirm={() => { void handleCloseProject(closingProject); setClosingProject(null) }}
        />
      )}
    </div>
  )
}
