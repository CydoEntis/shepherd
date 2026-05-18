function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export type EditorTab =
  | { kind: 'file'; path: string }
  | { kind: 'terminal'; sessionId: string }

export type LayoutLeaf =
  | { type: 'leaf'; id: string; panel: 'editor-group'; tabs: EditorTab[]; activeIndex: number; isMain?: true }
  | { type: 'leaf'; id: string; panel: 'markdown-preview'; filePath: string }
  | { type: 'leaf'; id: string; panel: 'home' }

export type LayoutSplit = {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: LayoutNode[]
}

export type LayoutNode = LayoutLeaf | LayoutSplit

export function makeTerminalLeaf(sessionId: string, isMain?: boolean): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'editor-group', tabs: [{ kind: 'terminal', sessionId }], activeIndex: 0, ...(isMain && { isMain }) }
}

export function makeMarkdownPreviewLeaf(filePath: string): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'markdown-preview', filePath }
}

export function makeHomeLeaf(): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'home' }
}

export function makeFileEditorLeaf(filePath: string, isMain?: boolean): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'editor-group', tabs: [{ kind: 'file', path: filePath }], activeIndex: 0, ...(isMain && { isMain }) }
}

export function findMainLeaf(node: LayoutNode): LayoutLeaf | null {
  if (node.type === 'leaf') return node.panel === 'editor-group' && node.isMain ? node : null
  for (const child of node.children) {
    const found = findMainLeaf(child)
    if (found) return found
  }
  return null
}

export function replaceNode(tree: LayoutNode, targetId: string, replacement: LayoutNode): LayoutNode {
  if (tree.type === 'leaf') return tree.id === targetId ? replacement : tree
  return { ...tree, children: tree.children.map((c) => replaceNode(c, targetId, replacement)) }
}

/** Insert newLeaf next to targetId, splitting in the given direction */
export function insertNode(
  node: LayoutNode,
  targetId: string,
  direction: 'horizontal' | 'vertical',
  newLeaf: LayoutLeaf,
  side: 'before' | 'after' = 'after'
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.id === targetId) {
      const children: LayoutNode[] = side === 'after' ? [node, newLeaf] : [newLeaf, node]
      return { type: 'split', id: makeId(), direction, children }
    }
    return node
  }
  return { ...node, children: node.children.map((c) => insertNode(c, targetId, direction, newLeaf, side)) }
}

/** Insert newLeaf at the right edge — used when opening the notes panel */
export function insertAtRight(root: LayoutNode, newLeaf: LayoutLeaf): LayoutNode {
  if (root.type === 'leaf') {
    return { type: 'split', id: makeId(), direction: 'horizontal', children: [root, newLeaf] }
  }
  if (root.direction === 'horizontal') {
    return { ...root, children: [...root.children, newLeaf] }
  }
  // vertical split — wrap in horizontal so notes sits to the right
  return { type: 'split', id: makeId(), direction: 'horizontal', children: [root, newLeaf] }
}

/** Remove a leaf by its id */
export function removeNode(node: LayoutNode, leafId: string): LayoutNode | null {
  if (node.type === 'leaf') return node.id === leafId ? null : node
  const children = node.children
    .map((c) => removeNode(c, leafId))
    .filter((c): c is LayoutNode => c !== null)
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { ...node, children }
}

/** Move a leaf (by id) to a new position relative to targetId */
export function moveNode(
  root: LayoutNode,
  sourceId: string,
  targetId: string,
  direction: 'horizontal' | 'vertical',
  side: 'before' | 'after'
): LayoutNode {
  const source = findLeafById(root, sourceId)
  if (!source) return root
  const withoutSource = removeNode(root, sourceId)
  if (!withoutSource) return root
  return insertNode(withoutSource, targetId, direction, source, side)
}

export function findLeafById(node: LayoutNode, id: string): LayoutLeaf | null {
  if (node.type === 'leaf') return node.id === id ? node : null
  for (const child of node.children) {
    const found = findLeafById(child, id)
    if (found) return found
  }
  return null
}

export function findTerminalLeafId(node: LayoutNode, sessionId: string): string | null {
  if (node.type === 'leaf') {
    if (node.panel === 'editor-group') {
      const hasIt = node.tabs.some((t) => t.kind === 'terminal' && t.sessionId === sessionId)
      return hasIt ? node.id : null
    }
    return null
  }
  for (const child of node.children) {
    const found = findTerminalLeafId(child, sessionId)
    if (found) return found
  }
  return null
}

