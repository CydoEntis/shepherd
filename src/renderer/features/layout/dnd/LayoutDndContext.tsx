import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { EditorTab } from '../layout-tree'

export type DropSide = 'top' | 'bottom' | 'left' | 'right' | 'center'

export type DragState =
  | { type: 'layout-leaf'; leafId: string; tabId: string }
  | { type: 'sidebar-session'; sessionId: string }
  | { type: 'sidebar-notes'; noteId: string }
  | { type: 'file-path'; filePath: string }
  | { type: 'editor-tab'; sourceTabId: string; sourceLeafId: string; tabIndex: number; tab: EditorTab }

export interface DropTarget {
  leafId: string
  side: DropSide
}

interface LayoutDndContextValue {
  dragState: DragState | null
  activeDropTarget: DropTarget | null
  startDrag: (state: DragState) => void
  endDrag: () => void
  setActiveDropTarget: (target: DropTarget | null) => void
}

const LayoutDndContext = createContext<LayoutDndContextValue>({
  dragState: null,
  activeDropTarget: null,
  startDrag: () => {},
  endDrag: () => {},
  setActiveDropTarget: () => {},
})

export function LayoutDndProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [activeDropTarget, setActiveDropTarget] = useState<DropTarget | null>(null)

  const startDrag = useCallback((state: DragState) => setDragState(state), [])

  const endDrag = useCallback(() => {
    setDragState(null)
    setActiveDropTarget(null)
  }, [])

  // Global safety net: clear drag state when any drag ends (handles drops outside panes or on unmounted sources)
  useEffect(() => {
    document.addEventListener('dragend', endDrag)
    return () => document.removeEventListener('dragend', endDrag)
  }, [endDrag])

  return (
    <LayoutDndContext.Provider value={{ dragState, activeDropTarget, startDrag, endDrag, setActiveDropTarget }}>
      {children}
    </LayoutDndContext.Provider>
  )
}

export function useLayoutDnd(): LayoutDndContextValue {
  return useContext(LayoutDndContext)
}
