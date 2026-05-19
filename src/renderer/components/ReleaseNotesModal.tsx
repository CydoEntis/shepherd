import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, LayoutPanelLeft, SplitSquareHorizontal, Trash2, AppWindow, MousePointer2, RefreshCw } from 'lucide-react'

declare const __APP_VERSION__: string

interface Props {
  open: boolean
  onClose: () => void
  onDismiss: () => void
}

interface ChangeEntry {
  icon: React.ReactNode
  title: string
  description: string
}

const CHANGES: ChangeEntry[] = [
  {
    icon: <LayoutPanelLeft size={15} />,
    title: 'Per-workspace file views',
    description:
      'Files opened in one workspace no longer appear in other workspaces. Each workspace maintains its own independent file layout — switching workspaces now shows the right files every time.',
  },
  {
    icon: <SplitSquareHorizontal size={15} />,
    title: 'New terminal opens in current pane',
    description:
      'Clicking "+ New Terminal" from any pane now adds the terminal as a tab inside that pane instead of opening a separate top-level session tab.',
  },
  {
    icon: <Trash2 size={15} />,
    title: 'Terminal close without kill',
    description:
      'Closing a terminal removes it from the layout but leaves the underlying process running. Use "Kill Session" from the right-click menu to terminate it.',
  },
  {
    icon: <MousePointer2 size={15} />,
    title: 'Unified terminal context menu',
    description:
      'Terminals no longer show two different menus depending on where you right-click. Both the tab and the terminal content area now show a single consistent menu with "Kill Session" and "Move to".',
  },
  {
    icon: <AppWindow size={15} />,
    title: 'Window management fixes',
    description:
      'Files moved to a secondary window can now be moved back to the main window. Secondary windows close automatically when the last item is moved out.',
  },
  {
    icon: <RefreshCw size={15} />,
    title: 'Editor window gradient restored',
    description:
      'Secondary file windows now correctly receive their window identity on startup, restoring the title bar color gradient.',
  },
]

export function ReleaseNotesModal({ open, onClose, onDismiss }: Props): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-brand-surface border border-brand-panel/80 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-brand-panel">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-semibold text-zinc-200">What's new in v{__APP_VERSION__}</span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-accent/20 text-brand-accent border border-brand-accent/30">
              New features
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-5 flex flex-col gap-4">
          {CHANGES.map((entry) => (
            <div key={entry.title} className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5 text-brand-accent">{entry.icon}</div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-zinc-200">{entry.title}</span>
                <span className="text-xs text-zinc-400 leading-relaxed">{entry.description}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-brand-panel">
          <button
            onClick={onDismiss}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Don't show again
          </button>
          <button
            onClick={onClose}
            className="text-[11px] font-medium px-3 py-1.5 rounded bg-brand-panel hover:bg-brand-panel/70 text-zinc-200 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
