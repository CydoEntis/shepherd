import { useRef, useCallback } from 'react'
import { cn } from '../../../lib/utils'
import { useLayoutDnd } from './LayoutDndContext'
import { useStore } from '../../../store/root.store'
import { makeNotesLeaf, findNotesLeafIdForNote, makeFileEditorLeaf, findLeafById, collectFileEditorLeaves } from '../layout-tree'
import { normalizePath } from '../../../lib/utils'
import type { DropSide } from './LayoutDndContext'

interface Props {
  leafId: string
  tabId: string
  children: React.ReactNode
}

function hitSide(e: React.DragEvent, el: HTMLElement): DropSide {
  const rect = el.getBoundingClientRect()
  const rx = (e.clientX - rect.left) / rect.width
  const ry = (e.clientY - rect.top) / rect.height
  const dx = Math.min(rx, 1 - rx)
  const dy = Math.min(ry, 1 - ry)
  if (dx < dy) return rx < 0.5 ? 'left' : 'right'
  return ry < 0.5 ? 'top' : 'bottom'
}

const ZONE_CLASS: Record<DropSide, string> = {
  left:   'top-1 bottom-1 left-1 w-[45%]',
  right:  'top-1 bottom-1 right-1 w-[45%]',
  top:    'top-1 left-1 right-1 h-[45%]',
  bottom: 'bottom-1 left-1 right-1 h-[45%]',
}

export function PaneDropTarget({ leafId, tabId, children }: Props): JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)

  const { dragState, activeDropTarget, endDrag, setActiveDropTarget } = useLayoutDnd()
  const moveLayout = useStore((s) => s.moveLayout)
  const insertSessionIntoLayout = useStore((s) => s.insertSessionIntoLayout)
  const insertLayout = useStore((s) => s.insertLayout)
  const replaceLayoutLeaf = useStore((s) => s.replaceLayoutLeaf)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const addOpenFile = useStore((s) => s.addOpenFile)
  const setFocusedLeaf = useStore((s) => s.setFocusedLeaf)
  const paneTree = useStore((s) => s.paneTree)

  const isDragging = dragState !== null
  const isSource = dragState?.type === 'layout-leaf' && dragState.leafId === leafId
  const activeZone = activeDropTarget?.leafId === leafId ? activeDropTarget.side : null

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // OS file drags have no internal dragState — let child elements (TerminalPane) handle them
    if (!dragState) {
      if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      return
    }
    if (isSource || !paneRef.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const side = hitSide(e, paneRef.current)
    if (activeDropTarget?.leafId !== leafId || activeDropTarget.side !== side) {
      setActiveDropTarget({ leafId, side })
    }
  }, [dragState, isSource, leafId, activeDropTarget, setActiveDropTarget])

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
    } else if (dragState.type === 'sidebar-notes') {
      const existingLeafId = dragState.noteId && tree ? findNotesLeafIdForNote(tree, dragState.noteId) : null
      if (existingLeafId) moveLayout(tabId, existingLeafId, leafId, direction, side)
      else insertLayout(tabId, leafId, direction, makeNotesLeaf(dragState.noteId), side)
    }

    endDrag()
  }, [dragState, activeZone, tabId, leafId, moveLayout, insertSessionIntoLayout, insertLayout, replaceLayoutLeaf, addOpenFile, setFocusedLeaf, paneTree, endDrag])

  return (
    <div
      ref={paneRef}
      className="relative w-full h-full group"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {/* Transparent overlay — blocks terminal canvas from eating drag events (not for file-path drags so terminals can receive them) */}
      {isDragging && !isSource && dragState?.type !== 'file-path' && (
        <div className="absolute inset-0 z-20" />
      )}

      {/* Drop preview highlight */}
      {isDragging && !isSource && activeZone && (
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
