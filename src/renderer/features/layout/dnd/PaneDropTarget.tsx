import { useRef, useCallback } from 'react'
import { cn } from '../../../lib/utils'
import { useLayoutDnd } from './LayoutDndContext'
import { useStore } from '../../../store/root.store'
import { makeFileEditorLeaf, findLeafById, collectFileEditorLeaves } from '../layout-tree'
import { normalizePath } from '../../../lib/utils'
import type { DropSide } from './LayoutDndContext'

interface Props {
  leafId: string
  tabId: string
  children: React.ReactNode
  acceptsCenter?: boolean
}

function hitSide(e: React.DragEvent, el: HTMLElement, allowCenter: boolean): DropSide {
  const rect = el.getBoundingClientRect()
  const rx = (e.clientX - rect.left) / rect.width
  const ry = (e.clientY - rect.top) / rect.height
  const dx = Math.min(rx, 1 - rx)
  const dy = Math.min(ry, 1 - ry)
  if (allowCenter && dx > 0.2 && dy > 0.2) return 'center'
  if (dx < dy) return rx < 0.5 ? 'left' : 'right'
  return ry < 0.5 ? 'top' : 'bottom'
}

const ZONE_CLASS: Record<DropSide, string> = {
  left:   'top-1 bottom-1 left-1 w-[45%]',
  right:  'top-1 bottom-1 right-1 w-[45%]',
  top:    'top-1 left-1 right-1 h-[45%]',
  bottom: 'bottom-1 left-1 right-1 h-[45%]',
  center: 'inset-2',
}

