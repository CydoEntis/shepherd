import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, FolderOpen, X, Zap, ShieldCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../../../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../../components/ui/select'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Switch } from '../../../components/ui/switch'
import { createSession, checkSbxAvailable } from '../session.service'
import { pickFolder } from '../../window/window.service'
import { useStore } from '../../../store/root.store'
import { cn, normalizePath, shortPath } from '../../../lib/utils'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import { toast } from 'sonner'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@shared/constants'

const PRESETS = [
  { id: 'shell', label: 'Shell', command: undefined },
  { id: 'claude', label: 'Claude', command: 'claude' },
  { id: 'codex', label: 'Codex', command: 'codex' },
  { id: 'gemini', label: 'Gemini', command: 'gemini' },
  { id: 'custom', label: 'Custom', command: undefined }
] as const

type PresetId = (typeof PRESETS)[number]['id']

const NO_GROUP = '__none__'

// Checked once at module load so the result is ready before the dialog ever opens.
const sbxCheck = checkSbxAvailable().catch(() => false)

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(64),
  preset: z.string(),
  customCommand: z.string().optional()
})

type FormData = z.infer<typeof schema>


export function NewSessionForm({ variant = 'icon' }: { variant?: 'icon' | 'sidebar' | 'none' }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<PresetId>('claude')
  const [selectedDir, setSelectedDir] = useState<string>('')
  const [selectedGroupId, setSelectedGroupId] = useState<string>(NO_GROUP)
  const [yoloMode, setYoloMode] = useState(false)
  const [skipSandbox, setSkipSandbox] = useState(false)
  const [useSandboxMode, setUseSandboxMode] = useState(false)
  const [sbxAvailable, setSbxAvailable] = useState(false)
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)
  const [activeTaskWorkspaceId, setActiveTaskWorkspaceId] = useState<string | undefined>(undefined)
  const [splitTarget, setSplitTarget] = useState<{ tabId: string; sessionId?: string; leafId?: string; direction: 'horizontal' | 'vertical' } | null>(null)
  const [paneTargetTabId, setPaneTargetTabId] = useState<string | null>(null)
  const upsertSession = useStore((s) => s.upsertSession)
  const addTab = useStore((s) => s.addTab)
  const splitPane = useStore((s) => s.splitPane)
  const splitPaneByLeafId = useStore((s) => s.splitPaneByLeafId)
  const openTerminalInLayout = useStore((s) => s.openTerminalInLayout)
  const settings = useStore((s) => s.settings)
  const workspaces = useStore((s) => s.workspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const groups = settings.sessionGroups ?? []

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ targetTabId?: string }>).detail ?? {}
      setPaneTargetTabId(detail.targetTabId ?? null)
      setWorkspacePath(null)
      setSplitTarget(null)
      setOpen(true)
    }
    document.addEventListener('acc:new-session', handler)
    return () => document.removeEventListener('acc:new-session', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ tabId: string; sessionId?: string; leafId?: string; direction: 'horizontal' | 'vertical' }>).detail
      setSplitTarget(detail)
      setWorkspacePath(null)
      setOpen(true)
    }
    document.addEventListener('acc:new-session-for-split', handler)
    return () => document.removeEventListener('acc:new-session-for-split', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ workspaceId: string }>).detail
      const workspace = useStore.getState().workspaces.find((w) => w.id === detail.workspaceId)
      setActiveTaskWorkspaceId(detail.workspaceId)
      setWorkspacePath(workspace?.rootPath || null)
      setOpen(true)
    }
    document.addEventListener('acc:new-task', handler)
    return () => document.removeEventListener('acc:new-task', handler)
  }, [])

  useEffect(() => {
    if (open) {
      const activeWs = workspaces.find((w) => w.id === activeWorkspaceId)
      const wsRoot = (activeWs && !activeWs.isRoot && activeWs.rootPath) ? activeWs.rootPath : ''
      setSelectedDir(settings.shellStartDir || wsRoot)
      setSelectedGroupId(NO_GROUP)
      setYoloMode(false)
      setSkipSandbox(false)
      setUseSandboxMode(false)
      setSelectedPreset('claude')
      void sbxCheck.then(setSbxAvailable)
    } else {
      setSplitTarget(null)
      setWorkspacePath(null)
      setActiveTaskWorkspaceId(undefined)
      setPaneTargetTabId(null)
    }
  }, [open])

  const pickDir = async (): Promise<void> => {
    const picked = await pickFolder()
    if (picked !== null) setSelectedDir(picked)
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', preset: 'claude', customCommand: '' }
  })

  const onSubmit = async (data: FormData): Promise<void> => {
    setLoading(true)
    try {
      const preset = PRESETS.find((p) => p.id === selectedPreset)
      const agentCommand =
        selectedPreset === 'custom'
          ? data.customCommand?.trim() || undefined
          : preset?.command

      if (workspacePath) {
        const projectName = normalizePath(workspacePath).split('/').filter(Boolean).pop() ?? 'session'
        const task = data.name.trim()
        const meta = await createSession({
          name: task || projectName,
          agentCommand,
          cwd: workspacePath,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          yoloMode: yoloMode || undefined,
          noSandbox: skipSandbox || undefined,
          useSandbox: useSandboxMode || undefined,
          workspaceId: activeTaskWorkspaceId
        })
        upsertSession(meta)
        addTab(meta.sessionId)
      } else if (splitTarget) {
        const meta = await createSession({
          name: data.name,
          agentCommand,
          cwd: selectedDir || undefined,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          yoloMode: yoloMode || undefined,
          noSandbox: skipSandbox || undefined,
          useSandbox: useSandboxMode || undefined,
          workspaceId: activeTaskWorkspaceId
        })
        upsertSession(meta)
        if (splitTarget.leafId) {
          splitPaneByLeafId(splitTarget.tabId, splitTarget.leafId, splitTarget.direction, meta)
        } else if (splitTarget.sessionId) {
          splitPane(splitTarget.tabId, splitTarget.sessionId, splitTarget.direction, meta)
        }
      } else if (paneTargetTabId) {
        // "+ Terminal" path — add to current pane, no top-level tab
        const meta = await createSession({
          name: data.name,
          agentCommand,
          cwd: selectedDir || undefined,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          yoloMode: yoloMode || undefined,
          noSandbox: skipSandbox || undefined,
          useSandbox: useSandboxMode || undefined,
        })
        upsertSession(meta)
        openTerminalInLayout(paneTargetTabId, meta)
      } else {
        const groupId = selectedGroupId === NO_GROUP ? undefined : selectedGroupId || undefined
        const workspaceId = activeWorkspaceId !== ROOT_WORKSPACE_ID ? activeWorkspaceId : undefined
        const meta = await createSession({
          name: data.name,
          agentCommand,
          cwd: selectedDir || undefined,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          groupId,
          workspaceId,
          yoloMode: yoloMode || undefined,
          noSandbox: skipSandbox || undefined,
          useSandbox: useSandboxMode || undefined
        })
        upsertSession(meta)
        addTab(meta.sessionId)
      }

      reset()
      setSelectedPreset('claude')
      setSelectedGroupId(NO_GROUP)
      setYoloMode(false)
      setSkipSandbox(false)
      setUseSandboxMode(false)
      setWorkspacePath(null)
      setActiveTaskWorkspaceId(undefined)
      setSplitTarget(null)
      setOpen(false)
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const shortDir = selectedDir ? shortPath(selectedDir) : ''

  const supportsYolo = selectedPreset === 'claude'
  const isWorkspaceMode = workspacePath !== null
  const isSplitMode = splitTarget !== null
  const projectLabel = isWorkspaceMode
    ? (workspaces.find((w) => w.id === activeTaskWorkspaceId)?.name ?? normalizePath(workspacePath).split('/').filter(Boolean).pop() ?? workspacePath)
    : null

  const dialogContent = (
    <DialogContent className="sm:max-w-sm" onCloseAutoFocus={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>{isWorkspaceMode ? 'New Task' : isSplitMode ? `Split ${splitTarget.direction === 'horizontal' ? 'Horizontal' : 'Vertical'}` : 'New Session'}</DialogTitle>
        {projectLabel && (
          <p className="text-xs text-zinc-500 mt-1">{projectLabel}</p>
        )}
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label variant="field" htmlFor="name">{isWorkspaceMode ? 'Task name' : 'Name'}</Label>
            <Input
              id="name"
              placeholder={isWorkspaceMode ? 'e.g. fix-auth' : 'my-agent'}
              autoFocus
              className="bg-brand-bg/60 border-white/10 focus-visible:border-brand-accent/50"
              {...register('name')}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label variant="field">Agent</Label>
            <Select value={selectedPreset} onValueChange={(v) => setSelectedPreset(v as PresetId)}>
              <SelectTrigger className="text-xs h-9 bg-brand-bg/60 border-white/10 focus:border-brand-accent/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id} className="text-xs">
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPreset === 'custom' && (
              <Input
                placeholder="e.g. aider, continue, ollama"
                className="mt-1 bg-brand-bg/60 border-white/10 focus-visible:border-brand-accent/50"
                {...register('customCommand')}
              />
            )}
          </div>

          {supportsYolo && (
            <>
              <div className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-md border transition-colors',
                yoloMode ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/10'
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  <Zap size={12} className={cn('flex-shrink-0', yoloMode ? 'text-amber-400' : 'text-zinc-500')} />
                  <span className={cn('text-xs font-medium', yoloMode ? 'text-amber-300' : 'text-zinc-300')}>
                    YOLO Mode
                  </span>
                  {yoloMode && settings.sandboxYoloMode && sbxAvailable && !skipSandbox ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-500">
                      <ShieldCheck size={10} />sandboxed
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-600 truncate">— skip permission prompts</span>
                  )}
                </div>
                <Switch
                  checked={yoloMode}
                  onCheckedChange={setYoloMode}
                  className={yoloMode ? 'data-[state=checked]:bg-amber-500' : ''}
                />
              </div>
              {yoloMode && settings.sandboxYoloMode && sbxAvailable && (
                <div className="flex items-center justify-between -mt-2 px-1">
                  <span className="text-xs text-zinc-500">Skip sandbox for this session</span>
                  <Switch
                    checked={skipSandbox}
                    onCheckedChange={setSkipSandbox}
                  />
                </div>
              )}
              {yoloMode && settings.sandboxYoloMode && !sbxAvailable && (
                <p className="text-xs text-amber-600 -mt-2 px-1">sbx not found — running unsandboxed. See docs.docker.com/ai/sandboxes to install.</p>
              )}
            </>
          )}

          {sbxAvailable && !(yoloMode && settings.sandboxYoloMode && !skipSandbox) && (
            <div className={cn(
              'flex items-center justify-between px-3 py-2.5 rounded-md border transition-colors',
              useSandboxMode ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10'
            )}>
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck size={12} className={cn('flex-shrink-0', useSandboxMode ? 'text-emerald-400' : 'text-zinc-500')} />
                <span className={cn('text-xs font-medium', useSandboxMode ? 'text-emerald-300' : 'text-zinc-300')}>
                  Sandbox
                </span>
                <span className="text-xs text-zinc-600 truncate">— Docker microVM isolation</span>
              </div>
              <Switch
                checked={useSandboxMode}
                onCheckedChange={setUseSandboxMode}
                className={useSandboxMode ? 'data-[state=checked]:bg-emerald-500' : ''}
              />
            </div>
          )}

          {!isWorkspaceMode && !isSplitMode && (
            <div className="flex flex-col gap-1.5">
              <Label variant="field">Working directory</Label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 h-9 rounded-lg border border-white/10 bg-brand-bg/60 text-xs text-zinc-400 min-w-0">
                  {selectedDir ? (
                    <>
                      <span className="truncate flex-1" title={selectedDir}>…/{shortDir}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedDir('')}
                        className="flex-shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
                      >
                        <X size={11} />
                      </button>
                    </>
                  ) : (
                    <span className="text-zinc-600">Home directory</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={pickDir}
                  className="flex items-center justify-center px-3 h-9 rounded-lg border border-white/10 bg-brand-bg/60 hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                  title="Browse"
                >
                  <FolderOpen size={14} />
                </button>
              </div>
            </div>
          )}

          {!isWorkspaceMode && !isSplitMode && groups.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label variant="field">Group <span className="normal-case text-zinc-600 font-normal tracking-normal">(optional)</span></Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger className="text-xs h-9 bg-brand-bg/60 border-white/10 focus:border-brand-accent/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GROUP} className="text-xs">None</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id} className="text-xs">{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-5 py-3 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 text-xs font-medium rounded bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Launching...' : 'Launch'}
          </button>
        </div>
      </form>
    </DialogContent>
  )

  if (variant === 'none') {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {dialogContent}
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'sidebar' ? (
          <button className="flex-1 flex items-center justify-center gap-2 py-2 text-xs text-zinc-500 hover:bg-brand-panel hover:text-brand-muted transition-colors rounded">
            <Plus size={15} /> New Session
          </button>
        ) : (
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="New session (Ctrl+T)"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Plus size={14} />
          </button>
        )}
      </DialogTrigger>
      {dialogContent}
    </Dialog>
  )
}
