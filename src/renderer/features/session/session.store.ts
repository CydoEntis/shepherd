import type { StateCreator } from 'zustand'
import type { SessionMeta, PersistedLayout } from '@shared/ipc-types'
import type { RootStore } from '../../store/root.store'
import {
  makeTerminalLeaf, makeMarkdownPreviewLeaf, makeHomeLeaf,
  makeFileEditorLeaf,
  splitTerminalLeaf, splitLeafById, removeTerminalLeaf,
  removeNode, insertAtRight, insertNode, moveNode, replaceNode,
  collectSessionIds, findTabForSession, hasMarkdownPreviewForFile,
  findTerminalLeafId, findLeafById, findMainLeaf,
  collectFileEditorLeaves,
  addFileToEditorGroup as addFileToEditorGroupTree,
  removeFileFromEditorGroup as removeFileFromEditorGroupTree,
  setEditorGroupActive as setEditorGroupActiveTree,
  addTerminalToEditorGroup as addTerminalToEditorGroupTree,
} from '../layout/layout-tree'
import type { LayoutNode, LayoutLeaf } from '../layout/layout-tree'

export type { LayoutNode }

export interface SessionSlice {
  sessions: Record<string, SessionMeta>
  tabOrder: string[]
  activeSessionId: string | null
  focusedSessionId: string | null
  focusedLeafId: string | null
  paneTree: Record<string, LayoutNode>
  pendingRestore: PersistedLayout | null
  isRestoringLayout: boolean

  upsertSession: (meta: SessionMeta) => void
  setActiveSession: (sessionId: string | null) => void
  setFocusedSession: (sessionId: string | null) => void
  setFocusedLeaf: (leafId: string | null) => void
  reorderTabs: (newOrder: string[]) => void
  markSessionExited: (sessionId: string, exitCode: number) => void
  addTab: (sessionId: string) => void
  removeTab: (tabId: string) => void
  splitPane: (
    tabId: string,
    targetSessionId: string,
    direction: 'horizontal' | 'vertical',
    newMeta: SessionMeta
  ) => void
  splitPaneByLeafId: (
    tabId: string,
    leafId: string,
    direction: 'horizontal' | 'vertical',
    newMeta: SessionMeta
  ) => void
  closePane: (tabId: string, sessionId: string) => void
  detachPane: (tabId: string, sessionId: string) => void
  removePaneBySessionId: (sessionId: string) => void
  setPendingRestore: (layout: PersistedLayout | null) => void
  setIsRestoringLayout: (v: boolean) => void
  restoreTab: (tabId: string, tree: LayoutNode, metas: SessionMeta[]) => void
  openGroupInSplits: (sessionIds: string[]) => void
  openMarkdownPreviewPane: (filePath: string) => void
  removeLayoutLeaf: (tabId: string, leafId: string) => void
  insertLayout: (tabId: string, targetLeafId: string, direction: 'horizontal' | 'vertical', newLeaf: LayoutLeaf, side: 'before' | 'after') => void
  moveLayout: (tabId: string, sourceLeafId: string, targetLeafId: string, direction: 'horizontal' | 'vertical', side: 'before' | 'after') => void
  insertSessionIntoLayout: (targetTabId: string, targetLeafId: string, sessionId: string, direction: 'horizontal' | 'vertical', side: 'before' | 'after') => void
  replaceLayoutLeaf: (tabId: string, leafId: string, replacement: LayoutNode) => void
  insertLayoutAtRight: (tabId: string, newLeaf: LayoutLeaf) => void
  insertSessionAtRight: (targetTabId: string, sessionId: string) => void
  switchPaneSession: (tabId: string, toSessionId: string) => void
  resetRootPane: () => void
  resetAllSessions: () => void

  addFileToEditorGroup: (tabId: string, leafId: string, filePath: string) => void
  removeFileFromEditorGroup: (tabId: string, leafId: string, fileIndex: number) => void
  setEditorGroupActive: (tabId: string, leafId: string, index: number) => void
  openFileInLayout: (filePath: string, displayTabId?: string) => void
  addTerminalTabToLeaf: (tabId: string, leafId: string, meta: SessionMeta) => void
  openTerminalInLayout: (tabId: string, meta: SessionMeta) => void
  reorderTabInEditorGroup: (tabId: string, leafId: string, fromIndex: number, toIndex: number) => void
  closeNonMainPane: (tabId: string, leafId: string) => void
  moveEditorTab: (srcTabId: string, srcLeafId: string, tabIndex: number, dstTabId: string, dstLeafId: string, edge?: 'top' | 'bottom' | 'left' | 'right' | null) => void
  closeTabsInEditorGroup: (tabId: string, leafId: string, mode: 'others' | 'left' | 'right', keepIndex: number) => void


