import { createPortal } from 'react-dom'
import { Search, Terminal, Zap, Plus, FolderOpen, FolderTree, PanelLeft, X, Maximize2, NotebookPen, FileText } from 'lucide-react'
import { useCommandPalette } from '../features/session/hooks/useCommandPalette'
import { cn } from '../lib/utils'

const ICON_MAP: Record<string, JSX.Element> = {
  Terminal:   <Terminal size={12} />,
  Zap:        <Zap size={12} />,
  Plus:       <Plus size={12} />,
  FolderOpen: <FolderOpen size={12} />,
  PanelLeft:  <PanelLeft size={12} />,
  X:          <X size={12} />,
  Maximize2:    <Maximize2 size={12} />,
  NotebookPen:  <NotebookPen size={12} />,
  FileText:     <FileText size={12} />,
  FolderTree:   <FolderTree size={12} />,
}

interface Props {
  open: boolean
  onClose: () => void
  onShowShortcuts: () => void
}

export function CommandPalette({ open, onClose, onShowShortcuts }: Props): JSX.Element | null {
  const { query, setQuery, selectedIdx, items } = useCommandPalette(open, onClose, onShowShortcuts)

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[15vh]"
      onMouseDown={() => onClose()}
    >
      <div
        className="bg-brand-surface border border-brand-panel/80 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-brand-panel">
          <Search size={14} className="text-zinc-400 flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions, presets, actions…"
            className="bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none flex-1"
          />
          <kbd className="text-[10px] text-zinc-600 border border-brand-panel rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div className="max-h-72 overflow-y-auto py-1.5">
          {items.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-8">No results</p>
          )}
          {items.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => item.action()}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                idx === selectedIdx ? 'bg-brand-accent/20 text-zinc-100' : 'text-zinc-300 hover:bg-brand-panel/60'
              )}
            >
              <span className="text-zinc-400 flex-shrink-0 w-3.5 flex items-center justify-center">
                {ICON_MAP[item.iconName]}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.description && (
                <span className="text-xs text-zinc-500 flex-shrink-0">{item.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
