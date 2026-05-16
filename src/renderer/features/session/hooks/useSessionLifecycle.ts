import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ipc } from '../../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import { useStore } from '../../../store/root.store'
import { listSessions, createSession, killSession } from '../session.service'
import { getWindowInfo, pickFolder } from '../../window/window.service'
import { loadLayout } from '../persistence.service'
import { findTabForSession } from '../../layout/layout-tree'
import type { LayoutNode } from '../../layout/layout-tree'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@shared/constants'
import type { PersistedLayout, SessionMeta, SessionExitPayload, WindowInitialSessionsPayload, TabReattachedPayload, NotePanePayload } from '@shared/ipc-types'

export function useSessionLifecycle(): void {
  const upsertSession = useStore((s) => s.upsertSession)
  const markSessionExited = useStore((s) => s.markSessionExited)
  const addTab = useStore((s) => s.addTab)
  const removePaneBySessionId = useStore((s) => s.removePaneBySessionId)
  const setWindowId = useStore((s) => s.setWindowId)
  const loadSettings = useStore((s) => s.loadSettings)
  const loadWorkspaces = useStore((s) => s.loadWorkspaces)
  const setPendingRestore = useStore((s) => s.setPendingRestore)
  const setIsMainWindow = useStore((s) => s.setIsMainWindow)
  const setWindowMeta = useStore((s) => s.setWindowMeta)
  const setWindowHighlighted = useStore((s) => s.setWindowHighlighted)
  const setTotalWindowCount = useStore((s) => s.setTotalWindowCount)
  const addNotePaneToLayout = useStore((s) => s.addNotePaneToLayout)
  const removeNotePaneFromLayout = useStore((s) => s.removeNotePaneFromLayout)
  const addDetachedNoteId = useStore((s) => s.addDetachedNoteId)
  const removeDetachedNoteId = useStore((s) => s.removeDetachedNoteId)
  const layoutRef = useRef<PersistedLayout | null | 'loading'>('loading')
  const isMainRef = useRef<boolean | null>(null)
  // Tracks running sessions found at startup — 'pending' until listSessions resolves
  const liveSessionsRef = useRef<SessionMeta[] | 'pending'>('pending')

  // Auto-create a plain shell when the user kills the last session.
  // Only fires when tab count drops from >1 → 1 (startup and restore are excluded
  // because tabOrder starts at 1 and only grows, so prevLength is never >1 initially).
  useEffect(() => {
    let prevTabCount = useStore.getState().tabOrder.length
    return useStore.subscribe((state) => {
      const curr = state.tabOrder.length
      if (
        curr === 1 &&
        state.tabOrder[0] === '__root__' &&
        prevTabCount > 1 &&
        state.isMainWindow &&
        !state.isRestoringLayout
      ) {
        const { settings } = useStore.getState()
        const cwd = settings.projectRoot || undefined
        createSession({
          name: 'Home',
          cwd,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
        }).then((meta) => {
          useStore.getState().upsertSession(meta)
          useStore.getState().addTab(meta.sessionId)
        }).catch(() => {})
      }
      prevTabCount = curr
    })
  }, [])

  useEffect(() => {
    loadSettings()
    loadWorkspaces()
    getWindowInfo().then(({ windowId, isMainWindow }) => {
      setWindowId(windowId)
      setIsMainWindow(isMainWindow)
      setWindowHighlighted(false)
    })

    const maybeShowRestore = (): void => {
      // Wait for all three async sources to resolve before deciding
      if (layoutRef.current === 'loading' || isMainRef.current === null || liveSessionsRef.current === 'pending') return
      const live = liveSessionsRef.current as SessionMeta[]
      if (live.length > 0) {
        // HMR/renderer-reload: only the main window wires up all running sessions
        if (isMainRef.current) live.forEach((m) => addTab(m.sessionId))
        return
      }
      if (isMainRef.current && layoutRef.current && layoutRef.current.sessions.length > 0) {
        setPendingRestore(layoutRef.current)
        return
      }
      // Nothing to restore → auto-open a plain shell so the user lands in a working state.
      // No agentCommand here: plain shells get OSC 7 shell integration auto-injected,
      // so the file tree tracks cd in real time without any manual profile setup.
      if (isMainRef.current) {
        const { settings } = useStore.getState()
        const cwd = settings.projectRoot || undefined
        createSession({
          name: 'Home',
          cwd,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
        }).then((meta) => {
          useStore.getState().upsertSession(meta)
          useStore.getState().addTab(meta.sessionId)
        }).catch(() => {})
      }
    }

    listSessions().then((sessions) => {
      const running = sessions.filter((m) => m.status === 'running')
      sessions.forEach((meta) => upsertSession(meta))
      liveSessionsRef.current = running
      maybeShowRestore()
    })

    loadLayout().then((layout) => {
      layoutRef.current = layout
      maybeShowRestore()
    })

    const offInitial = ipc.on(IPC.WINDOW_INITIAL_SESSIONS, (payload) => {
      const { sessionIds, windowId, isMainWindow: isMain, windowName, windowColor, totalWindowCount } = payload as WindowInitialSessionsPayload
      setWindowId(windowId)
      if (windowName && windowColor) setWindowMeta(windowName, windowColor)
      if (totalWindowCount != null) setTotalWindowCount(totalWindowCount)
      sessionIds.forEach((sessionId) => addTab(sessionId))
      isMainRef.current = isMain ?? sessionIds.length === 0
      setIsMainWindow(isMainRef.current)
      maybeShowRestore()
    })

    const offMeta = ipc.on(IPC.SESSION_META_UPDATE, (payload) => {
      const meta = payload as SessionMeta
      const { sessions, paneTree, activeSessionId } = useStore.getState()
      const prev = sessions[meta.sessionId]

      if (prev?.agentStatus === 'running' && meta.agentStatus === 'waiting-input') {
        const tabId = findTabForSession(paneTree, meta.sessionId)
        if (tabId) {
          useStore.getState().addNotification({ type: 'agent-done', title: `${meta.name} is awaiting input`, tabId })
          const isBackground = tabId !== activeSessionId
          toast.success(
            `${meta.name} is awaiting input`,
            isBackground
              ? { action: { label: 'Switch', onClick: () => useStore.getState().setActiveSession(tabId) } }
              : undefined
          )
        }
      }

      upsertSession(meta)
    })

    const offExit = ipc.on(IPC.SESSION_EXIT, (payload) => {
      const { sessionId, exitCode } = payload as SessionExitPayload
      const session = useStore.getState().sessions[sessionId]
      // Session already removed from store means it was intentionally closed — skip toast
      if (!session) return
      const sessionName = session.name
      const isAgent = !!session.agentCommand
      markSessionExited(sessionId, exitCode)
      removePaneBySessionId(sessionId)
      // Only show exit toasts for agent sessions — plain shells exit silently
      if (!isAgent) return
      if (exitCode === 0) {
        toast.success(`${sessionName} finished`)
      } else {
        toast.error(`${sessionName} exited (code ${exitCode})`)
      }
    })

    const offReattached = ipc.on(IPC.WINDOW_TAB_REATTACHED, (payload) => {
      const { sessionId } = payload as TabReattachedPayload
      addTab(sessionId)
    })

    const offAddSession = ipc.on(IPC.WINDOW_ADD_SESSION, (payload) => {
      const { sessionId, meta } = payload as { sessionId: string; meta: SessionMeta }
      if (meta) upsertSession(meta)
      addTab(sessionId)
    })

    const offRemoveSession = ipc.on(IPC.WINDOW_SESSION_REMOVED, (payload) => {
      const { sessionId } = payload as { sessionId: string }
      const { paneTree, detachPane, removeTab } = useStore.getState()
      const tabId = findTabForSession(paneTree, sessionId) ?? sessionId
      detachPane(tabId, sessionId)
      removeTab(sessionId)
    })

    const offHighlight = ipc.on(IPC.WINDOW_HIGHLIGHT, (payload) => {
      const { active } = payload as { active: boolean }
      setWindowHighlighted(active)
    })

    const onFocus = (): void => setWindowHighlighted(false)
    window.addEventListener('focus', onFocus)

    const offWindowCount = ipc.on(IPC.WINDOW_COUNT_CHANGED, (payload) => {
      const { count } = payload as { count: number }
      setTotalWindowCount(count)
    })

    const offMetaUpdated = ipc.on(IPC.WINDOW_META_UPDATED, (payload) => {
      const { name, color } = payload as { name: string; color: string }
      setWindowMeta(name, color)
    })

    const offSettingsUpdated = ipc.on(IPC.SETTINGS_UPDATED, () => {
      void loadSettings()
    })

    const offInitialNotPane = ipc.on(IPC.WINDOW_INITIAL_NOTE_PANE, (payload) => {
      const { noteId, panel } = payload as NotePanePayload
      addNotePaneToLayout(noteId, panel)
    })

    const offNotePaneReattached = ipc.on(IPC.WINDOW_NOTE_PANE_REATTACHED, (payload) => {
      const { noteId, panel } = payload as NotePanePayload
      removeDetachedNoteId(noteId)
      addNotePaneToLayout(noteId, panel)
    })

    const offAddNotePane = ipc.on(IPC.WINDOW_ADD_NOTE_PANE, (payload) => {
      const { noteId, panel } = payload as NotePanePayload
      removeDetachedNoteId(noteId)
      addNotePaneToLayout(noteId, panel)
    })

    const offRemoveNotePane = ipc.on(IPC.WINDOW_NOTE_PANE_REMOVED, (payload) => {
      const { noteId, panel } = payload as NotePanePayload
      addDetachedNoteId(noteId)
      removeNotePaneFromLayout(noteId, panel)
    })

    const findFirstTerminalSessionId = (node: LayoutNode): string | null => {
      if (node.type === 'leaf') return node.panel === 'terminal' ? node.sessionId : null
      for (const child of node.children) {
        const found = findFirstTerminalSessionId(child)
        if (found) return found
      }
      return null
    }

    const onOpenProject = (): void => {
      pickFolder().then((folder) => {
        if (!folder) return
        const { tabOrder, paneTree } = useStore.getState()
        // Identify the home terminal — first non-root tab's first terminal session
        const homeTabId = tabOrder.find((id) => id !== '__root__')
        const homeSessionId = homeTabId && paneTree[homeTabId]
          ? findFirstTerminalSessionId(paneTree[homeTabId])
          : null

        createSession({
          name: folder.split(/[\\/]/).pop() ?? 'project',
          cwd: folder,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          projectRoot: folder,
        }).then((meta) => {
          useStore.getState().upsertSession(meta)
          useStore.getState().addTab(meta.sessionId)
          // Kill the home terminal after the new one is registered
          if (homeSessionId) {
            killSession(homeSessionId).catch(() => {})
            useStore.getState().removePaneBySessionId(homeSessionId)
          }
        }).catch(() => {})
      }).catch(() => {})
    }
    document.addEventListener('acc:open-project', onOpenProject)

    const offOpenPath = ipc.on(IPC.OPEN_PATH, (payload) => {
      const { path: folderPath } = payload as { path: string }
      const { settings } = useStore.getState()
      createSession({
        name: folderPath.split(/[\\/]/).pop() ?? 'project',
        cwd: folderPath,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        projectRoot: folderPath,
        workspaceId: settings.projectRoot ? undefined : undefined,
      }).then((meta) => {
        useStore.getState().upsertSession(meta)
        useStore.getState().addTab(meta.sessionId)
      }).catch(() => {})
    })

    return () => {
      document.removeEventListener('acc:open-project', onOpenProject)
      offInitial()
      offMeta()
      offExit()
      offReattached()
      offAddSession()
      offRemoveSession()
      offHighlight()
      window.removeEventListener('focus', onFocus)
      offWindowCount()
      offMetaUpdated()
      offSettingsUpdated()
      offInitialNotPane()
      offNotePaneReattached()
      offAddNotePane()
      offRemoveNotePane()
      offOpenPath()
    }
  }, [])

}
