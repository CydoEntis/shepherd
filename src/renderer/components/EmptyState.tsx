import { useStore } from '../store/root.store'
import { cn } from '../lib/utils'
import logoUrl from '../assets/logo.png'

declare const __APP_VERSION__: string

const MODIFIERS = new Set(['ctrl', 'shift', 'alt', 'cmd', 'meta', 'win'])

function useKbdVariant(): 'dark' | 'light' | 'space' {
  const theme = useStore((s) => s.settings.theme)
  if (theme === 'space') return 'space'
  if (theme === 'light') return 'light'
  if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return 'dark'
}

function Key({ label }: { label: string }): JSX.Element {
  const variant = useKbdVariant()
  const isMod = MODIFIERS.has(label.toLowerCase())
  const themed = variant === 'space'
    ? isMod ? 'bg-indigo-950 border-indigo-700/50 border-b-indigo-900 text-indigo-300' : 'bg-violet-950 border-violet-700/50 border-b-violet-900 text-violet-200'
    : variant === 'light'
      ? isMod ? 'bg-slate-300 border-slate-400/70 border-b-slate-500/50 text-slate-700' : 'bg-white border-slate-300/80 border-b-slate-400/60 text-slate-800'
      : isMod ? 'bg-brand-panel border-brand-panel/60 text-brand-muted' : 'bg-brand-surface border-brand-panel/60 text-brand-accent'
  return (
    <kbd className={cn(
      'inline-flex items-center justify-center font-semibold font-mono rounded-md',
      'border border-b-[3px] shadow-sm select-none text-[10px] leading-none px-2 py-1.5',
      isMod ? 'min-w-[40px]' : 'min-w-[26px]',
      themed
    )}>
      {label}
    </kbd>
  )
}

function parseHotkey(hotkey: string): string[] {
  return hotkey.split('+').map((k) => k.trim())
}

function KeybindEntry({ hotkey, label, action }: { hotkey: string; label: string; action?: () => void }): JSX.Element {
  const keys = parseHotkey(hotkey)
  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors group ${action ? 'cursor-pointer hover:bg-brand-panel/40' : ''}`}
      onClick={action}
    >
      <div className="flex items-center gap-1 min-w-[110px] justify-end">
        {keys.map((k, i) => <Key key={i} label={k} />)}
      </div>
      <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">{label}</span>
    </div>
  )
}

export function EmptyState(): JSX.Element {
  const hotkeys = useStore((s) => s.settings.hotkeys)

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 select-none">
      <div className="flex flex-col items-center gap-1.5">
        <img src={logoUrl} alt="Orbit" className="w-24 h-24 object-contain" />
        <span className="text-base font-semibold text-zinc-200 tracking-widest uppercase">Orbit</span>
        <span className="text-[11px] text-zinc-600 tracking-wide">Mission control for AI agents</span>
      </div>

      <div className="w-56 h-px bg-brand-panel" />

      <div className="flex flex-col gap-0">
        <KeybindEntry hotkey={hotkeys.newSession} label="New session" action={() => document.dispatchEvent(new CustomEvent('acc:new-session'))} />
        <KeybindEntry hotkey="Ctrl+O" label="Open project" action={() => document.dispatchEvent(new CustomEvent('acc:open-project'))} />
        <KeybindEntry hotkey={hotkeys.commandPalette} label="Command palette" action={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', ctrlKey: true, shiftKey: true, bubbles: true }))} />
      </div>

      <p className="text-[10px] text-zinc-700 tracking-wider">v{__APP_VERSION__}</p>
    </div>
  )
}
