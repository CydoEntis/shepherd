import { useState, useEffect, useMemo, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FolderOpen, GitBranch, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { AppSettingsSchema, DEFAULT_SETTINGS } from '@shared/ipc-types'
import type { AppSettings } from '@shared/ipc-types'
import { pickFolder, pickFile } from '../../window/window.service'
import { detectShells } from '../../fs/fs.service'
import { killSession } from '../../session/session.service'
import { clearLayout } from '../../session/persistence.service'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Checkbox } from '../../../components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectSeparator,
  SelectTrigger, SelectValue
} from '../../../components/ui/select'
import { Popover, PopoverTrigger, PopoverContent } from '../../../components/ui/popover'
import { useStore } from '../../../store/root.store'
import { TERMINAL_THEME_LIST } from '../../terminal/hooks/useTerminal'
import { cn } from '../../../lib/utils'

const THEME_SWATCHES: { id: AppSettings['theme']; label: string; bg: string; accent: string }[] = [
  { id: 'dark',   label: 'Dark',   bg: '#0f1117', accent: '#a1a1aa' },
  { id: 'light',  label: 'Light',  bg: '#f6f0e4', accent: '#27272a' },
  { id: 'space',  label: 'Space',  bg: '#0a0719', accent: '#c4a8ff' },
  { id: 'nebula', label: 'Nebula', bg: '#080514', accent: '#64dcff' },
  { id: 'solar',  label: 'Solar',  bg: '#0c0804', accent: '#ffb900' },
  { id: 'aurora', label: 'Aurora', bg: '#040c0e', accent: '#00e6a0' },
  { id: 'mars',   label: 'Mars',   bg: '#100805', accent: '#ff692d' },
  { id: 'pulsar', label: 'Pulsar', bg: '#040814', accent: '#00d7ff' },
  { id: 'system', label: 'System', bg: '#1a1a2e', accent: '#71717a' },
]

const MONACO_THEME_LIST = [
  { id: 'vs-dark',            label: 'VS Dark' },
  { id: 'vs',                 label: 'VS Light' },
  { id: 'hc-black',           label: 'High Contrast' },
  { id: 'github-dark',        label: 'GitHub Dark' },
  { id: 'dracula',            label: 'Dracula' },
  { id: 'one-dark',           label: 'One Dark' },
  { id: 'monokai',            label: 'Monokai' },
  { id: 'monokai-bright',     label: 'Monokai Bright' },
  { id: 'night-owl',          label: 'Night Owl' },
  { id: 'oceanic-next',       label: 'Oceanic Next' },
  { id: 'cobalt2',            label: 'Cobalt 2' },
  { id: 'blackboard',         label: 'Blackboard' },
  { id: 'twilight',           label: 'Twilight' },
  { id: 'vibrant-ink',        label: 'Vibrant Ink' },
  { id: 'clouds-midnight',    label: 'Cloud Midnight' },
  { id: 'merbivore-soft',     label: 'Merbivore Soft' },
  { id: 'upstream-sunburst',  label: 'Upstream Sunburst' },
  { id: 'pastels-on-dark',    label: 'Pastels on Dark' },
  { id: 'dawn',               label: 'Dawn' },
  { id: 'amy',                label: 'Amy' },
  { id: 'birds-of-paradise',  label: 'Birds of Paradise' },
]

const HOTKEY_FIELDS: { key: keyof AppSettings['hotkeys']; label: string }[] = [
  { key: 'newSession',     label: 'New Session' },
  { key: 'closeSession',   label: 'Close Session' },
  { key: 'openProject',    label: 'Open Project' },
  { key: 'commandPalette', label: 'Command Palette' },
  { key: 'quickNote',      label: 'Toggle Notes' },
  { key: 'showShortcuts',  label: 'Show Shortcuts' },
  { key: 'reviewChanges',  label: 'Review Changes' },
]

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

interface HotkeyInputProps {
  value: string
  onChange: (value: string) => void
}

