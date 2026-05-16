import { useState, useCallback, useRef, useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { Settings, HelpCircle } from 'lucide-react'
import { marked } from 'marked'
import { createPortal } from 'react-dom'
import { useTheme } from './hooks/useTheme'
import { useSidebarResize } from './hooks/useSidebarResize'
import { useNoteWindowPreview } from './hooks/useNoteWindowPreview'
import { TitleBar } from './components/TitleBar'
import { PaneContextMenu } from './features/session/components/PaneContextMenu'
import { CommandPalette } from './components/CommandPalette'
import { FileFinderModal } from './features/fs/components/FileFinderModal'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal'
import { ReleaseNotesModal } from './components/ReleaseNotesModal'
import { NewSessionForm } from './features/session/components/NewSessionForm'
import { SettingsForm } from './features/settings/components/SettingsForm'
import { AgentMonitorSidebar } from './features/workspace/components/AgentMonitorSidebar'
import { AgentMonitorLayout } from './features/workspace/components/AgentMonitorLayout'
import { SessionDock } from './features/session/components/SessionDock'
import { GitReviewPanel } from './features/workspace/components/GitReviewPanel'
import { useSessionLifecycle } from './features/session/hooks/useSessionLifecycle'
import { useLayoutPersistence } from './features/session/hooks/useLayoutPersistence'
import { useLayoutRestore } from './features/session/hooks/useLayoutRestore'
import { useKeyboardShortcuts } from './features/session/hooks/useKeyboardShortcuts'
import { usePaneActions } from './features/session/hooks/usePaneActions'
import { useAutoUpdater } from './features/updater/hooks/useAutoUpdater'
import { useGitReview } from './features/workspace/hooks/useGitReview'
import { useStore } from './store/root.store'
import { findNotesLeafId } from './features/layout/layout-tree'
import { LayoutDndProvider } from './features/layout/dnd/LayoutDndContext'
import { setWindowMeta } from './features/window/window.service'
import { getUiState, setUiState } from './features/workspace/workspace.service'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NotificationBell } from './features/notifications/components/NotificationBell'
import { ipc } from './lib/ipc'
import { IPC } from '@shared/ipc-channels'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import { cn, normalizePath } from './lib/utils'

declare const __APP_VERSION__: string

interface ContextMenuTarget {
  x: number
  y: number
  sessionId: string
  tabId: string
}


const WINDOW_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#06b6d4']

