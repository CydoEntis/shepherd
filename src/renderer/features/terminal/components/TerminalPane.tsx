import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Columns2, Rows2, ExternalLink, Copy, Clipboard, Search, ChevronUp, ChevronDown, Pencil, ArrowRightLeft, ChevronRight } from 'lucide-react'
import { useTerminal } from '../hooks/useTerminal'
import { writeToSession } from '../../session/session.service'
import { listWindows } from '../../window/window.service'
import { TerminalBreadcrumbs } from './TerminalBreadcrumbs'
import { WindowMoveSubmenu } from '../../window/components/WindowMoveSubmenu'
import { cn } from '../../../lib/utils'

const CTX_ICONS: Record<string, JSX.Element> = {
  'Copy': <Copy size={12} />,
  'Paste': <Clipboard size={12} />,
  'Open URL': <ExternalLink size={12} />,
}

const PANE_ICONS: Record<string, JSX.Element> = {
  'Edit': <Pencil size={12} />,
  'Move to': <ArrowRightLeft size={12} />,
  'Split Horizontal': <Columns2 size={12} />,
  'Split Vertical': <Rows2 size={12} />,
  'Close Pane': <X size={12} />,
}

export type PaneItem =
  | { type?: 'action'; label: string; action: () => void }
  | { type: 'separator' }
  | { type: 'move-to'; windowId: string | null; isMainWindow: boolean; onNewWindow: () => void; onMoveToWindow: (targetWindowId: string) => void }

interface Props {
  sessionId: string
  paneItems?: PaneItem[]
}

export function TerminalPane({ sessionId, paneItems }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { ctxMenu, dismissCtxMenu, search } = useTerminal(sessionId, containerRef)
  const [searchTerm, setSearchTerm] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [otherWindows, setOtherWindows] = useState<{ windowId: string; windowName: string; windowColor: string }[]>([])
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const [submenuY, setSubmenuY] = useState(0)
  const paneMenuRef = useRef<HTMLDivElement>(null)
  const moveTriggerRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const moveToItem = paneItems?.find((it): it is Extract<PaneItem, { type: 'move-to' }> => it.type === 'move-to')

  useEffect(() => {
    if (!ctxMenu || !moveToItem) return
    listWindows().then((wins) => {
      setOtherWindows(wins
        .filter((w) => w.windowId !== moveToItem.windowId)
        .map((w) => ({ windowId: w.windowId, windowName: w.windowName, windowColor: w.windowColor })))
    }).catch(() => {})
    return () => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current) }
  }, [ctxMenu, moveToItem?.windowId])

  const clearHide = (): void => { if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null } }
  const scheduleHide = (): void => { clearHide(); hideTimeoutRef.current = setTimeout(() => setShowMoveSubmenu(false), 150) }
  const getSubmenuX = (): number => {
    const w = paneMenuRef.current?.offsetWidth ?? 164
    const sub = 160
    const mx = ctxMenu?.x ?? 0
    const rx = mx + w + 4
    return rx + sub > window.innerWidth ? mx - sub - 4 : rx
  }

  const handleDragOver = (e: React.DragEvent): void => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setIsDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as unknown as { path: string }).path)
      .filter(Boolean)
    if (!paths.length) return
    writeToSession({ sessionId, data: paths.map((p) => `@${p}`).join(' ') })
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
      className="relative w-full h-full flex flex-col"
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
          <span className="text-xs text-brand-accent font-medium">Drop to insert @reference</span>
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
                <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">{CTX_ICONS[item.label]}</span>
                {item.label}
              </button>
            ))}
            {paneItems && paneItems.length > 0 && (
              <>
                <div className="my-1 border-t border-brand-panel/60" />
                {paneItems.map((item, i) => {
                  if (item.type === 'separator') {
                    return <div key={i} className="my-1 border-t border-brand-panel/60" />
                  }
                  if (item.type === 'move-to') {
                    return (
                      <button
                        key={i}
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
                          <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">{PANE_ICONS['Move to']}</span>
                          Move to
                        </span>
                        <ChevronRight size={10} className="text-zinc-600" />
                      </button>
                    )
                  }
                  const label = (item as { label: string; action: () => void }).label
                  const action = (item as { label: string; action: () => void }).action
                  return (
                    <button key={i} onMouseDown={(e) => { e.stopPropagation(); action(); dismissCtxMenu() }}
                      className={cn('w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-brand-panel transition-colors',
                        label === 'Close Pane' ? 'text-red-400 hover:text-red-300' : 'text-zinc-300 hover:text-zinc-100'
                      )}>
                      <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">{PANE_ICONS[label]}</span>
                      {label}
                    </button>
                  )
                })}
              </>
            )}
          </div>

          {showMoveSubmenu && moveToItem && (
            <WindowMoveSubmenu
              style={{ left: getSubmenuX(), top: submenuY }}
              windows={otherWindows}
              onSelect={(wId) => { moveToItem.onMoveToWindow(wId); dismissCtxMenu(); setShowMoveSubmenu(false) }}
              onMouseEnter={clearHide}
              onMouseLeave={scheduleHide}
              onNewWindow={moveToItem.isMainWindow ? () => { moveToItem.onNewWindow(); dismissCtxMenu(); setShowMoveSubmenu(false) } : undefined}
            />
          )}
        </>,
        document.body
      )}
    </div>
  )
}
