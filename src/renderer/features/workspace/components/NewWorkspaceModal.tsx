import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Loader2, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { pickFolder } from '../../window/window.service'
import { Input } from '../../../components/ui/input'
import { Button } from '../../../components/ui/button'

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
      <div className="relative bg-brand-surface border border-brand-panel/60 rounded-lg shadow-2xl w-80 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-200">New Project</span>
          <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-300 transition-colors"><X size={14} /></button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Name</label>
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') onDismiss() }}
            placeholder="my-project"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Root Folder <span className="normal-case text-zinc-600">(optional)</span></label>
          <div className="flex gap-2">
            <Input
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="/path/to/project"
              className="flex-1 text-xs font-mono"
            />
            <button
              onClick={() => void handlePickFolder()}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded border border-brand-panel/60',
                'text-zinc-500 hover:text-zinc-300 hover:bg-brand-panel transition-colors flex-shrink-0'
              )}
              title="Browse"
            >
              <FolderOpen size={13} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onDismiss}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
            className="bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 disabled:opacity-40"
          >
            {creating ? <Loader2 size={11} className="animate-spin inline" /> : 'Create'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
