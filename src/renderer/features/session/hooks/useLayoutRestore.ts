import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '../../../store/root.store'
import { createSession, patchSession, writeToSession } from '../session.service'
import { clearLayout } from '../persistence.service'
import { collectSessionIds, collectFileEditorLeaves, migrateLayoutNode } from '../../layout/layout-tree'
import type { PersistedLayout } from '@shared/ipc-types'
import type { LayoutNode } from '../../layout/layout-tree'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@shared/constants'

function remapLayoutTree(node: LayoutNode, idMap: Map<string, string>): LayoutNode {
  if (node.type === 'leaf') {
    if (node.panel !== 'terminal') return node
    const newId = idMap.get(node.sessionId)
    return newId ? { ...node, sessionId: newId } : node
  }
  return { ...node, children: node.children.map((c) => remapLayoutTree(c, idMap)) }
}

function firstSessionId(node: LayoutNode): string | null {
  if (node.type === 'leaf') return node.panel === 'terminal' ? node.sessionId : null
  for (const child of node.children) {
    const id = firstSessionId(child)
    if (id) return id
  }
  return null
}

export function useLayoutRestore(): void {
  const pendingRestore = useStore((s) => s.pendingRestore)
  const setPendingRestore = useStore((s) => s.setPendingRestore)
  const setIsRestoringLayout = useStore((s) => s.setIsRestoringLayout)
  const upsertSession = useStore((s) => s.upsertSession)
  const restoreTab = useStore((s) => s.restoreTab)
  const resumeOnStartup = useStore((s) => s.settings.resumeOnStartup)

  const handleRestore = async (layout: PersistedLayout): Promise<void> => {
    setPendingRestore(null)
    setIsRestoringLayout(true)
    await clearLayout()

    const idMap = new Map<string, string>()
    const createdMetas: Awaited<ReturnType<typeof createSession>>[] = []
    const resumeIds: string[] = []

    for (const ps of layout.sessions) {
      let agentCommand = ps.agentCommand
      if (agentCommand === 'claude' && ps.conversationId) {
        agentCommand = `claude --resume ${ps.conversationId}`
      }
      try {
        const cwd = ps.worktreePath || ps.cwd || undefined
        // On restore, always skip sandbox — the previous sbx container may still
        // hold its containerd bundle lock on Windows, causing a 500 error on restart.
        // YOLO mode (--dangerously-skip-permissions) still applies; user can open a
        // new sandboxed session if they need the Docker isolation.
        const meta = await createSession({ name: ps.name, agentCommand, cwd, cols: DEFAULT_COLS, rows: DEFAULT_ROWS, color: ps.color, groupId: ps.groupId, yoloMode: ps.yoloMode, noSandbox: true })
        if (ps.worktreePath) {
          // Immediately put the session in the store with worktree fields from
          // the persisted data — don't wait on patchSession which can return
          // undefined if Electron IPC resolves before the registry is ready.
          upsertSession({ ...meta, worktreePath: ps.worktreePath, worktreeBranch: ps.worktreeBranch, worktreeBaseBranch: ps.worktreeBaseBranch, projectRoot: ps.projectRoot })
          // Sync the main-process registry in the background
          patchSession({ sessionId: meta.sessionId, worktreePath: ps.worktreePath, worktreeBranch: ps.worktreeBranch, worktreeBaseBranch: ps.worktreeBaseBranch, projectRoot: ps.projectRoot }).catch(() => {})
        } else {
          upsertSession(meta)
        }
        idMap.set(ps.sessionId, meta.sessionId)
        createdMetas.push(meta)
        if (resumeOnStartup && ps.agentCommand) resumeIds.push(meta.sessionId)
      } catch (err) {
        console.error('Failed to restore session:', ps.name, err)
        toast.error(`Could not restore "${ps.name}"`)
      }
    }

    for (const tab of layout.tabs) {
      if (!tab.tree) continue
      const tree = migrateLayoutNode(tab.tree)
      const firstId = firstSessionId(tree)
      const newTabId = firstId ? idMap.get(firstId) : null
      if (!newTabId) continue

      const remapped = remapLayoutTree(tree, idMap)
      const tabSessionIds = new Set(collectSessionIds(remapped))
      const tabMetas = createdMetas.filter((m) => tabSessionIds.has(m.sessionId))
      restoreTab(newTabId, remapped, tabMetas)
    }

    setIsRestoringLayout(false)

    // Repopulate openFilesList: merge saved list with any file-editor leaves in restored trees
    const restoreStore = useStore.getState()
    const filesToRestore = new Set<string>(layout.openFilesList ?? [])
    for (const tree of Object.values(restoreStore.paneTree)) {
      collectFileEditorLeaves(tree).forEach((info) => filesToRestore.add(info.filePath))
    }
    filesToRestore.forEach((path) => restoreStore.addOpenFile(path))

    if (resumeIds.length > 0) {
      setTimeout(() => {
        for (const sessionId of resumeIds) {
          writeToSession({ sessionId, data: '/resume\r' })
        }
      }, 2000)
    }
  }

  const handleRestoreRef = useRef(handleRestore)
  useEffect(() => { handleRestoreRef.current = handleRestore })

  useEffect(() => {
    if (pendingRestore) {
      handleRestoreRef.current(pendingRestore)
    }
  }, [pendingRestore])
}
