function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export type LayoutLeaf =
  | { type: 'leaf'; id: string; panel: 'terminal'; sessionId: string }
  | { type: 'leaf'; id: string; panel: 'notes'; noteId?: string }
  | { type: 'leaf'; id: string; panel: 'markdown-preview'; noteId: string }
  | { type: 'leaf'; id: string; panel: 'home' }
  | { type: 'leaf'; id: string; panel: 'file-editor'; filePath: string }

export type LayoutSplit = {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: LayoutNode[]
}

export type LayoutNode = LayoutLeaf | LayoutSplit

export function makeTerminalLeaf(sessionId: string): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'terminal', sessionId }
}

export function makeNotesLeaf(noteId?: string): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'notes', noteId }
}

export function makeMarkdownPreviewLeaf(noteId: string): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'markdown-preview', noteId }
}

export function makeHomeLeaf(): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'home' }
}

export function makeFileEditorLeaf(filePath: string): LayoutLeaf {
  return { type: 'leaf', id: makeId(), panel: 'file-editor', filePath }
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
  if (node.type === 'leaf') return (node.panel === 'terminal' && node.sessionId === sessionId) ? node.id : null
  for (const child of node.children) {
    const found = findTerminalLeafId(child, sessionId)
    if (found) return found
  }
  return null
}

export function findNotesLeafId(node: LayoutNode): string | null {
  if (node.type === 'leaf') return node.panel === 'notes' ? node.id : null
  for (const child of node.children) {
    const found = findNotesLeafId(child)
    if (found) return found
  }
  return null
}

export function hasNotesForNote(node: LayoutNode, noteId: string): boolean {
  if (node.type === 'leaf') return node.panel === 'notes' && node.noteId === noteId
  return node.children.some((c) => hasNotesForNote(c, noteId))
}

export function findNotesLeafIdForNote(node: LayoutNode, noteId: string): string | null {
  if (node.type === 'leaf') return (node.panel === 'notes' && node.noteId === noteId) ? node.id : null
  for (const child of node.children) {
    const found = findNotesLeafIdForNote(child, noteId)
    if (found) return found
  }
  return null
}

export function hasMarkdownPreviewForNote(node: LayoutNode, noteId: string): boolean {
  if (node.type === 'leaf') return node.panel === 'markdown-preview' && node.noteId === noteId
  return node.children.some((c) => hasMarkdownPreviewForNote(c, noteId))
}

export function collectSessionIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return node.panel === 'terminal' ? [node.sessionId] : []
  return node.children.flatMap(collectSessionIds)
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

/** Split a terminal leaf by sessionId — used by the store's splitPane action */
export function splitTerminalLeaf(
  node: LayoutNode,
  targetSessionId: string,
  direction: 'horizontal' | 'vertical',
  newSessionId: string
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.panel === 'terminal' && node.sessionId === targetSessionId) {
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

/** Remove terminal leaf by sessionId — used by store's closePane / detachPane */
export function removeTerminalLeaf(node: LayoutNode, sessionId: string): LayoutNode | null {
  if (node.type === 'leaf') {
    return node.panel === 'terminal' && node.sessionId === sessionId ? null : node
  }
  const children = node.children
    .map((c) => removeTerminalLeaf(c, sessionId))
    .filter((c): c is LayoutNode => c !== null)
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  return { ...node, children }
}

/** Migrate legacy { type:'leaf', sessionId } format (no id/panel) to LayoutNode */
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
    return { type: 'leaf', id: typeof n.id === 'string' ? n.id : makeId(), panel: 'notes' }
  }
  return {
    type: 'leaf',
    id: typeof n.id === 'string' ? n.id : makeId(),
    panel: 'terminal',
    sessionId: n.sessionId as string,
  }
}