export function hasMarkdownPreviewForFile(node: LayoutNode, filePath: string): boolean {
  if (node.type === 'leaf') return node.panel === 'markdown-preview' && node.filePath === filePath
  return node.children.some((c) => hasMarkdownPreviewForFile(c, filePath))
}

export function collectSessionIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') {
    if (node.panel === 'editor-group') {
      return node.tabs.filter((t): t is Extract<EditorTab, { kind: 'terminal' }> => t.kind === 'terminal').map((t) => t.sessionId)
    }
    return []
  }
  return node.children.flatMap(collectSessionIds)
}

export type FileEditorLeafInfo = { leafId: string; filePath: string }

export function collectFileEditorLeaves(node: LayoutNode): FileEditorLeafInfo[] {
  if (node.type === 'leaf') {
    if (node.panel === 'editor-group') {
      return node.tabs
        .filter((t): t is Extract<EditorTab, { kind: 'file' }> => t.kind === 'file')
        .map((t) => ({ leafId: node.id, filePath: t.path }))
    }
    return []
  }
  return node.children.flatMap(collectFileEditorLeaves)
}

export function addFileToEditorGroup(node: LayoutNode, leafId: string, filePath: string): LayoutNode {
  if (node.type === 'leaf') {
    if (node.id === leafId && node.panel === 'editor-group') {
      const idx = node.tabs.findIndex((t) => t.kind === 'file' && t.path === filePath)
      if (idx !== -1) return { ...node, activeIndex: idx }
      const newTabs: EditorTab[] = [...node.tabs, { kind: 'file', path: filePath }]
      return { ...node, tabs: newTabs, activeIndex: newTabs.length - 1 }
    }
    return node
  }
  return { ...node, children: node.children.map((c) => addFileToEditorGroup(c, leafId, filePath)) }
}

export function removeFileFromEditorGroup(node: LayoutNode, leafId: string, tabIndex: number): LayoutNode | null {
  if (node.type === 'leaf') {
    if (node.id === leafId && node.panel === 'editor-group') {
      if (node.tabs.length <= 1) return null
      const newTabs = node.tabs.filter((_, i) => i !== tabIndex)
      return { ...node, tabs: newTabs, activeIndex: Math.min(node.activeIndex, newTabs.length - 1) }
    }
    return node
  }
  const children = node.children
    .map((c) => removeFileFromEditorGroup(c, leafId, tabIndex))
    .filter((c): c is LayoutNode => c !== null)
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { ...node, children }
}

export function setEditorGroupActive(node: LayoutNode, leafId: string, index: number): LayoutNode {
  if (node.type === 'leaf') {
    if (node.id === leafId && node.panel === 'editor-group') return { ...node, activeIndex: index }
    return node
  }
  return { ...node, children: node.children.map((c) => setEditorGroupActive(c, leafId, index)) }
}

export function findTabForSession(
  layoutTree: Record<string, LayoutNode>,
  sessionId: string
): string | null {
  for (const tabId of Object.keys(layoutTree)) {
    if (collectSessionIds(layoutTree[tabId]).includes(sessionId)) return tabId
  }
  return null
}

/** Split an editor-group leaf that contains targetSessionId — used by the store's splitPane action */
export function splitTerminalLeaf(
  node: LayoutNode,
  targetSessionId: string,
  direction: 'horizontal' | 'vertical',
  newSessionId: string
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.panel === 'editor-group' && node.tabs.some((t) => t.kind === 'terminal' && t.sessionId === targetSessionId)) {
      return {
        type: 'split',
        id: makeId(),
        direction,
        children: [node, makeTerminalLeaf(newSessionId)],
      }
    }
    return node
  }
  return { ...node, children: node.children.map((c) => splitTerminalLeaf(c, targetSessionId, direction, newSessionId)) }
}

/** Split any editor-group leaf by its leafId — used when splitting from a file pane */
export function splitLeafById(
  node: LayoutNode,
  leafId: string,
  direction: 'horizontal' | 'vertical',
  newSessionId: string
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.id === leafId && node.panel === 'editor-group') {
      return {
        type: 'split',
        id: makeId(),
        direction,
        children: [node, makeTerminalLeaf(newSessionId)],
      }
    }
    return node
  }
  return { ...node, children: node.children.map((c) => splitLeafById(c, leafId, direction, newSessionId)) }
}

