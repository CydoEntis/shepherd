import { useState, useRef, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import { highlightWindow } from '../window.service'

interface WindowEntry {
  windowId: string
  windowName: string
  windowColor: string
}

interface Props {
  style: React.CSSProperties
  windows: WindowEntry[]
  onSelect: (windowId: string) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onNewWindow?: () => void
}

export function WindowMoveSubmenu({ style, windows, onSelect, onMouseEnter, onMouseLeave, onNewWindow }: Props): JSX.Element {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const highlightedRef = useRef<string | null>(null)

  const clearHighlight = (): void => {
    if (highlightedRef.current) {
      highlightWindow(highlightedRef.current, false).catch(() => {})
      highlightedRef.current = null
    }
  }

  useEffect(() => () => { clearHighlight() }, [])

  const handleHoverIn = (windowId: string): void => {
    setHoveredId(windowId)
    if (highlightedRef.current && highlightedRef.current !== windowId) {
      highlightWindow(highlightedRef.current, false).catch(() => {})
    }
    highlightedRef.current = windowId
    highlightWindow(windowId, true).catch(() => {})
  }

  return (
    <div
      className="fixed z-[10000] bg-brand-panel border border-white/10 rounded shadow-2xl shadow-black/60 py-1 min-w-[140px]"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={() => { clearHighlight(); onMouseLeave() }}
    >
      {onNewWindow && (
        <button
          onMouseDown={(e) => { e.stopPropagation(); onNewWindow() }}
          onMouseEnter={() => setHoveredId('__new__')}
          onMouseLeave={() => setHoveredId(null)}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors"
          style={{ color: hoveredId === '__new__' ? '#f4f4f5' : '#d4d4d8', background: hoveredId === '__new__' ? 'rgba(255,255,255,0.06)' : undefined }}
        >
          <ExternalLink size={11} />New Window
        </button>
      )}
      {onNewWindow && windows.length > 0 && <div className="my-1 border-t border-white/10" />}
      {windows.map((w) => (
        <button
          key={w.windowId}
          onMouseDown={(e) => { e.stopPropagation(); onSelect(w.windowId) }}
          onMouseEnter={() => handleHoverIn(w.windowId)}
          onMouseLeave={() => setHoveredId(null)}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors"
          style={{
            color: hoveredId === w.windowId ? '#f4f4f5' : '#d4d4d8',
            backgroundImage: `linear-gradient(to right, ${w.windowColor}${hoveredId === w.windowId ? '40' : '20'} 0%, transparent 70%)`,
          }}
        >
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: w.windowColor }} />
          {w.windowName}
        </button>
      ))}
    </div>
  )
}
