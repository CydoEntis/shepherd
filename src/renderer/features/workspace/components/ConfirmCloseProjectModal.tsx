import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '../../../components/ui/button'

interface ConfirmCloseProjectModalProps {
  workspaceLabel: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmCloseProjectModal({ workspaceLabel, onClose, onConfirm }: ConfirmCloseProjectModalProps): JSX.Element {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-brand-surface border border-brand-panel/60 rounded-lg shadow-2xl w-80 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-200">Close Project</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={14} /></button>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          All running sessions in{' '}
          <span className="text-zinc-200 font-medium">{workspaceLabel}</span> will be killed.
          The project will be saved to Recent Projects so you can reopen it anytime.
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onConfirm} className="bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30">
            Close Project
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
