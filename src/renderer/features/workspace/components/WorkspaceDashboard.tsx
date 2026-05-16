import { Terminal, Plus } from 'lucide-react'

export function WorkspaceDashboard(): JSX.Element {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 select-none px-8">
      <Terminal size={28} className="text-zinc-500" />
      <div className="text-center">
        <p className="text-sm font-medium text-zinc-300">No active sessions</p>
        <p className="text-xs text-zinc-500 mt-1">Open a new session from the sidebar</p>
      </div>
      <button
        onClick={() => document.dispatchEvent(new CustomEvent('acc:new-session'))}
        className="flex items-center gap-2 px-4 py-2 rounded text-sm text-zinc-300 bg-brand-panel hover:bg-brand-panel/70 border border-brand-panel/60 transition-colors"
      >
        <Plus size={13} />
        New Session
      </button>
    </div>
  )
}
