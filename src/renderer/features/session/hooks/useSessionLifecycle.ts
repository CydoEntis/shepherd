import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ipc } from '../../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import { useStore } from '../../../store/root.store'
import { listSessions, createSession, killSession, patchSession } from '../session.service'
import { getWindowInfo, pickFolder } from '../../window/window.service'
import { normalizePath } from '../../../lib/utils'
import { findTabForSession, collectSessionIds } from '../../layout/layout-tree'
import type { LayoutNode } from '../../layout/layout-tree'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@shared/constants'
import type { SessionMeta, SessionExitPayload, WindowInitialSessionsPayload, TabReattachedPayload, NotePanePayload } from '@shared/ipc-types'

export function useSessionLifecycle(): void {
  const upsertSession = useStore((s) => s.upsertSession)
  const markSessionExited = useStore((s) => s.markSessionExited)
  const addTab = useStore((s) => s.addTab)
  const removePaneBySessionId = useStore((s) => s.removePaneBySessionId)
  const setWindowId = useStore((s) => s.setWindowId)
  const loadSettings = useStore((s) => s.loadSettings)
  const loadWorkspaces = useStore((s) => s.loadWorkspaces)
  const setIsMainWindow = useStore((s) => s.setIsMainWindow)
  const setWindowMeta = useStore((s) => s.setWindowMeta)
  const setWindowHighlighted = useStore((s) => s.setWindowHighlighted)
  const setTotalWindowCount = useStore((s) => s.setTotalWindowCount)
  const addNotePaneToLayout = useStore((s) => s.addNotePaneToLayout)
  const removeNotePaneFromLayout = useStore((s) => s.removeNotePaneFromLayout)
  const addDetachedNoteId = useStore((s) => s.addDetachedNoteId)
  const removeDetachedNoteId = useStore((s) => s.removeDetachedNoteId)
  const isMainRef = useRef<boolean | null>(null)
  // Tracks running sessions found at startup — 'pending' until listSessions resolves
  const liveSessionsRef = useRef<SessionMeta[] | 'pending'>('pending')

  useEffect(() => {
    loadSettings()
    loadWorkspaces()

    const wireUpLiveSessions = (): void => {
      // Wait for both async sources before deciding
      if (isMainRef.current === null || liveSessionsRef.current === 'pending') return
      const live = liveSessionsRef.current as SessionMeta[]
      if (live.length === 0 || !isMainRef.current) return
      // HMR/renderer-reload or background PTY survival: wire existing running sessions back in
      const { workspaces } = useStore.getState()
      live.forEach((m) => {
        addTab(m.sessionId)
        // Migrate untagged sessions: tag them with any matching named workspace
        if (!m.workspaceId) {
          const sessionPath = normalizePath(m.projectRoot ?? m.cwd)
          const matchingWs = workspaces.find((w) => {
            if (w.isRoot || !w.rootPath) return false
            const wsPath = normalizePath(w.rootPath)
            return sessionPath === wsPath || sessionPath.startsWith(wsPath + '/')
          })
          if (matchingWs) {
            patchSession({ sessionId: m.sessionId, workspaceId: matchingWs.id })
              .then((updated) => useStore.getState().upsertSession(updated))
              .catch(() => {})
          }
        }
      })
    }

    getWindowInfo().then(({ windowId, isMainWindow }) => {
      setWindowId(windowId)
      setIsMainWindow(isMainWindow)
      setWindowHighlighted(false)
      // Fallback: WINDOW_INITIAL_SESSIONS is sent on did-finish-load, which fires
      // before React's useEffect registers the listener — the event can be missed.
      // getWindowInfo() is an invoke (request-response) so it always resolves.
      if (isMainRef.current === null) {
        isMainRef.current = isMainWindow
        wireUpLiveSessions()
      }
    })

    listSessions().then((sessions) => {
      const running = sessions.filter((m) => m.status === 'running')
      sessions.forEach((meta) => upsertSession(meta))
      liveSessionsRef.current = running
      wireUpLiveSessions()
    })

    const offInitial = ipc.on(IPC.WINDOW_INITIAL_SESSIONS, (payload) => {
      const { sessionIds, windowId, isMainWindow: isMain, windowName, windowColor, totalWindowCount } = payload as WindowInitialSessionsPayload
      setWindowId(windowId)
      if (windowName && windowColor) setWindowMeta(windowName, windowColor)
      if (totalWindowCount != null) setTotalWindowCount(totalWindowCount)
      sessionIds.forEach((sessionId) => addTab(sessionId))
      isMainRef.current = isMain ?? sessionIds.length === 0
      setIsMainWindow(isMainRef.current)
      wireUpLiveSessions()
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

      if (!isAgent) {
        // Plain shells: close the pane silently so the user lands on the adjacent
        // terminal (multi-pane split) or triggers auto-create (single-pane tab).
        const { paneTree } = useStore.getState()
        const tabId = findTabForSession(paneTree, sessionId)
        if (tabId) {
          const tree = paneTree[tabId]
          if (tree && collectSessionIds(tree).length > 1) {
            removePaneBySessionId(sessionId)
          } else {
            useStore.getState().closePane(tabId, sessionId)
          }
        }
        return
      }

      removePaneBySessionId(sessionId)
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
          // Replace the home terminal — closePane removes its tab from tabOrder entirely
          if (homeTabId && homeSessionId) {
            killSession(homeSessionId).catch(() => {})
            useStore.getState().closePane(homeTabId, homeSessionId)
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
