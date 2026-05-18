import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../../../lib/utils'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { SESSION_COLORS, MAX_NAME_LENGTH } from '../session.service'
import type { SessionMeta } from '@shared/ipc-types'

interface EditSessionModalProps {
  meta: SessionMeta
  onSave: (name: string, color: string) => void
  onDismiss: () => void
}

export function EditSessionModal({ meta, onSave, onDismiss }: EditSessionModalProps): JSX.Element {
  const [name, setName] = useState(meta.name)
  const [color, setColor] = useState(meta.color ?? SESSION_COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onDismiss() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onDismiss])

  const validate = (v: string): string | null => {
    if (!v.trim()) return 'Name cannot be blank'
    if (v.trim().length > MAX_NAME_LENGTH) return `Max ${MAX_NAME_LENGTH} characters`
    return null
  }

  const handleSave = (): void => {
    const trimmed = name.trim()
    const err = validate(trimmed)
    if (err) { setError(err); return }
    onSave(trimmed, color)
  }

  const isCustomColor = !(SESSION_COLORS as readonly string[]).includes(color)

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-brand-surface border border-white/10 rounded-lg shadow-2xl shadow-black/70 w-80 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <span className="text-sm font-semibold text-zinc-200">Edit Session</span>
          <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Name</Label>
              <span className={cn('text-xs', name.trim().length > MAX_NAME_LENGTH ? 'text-red-400' : 'text-zinc-600')}>
                {name.trim().length}/{MAX_NAME_LENGTH}
              </span>
            </div>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(validate(e.target.value)) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              className={cn(
                'bg-brand-bg/60 border-white/10 focus-visible:border-brand-accent/50',
                error ? 'border-red-500/70 focus-visible:border-red-400' : ''
              )}
            />
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Color</Label>
            <div className="flex gap-2 flex-wrap">
              {SESSION_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={cn(
                    'w-7 h-7 rounded-full transition-transform hover:scale-110 flex-shrink-0',
                    color === c && 'ring-2 ring-white ring-offset-2 ring-offset-brand-surface scale-110'
                  )}
                />
              ))}
              <label
                className="relative w-7 h-7 rounded-full cursor-pointer flex-shrink-0 border-2 border-dashed border-zinc-600 hover:border-zinc-400 transition-colors flex items-center justify-center overflow-hidden"
                title="Custom color"
              >
                <span className="absolute inset-0 rounded-full" style={{ backgroundColor: isCustomColor ? color : 'transparent' }} />
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
                {!isCustomColor && <span className="text-zinc-600 text-[10px]">+</span>}
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end px-5 py-3 border-t border-white/8">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!!error || !name.trim()}
            className="px-4 py-1.5 text-xs font-medium rounded bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
