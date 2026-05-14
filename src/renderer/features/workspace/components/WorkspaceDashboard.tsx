import { useState } from 'react'
import { FolderOpen, Plus } from 'lucide-react'
import { useStore } from '../../../store/root.store'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import { shortPath } from '../../../lib/utils'
import { NewWorkspaceModal } from './NewWorkspaceModal'
import { createWorkspace } from '../workspace.service'
import { toast } from 'sonner'

export function WorkspaceDashboard(): JSX.Element {
  const workspaces = useStore((s) => s.workspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useStore((s) => s.setActiveWorkspaceId)
  const addWorkspace = useStore((s) => s.addWorkspace)
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = useState(false)

  const isRoot = activeWorkspaceId === ROOT_WORKSPACE_ID
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null
  const nonRootWorkspaces = workspaces.filter((w) => !w.isRoot)

  const handleCreateWorkspace = async (name: string, rootPath: string): Promise<void> => {
    try {
      const workspace = await createWorkspace({ name, rootPath })
      addWorkspace(workspace)
      setActiveWorkspaceId(workspace.id)
      toast.success(`Workspace "${name}" created`)
    } catch {
      toast.error('Failed to create workspace')
    }
  }

  if (isRoot) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 select-none px-8">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Workspaces</p>
        <div className="w-full max-w-[220px] flex flex-col gap-1.5">
          {nonRootWorkspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => setActiveWorkspaceId(w.id)}
              className="flex items-center gap-2 px-3 py-2 rounded bg-brand-panel/40 hover:bg-brand-panel text-left transition-colors"
            >
              <FolderOpen size={12} className="flex-shrink-0 text-zinc-500" />
              <div className="min-w-0">
                <div className="text-xs text-zinc-300 truncate">{w.name}</div>
                {w.rootPath && <div className="text-[10px] text-zinc-600 truncate">{shortPath(w.rootPath)}</div>}
              </div>
            </button>
          ))}
          {nonRootWorkspaces.length === 0 && (
            <p className="text-[11px] text-zinc-700 text-center py-2">No workspaces yet</p>
          )}
          <button
            onClick={() => setShowNewWorkspaceModal(true)}
            className="flex items-center gap-2 px-3 py-2 rounded border border-dashed border-brand-panel hover:border-zinc-600 text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <Plus size={12} />
            <span className="text-xs">New Workspace</span>
          </button>
        </div>
        <div className="h-px w-full max-w-[220px] bg-brand-panel/40" />
        <button
          onClick={() => document.dispatchEvent(new CustomEvent('acc:new-session'))}
          className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          + Quick Session
        </button>
        {showNewWorkspaceModal && (
          <NewWorkspaceModal
            onDismiss={() => setShowNewWorkspaceModal(false)}
            onSave={handleCreateWorkspace}
          />
        )}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 select-none px-8">
      <FolderOpen size={20} className="text-zinc-700" />
      <div className="text-center">
        <div className="text-sm font-medium text-zinc-400">{activeWorkspace?.name ?? 'Workspace'}</div>
        {activeWorkspace?.rootPath && (
          <div className="text-[11px] text-zinc-600 mt-0.5">{shortPath(activeWorkspace.rootPath)}</div>
        )}
      </div>
    </div>
  )
}
