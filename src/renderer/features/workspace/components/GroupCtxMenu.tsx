import { createPortal } from 'react-dom'
import { Pencil, X, Columns2 } from 'lucide-react'

interface GroupCtxMenuProps {
  groupCtxMenu: { x: number; y: number; group: { id: string; name: string; color?: string } }
  onDismiss: () => void
  onEdit: (group: { id: string; name: string; color?: string }) => void
  onDelete: (groupId: string) => void
  onOpenAsLayout: (groupId: string) => void
}

export function GroupCtxMenu({ groupCtxMenu, onDismiss, onEdit, onDelete, onOpenAsLayout }: GroupCtxMenuProps): JSX.Element {
  const { x, y, group } = groupCtxMenu
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onMouseDown={onDismiss}
        onContextMenu={(e) => { e.preventDefault(); onDismiss() }}
      />
      <div
        className="fixed z-[9999] bg-brand-panel border border-white/10 rounded shadow-2xl shadow-black/60 py-1 min-w-[160px]"
        style={{ left: Math.min(x, window.innerWidth - 180), top: Math.min(y, window.innerHeight - 130) }}
      >
        <button
          onMouseDown={(e) => { e.stopPropagation(); onOpenAsLayout(group.id); onDismiss() }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
        >
          <Columns2 size={12} />Open as Layout
        </button>
        <div className="my-1 border-t border-white/10" />
        <button
          onMouseDown={(e) => { e.stopPropagation(); onEdit(group); onDismiss() }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
        >
          <Pencil size={12} />Rename / Recolor
        </button>
        <div className="my-1 border-t border-white/10" />
        <button
          onMouseDown={(e) => { e.stopPropagation(); onDelete(group.id); onDismiss() }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 hover:text-red-300 transition-colors"
        >
          <X size={12} />Delete Group
        </button>
      </div>
    </>,
    document.body
  )
}
