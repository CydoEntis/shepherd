import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Search, ChevronUp, ChevronDown } from 'lucide-react'
import { MonacoEditorPane } from './MonacoEditorPane'
import { useTerminal } from '../../terminal/hooks/useTerminal'
import { TerminalBreadcrumbs } from '../../terminal/components/TerminalBreadcrumbs'
import { writeToSession } from '../../session/session.service'
import { useStore } from '../../../store/root.store'
import { useLayoutDnd } from '../../layout/dnd/LayoutDndContext'
import { cn } from '../../../lib/utils'
import type { EditorTab } from '../../layout/layout-tree'

const GHOST_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

interface TabGroupPaneProps {
  tabs: EditorTab[]
  activeIndex: number
  tabId: string
  leafId: string
}

// TerminalTabSlot: renders a single terminal tab's xterm container.
// Inactive slots stay mounted (display: none) so xterm stays alive without remounting.
interface TerminalTabSlotProps {
  sessionId: string
  isActive: boolean
  tabId: string
  leafId: string
  onClose: () => void
}

function TerminalTabSlot({ sessionId, isActive, tabId, leafId, onClose }: TerminalTabSlotProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { ctxMenu, dismissCtxMenu, search } = useTerminal(sessionId, containerRef)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)

  // Suppress unused param lint — tabId/leafId reserved for future per-slot actions
  void tabId
  void leafId

  const handleDragOver = (e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/orbit-file')) {
      e.preventDefault()
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const orbitPath = e.dataTransfer.getData('application/orbit-file')
    if (orbitPath) {
      writeToSession({ sessionId, data: `"${orbitPath}" ` })
      return
    }
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as unknown as { path: string }).path)
      .filter(Boolean)
    if (!paths.length) return
    writeToSession({ sessionId, data: paths.map((p) => `"${p}"`).join(' ') })
  }

  useEffect(() => {
    if (search.visible) {
      setTimeout(() => searchInputRef.current?.focus(), 0)
    } else {
      setSearchTerm('')
    }
  }, [search.visible])

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={{ display: isActive ? 'flex' : 'none' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex-1 min-h-0" style={{ padding: '8px 12px' }}>
        <div
          ref={containerRef}
          className="xterm-container"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      <TerminalBreadcrumbs sessionId={sessionId} />

      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-brand-bg/70 border-2 border-dashed border-brand-accent/60 rounded pointer-events-none">
          <span className="text-xs text-brand-accent font-medium">Drop to insert path</span>
        </div>
      )}

      {search.visible && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-brand-surface border border-brand-panel/80 rounded-md shadow-xl px-2 py-1">
          <Search size={11} className="text-zinc-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              if (e.target.value) search.findNext(e.target.value)
              else searchInputRef.current && (searchInputRef.current.value = '')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) search.findNext(searchTerm)
              else if (e.key === 'Enter' && e.shiftKey) search.findPrevious(searchTerm)
              else if (e.key === 'Escape') search.hide()
            }}
            placeholder="Find in terminal…"
            className="w-48 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
          />
          <button onClick={() => search.findPrevious(searchTerm)} title="Previous (Shift+Enter)" className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5">
            <ChevronUp size={12} />
          </button>
          <button onClick={() => search.findNext(searchTerm)} title="Next (Enter)" className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5">
            <ChevronDown size={12} />
          </button>
          <button onClick={search.hide} className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5 ml-0.5">
            <X size={11} />
          </button>
        </div>
      )}

      {ctxMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onMouseDown={() => dismissCtxMenu()}
            onContextMenu={(e) => { e.preventDefault(); dismissCtxMenu() }}
          />
          <div
            className="fixed z-[9999] bg-brand-surface border border-brand-panel/60 rounded shadow-xl py-1 min-w-[160px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            {ctxMenu.items.map((item, i) => (
              <button key={i} onMouseDown={(e) => { e.stopPropagation(); item.action(); dismissCtxMenu() }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors">
                {item.label}
              </button>
            ))}
            <div className="my-1 border-t border-brand-panel/60" />
            <button
              onMouseDown={(e) => { e.stopPropagation(); onClose(); dismissCtxMenu() }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-brand-panel hover:text-red-300 transition-colors"
            >
              Close Tab
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

export function TabGroupPane({ tabs, activeIndex, tabId, leafId }: TabGroupPaneProps): JSX.Element {
  const setEditorGroupActive = useStore((s) => s.setEditorGroupActive)
  const removeFileFromEditorGroup = useStore((s) => s.removeFileFromEditorGroup)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const reorderTabInEditorGroup = useStore((s) => s.reorderTabInEditorGroup)
  const sessions = useStore((s) => s.sessions)
  const moveEditorTab = useStore((s) => s.moveEditorTab)
  const dragTabIndex = useRef<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [tabBarDragOver, setTabBarDragOver] = useState(false)
  const ghostRef = useRef<HTMLImageElement | null>(null)
  const { startDrag, endDrag, dragState, setActiveDropTarget } = useLayoutDnd()

  const safeIndex = Math.min(activeIndex, tabs.length - 1)
  const activeTab = tabs[safeIndex]

  const handleCloseTab = (e: React.MouseEvent, index: number): void => {
    e.stopPropagation()
    if (tabs.length <= 1) {
      removeLayoutLeaf(tabId, leafId)
    } else {
      removeFileFromEditorGroup(tabId, leafId, index)
    }
  }

  const handleNewTerminal = (): void => {
    document.dispatchEvent(new CustomEvent('acc:new-terminal-in-pane', { detail: { tabId, leafId } }))
  }

  const getTabLabel = (tab: EditorTab): string => {
    if (tab.kind === 'file') {
      return tab.path.replace(/\\/g, '/').split('/').pop() ?? tab.path
    }
    return sessions[tab.sessionId]?.name ?? 'Terminal'
  }

  const getTabColor = (tab: EditorTab): string | null => {
    if (tab.kind === 'terminal') {
      return sessions[tab.sessionId]?.color ?? '#22c55e'
    }
    return null
  }

  // Collect all terminal session IDs for rendering TerminalTabSlot components
  const terminalTabs = tabs.reduce<Array<{ sessionId: string; tabIndex: number }>>((acc, tab, i) => {
    if (tab.kind === 'terminal') acc.push({ sessionId: tab.sessionId, tabIndex: i })
    return acc
  }, [])

  return (
    <div className="flex flex-col w-full h-full">
      {/* Tab bar — also a merge drop target for editor-tab drags from other panes */}
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

          const showDropIndicator = dragOverIndex === i && dragTabIndex.current !== null && dragTabIndex.current !== i

          return (
            <button
              key={`${tab.kind}-${tab.kind === 'terminal' ? tab.sessionId : tab.path}-${i}`}
              draggable
              onClick={() => {
                setEditorGroupActive(tabId, leafId, i)
                if (tab.kind === 'terminal') {
                  useStore.getState().setFocusedSession(tab.sessionId)
                } else {
                  useStore.getState().setFocusedLeaf(leafId)
                }
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
              style={isActive && color ? { borderTopColor: color } : isActive ? { borderTopColor: 'rgb(var(--brand-accent))' } : undefined}
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

        {/* New terminal tab button */}
        <button
          onMouseDown={handleNewTerminal}
          title="New terminal in pane"
          className="flex items-center justify-center w-7 h-full text-zinc-600 hover:text-zinc-300 hover:bg-brand-surface/60 transition-colors flex-shrink-0"
        >
          <Plus size={12} />
        </button>

        {/* Spacer */}
        <div className="flex-1" />
      </div>

      {/* Ghost image for drag — transparent 1×1, keeps browser ghost invisible */}
      <img ref={ghostRef} src={GHOST_SRC} className="absolute opacity-0 pointer-events-none" style={{ left: -9999, top: -9999 }} alt="" aria-hidden />

      {/* Content area */}
      <div className="flex-1 min-h-0 relative">
        {/* Terminal slots — all mounted, inactive ones hidden via display:none */}
        {terminalTabs.map(({ sessionId, tabIndex }) => (
          <TerminalTabSlot
            key={sessionId}
            sessionId={sessionId}
            isActive={tabIndex === safeIndex}
            tabId={tabId}
            leafId={leafId}
            onClose={() => handleCloseTab({ stopPropagation: () => {} } as React.MouseEvent, tabIndex)}
          />
        ))}

        {/* File editor — only render active file tab */}
        {activeTab?.kind === 'file' && (
          <div className="absolute inset-0">
            <MonacoEditorPane
              key={activeTab.path}
              filePath={activeTab.path}
              tabId={tabId}
              leafId={leafId}
            />
          </div>
        )}
      </div>
    </div>
  )
}
