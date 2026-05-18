import { createPortal } from 'react-dom'
import { useRef } from 'react'
import { useClickOutside } from '../../../hooks/useClickOutside'
import { Columns2, Rows2, ExternalLink, PanelLeftOpen, X, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

interface Props {
  x: number
  y: number
  isMainWindow: boolean
  onDismiss: () => void
  onSplitH: () => void
  onSplitV: () => void
  onDetach: () => void
  onReattach: () => void
  onClosePane: () => void
  onKillSession: () => void
}

function MenuItem({
  icon,
  label,
  onClick,
  className
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors text-left',
        className
      )}
    >
      <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">{icon}</span>
      {label}
    </button>
  )
}

export function PaneContextMenu({ x, y, isMainWindow, onDismiss, onSplitH, onSplitV, onDetach, onReattach, onClosePane, onKillSession }: Props): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useClickOutside(menuRef, onDismiss)

  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - 180)

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: adjustedY, left: adjustedX, zIndex: 9999 }}
      className="bg-brand-panel border border-white/10 rounded-md shadow-2xl shadow-black/60 py-1 w-48"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
    >
      <MenuItem icon={<Columns2 size={12} />} label="Split Horizontal" onClick={() => { onSplitH(); onDismiss() }} />
      <MenuItem icon={<Rows2 size={12} />} label="Split Vertical" onClick={() => { onSplitV(); onDismiss() }} />
      <div className="h-px bg-white/10 my-1" />
      {isMainWindow
        ? <MenuItem icon={<ExternalLink size={12} />} label="Detach to Window" onClick={() => { onDetach(); onDismiss() }} />
        : <MenuItem icon={<PanelLeftOpen size={12} />} label="Reattach to Main" onClick={() => { onReattach(); onDismiss() }} />
      }
      <div className="h-px bg-white/10 my-1" />
      <MenuItem
        icon={<X size={12} />}
        label="Close Pane"
        onClick={() => { onClosePane(); onDismiss() }}
      />
      <MenuItem
        icon={<Trash2 size={12} />}
        label="Kill Session"
        onClick={() => { onKillSession(); onDismiss() }}
        className="text-red-400 hover:text-red-300"
      />
    </div>,
    document.body
  )
}
