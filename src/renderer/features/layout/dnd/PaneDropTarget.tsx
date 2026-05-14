import { useRef, useCallback } from 'react'
import { GripHorizontal } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useLayoutDnd } from './LayoutDndContext'
import { useStore } from '../../../store/root.store'
import { makeNotesLeaf, findNotesLeafIdForNote, makeFileEditorLeaf, findLeafById } from '../layout-tree'
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

const GHOST_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export function PaneDropTarget({ leafId, tabId, children }: Props): JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLImageElement | null>(null)

  const { dragState, activeDropTarget, startDrag, endDrag, setActiveDropTarget } = useLayoutDnd()
  const moveLayout = useStore((s) => s.moveLayout)
  const insertSessionIntoLayout = useStore((s) => s.insertSessionIntoLayout)
  const insertLayout = useStore((s) => s.insertLayout)
  const paneTree = useStore((s) => s.paneTree)

  const isDragging = dragState !== null
  const isSource = dragState?.type === 'layout-leaf' && dragState.leafId === leafId
  const activeZone = activeDropTarget?.leafId === leafId ? activeDropTarget.side : null

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!ghostRef.current) {
      const img = new Image(); img.src = GHOST_SRC; ghostRef.current = img
    }
    e.dataTransfer.setDragImage(ghostRef.current, 0, 0)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', leafId)
    startDrag({ type: 'layout-leaf', leafId, tabId })
  }, [leafId, tabId, startDrag])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!dragState || isSource || !paneRef.current) return
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
      // Never insert file editors into '__root__' — that corrupts workspace navigation
      if (tabId !== '__root__') {
        const targetLeaf = tree ? findLeafById(tree, leafId) : null
        if (targetLeaf?.type === 'leaf' && targetLeaf.panel === 'file-editor') {
          document.dispatchEvent(new CustomEvent('acc:open-file-in-pane', {
            detail: { leafId, filePath: dragState.filePath }
          }))
        } else {
          const fileSide = (activeZone === 'right' || activeZone === 'bottom') ? 'after' : 'before'
          insertLayout(tabId, leafId, direction, makeFileEditorLeaf(dragState.filePath), fileSide)
        }
      }
    } else if (!activeZone) {
      endDrag(); return
    } else if (dragState.type === 'layout-leaf') {
      if (dragState.tabId === tabId) moveLayout(tabId, dragState.leafId, leafId, direction, side)
    } else if (dragState.type === 'sidebar-session') {
      insertSessionIntoLayout(tabId, leafId, dragState.sessionId, direction, side)
    } else if (dragState.type === 'sidebar-notes') {
      const existingLeafId = dragState.noteId && tree ? findNotesLeafIdForNote(tree, dragState.noteId) : null
      if (existingLeafId) moveLayout(tabId, existingLeafId, leafId, direction, side)
      else insertLayout(tabId, leafId, direction, makeNotesLeaf(dragState.noteId), side)
    }

    endDrag()
  }, [dragState, activeZone, tabId, leafId, moveLayout, insertSessionIntoLayout, insertLayout, paneTree, endDrag])

  return (
    <div
      ref={paneRef}
      className="relative w-full h-full group"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag handle — shown on pane hover, initiates pane rearrange */}
      {!isDragging && (
        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={() => endDrag()}
          className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 rounded hover:bg-brand-panel/80 bg-brand-surface/60"
          title="Drag to rearrange"
        >
          <GripHorizontal size={10} className="text-zinc-500" />
        </div>
      )}

      {/* Transparent overlay — blocks terminal canvas from eating drag events */}
      {isDragging && !isSource && (
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