export function PaneDropTarget({ leafId, tabId, children, acceptsCenter }: Props): JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)

  const { dragState, activeDropTarget, endDrag, setActiveDropTarget } = useLayoutDnd()
  const moveLayout = useStore((s) => s.moveLayout)
  const insertSessionIntoLayout = useStore((s) => s.insertSessionIntoLayout)
  const insertLayout = useStore((s) => s.insertLayout)
  const replaceLayoutLeaf = useStore((s) => s.replaceLayoutLeaf)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const addOpenFile = useStore((s) => s.addOpenFile)
  const setFocusedLeaf = useStore((s) => s.setFocusedLeaf)
  const addFileToEditorGroup = useStore((s) => s.addFileToEditorGroup)
  const paneTree = useStore((s) => s.paneTree)

  const moveEditorTab = useStore((s) => s.moveEditorTab)

  const isDragging = dragState !== null
  // isSource controls whether the OVERLAY renders (overlay blocks child events).
  // editor-tab from same leaf: keep isSource=true so the overlay is suppressed and tab buttons
  // remain reachable for within-bar reordering (tab button onDragOver stops propagation during
  // reorder, so handleDragOver below only fires when the cursor leaves the tab bar).
  const isSource =
    (dragState?.type === 'layout-leaf' && dragState.leafId === leafId) ||
    (dragState?.type === 'editor-tab' && dragState.sourceLeafId === leafId)
  const isSelfEditorTab = dragState?.type === 'editor-tab' && dragState.sourceLeafId === leafId
  const activeZone = activeDropTarget?.leafId === leafId ? activeDropTarget.side : null

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // OS file drags have no internal dragState — let child elements (TerminalPane) handle them
    if (!dragState) {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      return
    }
    if (!paneRef.current) return

    // Self editor-tab: support edge-only splits. The tab bar's per-tab onDragOver calls
    // stopPropagation during within-bar reorder, so this branch only fires when the cursor
    // has moved into the content area — a genuine intent to split the pane.
    if (isSelfEditorTab) {
      const side = hitSide(e, paneRef.current, false) // never center — merge into self is a no-op
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (activeDropTarget?.leafId !== leafId || activeDropTarget.side !== side) {
        setActiveDropTarget({ leafId, side })
      }
      return
    }

    if (isSource) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const allowCenter = !!acceptsCenter && (dragState.type === 'file-path' || dragState.type === 'editor-tab')
    const side = hitSide(e, paneRef.current, allowCenter)
    if (activeDropTarget?.leafId !== leafId || activeDropTarget.side !== side) {
      setActiveDropTarget({ leafId, side })
    }
  }, [dragState, isSource, isSelfEditorTab, leafId, activeDropTarget, acceptsCenter, setActiveDropTarget])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!paneRef.current?.contains(e.relatedTarget as Node)) {
      setActiveDropTarget(null)
    }
  }, [setActiveDropTarget])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!dragState) { endDrag(); return }

    const tree = paneTree[tabId]
    const direction = (activeZone === 'left' || activeZone === 'right') ? 'horizontal' : 'vertical'
    const side = (activeZone === 'right' || activeZone === 'bottom') ? 'after' : 'before'

    // Center drop — add file to this editor group
    if (activeZone === 'center' && dragState.type === 'file-path') {
      addFileToEditorGroup(tabId, leafId, dragState.filePath)
      addOpenFile(dragState.filePath)
      endDrag()
      return
    }

    if (dragState.type === 'file-path') {
      const filePath = dragState.filePath

      // Check if file is already open somewhere in the layout
      let existingLeafId: string | null = null
      let existingTabId: string | null = null
      for (const tId of Object.keys(paneTree)) {
        const t = paneTree[tId]
        if (!t) continue
        const found = collectFileEditorLeaves(t).find((l) => normalizePath(l.filePath) === normalizePath(filePath))
        if (found) { existingLeafId = found.leafId; existingTabId = tId; break }
      }

      if (existingLeafId && existingTabId) {
        if (activeZone && existingLeafId !== leafId) {
          if (existingTabId === tabId) {
            // Already in this tab — just reposition it
            moveLayout(tabId, existingLeafId, leafId, direction, side)
            setFocusedLeaf(existingLeafId)
          } else {
            // In a different tab (e.g. file tab) — open a new independent copy here
            const newLeaf = makeFileEditorLeaf(normalizePath(filePath))
            const currentTree = paneTree[tabId]
            if (currentTree?.type === 'leaf' && currentTree.panel === 'home' && currentTree.id === leafId) {
              replaceLayoutLeaf(tabId, leafId, newLeaf)
            } else {
              insertLayout(tabId, leafId, direction, newLeaf, side)
            }
            setFocusedLeaf(newLeaf.id)
          }
        } else {
          setFocusedLeaf(existingLeafId)
        }
        endDrag()
        return
      }

      // Not yet in layout — split alongside the drop target
      const newLeaf = makeFileEditorLeaf(filePath)
      addOpenFile(filePath)
      const currentTree = paneTree[tabId]
      if (currentTree?.type === 'leaf' && currentTree.panel === 'home' && currentTree.id === leafId) {
        replaceLayoutLeaf(tabId, leafId, newLeaf)
      } else {
        insertLayout(tabId, leafId, direction, newLeaf, side)
      }
      setFocusedLeaf(newLeaf.id)
    } else if (!activeZone) {
      endDrag(); return
    } else if (dragState.type === 'layout-leaf') {
      if (dragState.tabId === tabId) {
        moveLayout(tabId, dragState.leafId, leafId, direction, side)
      } else {
        // Cross-tab: pull the leaf out of its source tab and place it here
        const srcTree = paneTree[dragState.tabId]
        if (srcTree) {
          const srcLeaf = findLeafById(srcTree, dragState.leafId)
          if (srcLeaf) {
            insertLayout(tabId, leafId, direction, srcLeaf, side)
            removeLayoutLeaf(dragState.tabId, dragState.leafId)
          }
        }
      }
    } else if (dragState.type === 'sidebar-session') {
      insertSessionIntoLayout(tabId, leafId, dragState.sessionId, direction, side)
    } else if (dragState.type === 'editor-tab') {
      const edge = activeZone === 'center' ? null : activeZone
      moveEditorTab(dragState.sourceTabId, dragState.sourceLeafId, dragState.tabIndex, tabId, leafId, edge)
    }

    endDrag()
  }, [dragState, activeZone, tabId, leafId, moveLayout, insertSessionIntoLayout, insertLayout, replaceLayoutLeaf, addOpenFile, addFileToEditorGroup, setFocusedLeaf, moveEditorTab, paneTree, endDrag])

  return (
    <div
      ref={paneRef}
      className="relative w-full h-full group"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {/* Transparent overlay — blocks terminal canvas from eating drag events on target panes.
          Not rendered for source pane (isSource=true) so tab buttons remain reachable. */}
      {isDragging && !isSource && (
        <div className="absolute inset-0 z-20" />
      )}

      {/* Drop preview highlight — also shown for self editor-tab edge drops (splits) */}
      {isDragging && activeZone && (!isSource || isSelfEditorTab) && (
        <div
          className={cn(
            'absolute z-30 pointer-events-none rounded',
            'bg-brand-accent/25 border-2 border-brand-accent',
            ZONE_CLASS[activeZone]
          )}
        />
      )}
    </div>
  )
}
