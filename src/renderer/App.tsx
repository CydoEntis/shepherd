import { useState, useCallback, useRef, useEffect } from 'react'
import { Toaster, toast } from 'sonner'
import { Settings, Moon, Sun, Monitor, Sparkles, GitBranch, Palette, Star, Flame, Waves, HelpCircle, Globe, Zap, ExternalLink, FolderOpen, ChevronDown, Plus, X } from 'lucide-react'
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
import { TERMINAL_THEME_LIST } from './features/terminal/hooks/useTerminal'
import { setWindowMeta } from './features/window/window.service'
import { useInstalledEditors } from './features/fs/hooks/useInstalledEditors'
import { openInEditor } from './features/fs/fs.service'
import { createWorkspace, deleteWorkspace } from './features/workspace/workspace.service'
import { NewWorkspaceModal } from './features/workspace/components/NewWorkspaceModal'
import { NotificationBell } from './features/notifications/components/NotificationBell'
import { openNoteInEditor } from './features/notes/notes.service'
import { ipc } from './lib/ipc'
import { IPC } from '@shared/ipc-channels'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import { cn, normalizePath, shortPath } from './lib/utils'

declare const __APP_VERSION__: string

interface ContextMenuTarget {
  x: number
  y: number
  sessionId: string
  tabId: string
}

const THEMES = [
  { id: 'dark'   as const, label: 'Dark',   icon: Moon      },
  { id: 'light'  as const, label: 'Light',  icon: Sun       },
  { id: 'system' as const, label: 'System', icon: Monitor   },
  { id: 'space'  as const, label: 'Space',  icon: Sparkles  },
  { id: 'nebula' as const, label: 'Nebula', icon: Star      },
  { id: 'solar'  as const, label: 'Solar',  icon: Flame     },
  { id: 'aurora' as const, label: 'Aurora', icon: Waves     },
  { id: 'mars'   as const, label: 'Mars',   icon: Globe     },
  { id: 'pulsar' as const, label: 'Pulsar', icon: Zap       },
]

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

function StatusThemeToggle(): JSX.Element {
  const theme = useStore((s) => s.settings.theme)
  const updateSettings = useStore((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ right: number; bottom: number }>({ right: 0, bottom: 32 })
  const CurrentIcon = THEMES.find((t) => t.id === theme)?.icon ?? Moon

  const handleOpen = (): void => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.top + 4 })
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={open ? () => setOpen(false) : handleOpen}
        title="Theme"
        className={cn('flex items-center gap-1.5 px-2.5 h-7 rounded transition-colors', open ? 'text-brand-muted bg-brand-panel' : 'text-zinc-500 hover:text-zinc-300')}
      >
        <CurrentIcon size={15} />
        <span className="text-[11px] font-medium">Theme</span>
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-36"
            style={{ right: menuPos.right, bottom: menuPos.bottom }}
          >
            {THEMES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { updateSettings({ theme: id }); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left',
                  theme === id ? 'text-zinc-200 bg-brand-panel/40' : 'text-zinc-400 hover:bg-brand-panel hover:text-zinc-200'
                )}
              >
                <Icon size={12} className="flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