function StatusWindowBadge(): JSX.Element | null {
  const windowName = useStore((s) => s.windowName)
  const windowColor = useStore((s) => s.windowColor)
  const windowId = useStore((s) => s.windowId)
  const totalWindowCount = useStore((s) => s.totalWindowCount)
  const setWindowMetaStore = useStore((s) => s.setWindowMeta)
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 })
  const nameRef = useRef<HTMLButtonElement>(null)

  if (windowId == null || totalWindowCount <= 1) return null

  const handleEditOpen = (): void => {
    const rect = nameRef.current?.getBoundingClientRect()
    if (rect) setPopoverPos({ x: rect.left + rect.width / 2, y: rect.top })
    setEditName(windowName)
    setEditColor(windowColor)
    setEditOpen(true)
  }

  const handleSave = (): void => {
    const name = editName.trim() || windowName
    setWindowMetaStore(name, editColor)
    void setWindowMeta(name, editColor)
    setEditOpen(false)
  }

  return (
    <>
      <button
        ref={nameRef}
        onClick={handleEditOpen}
        className="flex items-center gap-1.5 h-7 px-2 rounded text-[11px] font-semibold hover:opacity-70 transition-opacity"
        style={{ color: windowColor }}
        title="Edit window name"
      >
        {windowName}
      </button>
      {editOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setEditOpen(false)} />
          <div
            className="fixed z-[9999] bg-brand-surface border border-brand-panel/60 rounded-lg shadow-2xl p-3 w-56"
            style={{ left: Math.max(4, popoverPos.x - 112), bottom: window.innerHeight - popoverPos.y + 8 }}
          >
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditOpen(false) }}
              className="w-full bg-brand-panel border border-brand-panel/60 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-brand-accent mb-2"
              placeholder="Window name"
            />
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {WINDOW_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setEditColor(c)}
                  className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: editColor === c ? `2px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleSave}
              className="w-full py-1 text-xs font-semibold rounded transition-opacity hover:opacity-80"
              style={{ backgroundColor: editColor, color: '#fff' }}
            >
              Save
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  )
}


export function App(): JSX.Element {
  useSessionLifecycle()
  useLayoutPersistence()
  useLayoutRestore()
  useAutoUpdater()

  const tabOrder = useStore((s) => s.tabOrder)
  const paneTree = useStore((s) => s.paneTree)
  const sessions = useStore((s) => s.sessions)
  const appTheme = useStore((s) => s.settings.theme)
  const storeActiveSessionId = useStore((s) => s.activeSessionId)
  const isRestoringLayout = useStore((s) => s.isRestoringLayout)
  const windowHighlighted = useStore((s) => s.windowHighlighted)
  const windowColor = useStore((s) => s.windowColor)

  const uiFontSize = useStore((s) => s.settings.uiFontSize ?? 14)
  const settingsLoaded = useStore((s) => s.settingsLoaded)
  const dismissedReleaseVersion = useStore((s) => s.settings.dismissedReleaseVersion)
  const updateSettings = useStore((s) => s.updateSettings)
  const patchNoteContent = useStore((s) => s.patchNoteContent)
  const addNotification = useStore((s) => s.addNotification)
  const markTabNotificationsRead = useStore((s) => s.markTabNotificationsRead)

  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [fileFinderOpen, setFileFinderOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  const [sidePanel, setSidePanel] = useState<'settings' | 'git' | null>(null)
  const [workspaceSessionId, setWorkspaceSessionId] = useState<string | null>('__root__')
  const restoredWorkspaceRef = useRef(false)

  useEffect(() => {
    if (workspaceSessionId && workspaceSessionId !== '__root__' && !paneTree[workspaceSessionId]) {
      setWorkspaceSessionId('__root__')
    }
  }, [workspaceSessionId, paneTree])

  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const workspaces = useStore((s) => s.workspaces)
  const setActiveWorkspaceId = useStore((s) => s.setActiveWorkspaceId)
  const resetRootPane = useStore((s) => s.resetRootPane)
  const workspaceProject = workspaces.find((w) => w.id === activeWorkspaceId)?.rootPath || null
  const { sidebarWidth, handleSidebarDragStart } = useSidebarResize(224)

  const selectedSession = useStore((s) => workspaceSessionId ? s.sessions[workspaceSessionId] : null)
  // Active session cwd — updated live via OSC 7 shell integration
  const focusedSessionCwd = useStore((s) => {
    const id = s.focusedSessionId ?? s.activeSessionId
    return id ? (s.sessions[id]?.cwd ?? null) : null
  })
  const gitRoot = selectedSession?.worktreePath ?? workspaceProject
  const gitReview = useGitReview(gitRoot, selectedSession?.worktreeBaseBranch)

  useEffect(() => {
    if (settingsLoaded && dismissedReleaseVersion !== __APP_VERSION__) {
      addNotification({ type: 'release-notes', title: `What's new in v${__APP_VERSION__}` })
    }
  }, [settingsLoaded, dismissedReleaseVersion])

  useEffect(() => {
    const handler = (): void => setReleaseNotesOpen(true)
    document.addEventListener('acc:open-release-notes', handler)
    return () => document.removeEventListener('acc:open-release-notes', handler)
  }, [])

  useEffect(() => {
    if (storeActiveSessionId) markTabNotificationsRead(storeActiveSessionId)
  }, [storeActiveSessionId])

  useEffect(() => {
    const handler = (): void => { if (gitRoot) setSidePanel(p => p === 'git' ? null : 'git') }
    document.addEventListener('acc:toggle-git-review', handler)
    return () => document.removeEventListener('acc:toggle-git-review', handler)
  }, [gitRoot])

  useEffect(() => {
    const handler = (): void => setFileFinderOpen(true)
    document.addEventListener('acc:open-file-finder', handler)
    return () => document.removeEventListener('acc:open-file-finder', handler)
  }, [])

  useEffect(() => { setSidePanel(null) }, [workspaceProject])

  useEffect(() => {
    const handler = (): void => setSidePanel((p) => p === 'settings' ? null : 'settings')
    document.addEventListener('acc:open-settings', handler)
    return () => document.removeEventListener('acc:open-settings', handler)
  }, [])


  useEffect(() => {
    return ipc.on(IPC.NOTES_EXTERNAL_UPDATE, (payload) => {
      const { id, content } = payload as { id: string; content: string }
      patchNoteContent(id, content)
    })
  }, [patchNoteContent])

  useEffect(() => {
    // During restore don't jump — the layout is still being rebuilt.
    // Once restore ends (or if there was never a restore), show the active session immediately.
    if (!isRestoringLayout) setWorkspaceSessionId(storeActiveSessionId ?? '__root__')
  }, [storeActiveSessionId, isRestoringLayout])

  // Restore last active workspace once the workspace list loads
  useEffect(() => {
    if (workspaces.length === 0 || restoredWorkspaceRef.current) return
    restoredWorkspaceRef.current = true
    getUiState().then((uiState) => {
      if (uiState.activeWorkspaceId && workspaces.some((w) => w.id === uiState.activeWorkspaceId)) {
        setActiveWorkspaceId(uiState.activeWorkspaceId)
      }
    })
  }, [workspaces, setActiveWorkspaceId])

  const handleWorkspaceChange = useCallback((id: string) => {
    setActiveWorkspaceId(id)
    setWorkspaceSessionId('__root__')
    resetRootPane()
    void setUiState({ activeWorkspaceId: id })
  }, [setActiveWorkspaceId, resetRootPane])

  useEffect(() => {
    document.documentElement.style.fontSize = `${uiFontSize}px`
  }, [uiFontSize])

  useTheme(appTheme)

  const toggleNotesPane = useStore((s) => s.toggleNotesPane)

  useKeyboardShortcuts({
    onTogglePalette: () => setPaletteOpen((v) => !v),
    onShowShortcuts: () => setShortcutsOpen((v) => !v),
    onOpenFileFinder: useCallback(() => setFileFinderOpen(true), []),
    onNewNoteDrawer: useCallback(() => {
      const { activeWorkspaceId, workspaces, activeSessionId: tabId, paneTree } = useStore.getState()
      const workspace = workspaces.find((w) => w.id === activeWorkspaceId && !w.isRoot)

      if (workspace?.rootPath) {
        document.dispatchEvent(new CustomEvent('acc:new-file-at-root', {
          detail: { parentDir: normalizePath(workspace.rootPath), type: 'file' }
        }))
        return
      }

      // Root or workspace without folder — toggle notes pane
      if (!tabId) return
      const tree = paneTree[tabId]
      if (tree && findNotesLeafId(tree)) {
        document.dispatchEvent(new CustomEvent('acc:new-note'))
      } else {
        toggleNotesPane(tabId)
        setTimeout(() => document.dispatchEvent(new CustomEvent('acc:new-note')), 50)
      }
    }, [toggleNotesPane]),
  })

  const { handleSplitH, handleSplitV, handleDetach, handleReattach, handleClosePane, handleKillSession } = usePaneActions(contextMenu)

  const handleContextMenu = useCallback((e: React.MouseEvent, sessionId: string, tabId: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId, tabId })
  }, [])

  const notePreviewWindowNoteId = useNoteWindowPreview()

  const focusedSessionId = useStore((s) => s.focusedSessionId)
  const notes = useStore((s) => s.notes)
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null)

  useEffect(() => {
    setFocusedNoteId(null)
    const handler = (e: Event): void => {
      const { noteId, tabId } = (e as CustomEvent<{ noteId: string; tabId: string }>).detail
      if (tabId === workspaceSessionId) setFocusedNoteId(noteId)
    }
    document.addEventListener('acc:note-active-changed', handler)
    return () => document.removeEventListener('acc:note-active-changed', handler)
  }, [workspaceSessionId])

  useEffect(() => { if (focusedSessionId) setFocusedNoteId(null) }, [focusedSessionId])

  useEffect(() => {
    const handler = (): void => setFocusedNoteId(null)
    document.addEventListener('acc:terminal-pane-focused', handler)
    return () => document.removeEventListener('acc:terminal-pane-focused', handler)
  }, [])

  const titleSession = (focusedSessionId && sessions[focusedSessionId])
    ? sessions[focusedSessionId]
    : workspaceSessionId ? sessions[workspaceSessionId] : null
  const focusedNote = focusedNoteId ? notes.find((n) => n.id === focusedNoteId) : null
  const noteTitleText = focusedNote
    ? (focusedNote.content.split('\n').find((l) => l.trim())?.trim().slice(0, 50) || 'Untitled')
    : null
  const titleBarTitle = sidePanel === 'settings' ? 'Settings' : (noteTitleText ?? titleSession?.name ?? 'Orbit')
  const titleBarSubtitle = sidePanel === 'settings' ? '' : (noteTitleText ? 'Note' : (titleSession?.cwd ?? ''))


  if (notePreviewWindowNoteId) {
    const previewNote = notes.find((n) => n.id === notePreviewWindowNoteId)
    const previewContent = previewNote?.content ?? ''
    const previewTitle = previewContent.split('\n').find((l) => l.trim())?.trim().slice(0, 50) || 'Untitled'
    const previewHtml = marked.parse(previewContent) as string
    return (
      <div className="flex flex-col h-screen bg-brand-bg text-zinc-100 overflow-hidden">
        <TitleBar title={`Preview · ${previewTitle}`} subtitle="Note Preview" />
        <div
          className="flex-1 overflow-y-auto px-8 py-6 markdown-body select-text min-h-0"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-brand-bg text-zinc-100 overflow-hidden">
      <TitleBar title={titleBarTitle} subtitle={titleBarSubtitle} />

      <LayoutDndProvider>
      <div className="flex flex-1 min-h-0">
        {/* Sidebar — always visible */}
        <div style={{ width: sidebarWidth, flexShrink: 0 }} className="flex flex-col h-full border-r border-brand-panel">
          <AgentMonitorSidebar
            activeWorkspaceId={activeWorkspaceId}
            onWorkspaceChange={handleWorkspaceChange}
            activeSessionId={workspaceSessionId}
            onSelectSession={setWorkspaceSessionId}
          />
        </div>
        <div
          className="w-1 flex-shrink-0 bg-brand-panel hover:bg-brand-accent transition-colors cursor-col-resize"
          onMouseDown={handleSidebarDragStart}
        />

        {/* Main content */}
        <div className="flex-1 min-w-0 min-h-0 flex relative">
          {/* Terminal area */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <SessionDock
              activeSessionId={workspaceSessionId}
              onSelectSession={setWorkspaceSessionId}
            />
            <div className="flex-1 min-h-0 relative">
            <ErrorBoundary>
            <AgentMonitorLayout
              sessionId={
                workspaceSessionId && (sessions[workspaceSessionId] || workspaceSessionId === '__root__')
                  ? workspaceSessionId
                  : '__root__'
              }
              onSessionClose={() => setWorkspaceSessionId('__root__')}
            />
            </ErrorBoundary>
            </div>
          </div>

          {sidePanel !== null && (
            <>
              <div className="absolute inset-0 z-10" onClick={() => setSidePanel(null)} />
              <div
                className={cn(
                  'absolute right-0 top-0 h-full z-20 border-l border-brand-panel bg-brand-surface flex flex-col shadow-2xl',
                  sidePanel === 'settings' ? 'w-[520px]' : 'w-[420px]'
                )}
              >
                {sidePanel === 'settings' && <SettingsForm onClose={() => setSidePanel(null)} />}
                {sidePanel === 'git' && <GitReviewPanel projectRoot={gitRoot} gitReview={gitReview} />}
              </div>
            </>
          )}
        </div>
      </div>
      </LayoutDndProvider>

      {/* Status bar */}
      <div className="flex items-center h-10 px-3 bg-brand-surface border-t border-brand-panel flex-shrink-0">
        <div className="flex-1 flex items-center gap-1">
          <span className="text-[11px] text-zinc-600 font-medium select-none">v{__APP_VERSION__}</span>
          <button
            onClick={() => setReleaseNotesOpen(true)}
            title="What's new"
            className="text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            <HelpCircle size={13} />
          </button>
        </div>
        <StatusWindowBadge />
        <div className="flex-1 flex items-center gap-0.5 justify-end">
          <NotificationBell />
          <button
            onClick={() => setSidePanel(p => p === 'settings' ? null : 'settings')}
            title="Settings"
            className={cn('flex items-center gap-1.5 px-2.5 h-7 rounded transition-colors', sidePanel === 'settings' ? 'text-brand-muted bg-brand-panel' : 'text-zinc-500 hover:text-zinc-300')}
          >
            <Settings size={15} />
            <span className="text-[11px] font-medium">Settings</span>
          </button>
        </div>
      </div>

      {contextMenu && (
        <PaneContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isMainWindow={useStore.getState().isMainWindow}
          onDismiss={() => setContextMenu(null)}
          onSplitH={handleSplitH}
          onSplitV={handleSplitV}
          onDetach={handleDetach}
          onReattach={handleReattach}
          onClosePane={handleClosePane}
          onKillSession={handleKillSession}
        />
      )}

      <NewSessionForm variant="none" />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onShowShortcuts={() => { setPaletteOpen(false); setShortcutsOpen(true) }}
      />
      <FileFinderModal
        open={fileFinderOpen}
        rootPath={workspaceProject ?? focusedSessionCwd ?? ''}
        activeTabId={workspaceSessionId ?? '__root__'}
        onClose={() => setFileFinderOpen(false)}
      />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ReleaseNotesModal
        open={releaseNotesOpen}
        onClose={() => setReleaseNotesOpen(false)}
        onDismiss={() => {
          updateSettings({ dismissedReleaseVersion: __APP_VERSION__ })
          setReleaseNotesOpen(false)
        }}
      />
      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        toastOptions={{
          actionButtonStyle: {
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: 'inherit',
          }
        }}
      />
      {windowHighlighted && (
        <div
          className="fixed inset-0 pointer-events-none z-[9999] animate-pulse"
          style={{ boxShadow: `inset 0 0 0 3px ${windowColor}` }}
        />
      )}
    </div>
  )
}