/** Remove terminal tab by sessionId from any editor-group; if editor-group becomes empty return null */
export function removeTerminalLeaf(node: LayoutNode, sessionId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    if (node.panel === 'editor-group') {
      const remaining = node.tabs.filter((t) => !(t.kind === 'terminal' && t.sessionId === sessionId))
      if (remaining.length === node.tabs.length) return node // not found here
      if (remaining.length === 0) return null
      return { ...node, tabs: remaining, activeIndex: Math.min(node.activeIndex, remaining.length - 1) }
    }
    return node
  }
  const children = node.children
    .map((c) => removeTerminalLeaf(c, sessionId))
    .filter((c): c is LayoutNode => c !== null)
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { ...node, children }
}

/** Add a terminal tab to a specific editor-group leaf */
export function addTerminalToEditorGroup(node: LayoutNode, leafId: string, sessionId: string): LayoutNode {
  if (node.type === 'leaf') {
    if (node.id === leafId && node.panel === 'editor-group') {
      // Don't duplicate
      const idx = node.tabs.findIndex((t) => t.kind === 'terminal' && t.sessionId === sessionId)
      if (idx !== -1) return { ...node, activeIndex: idx }
      const newTabs: EditorTab[] = [...node.tabs, { kind: 'terminal', sessionId }]
      return { ...node, tabs: newTabs, activeIndex: newTabs.length - 1 }
    }
    return node
  }
  return { ...node, children: node.children.map((c) => addTerminalToEditorGroup(c, leafId, sessionId)) }
}

/** Migrate legacy layout formats to current LayoutNode */
export function migrateLayoutNode(raw: unknown): LayoutNode {
  const n = raw as Record<string, unknown>
  if (n.type === 'split') {
    return {
      type: 'split',
      id: typeof n.id === 'string' ? n.id : makeId(),
      direction: n.direction as 'horizontal' | 'vertical',
      children: (n.children as unknown[]).map(migrateLayoutNode),
    }
  }
  if (n.panel === 'notes') {
    return { type: 'leaf', id: typeof n.id === 'string' ? n.id : makeId(), panel: 'home' }
  }
  if (n.panel === 'markdown-preview' && typeof n.noteId === 'string') {
    return { type: 'leaf', id: typeof n.id === 'string' ? n.id : makeId(), panel: 'home' }
  }
  if (n.panel === 'markdown-preview' && typeof n.filePath === 'string') {
    return { type: 'leaf', id: typeof n.id === 'string' ? n.id : makeId(), panel: 'markdown-preview', filePath: n.filePath }
  }
  if (n.panel === 'home') {
    return { type: 'leaf', id: typeof n.id === 'string' ? n.id : makeId(), panel: 'home' }
  }
  // Migrate old file-editor format → editor-group
  if (n.panel === 'file-editor') {
    const filePaths = Array.isArray(n.filePaths)
      ? (n.filePaths as string[])
      : typeof n.filePath === 'string' ? [n.filePath] : []
    const tabs: EditorTab[] = filePaths.map((p) => ({ kind: 'file' as const, path: p }))
    return {
      type: 'leaf',
      id: typeof n.id === 'string' ? n.id : makeId(),
      panel: 'editor-group',
      tabs: tabs.length > 0 ? tabs : [{ kind: 'file', path: '' }],
      activeIndex: typeof n.activeIndex === 'number' ? n.activeIndex : 0,
    }
  }
  // Migrate old terminal format → editor-group
  if (n.panel === 'editor-group') {
    return {
      type: 'leaf',
      id: typeof n.id === 'string' ? n.id : makeId(),
      panel: 'editor-group',
      tabs: Array.isArray(n.tabs) ? (n.tabs as EditorTab[]) : [],
      activeIndex: typeof n.activeIndex === 'number' ? n.activeIndex : 0,
      ...(n.isMain === true ? { isMain: true as const } : {}),
    }
  }
  // Legacy terminal leaf (no panel field or panel === 'terminal')
  return {
    type: 'leaf',
    id: typeof n.id === 'string' ? n.id : makeId(),
    panel: 'editor-group',
    tabs: [{ kind: 'terminal', sessionId: n.sessionId as string }],
    activeIndex: 0,
  }
}
