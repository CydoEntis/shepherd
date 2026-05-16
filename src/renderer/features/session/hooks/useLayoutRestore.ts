import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '../../../store/root.store'
import { createSession, patchSession } from '../session.service'
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
  const handleRestore = async (layout: PersistedLayout): Promise<void> => {
    setPendingRestore(null)
    setIsRestoringLayout(true)
    await clearLayout()

    const idMap = new Map<string, string>()
    const createdMetas: Awaited<ReturnType<typeof createSession>>[] = []

    for (const ps of layout.sessions) {
      try {
        const cwd = ps.worktreePath || ps.cwd || undefined
        // Restore as plain shells — don't auto-relaunch agent commands on restart.
        // The cwd, name, color, and group are preserved; the user can start an
        // agent manually in any restored session.
        const meta = await createSession({ name: ps.name, cwd, cols: DEFAULT_COLS, rows: DEFAULT_ROWS, color: ps.color, groupId: ps.groupId, noSandbox: true })
        if (ps.worktreePath) {
          upsertSession({ ...meta, worktreePath: ps.worktreePath, worktreeBranch: ps.worktreeBranch, worktreeBaseBranch: ps.worktreeBaseBranch, projectRoot: ps.projectRoot })
          patchSession({ sessionId: meta.sessionId, worktreePath: ps.worktreePath, worktreeBranch: ps.worktreeBranch, worktreeBaseBranch: ps.worktreeBaseBranch, projectRoot: ps.projectRoot }).catch(() => {})
        } else {
          upsertSession(meta)
        }
        idMap.set(ps.sessionId, meta.sessionId)
        createdMetas.push(meta)
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

  }

  const handleRestoreRef = useRef(handleRestore)
  useEffect(() => { handleRestoreRef.current = handleRestore })

  useEffect(() => {
    if (pendingRestore) {
      handleRestoreRef.current(pendingRestore)
    }
  }, [pendingRestore])
}
