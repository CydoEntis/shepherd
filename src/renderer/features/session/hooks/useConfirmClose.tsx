import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../../store/root.store'
import { Checkbox } from '../../../components/ui/checkbox'
import { Label } from '../../../components/ui/label'

export function useConfirmClose(): {
  requestClose: (onConfirm: () => void) => void
  modal: JSX.Element | null
} {
  const confirmCloseSession = useStore((s) => s.settings.confirmCloseSession)
  const updateSettings = useStore((s) => s.updateSettings)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [dontAsk, setDontAsk] = useState(false)

  const requestClose = (onConfirm: () => void): void => {
    if (confirmCloseSession === false) {
      onConfirm()
      return
    }
    setDontAsk(false)
    setPending(() => onConfirm)
  }

  const handleConfirm = async (): Promise<void> => {
    if (dontAsk) await updateSettings({ confirmCloseSession: false })
    pending?.()
    setPending(null)
  }

  const handleCancel = (): void => setPending(null)

  const modal = pending
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onMouseDown={(e) => { if (e.target === e.currentTarget) handleCancel() }}
        >
          <div className="bg-brand-surface border border-white/10 rounded-lg shadow-2xl shadow-black/70 w-64 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/8">
              <p className="text-sm font-semibold text-zinc-200">Close session?</p>
              <p className="text-xs text-zinc-500 mt-1">The session will be terminated.</p>
            </div>
            <div className="flex items-center gap-2 px-4 py-3">
              <Checkbox
                id="dont-ask"
                checked={dontAsk}
                onCheckedChange={(v) => setDontAsk(v === true)}
              />
              <Label htmlFor="dont-ask" className="text-xs text-zinc-500 cursor-pointer">Don't ask again</Label>
            </div>
            <div className="flex gap-2 justify-end px-4 py-3 border-t border-white/8">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return { requestClose, modal }
}
