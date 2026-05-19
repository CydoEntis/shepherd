import { useEffect, useRef } from 'react'
import { useStore } from '../../../store/root.store'
import { saveLayout } from '../persistence.service'
import { collectSessionIds, makeTerminalLeaf } from '../../layout/layout-tree'
import type { PersistedLayout } from '@shared/ipc-types'

export function useLayoutPersistence(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingLayoutRef = useRef<PersistedLayout | null>(null)

  useEffect(() => {
    const unsubscribe = useStore.subscribe((state) => {
      if (!state.isMainWindow) return

      const runningSessions = Object.values(state.sessions).filter((m) => m.status === 'running')
      if (runningSessions.length === 0) return

      // Sessions that live in the main window's pane trees
      const inTabSessionIds = new Set(
        state.tabOrder.flatMap((tabId) => {
          const tree = state.paneTree[tabId]
          return tree ? collectSessionIds(tree) : []
        })
      )

      // Sessions running but not in any tab = detached into another window.
      const detachedTabs = runningSessions
        .filter((m) => !inTabSessionIds.has(m.sessionId))
        .map((m) => ({
          tabId: m.sessionId,
          tree: makeTerminalLeaf(m.sessionId),
          detached: true
        }))

      const layout: PersistedLayout = {
        version: 1,
        activeTabIndex: state.tabOrder.indexOf(state.activeSessionId ?? ''),
        openFilesList: state.openFilesList,
        sessions: runningSessions.map((m) => ({
          sessionId: m.sessionId,
          name: m.name,
          agentCommand: m.agentCommand,
          cwd: m.cwd,
          color: m.color,
          conversationId: m.conversationId,
          groupId: m.groupId,
          yoloMode: m.yoloMode,
          workspaceId: m.workspaceId,
        })),
        tabs: [
          ...state.tabOrder
            .map((tabId) => ({ tabId, tree: state.paneTree[tabId] }))
            .filter((t) => t.tree != null),
          ...detachedTabs
        ]
      }

      pendingLayoutRef.current = layout
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        saveLayout(layout)
        pendingLayoutRef.current = null
      }, 2000)
    })

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        // Flush any pending save synchronously so state isn't lost on close
        if (pendingLayoutRef.current) saveLayout(pendingLayoutRef.current)
      }
      unsubscribe()
    }
  }, [])
}