  openFilesList: string[]
  addOpenFile: (path: string) => void
  removeOpenFile: (path: string) => void
  removeFileFromAllLayouts: (filePath: string) => void

  updateSessionCwd: (sessionId: string, cwd: string) => void

  fileTabs: Record<string, { path: string; name: string; workspaceId?: string }>
  openFileTab: (path: string, workspaceId?: string) => void
  closeFileTab: (tabId: string) => void
  renameFileTab: (tabId: string, newPath: string) => void
}

export const createSessionSlice: StateCreator<RootStore, [['zustand/immer', never]], [], SessionSlice> = (set) => ({
  sessions: {},
  tabOrder: ['__root__'],
  activeSessionId: null,
  focusedSessionId: null,
  focusedLeafId: null,
  paneTree: { '__root__': makeHomeLeaf() as LayoutNode },
  pendingRestore: null,
  isRestoringLayout: false,
  openFilesList: [],
  fileTabs: {},

  upsertSession: (meta) =>
    set((state) => {
      state.sessions[meta.sessionId] = meta
    }),

  updateSessionCwd: (sessionId, cwd) =>
    set((state) => {
      if (state.sessions[sessionId]) {
        state.sessions[sessionId].cwd = cwd
      }
    }),

  addTab: (sessionId) =>
    set((state) => {
      if (!state.tabOrder.includes(sessionId)) {
        state.tabOrder.push(sessionId)
        state.paneTree[sessionId] = makeTerminalLeaf(sessionId, true)
      }
      state.activeSessionId = sessionId
      state.focusedSessionId = sessionId
    }),

  removeTab: (tabId) =>
    set((state) => {
      if (tabId === '__root__') return
      if (state.activeSessionId === tabId) {
        const idx = state.tabOrder.indexOf(tabId)
        const realTabs = state.tabOrder.filter((id) => id !== '__root__' && id !== tabId)
        const toLeft = realTabs.filter((id) => state.tabOrder.indexOf(id) < idx)
        state.activeSessionId = toLeft.length > 0 ? toLeft[toLeft.length - 1] : (realTabs[0] ?? '__root__')
      }
      state.tabOrder = state.tabOrder.filter((id) => id !== tabId)
      const tree = state.paneTree[tabId]
      if (tree) {
        collectSessionIds(tree).forEach((sid) => delete state.sessions[sid])
        delete state.paneTree[tabId]
      }
      if (state.fileTabs[tabId]) delete state.fileTabs[tabId]
    }),

  splitPane: (tabId, targetSessionId, direction, newMeta) =>
    set((state) => {
      state.sessions[newMeta.sessionId] = newMeta
      const tree = state.paneTree[tabId]
      if (tree) {
        state.paneTree[tabId] = splitTerminalLeaf(tree, targetSessionId, direction, newMeta.sessionId)
      }
    }),

  splitPaneByLeafId: (tabId, leafId, direction, newMeta) =>
    set((state) => {
      state.sessions[newMeta.sessionId] = newMeta
      const tree = state.paneTree[tabId]
      if (tree) {
        state.paneTree[tabId] = splitLeafById(tree, leafId, direction, newMeta.sessionId)
      }
    }),

  closePane: (tabId, sessionId) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      delete state.sessions[sessionId]
      const newTree = removeTerminalLeaf(tree, sessionId)
      if (!newTree) {
        if (tabId === '__root__') {
          state.paneTree[tabId] = makeHomeLeaf()
        } else {
          if (state.activeSessionId === tabId) {
            const idx = state.tabOrder.indexOf(tabId)
            const realTabs = state.tabOrder.filter((id) => id !== '__root__' && id !== tabId)
            const toLeft = realTabs.filter((id) => state.tabOrder.indexOf(id) < idx)
            state.activeSessionId = toLeft.length > 0 ? toLeft[toLeft.length - 1] : (realTabs[0] ?? '__root__')
          }
          state.tabOrder = state.tabOrder.filter((id) => id !== tabId)
          delete state.paneTree[tabId]
        }
      } else {
        state.paneTree[tabId] = newTree
        if (state.focusedSessionId === sessionId) {
          const remaining = collectSessionIds(newTree)
          state.focusedSessionId = remaining[0] ?? null
        }
      }
    }),

  detachPane: (tabId, sessionId) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      const newTree = removeTerminalLeaf(tree, sessionId)
      if (!newTree) {
        if (tabId === '__root__') { state.paneTree[tabId] = makeHomeLeaf() } else {
          if (state.activeSessionId === tabId) {
            const idx = state.tabOrder.indexOf(tabId)
            const realTabs = state.tabOrder.filter((id) => id !== '__root__' && id !== tabId)
            const toLeft = realTabs.filter((id) => state.tabOrder.indexOf(id) < idx)
            state.activeSessionId = toLeft.length > 0 ? toLeft[toLeft.length - 1] : (realTabs[0] ?? '__root__')
          }
          state.tabOrder = state.tabOrder.filter((id) => id !== tabId)
          delete state.paneTree[tabId]
        }
      } else {
        // If the remaining tree is a single editor-group leaf with only one terminal tab
        // belonging to another session's own tab, rescue it back to its own pane tree.
        const isSingleTerminalGroup = (
          newTree.type === 'leaf' &&
          newTree.panel === 'editor-group' &&
          newTree.tabs.length === 1 &&
          newTree.tabs[0].kind === 'terminal' &&
          newTree.tabs[0].sessionId !== tabId &&
          state.tabOrder.includes(newTree.tabs[0].sessionId)
        )
        if (isSingleTerminalGroup && newTree.type === 'leaf' && newTree.panel === 'editor-group' && newTree.tabs[0].kind === 'terminal') {
          const rescueSessionId = newTree.tabs[0].sessionId
          state.paneTree[rescueSessionId] = makeTerminalLeaf(rescueSessionId)
          state.paneTree[tabId] = makeHomeLeaf() as LayoutNode
          state.activeSessionId = rescueSessionId
          state.focusedSessionId = rescueSessionId
        } else {
          state.paneTree[tabId] = newTree
        }
      }
    }),

  removePaneBySessionId: (sessionId) =>
    set((state) => {
      const tabId = findTabForSession(state.paneTree, sessionId)
      if (!tabId) return
      const tree = state.paneTree[tabId]
      if (!tree) return
      if (collectSessionIds(tree).length <= 1) return
      delete state.sessions[sessionId]
      const newTree = removeTerminalLeaf(tree, sessionId)
      if (!newTree) {
        state.tabOrder = state.tabOrder.filter((id) => id !== tabId)
        delete state.paneTree[tabId]
        if (state.activeSessionId === tabId) {
          state.activeSessionId = state.tabOrder[0] ?? null
        }
      } else {
        state.paneTree[tabId] = newTree
        if (state.focusedSessionId === sessionId) {
          const remaining = collectSessionIds(newTree)
          state.focusedSessionId = remaining[0] ?? null
        }
      }
    }),

  setFocusedSession: (sessionId) =>
    set((state) => {
      state.focusedSessionId = sessionId
      if (sessionId) state.focusedLeafId = null
    }),

  setFocusedLeaf: (leafId) =>
    set((state) => {
      state.focusedLeafId = leafId
      if (leafId) state.focusedSessionId = null
    }),

  setActiveSession: (sessionId) =>
    set((state) => {
      state.activeSessionId = sessionId
      if (sessionId) { state.focusedSessionId = sessionId; state.focusedLeafId = null }
    }),

  reorderTabs: (newOrder) =>
    set((state) => {
      state.tabOrder = newOrder
    }),

  markSessionExited: (sessionId, exitCode) =>
    set((state) => {
      if (state.sessions[sessionId]) {
        state.sessions[sessionId].status = 'exited'
        state.sessions[sessionId].exitCode = exitCode
      }
    }),

  setPendingRestore: (layout) =>
    set((state) => {
      state.pendingRestore = layout
    }),

  setIsRestoringLayout: (v) =>
    set((state) => {
      state.isRestoringLayout = v
    }),

  restoreTab: (tabId, tree, metas) =>
    set((state) => {
      if (!state.tabOrder.includes(tabId)) {
        state.tabOrder.push(tabId)
      }
      state.paneTree[tabId] = tree
      for (const meta of metas) {
        state.sessions[meta.sessionId] = meta
      }
      state.activeSessionId = tabId
      state.focusedSessionId = tabId
    }),

  openGroupInSplits: (sessionIds) =>
    set((state) => {
      const running = sessionIds.filter((id) => state.sessions[id]?.status === 'running')
      if (running.length === 0) return

      const first = running[0]
      const existingTabId = findTabForSession(state.paneTree, first)
      const tabId = existingTabId ?? first

      if (!existingTabId) {
        if (!state.tabOrder.includes(tabId)) state.tabOrder.push(tabId)
        state.paneTree[tabId] = makeTerminalLeaf(first)
      }

      for (const sid of running.slice(1)) {
        const oldTabId = findTabForSession(state.paneTree, sid)
        if (oldTabId && oldTabId !== tabId) {
          const oldTree = state.paneTree[oldTabId]
          if (oldTree) {
            const newOldTree = removeTerminalLeaf(oldTree, sid)
            if (!newOldTree) {
              state.tabOrder = state.tabOrder.filter((id) => id !== oldTabId)
              delete state.paneTree[oldTabId]
              if (state.activeSessionId === oldTabId) {
                state.activeSessionId = state.tabOrder[0] ?? null
              }
            } else {
              state.paneTree[oldTabId] = newOldTree
            }
          }
        }
      }

      if (running.length === 1) {
        state.activeSessionId = tabId
        return
      }

      const n = running.length
      const numCols = Math.ceil(Math.sqrt(n))
      const cols: string[][] = Array.from({ length: numCols }, () => [])
      running.forEach((sid, i) => cols[i % numCols].push(sid))

      const colAnchors: string[] = [cols[0][0]]
      for (let c = 1; c < cols.length; c++) {
        if (cols[c].length === 0) continue
        const firstInCol = cols[c][0]
        const tree = state.paneTree[tabId]
        if (tree) state.paneTree[tabId] = splitTerminalLeaf(tree, colAnchors[c - 1], 'horizontal', firstInCol)
        colAnchors.push(firstInCol)
      }

      for (let c = 0; c < cols.length; c++) {
        for (let r = 1; r < cols[c].length; r++) {
          const tree = state.paneTree[tabId]
          if (tree) state.paneTree[tabId] = splitTerminalLeaf(tree, cols[c][r - 1], 'vertical', cols[c][r])
        }
      }

      state.activeSessionId = tabId
      if (!state.tabOrder.includes(tabId)) state.tabOrder.push(tabId)
    }),

  openMarkdownPreviewPane: (filePath) =>
    set((state) => {
      const tabId = state.activeSessionId
      if (!tabId) return
      const tree = state.paneTree[tabId]
      if (!tree) return
      if (hasMarkdownPreviewForFile(tree, filePath)) return
      state.paneTree[tabId] = insertAtRight(tree, makeMarkdownPreviewLeaf(filePath))
    }),

  removeLayoutLeaf: (tabId, leafId) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      const newTree = removeNode(tree, leafId)
      if (newTree) {
        state.paneTree[tabId] = newTree
      } else if (tabId === '__root__') {
        state.paneTree[tabId] = makeHomeLeaf()
      } else {
        delete state.paneTree[tabId]
      }
    }),

  replaceLayoutLeaf: (tabId, leafId, replacement) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      state.paneTree[tabId] = replaceNode(tree, leafId, replacement)
    }),

  insertLayout: (tabId, targetLeafId, direction, newLeaf, side) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      state.paneTree[tabId] = insertNode(tree, targetLeafId, direction, newLeaf, side)
    }),

  moveLayout: (tabId, sourceLeafId, targetLeafId, direction, side) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      state.paneTree[tabId] = moveNode(tree, sourceLeafId, targetLeafId, direction, side)
    }),

  insertSessionIntoLayout: (targetTabId, targetLeafId, sessionId, direction, side) =>
    set((state) => {
      const newLeaf = makeTerminalLeaf(sessionId)
      const sourceTabId = findTabForSession(state.paneTree, sessionId)
      if (sourceTabId) {
        const sourceTree = state.paneTree[sourceTabId]
        if (sourceTree) {
          const newSourceTree = removeTerminalLeaf(sourceTree, sessionId)
          if (!newSourceTree) {
            // Session is the only pane in this tab. If it's the same tab as the target,
            // deleting the source tree would also delete the target — leave it in place.
            if (sourceTabId === targetTabId) {
              state.focusedSessionId = sessionId
              return
            }
            // Keep the source tab as a home leaf so its dock chip stays visible
            state.paneTree[sourceTabId] = makeHomeLeaf() as LayoutNode
          } else {
            state.paneTree[sourceTabId] = newSourceTree
          }
        }
      }
      const targetTree = state.paneTree[targetTabId]
      if (targetTree) {
        // If the entire target tree is a home leaf, replace it rather than splitting alongside it.
        // Dragging a session onto a home pane always means "show this session here".
        if (targetTree.type === 'leaf' && targetTree.panel === 'home') {
          state.paneTree[targetTabId] = newLeaf
        } else {
          state.paneTree[targetTabId] = insertNode(targetTree, targetLeafId, direction, newLeaf, side)
        }
      }
      state.activeSessionId = targetTabId
      state.focusedSessionId = sessionId
    }),

  insertLayoutAtRight: (tabId, newLeaf) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      state.paneTree[tabId] = insertAtRight(tree, newLeaf)
    }),

  insertSessionAtRight: (targetTabId, sessionId) =>
    set((state) => {
      const sourceTabId = findTabForSession(state.paneTree, sessionId)
      if (sourceTabId === targetTabId) {
        state.focusedSessionId = sessionId
        return
      }
      if (sourceTabId) {
        const sourceTree = state.paneTree[sourceTabId]
        if (sourceTree) {
          const newSourceTree = removeTerminalLeaf(sourceTree, sessionId)
          if (!newSourceTree) {
            // Keep the source tab as a home leaf so its dock chip stays visible
            state.paneTree[sourceTabId] = makeHomeLeaf() as LayoutNode
          } else {
            state.paneTree[sourceTabId] = newSourceTree
          }
        }
      }
      const targetTree = state.paneTree[targetTabId]
      if (targetTree) {
        state.paneTree[targetTabId] = insertAtRight(targetTree, makeTerminalLeaf(sessionId))
      }
      state.activeSessionId = targetTabId
      state.focusedSessionId = sessionId
    }),

  switchPaneSession: (tabId, toSessionId) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      // Find the editor-group leaf that contains the focused session; fall back to first terminal
      const focusedLeafId = state.focusedSessionId ? findTerminalLeafId(tree, state.focusedSessionId) : null
      const leafId = focusedLeafId ?? findTerminalLeafId(tree, collectSessionIds(tree)[0] ?? '')
      if (!leafId) return
      // Find the leaf and replace the terminal tab with the new sessionId
      const leaf = findLeafById(tree, leafId)
      if (!leaf || leaf.panel !== 'editor-group') return
      const fromSessionId = state.focusedSessionId ?? collectSessionIds(tree)[0]
      const tabIdx = leaf.tabs.findIndex((t) => t.kind === 'terminal' && t.sessionId === fromSessionId)
      if (tabIdx === -1) return
      const newTabs = leaf.tabs.map((t, i): typeof t => i === tabIdx ? { kind: 'terminal', sessionId: toSessionId } : t)
      const updatedLeaf: LayoutLeaf = { ...leaf, tabs: newTabs }
      state.paneTree[tabId] = replaceNode(tree, leafId, updatedLeaf)
      state.activeSessionId = tabId
      state.focusedSessionId = toSessionId
    }),

  resetRootPane: () =>
    set((state) => {
      state.paneTree['__root__'] = makeHomeLeaf() as LayoutNode
    }),

  resetAllSessions: () =>
    set((state) => {
      state.sessions = {}
      state.tabOrder = ['__root__']
      state.activeSessionId = null
      state.focusedSessionId = null
      state.focusedLeafId = null
      state.paneTree = { '__root__': makeHomeLeaf() as LayoutNode }
      state.pendingRestore = null
      state.isRestoringLayout = false
    }),

  addOpenFile: (path) =>
    set((state) => {
      if (!state.openFilesList.includes(path)) state.openFilesList.push(path)
    }),

  removeOpenFile: (path) =>
    set((state) => {
      state.openFilesList = state.openFilesList.filter((p) => p !== path)
    }),

  openFileTab: (path, workspaceId) =>
    set((state) => {
      const norm = (p: string): string => p.replace(/\\/g, '/')
      const tabId = `file:${norm(path)}`
      if (state.tabOrder.includes(tabId)) {
        state.activeSessionId = tabId
        state.focusedSessionId = null
        state.focusedLeafId = null
        return
      }
      const name = norm(path).split('/').pop() ?? path
      state.fileTabs[tabId] = { path: norm(path), name, workspaceId }
      state.tabOrder.push(tabId)
      state.paneTree[tabId] = makeFileEditorLeaf(norm(path)) as LayoutNode
      state.activeSessionId = tabId
      state.focusedSessionId = null
      state.focusedLeafId = null
    }),

  closeFileTab: (tabId) =>
    set((state) => {
      if (!state.fileTabs[tabId]) return
      if (state.activeSessionId === tabId) {
        const idx = state.tabOrder.indexOf(tabId)
        const others = state.tabOrder.filter((id) => id !== tabId)
        const toLeft = state.tabOrder.slice(0, idx).filter((id) => id !== tabId)
        state.activeSessionId = toLeft.length > 0 ? toLeft[toLeft.length - 1] : (others[0] ?? '__root__')
      }
      state.tabOrder = state.tabOrder.filter((id) => id !== tabId)
      delete state.paneTree[tabId]
      delete state.fileTabs[tabId]
    }),

  renameFileTab: (tabId, newPath) =>
    set((state) => {
      if (!state.fileTabs[tabId]) return
      const norm = (p: string): string => p.replace(/\\/g, '/')
      const normPath = norm(newPath)
      const name = normPath.split('/').pop() ?? normPath
      state.fileTabs[tabId].path = normPath
      state.fileTabs[tabId].name = name
      state.paneTree[tabId] = makeFileEditorLeaf(normPath) as LayoutNode
    }),

  removeFileFromAllLayouts: (filePath) =>
    set((state) => {
      const norm = (p: string): string => p.replace(/\\/g, '/')
      const normPath = norm(filePath)
      for (const tabId of Object.keys(state.paneTree)) {
        // Collect editor-group leaves that contain this file path
        const collectAffectedLeafIds = (node: LayoutNode): string[] => {
          if (node.type === 'leaf') {
            return node.panel === 'editor-group' && node.tabs.some((t) => t.kind === 'file' && norm(t.path) === normPath)
              ? [node.id]
              : []
          }
          return node.children.flatMap(collectAffectedLeafIds)
        }
        const leafIds = collectAffectedLeafIds(state.paneTree[tabId])
        for (const leafId of leafIds) {
          const tree = state.paneTree[tabId]
          if (!tree) break
          const leaf = tree.type === 'leaf' && tree.id === leafId ? tree
            : (() => {
                const found = findLeafById(tree, leafId)
                return found
              })()
          if (!leaf || leaf.panel !== 'editor-group') continue
          // Find the tab index for this file
          const tabIdx = leaf.tabs.findIndex((t) => t.kind === 'file' && norm(t.path) === normPath)
          if (tabIdx === -1) continue
          if (leaf.tabs.length <= 1) {
            // Remove the whole leaf
            const newTree = removeNode(tree, leafId)
            if (newTree) {
              state.paneTree[tabId] = newTree
            } else if (tabId === '__root__') {
              state.paneTree[tabId] = makeHomeLeaf()
            } else {
              state.tabOrder = state.tabOrder.filter((id) => id !== tabId)
              delete state.paneTree[tabId]
              if (state.activeSessionId === tabId) state.activeSessionId = state.tabOrder[0] ?? null
              break
            }
          } else {
            const newTree = removeFileFromEditorGroupTree(tree, leafId, tabIdx)
            if (newTree) state.paneTree[tabId] = newTree
          }
        }
      }
    }),

  addTerminalTabToLeaf: (tabId, leafId, meta) =>
    set((state) => {
      state.sessions[meta.sessionId] = meta
      const tree = state.paneTree[tabId]
      if (tree) {
        state.paneTree[tabId] = addTerminalToEditorGroupTree(tree, leafId, meta.sessionId)
      }
      state.focusedSessionId = meta.sessionId
      state.focusedLeafId = null
    }),

  addFileToEditorGroup: (tabId, leafId, filePath) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      state.paneTree[tabId] = addFileToEditorGroupTree(tree, leafId, filePath)
      if (!state.openFilesList.includes(filePath)) state.openFilesList.push(filePath)
    }),

  removeFileFromEditorGroup: (tabId, leafId, fileIndex) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      const newTree = removeFileFromEditorGroupTree(tree, leafId, fileIndex)
      if (newTree) {
        state.paneTree[tabId] = newTree
      } else if (tabId === '__root__') {
        state.paneTree[tabId] = makeHomeLeaf()
      } else {
        delete state.paneTree[tabId]
      }
    }),

  setEditorGroupActive: (tabId, leafId, index) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      state.paneTree[tabId] = setEditorGroupActiveTree(tree, leafId, index)
    }),

  openFileInLayout: (filePath, displayTabId) =>
    set((state) => {
      const norm = (p: string): string => p.replace(/\\/g, '/')
      const normPath = norm(filePath)
      const targetTabId = displayTabId ?? state.activeSessionId ?? '__root__'

      const findFirstEditorGroup = (node: LayoutNode): string | null => {
        if (node.type === 'leaf') return node.panel === 'editor-group' ? node.id : null
        for (const child of node.children) {
          const found = findFirstEditorGroup(child)
          if (found) return found
        }
        return null
      }

      const targetTree = state.paneTree[targetTabId]

      // 1. Already open → switch to it
      if (targetTree) {
        const leaves = collectFileEditorLeaves(targetTree)
        const existing = leaves.find((l) => norm(l.filePath) === normPath)
        if (existing) {
          state.focusedLeafId = existing.leafId
          state.focusedSessionId = null
          const leaf = findLeafById(targetTree, existing.leafId)
          if (leaf?.panel === 'editor-group') {
            const idx = leaf.tabs.findIndex((t) => t.kind === 'file' && norm(t.path) === normPath)
            if (idx !== -1) state.paneTree[targetTabId] = setEditorGroupActiveTree(targetTree, existing.leafId, idx)
          }
          return
        }
      }

      // 2. Resolve target leaf: focused file leaf → focused terminal's leaf → first editor-group
      let targetLeafId: string | null = null
      if (targetTree) {
        if (state.focusedLeafId) {
          const leaf = findLeafById(targetTree, state.focusedLeafId)
          if (leaf?.panel === 'editor-group') targetLeafId = state.focusedLeafId
        }
        if (!targetLeafId && state.focusedSessionId) {
          targetLeafId = findTerminalLeafId(targetTree, state.focusedSessionId)
        }
        if (!targetLeafId) {
          targetLeafId = findFirstEditorGroup(targetTree)
        }
      }

      if (targetLeafId && targetTree) {
        state.paneTree[targetTabId] = addFileToEditorGroupTree(targetTree, targetLeafId, normPath)
        state.focusedLeafId = targetLeafId
        state.focusedSessionId = null
        if (!state.openFilesList.includes(normPath)) state.openFilesList.push(normPath)
        return
      }

      // 3. No editor-group exists → create one (replace home or insert at right)
      const tree = targetTree ?? (makeHomeLeaf() as LayoutNode)
      const effectiveTabId = targetTree ? targetTabId : '__root__'
      const isHome = tree.type === 'leaf' && tree.panel === 'home'
      const newLeaf = makeFileEditorLeaf(normPath, isHome)
      state.paneTree[effectiveTabId] = isHome ? (newLeaf as LayoutNode) : insertAtRight(tree, newLeaf)
      state.focusedLeafId = newLeaf.id
      state.focusedSessionId = null
      if (!state.openFilesList.includes(normPath)) state.openFilesList.push(normPath)
    }),

  reorderTabInEditorGroup: (tabId, leafId, fromIndex, toIndex) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      const leaf = findLeafById(tree, leafId)
      if (!leaf || leaf.panel !== 'editor-group' || fromIndex === toIndex) return
      const tabs = [...leaf.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      const ai = leaf.activeIndex
      const newActiveIndex =
        ai === fromIndex ? toIndex :
        fromIndex < toIndex && ai > fromIndex && ai <= toIndex ? ai - 1 :
        fromIndex > toIndex && ai < fromIndex && ai >= toIndex ? ai + 1 :
        ai
      const updatedLeaf: LayoutLeaf = { ...leaf, tabs, activeIndex: newActiveIndex }
      state.paneTree[tabId] = replaceNode(tree, leafId, updatedLeaf)
    }),

  closeNonMainPane: (tabId, leafId) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      const closingLeaf = findLeafById(tree, leafId)
      if (!closingLeaf || closingLeaf.panel !== 'editor-group') return
      const mainLeaf = findMainLeaf(tree)
      if (!mainLeaf || mainLeaf.id === leafId) {
        // No main or this IS main — just remove normally
        const newTree = removeNode(tree, leafId)
        if (newTree) { state.paneTree[tabId] = newTree }
        else if (tabId === '__root__') { state.paneTree[tabId] = makeHomeLeaf() }
        else { delete state.paneTree[tabId] }
        return
      }
      // Migrate tabs to main leaf
      let updatedTree: LayoutNode = tree
      for (const tab of closingLeaf.tabs) {
        if (tab.kind === 'file') updatedTree = addFileToEditorGroupTree(updatedTree, mainLeaf.id, tab.path)
        else updatedTree = addTerminalToEditorGroupTree(updatedTree, mainLeaf.id, tab.sessionId)
      }
      // Remove the closing leaf
      const finalTree = removeNode(updatedTree, leafId)
      if (finalTree) { state.paneTree[tabId] = finalTree }
      else if (tabId === '__root__') { state.paneTree[tabId] = makeHomeLeaf() }
      else { delete state.paneTree[tabId] }
      // Focus the last migrated tab in main
      const lastTab = closingLeaf.tabs[closingLeaf.tabs.length - 1]
      if (lastTab?.kind === 'terminal') { state.focusedSessionId = lastTab.sessionId; state.focusedLeafId = null }
      else { state.focusedLeafId = mainLeaf.id; state.focusedSessionId = null }
    }),

  moveEditorTab: (srcTabId, srcLeafId, tabIndex, dstTabId, dstLeafId, edge) =>
    set((state) => {
      const srcTree = state.paneTree[srcTabId]
      if (!srcTree) return
      const srcLeaf = findLeafById(srcTree, srcLeafId)
      if (!srcLeaf || srcLeaf.panel !== 'editor-group') return
      const tab = srcLeaf.tabs[tabIndex]
      if (!tab) return
      if (srcLeafId === dstLeafId && !edge) return
      // Lone tab dragged to edge of its own leaf — splitting would just move it back to the same spot
      if (srcLeafId === dstLeafId && edge && srcLeaf.tabs.length === 1) return

      // Step 1: Remove tab from source
      const newSrcTabs = srcLeaf.tabs.filter((_, i) => i !== tabIndex)
      if (newSrcTabs.length === 0) {
        if (srcLeaf.isMain) {
          const collapsed = removeNode(srcTree, srcLeafId)
          if (!collapsed) {
            state.paneTree[srcTabId] = makeHomeLeaf() as LayoutNode
          } else {
            state.paneTree[srcTabId] = collapsed
          }
        } else {
          const collapsed = removeNode(srcTree, srcLeafId)
          if (collapsed) { state.paneTree[srcTabId] = collapsed }
          else if (srcTabId === '__root__') { state.paneTree[srcTabId] = makeHomeLeaf() as LayoutNode }
          else { delete state.paneTree[srcTabId] }
        }
      } else {
        const updatedSrcLeaf: LayoutLeaf = { ...srcLeaf, tabs: newSrcTabs, activeIndex: Math.min(srcLeaf.activeIndex, newSrcTabs.length - 1) }
        state.paneTree[srcTabId] = replaceNode(srcTree, srcLeafId, updatedSrcLeaf)
      }

      // Step 2: Add to destination (re-fetch tree — may have changed if same tabId)
      const dstTree = state.paneTree[dstTabId]
      if (!dstTree) return
      if (!edge) {
        if (tab.kind === 'file') state.paneTree[dstTabId] = addFileToEditorGroupTree(dstTree, dstLeafId, tab.path)
        else state.paneTree[dstTabId] = addTerminalToEditorGroupTree(dstTree, dstLeafId, tab.sessionId)
        state.focusedLeafId = dstLeafId
      } else {
        const newLeaf = tab.kind === 'file' ? makeFileEditorLeaf(tab.path) : makeTerminalLeaf(tab.sessionId)
        const direction = (edge === 'left' || edge === 'right') ? 'horizontal' : 'vertical'
        const sidePl: 'before' | 'after' = (edge === 'right' || edge === 'bottom') ? 'after' : 'before'
        state.paneTree[dstTabId] = insertNode(dstTree, dstLeafId, direction, newLeaf, sidePl)
        state.focusedLeafId = newLeaf.id
      }
      if (tab.kind === 'terminal') { state.focusedSessionId = tab.sessionId; state.focusedLeafId = null }
      else { state.focusedSessionId = null }
    }),

  closeTabsInEditorGroup: (tabId, leafId, mode, keepIndex) =>
    set((state) => {
      const tree = state.paneTree[tabId]
      if (!tree) return
      const leaf = findLeafById(tree, leafId)
      if (!leaf || leaf.panel !== 'editor-group') return
      const tabs = leaf.tabs
      const newTabs =
        mode === 'others' ? [tabs[keepIndex]] :
        mode === 'left'   ? tabs.slice(keepIndex) :
                            tabs.slice(0, keepIndex + 1)
      const updatedLeaf: LayoutLeaf = { ...leaf, tabs: newTabs, activeIndex: mode === 'left' ? 0 : Math.min(keepIndex, newTabs.length - 1) }
      state.paneTree[tabId] = replaceNode(tree, leafId, updatedLeaf)
    }),

  openTerminalInLayout: (tabId, meta) =>
    set((state) => {
      state.sessions[meta.sessionId] = meta
      const tree = state.paneTree[tabId]

      // Helper: find first editor-group leaf id in a tree
      const findFirstEditorGroup = (node: LayoutNode): string | null => {
        if (node.type === 'leaf') return node.panel === 'editor-group' ? node.id : null
        for (const child of node.children) {
          const found = findFirstEditorGroup(child)
          if (found) return found
        }
        return null
      }

      if (!tree) {
        // No pane tree at all — create one
        state.paneTree[tabId] = makeTerminalLeaf(meta.sessionId) as LayoutNode
        state.focusedSessionId = meta.sessionId
        return
      }

      // Try focused leaf first (file-focused), then focused session's leaf (terminal-focused)
      if (state.focusedLeafId) {
        const leaf = findLeafById(tree, state.focusedLeafId)
        if (leaf?.panel === 'editor-group') {
          state.paneTree[tabId] = addTerminalToEditorGroupTree(tree, state.focusedLeafId, meta.sessionId)
          state.focusedSessionId = meta.sessionId
          state.focusedLeafId = null
          return
        }
      }
      if (state.focusedSessionId) {
        const termLeafId = findTerminalLeafId(tree, state.focusedSessionId)
        if (termLeafId) {
          state.paneTree[tabId] = addTerminalToEditorGroupTree(tree, termLeafId, meta.sessionId)
          state.focusedSessionId = meta.sessionId
          return
        }
      }

      // Try first editor-group in the tree
      const firstLeafId = findFirstEditorGroup(tree)
      if (firstLeafId) {
        state.paneTree[tabId] = addTerminalToEditorGroupTree(tree, firstLeafId, meta.sessionId)
        state.focusedSessionId = meta.sessionId
        return
      }

      // Replace home leaf or insert at right
      const isFirst = tree.type === 'leaf' && tree.panel === 'home'
      const newTermLeaf = makeTerminalLeaf(meta.sessionId, isFirst)
      state.paneTree[tabId] = isFirst
        ? (newTermLeaf as LayoutNode)
        : insertAtRight(tree, newTermLeaf)
      state.focusedSessionId = meta.sessionId
    }),

})
