import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { GROUP_COLORS } from '../../session/session.service'
import { cn } from '../../../lib/utils'
import { Input } from '../../../components/ui/input'

interface NewGroupModalProps {
  onDismiss: () => void
  onSave: (name: string, color: string) => Promise<void>
}

export function NewGroupModal({ onDismiss, onSave }: NewGroupModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleCreate = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || creating) return
    setCreating(true)
    try {
      await onSave(trimmed, color)
      onDismiss()
    } catch (err) {
      toast.error(`Group failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-brand-surface border border-white/10 rounded-lg shadow-2xl shadow-black/70 w-72 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <span className="text-sm font-semibold text-zinc-200">New Group</span>
          <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={14} /></button>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !creating) void handleCreate(); if (e.key === 'Escape') onDismiss() }}
            placeholder="group name"
            className="bg-brand-bg/60 border-white/10 focus-visible:border-brand-accent/50"
          />
          <div className="flex gap-2 flex-wrap">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={cn('w-7 h-7 rounded-full transition-transform hover:scale-110 flex-shrink-0', color === c && 'ring-2 ring-white ring-offset-2 ring-offset-brand-surface scale-110')}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end px-5 py-3 border-t border-white/8">
          <button onClick={onDismiss} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded">Cancel</button>
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
            className="px-4 py-1.5 text-xs font-medium rounded bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {creating && <Loader2 size={11} className="animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
