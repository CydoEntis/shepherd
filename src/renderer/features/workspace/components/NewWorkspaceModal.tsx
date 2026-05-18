import { useState, useRef, useEffect } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { pickFolder } from '../../window/window.service'

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

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onDismiss() }}>
      <DialogContent className="w-80" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Open Project</DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label variant="field">Name</Label>
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
              placeholder="my-project"
              className="bg-brand-bg/60 border-white/10 focus-visible:border-brand-accent/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label variant="field">Root Folder <span className="normal-case text-zinc-600 font-normal tracking-normal">(optional)</span></Label>
            <div className="flex gap-2">
              <Input
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1 text-xs font-mono bg-brand-bg/60 border-white/10 focus-visible:border-brand-accent/50"
              />
              <button
                onClick={() => void handlePickFolder()}
                className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 bg-brand-bg/60 text-zinc-500 hover:text-zinc-300 hover:bg-white/10 transition-colors flex-shrink-0"
                title="Browse"
              >
                <FolderOpen size={13} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end px-5 py-3 border-t border-white/[0.08]">
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
      </DialogContent>
    </Dialog>
  )
}
