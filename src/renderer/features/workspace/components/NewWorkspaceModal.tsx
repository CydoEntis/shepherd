import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Loader2, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { pickFolder } from '../../window/window.service'
import { Input } from '../../../components/ui/input'

interface Props {
  onDismiss: () => void
  onSave: (name: string, rootPath: string) => Promise<void>
}

export function NewWorkspaceModal({ onDismiss, onSave }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [rootPath, setRootPath] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handlePickFolder = async (): Promise<void> => {
    const folder = await pickFolder()
    if (!folder) return
    setRootPath(folder)
    if (!name.trim()) {
      const parts = folder.replace(/\\/g, '/').split('/').filter(Boolean)
      setName(parts[parts.length - 1] ?? folder)
    }
  }

  const handleCreate = async (): Promise<void> => {
    const trimmedName = name.trim()
    if (!trimmedName || creating) return
    setCreating(true)
    try {
      await onSave(trimmedName, rootPath.trim())
      onDismiss()
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
      <div className="relative bg-brand-surface border border-white/10 rounded-lg shadow-2xl shadow-black/70 w-80 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <span className="text-sm font-semibold text-zinc-200">Open Project</span>
          <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Name</label>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') onDismiss() }}
              placeholder="my-project"
              className="bg-brand-bg/60 border-white/10 focus-visible:border-brand-accent/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Root Folder <span className="normal-case text-zinc-600 font-normal">(optional)</span></label>
            <div className="flex gap-2">
              <Input
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1 text-xs font-mono bg-brand-bg/60 border-white/10 focus-visible:border-brand-accent/50"
              />
              <button
                onClick={() => void handlePickFolder()}
                className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 bg-brand-bg/60',
                  'text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors flex-shrink-0'
                )}
                title="Browse"
              >
                <FolderOpen size={13} />
              </button>
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
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
            className="px-4 py-1.5 text-xs font-medium rounded bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {creating && <Loader2 size={11} className="animate-spin" />}
            Open
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
