import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../store/root.store'
import { cn } from '../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

const MODIFIERS = new Set(['ctrl', 'shift', 'alt', 'cmd', 'meta', 'win'])

function useKbdVariant(): 'dark' | 'light' | 'space' {
  const theme = useStore((s) => s.settings.theme)
  if (theme === 'space') return 'space'
  if (theme === 'light') return 'light'
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return 'dark'
}

function kbdColor(isMod: boolean, variant: 'dark' | 'light' | 'space'): string {
  if (variant === 'space') return isMod
    ? 'bg-indigo-950 border-indigo-700/50 border-b-indigo-900 text-indigo-300'
    : 'bg-violet-950 border-violet-700/50 border-b-violet-900 text-violet-200'
  if (variant === 'light') return isMod
    ? 'bg-slate-300 border-slate-400/70 border-b-slate-500/50 text-slate-700'
    : 'bg-white border-slate-300/80 border-b-slate-400/60 text-slate-800'
  return isMod
    ? 'bg-brand-panel border-brand-panel/60 text-brand-muted'
    : 'bg-brand-surface border-brand-panel/60 text-brand-accent'
}

function Kbd({ keys }: { keys: string }): JSX.Element {
  const variant = useKbdVariant()
  return (
    <span className="inline-flex items-center gap-1">
      {keys.split('+').map((k, i) => {
        const key = k.trim()
        const isMod = MODIFIERS.has(key.toLowerCase())
        return (
          <kbd
            key={i}
            className={cn(
              'inline-flex items-center justify-center font-semibold font-mono rounded-md',
              'border border-b-[3px] shadow-sm select-none px-2 py-1.5',
              'text-[10px] leading-none',
              isMod ? 'min-w-[40px]' : 'min-w-[26px]',
              kbdColor(isMod, variant)
            )}
          >
            {key}
          </kbd>
        )
      })}
    </span>
  )
}

interface Row { label: string; binding: string }
interface Section { title: string; rows: Row[] }

export function KeyboardShortcutsModal({ open, onClose }: Props): JSX.Element | null {
  const hk = useStore((s) => s.settings.hotkeys)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [open, onClose])

  if (!open) return null

  const sections: Section[] = [
    {
      title: 'Global',
      rows: [
        { label: 'Command Palette',    binding: hk.commandPalette },
        { label: 'File Tree',          binding: hk.openFileFinder },
        { label: 'Show Shortcuts',     binding: hk.showShortcuts },
        { label: 'Open Project',       binding: hk.openProject },
      ]
    },
    {
      title: 'Sessions',
      rows: [
        { label: 'New Session',        binding: hk.newSession },
        { label: 'Close Session',      binding: hk.closeSession },
        { label: 'Rename / Recolor',   binding: 'Double-click session' },
        { label: 'Session options',    binding: 'Right-click session' },
        { label: 'Split / Detach',     binding: 'Right-click pane' },
      ]
    },
    {
      title: 'Terminal',
      rows: [
        { label: 'Copy selection',     binding: 'Ctrl+C (with selection)' },
        { label: 'Paste',              binding: 'Ctrl+Shift+V' },
        { label: 'Search',             binding: 'Ctrl+Shift+F' },
        { label: 'Open URL / file',    binding: 'Select text, Shift+click' },
      ]
    },
    {
      title: 'Notes',
      rows: [
        { label: 'Open / close notes', binding: hk.quickNote },
        { label: 'Toggle file tree',   binding: 'Ctrl+Shift+B' },
        { label: 'Split preview',      binding: 'Ctrl+Shift+M' },
      ]
    },
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-brand-surface border border-brand-panel/80 rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-brand-panel">
          <span className="text-sm font-semibold text-zinc-200">Keyboard Shortcuts</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[70vh] p-5 grid grid-cols-2 gap-x-8 gap-y-6">
          {sections.map((section) => (
            <div key={section.title} className="flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium mb-0.5">{section.title}</p>
              {section.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-400">{row.label}</span>
                  <Kbd keys={row.binding} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
