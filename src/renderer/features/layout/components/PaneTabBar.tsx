import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Terminal, FilePlus } from 'lucide-react'
import { useStore } from '../../../store/root.store'
import { useLayoutDnd } from '../dnd/LayoutDndContext'
import { cn } from '../../../lib/utils'
import { TabContextMenu } from './TabContextMenu'
import type { EditorTab } from '../layout-tree'

const GHOST_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

interface Props {
  tabs: EditorTab[]
  activeIndex: number
  tabId: string
  leafId: string
  onNewTerminal: () => void
  onNewFile: () => void
}

interface CtxState {
  x: number
  y: number
  tabIndex: number
}

export function PaneTabBar({ tabs, activeIndex, tabId, leafId, onNewTerminal, onNewFile }: Props): JSX.Element {
  const setEditorGroupActive = useStore((s) => s.setEditorGroupActive)
  const removeFileFromEditorGroup = useStore((s) => s.removeFileFromEditorGroup)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const closePane = useStore((s) => s.closePane)
  const reorderTabInEditorGroup = useStore((s) => s.reorderTabInEditorGroup)
  const moveEditorTab = useStore((s) => s.moveEditorTab)
  const sessions = useStore((s) => s.sessions)

  const { startDrag, endDrag, dragState } = useLayoutDnd()

  const dragTabIndex = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [tabBarDragOver, setTabBarDragOver] = useState(false)
  const [ctxState, setCtxState] = useState<CtxState | null>(null)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const ghostRef = useRef<HTMLImageElement | null>(null)
  const plusBtnRef = useRef<HTMLButtonElement>(null)

  const safeIndex = Math.min(activeIndex, tabs.length - 1)

  const getTabLabel = (tab: EditorTab): string => {
    if (tab.kind === 'file') return tab.path.replace(/\\/g, '/').split('/').pop() ?? tab.path
    return sessions[tab.sessionId]?.name ?? 'Terminal'
  }

  const getTabColor = (tab: EditorTab): string | null => {
    if (tab.kind === 'terminal') return sessions[tab.sessionId]?.color ?? '#22c55e'
    return null
  }

  const handleCloseTab = (e: React.MouseEvent, index: number): void => {
    e.stopPropagation()
    const tab = tabs[index]
    if (tab.kind === 'terminal') {
      if (tabs.length <= 1) closePane(tabId, tab.sessionId)
      else removeFileFromEditorGroup(tabId, leafId, index)
    } else {
      if (tabs.length <= 1) removeLayoutLeaf(tabId, leafId)
      else removeFileFromEditorGroup(tabId, leafId, index)
    }
  }

  return (
    <>
      <div
        className={cn(
          'flex items-stretch border-b overflow-x-auto flex-shrink-0 min-h-0 transition-colors',
          tabBarDragOver
            ? 'bg-brand-accent/15 border-brand-accent/60'
            : 'bg-brand-panel/60 border-white/8'
        )}
        onDragOver={(e) => {
          if (dragState?.type !== 'editor-tab' || dragState.sourceLeafId === leafId) return
          e.preventDefault()
          setTabBarDragOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setTabBarDragOver(false)
        }}
        onDrop={(e) => {
          if (dragState?.type !== 'editor-tab' || dragState.sourceLeafId === leafId) return
          e.preventDefault()
          e.stopPropagation()
          setTabBarDragOver(false)
          moveEditorTab(dragState.sourceTabId, dragState.sourceLeafId, dragState.tabIndex, tabId, leafId, null)
          endDrag()
        }}
      >
        {tabs.map((tab, i) => {
          const label = getTabLabel(tab)
          const color = getTabColor(tab)
          const isActive = i === safeIndex
          const showDropIndicator =
            dragOverIndex === i && dragTabIndex.current !== null && dragTabIndex.current !== i

          return (
            <button
              key={`${tab.kind}-${tab.kind === 'terminal' ? tab.sessionId : tab.path}-${i}`}
              draggable
              onClick={() => {
                setEditorGroupActive(tabId, leafId, i)
                if (tab.kind === 'terminal') useStore.getState().setFocusedSession(tab.sessionId)
                else useStore.getState().setFocusedLeaf(leafId)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setCtxState({ x: e.clientX, y: e.clientY, tabIndex: i })
              }}
              onDragStart={(e) => {
                dragTabIndex.current = i
                e.dataTransfer.effectAllowed = 'move'
                if (ghostRef.current) e.dataTransfer.setDragImage(ghostRef.current, 0, 0)
                startDrag({ type: 'editor-tab', sourceTabId: tabId, sourceLeafId: leafId, tabIndex: i, tab })
              }}
              onDragEnd={() => {
                dragTabIndex.current = null
                setDragOverIndex(null)
              }}
              onDragOver={(e) => {
                if (dragTabIndex.current === null) return
                e.preventDefault()
                e.stopPropagation()
                setDragOverIndex(i)
              }}
              onDrop={(e) => {
                e.stopPropagation()
                e.preventDefault()
                const from = dragTabIndex.current
                dragTabIndex.current = null
                setDragOverIndex(null)
                if (from === null || from === i) return
                reorderTabInEditorGroup(tabId, leafId, from, i)
              }}
              className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 text-[11px] flex-shrink-0 border-r border-white/8 transition-colors select-none',
                isActive
                  ? 'bg-brand-bg text-zinc-200 border-t-2'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-brand-surface/60',
                showDropIndicator && 'border-l-2 border-l-brand-accent'
              )}
              style={
                isActive && color
                  ? { borderTopColor: color }
                  : isActive
                    ? { borderTopColor: 'rgb(var(--brand-accent))' }
                    : undefined
              }
            >
              {tab.kind === 'terminal' && color && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              )}
              <span className="max-w-[120px] truncate">{label}</span>
              <span
                onClick={(e) => handleCloseTab(e, i)}
                className="flex items-center justify-center w-3.5 h-3.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 hover:bg-white/10 transition-all flex-shrink-0"
              >
                <X size={9} />
              </span>
            </button>
          )
        })}

        <button
          ref={plusBtnRef}
          onMouseDown={() => setShowPlusMenu((v) => !v)}
          title="New tab"
          className="flex items-center justify-center w-7 h-full text-zinc-600 hover:text-zinc-300 hover:bg-brand-surface/60 transition-colors flex-shrink-0"
        >
          <Plus size={12} />
        </button>

        <div className="flex-1" />

        {/* Transparent ghost image — suppresses browser default drag preview */}
        <img
          ref={ghostRef}
          src={GHOST_SRC}
          className="absolute opacity-0 pointer-events-none"
          style={{ left: -9999, top: -9999 }}
          alt=""
          aria-hidden
        />
      </div>

      {ctxState && tabs[ctxState.tabIndex] && (
        <TabContextMenu
          x={ctxState.x}
          y={ctxState.y}
          tab={tabs[ctxState.tabIndex]}
          tabIndex={ctxState.tabIndex}
          totalTabs={tabs.length}
          tabId={tabId}
          leafId={leafId}
          onDismiss={() => setCtxState(null)}
        />
      )}

      {showPlusMenu && createPortal(
        (() => {
          const rect = plusBtnRef.current?.getBoundingClientRect()
          const top = (rect?.bottom ?? 0) + 4
          const left = rect?.left ?? 0
          return (
            <>
              <div className="fixed inset-0 z-[9998]" onMouseDown={() => setShowPlusMenu(false)} />
              <div
                className="fixed z-[9999] bg-brand-panel border border-white/10 rounded-lg shadow-2xl shadow-black/60 py-1 min-w-[148px]"
                style={{ top, left }}
              >
                <button
                  onMouseDown={() => { setShowPlusMenu(false); onNewTerminal() }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
                >
                  <Terminal size={11} className="flex-shrink-0" />
                  New Terminal
                </button>
                <button
                  onMouseDown={() => { setShowPlusMenu(false); onNewFile() }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
                >
                  <FilePlus size={11} className="flex-shrink-0" />
                  New File
                </button>
              </div>
            </>
          )
        })(),
        document.body
      )}
    </>
  )
}