function HotkeyInput({ value, onChange }: HotkeyInputProps): JSX.Element {
  const [capturing, setCapturing] = useState(false)

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { setCapturing(false); return }
    if (MODIFIER_KEYS.has(e.key)) return
    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('Ctrl')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')
    if (e.metaKey) modifiers.push('Meta')
    if (modifiers.length === 0) return
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key
    onChange([...modifiers, key].join('+'))
    setCapturing(false)
  }

  return (
    <div
      tabIndex={0}
      onFocus={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={capturing ? handleKeyDown : undefined}
      className={cn(
        'flex items-center h-9 px-3 rounded border text-xs font-mono cursor-pointer select-none transition-colors outline-none flex-1',
        capturing
          ? 'border-brand-accent/60 bg-brand-accent/5 text-brand-accent'
          : 'border-brand-panel bg-brand-surface text-zinc-300 hover:border-zinc-600'
      )}
    >
      {capturing
        ? <span className="text-zinc-500">Press shortcut…</span>
        : value || <span className="text-zinc-600">—</span>
      }
    </div>
  )
}

interface ShellOption { name: string; path: string }

interface ShellSelectProps {
  value: string
  onChange: (v: string) => void
  onBrowse: () => void
}

function ShellSelect({ value, onChange, onBrowse }: ShellSelectProps): JSX.Element {
  const [detected, setDetected] = useState<ShellOption[]>([])

  useEffect(() => {
    detectShells().then(setDetected).catch(() => {})
  }, [])

  // Radix Select forbids empty-string values — use a sentinel for "System default"
  const SENTINEL_DEFAULT = '__default__'
  const selectValue = value === '' ? SENTINEL_DEFAULT : value

  const options = useMemo<ShellOption[]>(() => {
    const list: ShellOption[] = [{ name: 'System default', path: SENTINEL_DEFAULT }, ...detected]
    if (value && !detected.some((s) => s.path === value)) {
      list.push({ name: value.split(/[/\\]/).pop() ?? value, path: value })
    }
    return list
  }, [detected, value])

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => {
        if (v === '__browse__') { onBrowse(); return }
        onChange(v === SENTINEL_DEFAULT ? '' : v)
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="System default" />
      </SelectTrigger>
      <SelectContent>
        {options.map(({ name, path }) => (
          <SelectItem key={path} value={path}>{name}</SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value="__browse__">Browse for shell…</SelectItem>
      </SelectContent>
    </Select>
  )
}

interface Props {
  onClose: () => void
}

export function SettingsForm({ onClose }: Props): JSX.Element {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const resetAllSessions = useStore((s) => s.resetAllSessions)
  const [confirmClear, setConfirmClear] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)

  const { register, handleSubmit, setValue, watch } = useForm<AppSettings>({
    resolver: zodResolver(AppSettingsSchema),
    values: settings
  })

  const defaultShell       = watch('defaultShell') ?? ''
  const shellStartDir      = watch('shellStartDir') ?? ''
  const dataDirectory      = watch('dataDirectory') ?? ''
  const notesDirectory     = watch('notesDirectory') ?? ''
  const worktreesDirectory = watch('worktreesDirectory') ?? ''
  const defaultSessionDir  = watch('defaultSessionDir') ?? ''
  const confirmClose      = watch('confirmCloseSession')
  const resumeOnStartup   = watch('resumeOnStartup')
  const sandboxYoloMode   = watch('sandboxYoloMode')
  const hotkeys           = watch('hotkeys')

  const pickShell = async (): Promise<void> => {
    const picked = await pickFile()
    if (picked) setValue('defaultShell', picked)
  }

  const pickShellStartDir = async (): Promise<void> => {
    const picked = await pickFolder()
    if (picked !== null) setValue('shellStartDir', picked)
  }

  const pickDataDir = async (): Promise<void> => {
    const picked = await pickFolder()
    if (picked !== null) setValue('dataDirectory', picked)
  }

  const pickNotesDir = async (): Promise<void> => {
    const picked = await pickFolder()
    if (picked !== null) setValue('notesDirectory', picked)
  }

  const pickWorktreesDir = async (): Promise<void> => {
    const picked = await pickFolder()
    if (picked !== null) setValue('worktreesDirectory', picked)
  }

  const pickSessionDir = async (): Promise<void> => {
    const picked = await pickFolder()
    if (picked !== null) setValue('defaultSessionDir', picked)
  }

  const handleClearSessions = useCallback(async (): Promise<void> => {
    const { sessions } = useStore.getState()
    await Promise.all(
      Object.values(sessions)
        .filter((s) => s.status === 'running')
        .map((s) => killSession(s.sessionId).catch(() => {}))
    )
    resetAllSessions()
    await clearLayout().catch(() => {})
    setConfirmClear(false)
    toast.success('All sessions cleared')
  }, [resetAllSessions])

  const onSubmit = async (data: AppSettings): Promise<void> => {
    await updateSettings(data)
    toast.success('Settings saved')
    onClose()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pl-10 pr-16 py-8 flex flex-col gap-6">

        <section className="flex flex-col gap-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Appearance</p>

          {/* App Theme — swatch dropdown */}
          <div className="flex flex-col gap-2">
            <Label>App Theme</Label>
            <Popover open={themePickerOpen} onOpenChange={setThemePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-full items-center justify-between rounded border border-brand-panel bg-brand-surface px-3 py-2 text-sm text-zinc-200 outline-none transition-colors hover:border-zinc-600"
                >
                  {(() => {
                    const s = THEME_SWATCHES.find((t) => t.id === (settings.theme ?? 'space'))
                    return s ? (
                      <>
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.bg, border: `1.5px solid ${s.accent}` }} />
                          <span>{s.label}</span>
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                      </>
                    ) : null
                  })()}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-3 max-h-none overflow-visible bg-brand-surface border-brand-panel" align="start">
                <div className="grid grid-cols-3 gap-2">
                  {THEME_SWATCHES.map(({ id, label, bg, accent }) => {
                    const active = (settings.theme ?? 'space') === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { void updateSettings({ theme: id }); setThemePickerOpen(false) }}
                        className={cn(
                          'flex flex-col items-center gap-1 px-3 py-2 rounded-lg border-2 transition-all',
                          active ? 'scale-105' : 'opacity-60 hover:opacity-90'
                        )}
                        style={{ background: bg, borderColor: active ? accent : 'transparent' }}
                      >
                        <span className="w-6 h-2 rounded-full" style={{ background: accent }} />
                        <span className="text-[10px] font-medium" style={{ color: accent }}>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Terminal + Editor theme */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Terminal Theme</Label>
              <Select
                value={settings.terminalTheme || '__auto__'}
                onValueChange={(v) => void updateSettings({ terminalTheme: v === '__auto__' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Auto (app theme)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (app theme)</SelectItem>
                  <SelectSeparator />
                  {TERMINAL_THEME_LIST.map(({ id, label }) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Editor Theme</Label>
              <Select
                value={settings.editorTheme || '__auto__'}
                onValueChange={(v) => void updateSettings({ editorTheme: v === '__auto__' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Auto (app theme)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (app theme)</SelectItem>
                  <SelectSeparator />
                  {MONACO_THEME_LIST.map(({ id, label }) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="uiFontSize">UI font size</Label>
              <Input id="uiFontSize" type="number" min={10} max={24} {...register('uiFontSize', { valueAsNumber: true })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editorFontSize">Editor font size</Label>
              <Input id="editorFontSize" type="number" min={8} max={32} {...register('editorFontSize', { valueAsNumber: true })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="termFontSize">Terminal font size</Label>
              <Input id="termFontSize" type="number" min={8} max={32} {...register('fontSize', { valueAsNumber: true })} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Label className="text-sm text-foreground font-normal">Review Git Changes</Label>
              <span className="text-xs text-zinc-500">Open the git diff panel for the current project</span>
            </div>
            <button
              type="button"
              onClick={() => document.dispatchEvent(new CustomEvent('acc:toggle-git-review'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-brand-panel text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors flex-shrink-0"
            >
              <GitBranch size={12} />
              Review
            </button>
          </div>
        </section>

        <div className="h-px bg-border" />

        <section className="flex flex-col gap-4">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Terminal</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fontFamily">Terminal font family</Label>
            <Input id="fontFamily" placeholder="monospace" {...register('fontFamily')} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaultShell">Default shell</Label>
            <ShellSelect
              value={defaultShell}
              onChange={(v) => setValue('defaultShell', v)}
              onBrowse={pickShell}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Shell start directory</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shellStartDir}
                placeholder="Home directory"
                className="flex-1 text-xs text-zinc-400 cursor-default"
              />
              <Button type="button" variant="outline" size="icon" onClick={pickShellStartDir} title="Browse" className="flex-shrink-0 h-9 w-9">
                <FolderOpen size={14} />
              </Button>
            </div>
          </div>
        </section>

        <div className="h-px bg-border" />

        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Hotkeys</p>
          <div className="grid grid-cols-1 gap-2.5">
            {HOTKEY_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-4">
                <Label className="w-40 flex-shrink-0 text-zinc-400">{label}</Label>
                <HotkeyInput
                  value={hotkeys?.[key] || DEFAULT_SETTINGS.hotkeys[key]}
                  onChange={(v) => setValue(`hotkeys.${key}` as const, v)}
                />
              </div>
            ))}
          </div>
        </section>

        <div className="h-px bg-border" />

        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Storage</p>

          <div className="flex flex-col gap-1.5">
            <Label>Data directory</Label>
            <p className="text-[11px] text-zinc-600 -mt-1">Where Orbit stores notes, worktrees, and session layout. Defaults to ~/Orbit/.orbit</p>
            <div className="flex gap-2">
              <Input readOnly value={dataDirectory} placeholder="~/Orbit/.orbit" className="flex-1 text-xs text-zinc-400 cursor-default" />
              <Button type="button" variant="outline" size="icon" onClick={pickDataDir} title="Browse" className="flex-shrink-0 h-9 w-9">
                <FolderOpen size={14} />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Notes directory <span className="text-zinc-600 font-normal">(override)</span></Label>
            <div className="flex gap-2">
              <Input readOnly value={notesDirectory} placeholder="~/Orbit/.orbit/notes" className="flex-1 text-xs text-zinc-400 cursor-default" />
              <Button type="button" variant="outline" size="icon" onClick={pickNotesDir} title="Browse" className="flex-shrink-0 h-9 w-9">
                <FolderOpen size={14} />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Worktrees directory <span className="text-zinc-600 font-normal">(override)</span></Label>
            <div className="flex gap-2">
              <Input readOnly value={worktreesDirectory} placeholder="~/Orbit/.orbit/worktrees" className="flex-1 text-xs text-zinc-400 cursor-default" />
              <Button type="button" variant="outline" size="icon" onClick={pickWorktreesDir} title="Browse" className="flex-shrink-0 h-9 w-9">
                <FolderOpen size={14} />
              </Button>
            </div>
          </div>
        </section>

        <div className="h-px bg-border" />

        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Sessions</p>
          <div className="flex flex-col gap-1.5">
            <Label>Default session directory</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={defaultSessionDir}
                placeholder="~/Orbit"
                className="flex-1 text-xs text-zinc-400 cursor-default"
              />
              <Button type="button" variant="outline" size="icon" onClick={pickSessionDir} title="Browse" className="flex-shrink-0 h-9 w-9">
                <FolderOpen size={14} />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="confirm-close" className="text-sm text-foreground font-normal cursor-pointer">
              Confirm before closing a session
            </Label>
            <Checkbox
              id="confirm-close"
              checked={confirmClose ?? true}
              onCheckedChange={(v) => setValue('confirmCloseSession', v === true)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="resume-on-startup" className="text-sm text-foreground font-normal cursor-pointer">
                Resume on startup
              </Label>
              <span className="text-xs text-zinc-500">Re-launch agent sessions and send /resume on next app start</span>
            </div>
            <Checkbox
              id="resume-on-startup"
              checked={resumeOnStartup ?? false}
              onCheckedChange={(v) => setValue('resumeOnStartup', v === true)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="sandbox-yolo" className="text-sm text-foreground font-normal cursor-pointer">
                Sandbox YOLO mode
              </Label>
              <span className="text-xs text-zinc-500">Run YOLO sessions inside an sbx microVM sandbox — requires Docker sbx CLI</span>
            </div>
            <Checkbox
              id="sandbox-yolo"
              checked={sandboxYoloMode ?? true}
              onCheckedChange={(v) => setValue('sandboxYoloMode', v === true)}
            />
          </div>
        </section>

        <div className="h-px bg-border" />

        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold text-red-500/60 uppercase tracking-wider">Danger Zone</p>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <Label className="text-sm text-foreground font-normal">Clear all sessions</Label>
              <span className="text-xs text-zinc-500">Kill all running terminals and reset to a blank slate</span>
            </div>
            {confirmClear ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleClearSessions()}
                  className="text-xs px-3 py-1.5 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                >
                  Confirm clear
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-xs px-3 py-1.5 rounded-md border border-red-500/30 text-red-400/80 hover:border-red-500/50 hover:text-red-400 transition-colors flex-shrink-0"
              >
                Clear all
              </button>
            )}
          </div>
        </section>

      </div>

      {/* Sticky footer */}
      <div className="flex justify-end gap-2 pl-10 pr-16 py-4 border-t border-border flex-shrink-0 bg-brand-bg">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" className="bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30">Save</Button>
      </div>

    </form>
  )
}