function StatusTerminalThemeToggle({ sessionId }: { sessionId: string }): JSX.Element {
  const activeTheme = useStore((s) => s.terminalThemes[sessionId])
  const setTerminalTheme = useStore((s) => s.setTerminalTheme)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ right: number; bottom: number }>({ right: 0, bottom: 32 })

  const handleOpen = (): void => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.top + 4 })
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={open ? () => setOpen(false) : handleOpen}
        title="Terminal theme"
        className={cn('flex items-center gap-1.5 px-2.5 h-7 rounded transition-colors', open ? 'text-brand-muted bg-brand-panel' : 'text-zinc-500 hover:text-zinc-300')}
      >
        <Palette size={15} />
        <span className="text-[11px] font-medium">Terminal</span>
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-44"
            style={{ right: menuPos.right, bottom: menuPos.bottom }}
          >
            <button
              onClick={() => { setTerminalTheme(sessionId, ''); setOpen(false) }}
              className={cn('w-full text-left px-3 py-1.5 text-xs transition-colors', !activeTheme ? 'text-zinc-200 bg-brand-panel/40' : 'text-zinc-400 hover:bg-brand-panel hover:text-zinc-200')}
            >
              Auto (app theme)
            </button>
            <div className="my-1 border-t border-brand-panel/40" />
            {TERMINAL_THEME_LIST.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setTerminalTheme(sessionId, id); setOpen(false) }}
                className={cn('w-full text-left px-3 py-1.5 text-xs transition-colors', activeTheme === id ? 'text-zinc-200 bg-brand-panel/40' : 'text-zinc-400 hover:bg-brand-panel hover:text-zinc-200')}
              >
                {label}
              </button>
            ))}
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
  const windowHighlighted = useStore((s) => s.windowHighlighted)
  const windowColor = useStore((s) => s.windowColor)

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
  const [openInMenuOpen, setOpenInMenuOpen] = useState(false)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [workspaceSessionId, setWorkspaceSessionId] = useState<string | null>('__root__')

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
  const installedEditors = useInstalledEditors()

  const selectedSession = useStore((s) => workspaceSessionId ? s.sessions[workspaceSessionId] : null)
  const gitRoot = selectedSession?.worktreePath ?? workspaceProject
  const gitReview = useGitReview(gitRoot, selectedSession?.worktreeBaseBranch)
  const totalChanges =
    (gitReview.data?.staged.length ?? 0) +
    (gitReview.data?.unstaged.length ?? 0) +
    (gitReview.data?.untracked.length ?? 0)

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
    const handler = (e: Event): void => {
      setActiveNoteId((e as CustomEvent<{ noteId: string }>).detail.noteId)
    }
    document.addEventListener('acc:note-active-changed', handler)
    return () => document.removeEventListener('acc:note-active-changed', handler)
  }, [])

  useEffect(() => {
    return ipc.on(IPC.NOTES_EXTERNAL_UPDATE, (payload) => {
      const { id, content } = payload as { id: string; content: string }
      patchNoteContent(id, content)
    })
  }, [patchNoteContent])

  useEffect(() => {
    setWorkspaceSessionId(storeActiveSessionId ?? '__root__')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeActiveSessionId])

  const handleWorkspaceChange = useCallback((id: string) => {
    setActiveWorkspaceId(id)
    setWorkspaceSessionId('__root__')
    resetRootPane()
  }, [setActiveWorkspaceId, resetRootPane])

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
        <div className="flex-1 min-w-0 min-h-0 flex">
          {/* Terminal area */}
          <div className="flex-1 min-w-0 min-h-0 relative">
            <AgentMonitorLayout
              sessionId={
                workspaceSessionId && (sessions[workspaceSessionId] || workspaceSessionId === '__root__')
                  ? workspaceSessionId
                  : '__root__'
              }
              onSessionClose={() => setWorkspaceSessionId('__root__')}
            />

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
          {installedEditors.length > 0 && (workspaceProject !== null || activeNoteId !== null) && (
            <div className="relative ml-1">
              <button
                onClick={() => setOpenInMenuOpen(v => !v)}
                className="flex items-center gap-1.5 px-2 h-6 rounded text-zinc-500 hover:text-zinc-300 hover:bg-brand-panel transition-colors"
              >
                <ExternalLink size={12} />
                <span className="text-[11px] font-medium">Open In</span>
              </button>
              {openInMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOpenInMenuOpen(false)} />
                  <div className="absolute left-0 bottom-full mb-1 z-50 bg-brand-bg border border-brand-panel/60 rounded shadow-xl py-1 min-w-[160px]">
                    {workspaceProject !== null && (
                      <>
                        <div className="px-3 py-1 text-[10px] text-zinc-600 uppercase tracking-wider font-medium select-none">Project</div>
                        {installedEditors.map(ed => (
                          <button
                            key={`proj-${ed.command}`}
                            onClick={() => { openInEditor(ed.command, workspaceProject); setOpenInMenuOpen(false) }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:bg-brand-panel hover:text-zinc-200 transition-colors text-left"
                          >
                            {ed.name}
                          </button>
                        ))}
                      </>
                    )}
                    {workspaceProject !== null && activeNoteId !== null && (
                      <div className="my-1 border-t border-brand-panel/40" />
                    )}
                    {activeNoteId !== null && (
                      <>
                        <div className="px-3 py-1 text-[10px] text-zinc-600 uppercase tracking-wider font-medium select-none">Note</div>
                        {installedEditors.map(ed => (
                          <button
                            key={`note-${ed.command}`}
                            onClick={() => {
                              openNoteInEditor(ed.command, activeNoteId)
                              setOpenInMenuOpen(false)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:bg-brand-panel hover:text-zinc-200 transition-colors text-left"
                          >
                            {ed.name}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <StatusWindowBadge />
        <div className="flex-1 flex items-center gap-0.5 justify-end">
          {workspaceProject !== null && (
            <button
              onClick={() => { if (gitRoot) setSidePanel(p => p === 'git' ? null : 'git') }}
              title="Review Changes (Ctrl+Shift+G)"
              className={cn(
                'relative flex items-center gap-1.5 px-2.5 h-7 rounded transition-colors',
                sidePanel === 'git'
                  ? 'text-brand-muted bg-brand-panel'
                  : totalChanges > 0
                    ? 'text-zinc-300 hover:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <GitBranch size={15} />
              <span className="text-[11px] font-medium">Git</span>
              {totalChanges > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-brand-accent text-[9px] font-bold text-brand-bg leading-none border-2 border-brand-surface">
                  {totalChanges > 99 ? '99+' : totalChanges}
                </span>
              )}
            </button>
          )}
          {workspaceSessionId !== null && (
            <StatusTerminalThemeToggle sessionId={workspaceSessionId} />
          )}
          <NotificationBell />
          <StatusThemeToggle />
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
        rootPath={workspaceProject ?? ''}
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
