import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, ChevronUp, ChevronDown, ArrowRightLeft, ChevronRight } from 'lucide-react'
import { MonacoEditorPane } from './MonacoEditorPane'
import { useTerminal } from '../../terminal/hooks/useTerminal'
import { TerminalBreadcrumbs } from '../../terminal/components/TerminalBreadcrumbs'
import { writeToSession } from '../../session/session.service'
import { listWindows, moveToWindow, detachTab } from '../../window/window.service'
import { WindowMoveSubmenu } from '../../window/components/WindowMoveSubmenu'
import { useStore } from '../../../store/root.store'
import { normalizePath } from '../../../lib/utils'
import { PaneTabBar } from '../../layout/components/PaneTabBar'
import type { EditorTab } from '../../layout/layout-tree'

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
  const paneMenuRef = useRef<HTMLDivElement>(null)
  const moveTriggerRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { ctxMenu, dismissCtxMenu, search } = useTerminal(sessionId, containerRef)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [otherWindows, setOtherWindows] = useState<{ windowId: string; windowName: string; windowColor: string }[]>([])
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const [submenuY, setSubmenuY] = useState(0)

  const windowId = useStore((s) => s.windowId)
  const isMainWindow = useStore((s) => s.isMainWindow)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const detachPane = useStore((s) => s.detachPane)

  useEffect(() => {
    if (!ctxMenu) { setShowMoveSubmenu(false); return }
    listWindows().then((wins) => {
      setOtherWindows(wins
        .filter((w) => windowId == null || w.windowId !== windowId)
        .map((w) => ({ windowId: w.windowId, windowName: w.windowName, windowColor: w.windowColor })))
    }).catch(() => {})
    return () => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current) }
  }, [ctxMenu, windowId])

  const clearHide = (): void => { if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null } }
  const scheduleHide = (): void => { clearHide(); hideTimeoutRef.current = setTimeout(() => setShowMoveSubmenu(false), 150) }
  const getSubmenuX = (): number => {
    const w = paneMenuRef.current?.offsetWidth ?? 164
    const mx = ctxMenu?.x ?? 0
    const rx = mx + w + 4
    return rx + 160 > window.innerWidth ? mx - 164 : rx
  }

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
    setIsDragOver(false)
    const orbitPath = e.dataTransfer.getData('application/orbit-file')
    if (orbitPath) {
      e.preventDefault()
      e.stopPropagation()
      writeToSession({ sessionId, data: `"${orbitPath}" ` })
      return
    }
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as unknown as { path: string }).path)
      .filter(Boolean)
    if (!paths.length) return // not a file drop — let PaneDropTarget handle it (no stopPropagation)
    e.preventDefault()
    e.stopPropagation()
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
            onMouseDown={() => { dismissCtxMenu(); setShowMoveSubmenu(false) }}
            onContextMenu={(e) => { e.preventDefault(); dismissCtxMenu(); setShowMoveSubmenu(false) }}
          />
          <div
            ref={paneMenuRef}
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
              ref={moveTriggerRef}
              onMouseEnter={() => {
                clearHide()
                const rect = moveTriggerRef.current?.getBoundingClientRect()
                if (rect) setSubmenuY(rect.top)
                setShowMoveSubmenu(true)
              }}
              onMouseLeave={scheduleHide}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center"><ArrowRightLeft size={12} /></span>
                Move to
              </span>
              <ChevronRight size={10} className="text-zinc-600" />
            </button>
            <div className="my-1 border-t border-brand-panel/60" />
            <button
              onMouseDown={(e) => { e.stopPropagation(); onClose(); dismissCtxMenu() }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
            >
              <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center"><X size={12} /></span>
              Close Tab
            </button>
            <button
              onMouseDown={(e) => { e.stopPropagation(); removeLayoutLeaf(tabId, leafId); dismissCtxMenu() }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-brand-panel hover:text-red-300 transition-colors"
            >
              <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center"><X size={12} /></span>
              Close Pane
            </button>
          </div>
          {showMoveSubmenu && (
            <WindowMoveSubmenu
              style={{ left: getSubmenuX(), top: submenuY }}
              windows={otherWindows}
              onSelect={(wId) => { void moveToWindow(sessionId, wId); dismissCtxMenu(); setShowMoveSubmenu(false) }}
              onMouseEnter={clearHide}
              onMouseLeave={scheduleHide}
              onNewWindow={isMainWindow && windowId ? () => {
                detachPane(tabId, sessionId)
                void detachTab(sessionId, windowId)
                dismissCtxMenu()
                setShowMoveSubmenu(false)
              } : undefined}
            />
          )}
        </>,
        document.body
      )}
    </div>
  )
}

export function TabGroupPane({ tabs, activeIndex, tabId, leafId }: TabGroupPaneProps): JSX.Element {
  const removeFileFromEditorGroup = useStore((s) => s.removeFileFromEditorGroup)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)

  const safeIndex = Math.min(activeIndex, tabs.length - 1)
  const activeTab = tabs[safeIndex]

  const handleCloseTabAtIndex = (index: number): void => {
    if (tabs.length <= 1) removeLayoutLeaf(tabId, leafId)
    else removeFileFromEditorGroup(tabId, leafId, index)
  }

  const handleNewTerminal = (): void => {
    document.dispatchEvent(new CustomEvent('acc:new-terminal-in-pane', { detail: { tabId, leafId } }))
  }

  const handleNewFile = (): void => {
    const { activeWorkspaceId, workspaces } = useStore.getState()
    const ws = workspaces.find((w) => w.id === activeWorkspaceId && !w.isRoot)
    if (!ws?.rootPath) return
    document.dispatchEvent(new CustomEvent('acc:new-file-at-root', { detail: { parentDir: normalizePath(ws.rootPath), type: 'file' } }))
  }

  // Collect all terminal session IDs for rendering TerminalTabSlot components
  const terminalTabs = tabs.reduce<Array<{ sessionId: string; tabIndex: number }>>((acc, tab, i) => {
    if (tab.kind === 'terminal') acc.push({ sessionId: tab.sessionId, tabIndex: i })
    return acc
  }, [])

  return (
    <div className="flex flex-col w-full h-full">
      <PaneTabBar
        tabs={tabs}
        activeIndex={activeIndex}
        tabId={tabId}
        leafId={leafId}
        onNewTerminal={handleNewTerminal}
        onNewFile={handleNewFile}
      />

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
            onClose={() => handleCloseTabAtIndex(tabIndex)}
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
