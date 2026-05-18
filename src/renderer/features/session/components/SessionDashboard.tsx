import { useState, useEffect, useRef, useCallback } from 'react'
import { useClickOutside } from '../../../hooks/useClickOutside'
import { X, FolderOpen, FolderClosed, Plus, Terminal, Loader2, ExternalLink, Copy, ChevronDown, ChevronRight, Pencil, Check, Layers, Search, Maximize2, PanelLeftOpen, LayoutGrid, CircleDot, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { SESSION_COLORS } from '../session.service'
import { Input } from '../../../components/ui/input'
import { createPortal } from 'react-dom'
import { NewSessionForm } from './NewSessionForm'
import { useStore } from '../../../store/root.store'
import { findTabForSession } from '../../layout/layout-tree'
import { FileTree } from '../../fs/components/FileTree'
import { PROJECT_COLORS } from '../../fs/components/FileTabBar'
import { useProjects } from '../hooks/useProjects'
import { useConfirmClose } from '../hooks/useConfirmClose'
import { useInstalledEditors } from '../../fs/hooks/useInstalledEditors'
import { showInFolder, openInEditor, openPath, moveFileToWindow } from '../../fs/fs.service'
import { createSession, patchSession } from '../session.service'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@shared/constants'
import { EditSessionModal } from './EditSessionModal'
import { EditGroupModal } from './EditGroupModal'
import { toast } from 'sonner'
import { cn, shortPath } from '../../../lib/utils'
import type { SessionMeta } from '@shared/ipc-types'

const GROUP_COLORS = SESSION_COLORS

interface ProjectCtxMenu { x: number; y: number; path: string }

function ProjectContextMenu({ x, y, path, onDismiss }: ProjectCtxMenu & { onDismiss: () => void }): JSX.Element {
  const editors = useInstalledEditors()
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, onDismiss)

  const ax = Math.min(x, window.innerWidth - 220)
  const ay = Math.min(y, window.innerHeight - 200)
  const dismiss = (fn: () => void) => () => { fn(); onDismiss() }

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: ay, left: ax, zIndex: 9999 }}
      className="bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-52"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button onClick={dismiss(() => openPath(path))}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
        <ExternalLink size={12} className="flex-shrink-0" />
        Open
      </button>
      {editors.map((ed) => (
        <button key={ed.command} onClick={dismiss(() => openInEditor(ed.command, path))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
          <ExternalLink size={12} className="flex-shrink-0" />
          Open in {ed.name}
        </button>
      ))}
      <div className="h-px bg-brand-panel my-1" />
      <button onClick={dismiss(() => navigator.clipboard.writeText(path))}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
        <Copy size={12} className="flex-shrink-0" />
        Copy Path
      </button>
      <div className="h-px bg-brand-panel my-1" />
      <button onClick={dismiss(() => showInFolder(path))}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
        <FolderOpen size={12} className="flex-shrink-0" />
        Reveal in Explorer
      </button>
    </div>,
    document.body
  )
}

// ─── Session group context menu ───────────────────────────────────────────────

const TASK_STATUS_OPTIONS = [
  { value: 'in-progress', label: 'In Progress', color: '#3b82f6' },
  { value: 'review', label: 'Review', color: '#f97316' },
  { value: 'done', label: 'Done', color: '#22c55e' },
] as const

interface SessionCtxMenuProps {
  x: number
  y: number
  meta: SessionMeta
  groups: { id: string; name: string; color?: string }[]
  tabId: string | null
  windowId: string | null
  isMainWindow: boolean
  onAssign: (groupId: string | null) => void
  onNewGroup: () => void
  onDetach: () => void
  onReattach: () => void
  onSetTaskStatus: (status: string | null) => void
  onDismiss: () => void
}

function SessionGroupMenu({ x, y, meta, groups, tabId, isMainWindow, onAssign, onNewGroup, onDetach, onReattach, onSetTaskStatus, onDismiss }: SessionCtxMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, onDismiss)

  const ax = Math.min(x, window.innerWidth - 200)
  const ay = Math.min(y, window.innerHeight - 220)

  const dismiss = (fn: () => void) => () => { fn(); onDismiss() }

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: ay, left: ax, zIndex: 9999 }}
      className="bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-48"
      onContextMenu={(e) => e.preventDefault()}
    >
      {meta.status === 'running' && (
        <>
          {tabId && isMainWindow ? (
            <button onClick={dismiss(onDetach)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
              <Maximize2 size={11} className="flex-shrink-0" /> Detach to Window
            </button>
          ) : (
            <button onClick={dismiss(onReattach)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
              <PanelLeftOpen size={11} className="flex-shrink-0" /> Reattach to Main
            </button>
          )}
          <div className="h-px bg-brand-panel my-1" />
        </>
      )}
      <p className="px-3 py-1 text-[10px] text-zinc-600 uppercase tracking-wider">Move to group</p>
      {meta.groupId && (
        <button
          onClick={dismiss(() => onAssign(null))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left"
        >
          <X size={11} className="flex-shrink-0" />
          No group
        </button>
      )}
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={dismiss(() => onAssign(g.id))}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left"
        >
          <Check size={11} className={cn('flex-shrink-0', meta.groupId === g.id ? 'text-brand-accent' : 'opacity-0')} />
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color ?? '#71717a' }} />
          {g.name}
        </button>
      ))}
      <div className="h-px bg-brand-panel my-1" />
      <button
        onClick={dismiss(onNewGroup)}
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-400 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left"
      >
        <Plus size={11} className="flex-shrink-0" />
        New group…
      </button>
    </div>,
    document.body
  )
}

// ─── Create group modal ───────────────────────────────────────────────────────

interface CreateGroupModalProps {
  pendingSessionId?: string
  onConfirm: (name: string, color: string, pendingSessionId?: string) => void
  onDismiss: () => void
}

function CreateGroupModal({ pendingSessionId, onConfirm, onDismiss }: CreateGroupModalProps): JSX.Element {
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const confirm = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed, color, pendingSessionId)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="bg-brand-surface border border-brand-panel/60 rounded-lg shadow-2xl p-4 w-72 flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-zinc-300">New Group</h3>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
            if (e.key === 'Escape') onDismiss()
          }}
          placeholder="Group name…"
        />
        <div className="flex flex-wrap gap-2">
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              style={{ backgroundColor: c }}
              className={cn(
                'w-5 h-5 rounded-full transition-transform',
                color === c ? 'ring-2 ring-offset-2 ring-offset-brand-surface ring-zinc-300 scale-110' : 'hover:scale-110'
              )}
              onClick={() => setColor(c)}
            />
          ))}
          <label className="relative w-5 h-5 rounded-full cursor-pointer flex-shrink-0 border-2 border-dashed border-zinc-600 hover:border-zinc-400 transition-colors flex items-center justify-center overflow-hidden" title="Custom color">
            <span className="absolute inset-0 rounded-full" style={{ backgroundColor: GROUP_COLORS.includes(color as any) ? 'transparent' : color }} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
            {GROUP_COLORS.includes(color as any) && <span className="text-zinc-600 text-[8px]">+</span>}
          </label>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors rounded hover:bg-brand-panel"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-xs bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-colors rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Group context menu ───────────────────────────────────────────────────────

function GroupCtxMenu({ x, y, onEdit, onOpenAllInSplits, onDelete, onDismiss }: {
  x: number; y: number
  onEdit: () => void
  onOpenAllInSplits: () => void
  onDelete: () => void
  onDismiss: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useClickOutside(ref, onDismiss)

  const ax = Math.min(x, window.innerWidth - 180)
  const ay = Math.min(y, window.innerHeight - 140)
  const dismiss = (fn: () => void) => () => { fn(); onDismiss() }

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: ay, left: ax, zIndex: 9999 }}
      className="bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-44"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button onClick={dismiss(onOpenAllInSplits)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
        <LayoutGrid size={11} className="flex-shrink-0" /> Open all in splits
      </button>
      <button onClick={dismiss(onEdit)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
        <Pencil size={11} className="flex-shrink-0" /> Edit group
      </button>
      <div className="h-px bg-brand-panel/60 my-1" />
      <button onClick={dismiss(onDelete)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-brand-panel hover:text-red-300 transition-colors text-left">
        <X size={11} className="flex-shrink-0" /> Delete group
      </button>
    </div>,
    document.body
  )
}

// ─── Project section (projects tab) ──────────────────────────────────────────

interface ProjectSectionProps {
  path: string
  name: string
  colorIndex: number
  refreshTick: number
  activeFilePath: string | null
  defaultExpanded: boolean
  expandedOverride?: boolean
  onFileClick: (path: string, xy: string | undefined) => void
  onNewSession: () => void
  onRemove: () => void
  onExpand: () => void
  onMoveToWindow: (filePath: string, targetWindowId: string | null) => void
}

function ProjectSection({ path, name, colorIndex, refreshTick, activeFilePath, defaultExpanded, expandedOverride, onFileClick, onNewSession, onRemove, onExpand, onMoveToWindow }: ProjectSectionProps): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (expandedOverride !== undefined) setExpanded(expandedOverride)
  }, [expandedOverride])
  const color = PROJECT_COLORS[colorIndex % PROJECT_COLORS.length]
  return (
    <div className="flex flex-col flex-shrink-0">
      {ctxMenu && <ProjectContextMenu x={ctxMenu.x} y={ctxMenu.y} path={path} onDismiss={() => setCtxMenu(null)} />}
      <div
        className="group flex items-center gap-2 px-3 py-2.5 border-b border-brand-panel/60 cursor-pointer transition-all"
        style={{ background: `linear-gradient(to right, ${color}2e, transparent)` }}
        onClick={() => { setExpanded((v) => { if (!v) onExpand(); return !v }) }}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {expanded
            ? <FolderOpen size={15} className="flex-shrink-0" style={{ color }} />
            : <FolderClosed size={15} className="flex-shrink-0" style={{ color }} />}
          <span className="text-sm font-semibold text-zinc-200 truncate">{name}</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onNewSession() }} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-brand-muted transition-colors" title="New session in this project"><Terminal size={12} /></button>
        <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-400 transition-colors" title="Remove"><X size={12} /></button>
      </div>
      {expanded && <FileTree projectRoot={path} activeFilePath={activeFilePath} onFileClick={onFileClick} refreshTick={refreshTick} onMoveToWindow={onMoveToWindow} />}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

// ─── Session row ─────────────────────────────────────────────────────────────

interface SessionRowProps {
  meta: SessionMeta
  isFocused: boolean
  tabId: string | null | undefined
  groups: { id: string; name: string; color?: string }[]
  openProjects?: string[]
  onActivate: () => void
  onClose: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function SessionRow({ meta, isFocused, tabId, openProjects, onActivate, onClose, onContextMenu }: SessionRowProps): JSX.Element {
  const normalizedCwd = meta.cwd.replace(/\\/g, '/')
  const linkedProject = openProjects?.find((p) => {
    const np = p.replace(/\\/g, '/')
    return normalizedCwd === np || normalizedCwd.startsWith(np + '/')
  })
  const upsertSession = useStore((s) => s.upsertSession)
  const isRunning = meta.status === 'running'
  const agentStatus = meta.agentStatus ?? 'idle'
  const sessionColor = meta.color ?? SESSION_COLORS[0]

  const [editOpen, setEditOpen] = useState(false)

  const openEdit = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setEditOpen(true)
  }

  const handleSave = async (name: string, color: string): Promise<void> => {
    setEditOpen(false)
    const updated = await patchSession({ sessionId: meta.sessionId, name, color })
    upsertSession(updated)
    toast.success('Session updated')
  }

  return (
    <>
      <div
        className={cn(
          'group w-full flex flex-col gap-0.5 px-3 py-2 transition-all border-l-2',
          tabId ? 'cursor-pointer' : 'cursor-pointer opacity-60',
        )}
        style={{
          borderLeftColor: isFocused ? sessionColor : 'transparent',
          background: `linear-gradient(to right, ${sessionColor}${isFocused ? '2e' : '12'}, transparent)`,
        }}
        onClick={onActivate}
        onDoubleClick={openEdit}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e) }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isRunning && agentStatus === 'running' ? (
            <Loader2 size={11} className="flex-shrink-0 animate-spin" style={{ color: sessionColor }} />
          ) : isRunning && agentStatus === 'waiting-input' ? (
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: sessionColor }} />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: isRunning ? sessionColor : '#52525b' }} />
          )}
          <span className={cn('text-xs font-medium truncate flex-1 min-w-0', isFocused ? 'text-zinc-100' : 'text-zinc-500')}>
            {meta.name}
          </span>
          {meta.taskStatus && (() => {
            const opt = TASK_STATUS_OPTIONS.find(o => o.value === meta.taskStatus)
            return opt ? (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium leading-none" style={{ color: opt.color, backgroundColor: `${opt.color}18`, border: `1px solid ${opt.color}40` }}>
                {opt.label}
              </span>
            ) : null
          })()}
          {meta.yoloMode && (
            <span className="flex-shrink-0 text-[9px] text-amber-400 font-medium">YOLO</span>
          )}
          {linkedProject && (
            <span title={linkedProject}><FolderOpen size={10} className="flex-shrink-0 text-zinc-600" /></span>
          )}
          <span className={cn('text-[10px] flex-shrink-0', isFocused ? 'text-zinc-400' : 'text-zinc-700')}>
            {timeAgo(meta.createdAt)}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            className="flex-shrink-0 text-zinc-700 hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100 ml-0.5"
            title="Close session"
          >
            <X size={13} />
          </button>
        </div>
        <div className={cn('pl-3.5 text-[10px] truncate', isFocused ? 'text-zinc-400' : 'text-zinc-600')}>
          {shortPath(meta.cwd)}
        </div>
      </div>

      {editOpen && <EditSessionModal meta={meta} onSave={handleSave} onDismiss={() => setEditOpen(false)} />}
    </>
  )
}

// ─── Group section ────────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: { id: string; name: string; color?: string }
  sessions: SessionMeta[]
  collapsed: boolean
  onToggle: () => void
  onEdit: (name: string, color: string) => void
  onDelete: () => void
  onOpenAllInSplits: () => void
  focusedSessionId: string | null
  paneTree: Record<string, unknown>
  openProjects: string[]
  onActivate: (tabId: string | null, sessionId: string) => void
  onClose: (sessionId: string) => void
  onSessionCtxMenu: (e: React.MouseEvent, meta: SessionMeta) => void
}

function GroupSection({ group, sessions, collapsed, onToggle, onEdit, onDelete, onOpenAllInSplits, focusedSessionId, paneTree, openProjects, onActivate, onClose, onSessionCtxMenu }: GroupSectionProps): JSX.Element {
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-brand-panel/60 transition-all cursor-pointer select-none"
        style={{ background: `linear-gradient(to right, ${group.color ?? '#71717a'}2e, transparent)` }}
        onClick={() => { if (collapsed) onToggle() }}
        onDoubleClick={(e) => { e.stopPropagation(); setEditModalOpen(true) }}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        <Layers size={13} className="flex-shrink-0" style={{ color: group.color ?? '#71717a' }} />
        <span className="text-xs font-semibold text-zinc-200 flex-1 truncate min-w-0">{group.name}</span>
        <span className="text-[10px] text-zinc-600">{sessions.length}</span>
      </div>
      {editModalOpen && (
        <EditGroupModal
          group={group}
          onSave={(name, color) => { onEdit(name, color); setEditModalOpen(false) }}
          onDismiss={() => setEditModalOpen(false)}
        />
      )}
      {ctxMenu && (
        <GroupCtxMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => setEditModalOpen(true)}
          onOpenAllInSplits={onOpenAllInSplits}
          onDelete={onDelete}
          onDismiss={() => setCtxMenu(null)}
        />
      )}

      {!collapsed && sessions.map((meta) => {
        const tabId = findTabForSession(paneTree as any, meta.sessionId)
        return (
          <div key={meta.sessionId} className="pl-3 border-l border-brand-panel/30 ml-3">
            <SessionRow
              meta={meta}
              isFocused={focusedSessionId === meta.sessionId}
              tabId={tabId}
              groups={[]}
              openProjects={openProjects}
              onActivate={() => onActivate(tabId, meta.sessionId)}
              onClose={() => onClose(meta.sessionId)}
              onContextMenu={(e) => onSessionCtxMenu(e, meta)}
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

interface Props {
  onFileClick: (path: string, xy: string | undefined) => void
  activeTab: 'sessions' | 'projects'
  activeFilePath: string | null
  externalRefreshTick?: number
  onSwitchToSessions: () => void
}

export function SessionDashboard({ onFileClick, activeTab, activeFilePath, externalRefreshTick, onSwitchToSessions }: Props): JSX.Element {
  const sessions = useStore((s) => s.sessions)
  const paneTree = useStore((s) => s.paneTree)
  const focusedSessionId = useStore((s) => s.focusedSessionId)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const setFocusedSession = useStore((s) => s.setFocusedSession)
  const switchPaneSession = useStore((s) => s.switchPaneSession)
  const updateSettings = useStore((s) => s.updateSettings)
  const upsertSession = useStore((s) => s.upsertSession)
  const addTab = useStore((s) => s.addTab)
  const settings = useStore((s) => s.settings)

  const { openProjects, refreshTicks, bumpRefresh, addProject, removeProject, closeSession } = useProjects()
  const openGroupInSplits = useStore((s) => s.openGroupInSplits)
  const windowId = useStore((s) => s.windowId)
  const isMainWindow = useStore((s) => s.isMainWindow)

  const [sessionQuery, setSessionQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [projectExpandOverride, setProjectExpandOverride] = useState<boolean | undefined>(undefined)
  const [sessionCtxMenu, setSessionCtxMenu] = useState<{ x: number; y: number; meta: SessionMeta } | null>(null)
  const [createGroupModal, setCreateGroupModal] = useState<{ pendingSessionId?: string } | null>(null)
  const { requestClose: requestSessionClose, modal: closeModal } = useConfirmClose()

  useEffect(() => {
    if (!externalRefreshTick) return
    openProjects.forEach((path) => bumpRefresh(path))
  }, [externalRefreshTick])

  const allSessions = Object.values(sessions)
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((m) => !sessionQuery || m.name.toLowerCase().includes(sessionQuery.toLowerCase()) || m.cwd.toLowerCase().includes(sessionQuery.toLowerCase()))
  const groups = settings.sessionGroups ?? []

  const handleFileMoveToWindow = useCallback(async (filePath: string, targetWindowId: string | null): Promise<void> => {
    try { await moveFileToWindow(filePath, targetWindowId) } catch {}
    const norm = (p: string): string => p.replace(/\\/g, '/')
    const tabId = `file:${norm(filePath)}`
    const state = useStore.getState()
    if (state.fileTabs[tabId]) state.closeFileTab(tabId)
  }, [])

  const handleAssignGroup = useCallback(async (sessionId: string, groupId: string | null) => {
    const updated = await patchSession({ sessionId, groupId })
    upsertSession(updated)
    if (groupId) {
      const groupName = groups.find((g) => g.id === groupId)?.name
      toast.success(`Moved to ${groupName ?? 'group'}`)
    } else {
      toast.success('Removed from group')
    }
  }, [upsertSession, groups])

  const handleCreateGroup = useCallback(async (name: string, color: string, assignSessionId?: string) => {
    const id = crypto.randomUUID()
    const newGroups = [...groups, { id, name, color }]
    await updateSettings({ sessionGroups: newGroups })
    if (assignSessionId) {
      const updated = await patchSession({ sessionId: assignSessionId, groupId: id })
      upsertSession(updated)
      toast.success(`Group "${name}" created and session assigned`)
    } else {
      toast.success(`Group "${name}" created`)
    }
  }, [groups, updateSettings, upsertSession])

  const handleEditGroup = useCallback(async (groupId: string, name: string, color: string) => {
    await updateSettings({ sessionGroups: groups.map((g) => g.id === groupId ? { ...g, name, color } : g) })
  }, [groups, updateSettings])

  const handleSetTaskStatus = useCallback(async (sessionId: string, taskStatus: string | null) => {
    const updated = await patchSession({ sessionId, taskStatus })
    upsertSession(updated)
  }, [upsertSession])

  const handleDetachSession = useCallback(async (meta: SessionMeta) => {
    const tabId = findTabForSession(paneTree, meta.sessionId)
    if (!tabId || !windowId) return
    const { detachPane } = useStore.getState()
    detachPane(tabId, meta.sessionId)
    const { detachTab } = await import('../../../features/window/window.service')
    await detachTab(meta.sessionId, windowId)
  }, [paneTree, windowId])

  const handleReattachSession = useCallback(async (meta: SessionMeta) => {
    const { reattachTab } = await import('../../../features/window/window.service')
    await reattachTab(meta.sessionId, windowId ?? undefined)
  }, [windowId])

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    const inGroup = allSessions.filter((m) => m.groupId === groupId)
    await Promise.all(inGroup.map((m) => patchSession({ sessionId: m.sessionId, groupId: null }).then(upsertSession)))
    await updateSettings({ sessionGroups: groups.filter((g) => g.id !== groupId) })
  }, [groups, allSessions, updateSettings, upsertSession])

  const ungroupedSessions = allSessions.filter((m) => !m.groupId || !groups.find((g) => g.id === m.groupId))

  return (
    <div className="flex flex-col w-full h-full bg-brand-bg">
      {/* Sessions tab */}
      {activeTab === 'sessions' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-brand-panel/40 flex-shrink-0">
            <Search size={11} className="text-zinc-600 flex-shrink-0" />
            <input
              value={sessionQuery}
              onChange={(e) => setSessionQuery(e.target.value)}
              placeholder="Filter sessions…"
              className="flex-1 bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none"
            />
            {groups.length > 0 && (
              <>
                <button
                  onClick={() => setCollapsedGroups(new Set())}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
                  title="Expand all groups"
                >
                  <ChevronsUpDown size={12} />
                </button>
                <button
                  onClick={() => setCollapsedGroups(new Set(groups.map(g => g.id)))}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
                  title="Collapse all groups"
                >
                  <ChevronsDownUp size={12} />
                </button>
              </>
            )}
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {/* Group sections */}
            {groups.map((group) => {
              const groupSessions = allSessions.filter((m) => m.groupId === group.id)
              const collapsed = collapsedGroups.has(group.id)
              return (
                <GroupSection
                  key={group.id}
                  group={group}
                  sessions={groupSessions}
                  collapsed={collapsed}
                  onToggle={() => setCollapsedGroups((prev) => {
                    const next = new Set(prev)
                    if (next.has(group.id)) next.delete(group.id)
                    else next.add(group.id)
                    return next
                  })}
                  onEdit={(name, color) => handleEditGroup(group.id, name, color)}
                  onDelete={() => handleDeleteGroup(group.id)}
                  onOpenAllInSplits={() => openGroupInSplits(groupSessions.map(m => m.sessionId))}
                  focusedSessionId={focusedSessionId}
                  paneTree={paneTree}
                  openProjects={openProjects}
                  onActivate={(tabId, sessionId) => {
                    if (tabId) { setActiveSession(tabId); setFocusedSession(sessionId) }
                    else if (activeSessionId && activeSessionId !== '__root__') { switchPaneSession(activeSessionId, sessionId) }
                    else { addTab(sessionId) }
                  }}
                  onClose={(sessionId) => requestSessionClose(() => closeSession(sessionId))}
                  onSessionCtxMenu={(e, meta) => setSessionCtxMenu({ x: e.clientX, y: e.clientY, meta })}
                />
              )
            })}

            {/* Ungrouped sessions */}
            {ungroupedSessions.length > 0 && (
              <>
                {groups.length > 0 && (
                  <div className="px-3 pt-2 pb-1">
                    <span className="text-[10px] text-zinc-700 uppercase tracking-wider">Ungrouped</span>
                  </div>
                )}
                {ungroupedSessions.map((meta) => {
                  const tabId = findTabForSession(paneTree, meta.sessionId)
                  return (
                    <SessionRow
                      key={meta.sessionId}
                      meta={meta}
                      isFocused={focusedSessionId === meta.sessionId}
                      tabId={tabId}
                      groups={groups}
                      openProjects={openProjects}
                      onActivate={() => {
                        if (tabId) { setActiveSession(tabId); setFocusedSession(meta.sessionId) }
                        else if (activeSessionId && activeSessionId !== '__root__') { switchPaneSession(activeSessionId, meta.sessionId) }
                        else { addTab(meta.sessionId) }
                      }}
                      onClose={() => requestSessionClose(() => closeSession(meta.sessionId))}
                      onContextMenu={(e) => setSessionCtxMenu({ x: e.clientX, y: e.clientY, meta })}
                    />
                  )
                })}
              </>
            )}

            {allSessions.length === 0 && (
              <p className="text-xs text-zinc-600 text-center mt-6">No sessions</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-brand-panel/60 p-2">
            <div className="flex gap-1">
              <NewSessionForm variant="sidebar" />
              <button
                onClick={() => setCreateGroupModal({})}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-500 hover:bg-brand-panel hover:text-brand-muted transition-colors rounded"
                title="New group"
              >
                <Layers size={15} /> New Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projects tab */}
      {activeTab === 'projects' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-brand-panel/40 flex-shrink-0">
            <Search size={11} className="text-zinc-600 flex-shrink-0" />
            <input
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              placeholder="Filter projects…"
              className="flex-1 bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none"
            />
            {openProjects.length > 0 && (
              <>
                <button
                  onClick={() => setProjectExpandOverride(true)}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
                  title="Expand all projects"
                >
                  <ChevronsUpDown size={12} />
                </button>
                <button
                  onClick={() => setProjectExpandOverride(false)}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"
                  title="Collapse all projects"
                >
                  <ChevronsDownUp size={12} />
                </button>
              </>
            )}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {openProjects.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-8">
                <FolderClosed size={28} className="text-zinc-700" />
                <p className="text-xs text-zinc-500 font-medium">No projects open</p>
              </div>
            )}
            {openProjects.filter(p => !projectQuery || p.toLowerCase().includes(projectQuery.toLowerCase())).map((p, idx) => {
              const name = p.split('/').filter(Boolean).pop() ?? p
              const lastActive = settings.lastActiveProject
              return (
                <ProjectSection
                  key={p}
                  path={p}
                  name={name}
                  colorIndex={idx}
                  refreshTick={refreshTicks[p] ?? 0}
                  activeFilePath={activeFilePath}
                  defaultExpanded={lastActive ? p === lastActive : idx === 0}
                  expandedOverride={projectExpandOverride}
                  onExpand={() => { setProjectExpandOverride(undefined); updateSettings({ lastActiveProject: p }) }}
                  onFileClick={onFileClick}
                  onMoveToWindow={handleFileMoveToWindow}
                  onNewSession={async () => {
                    try {
                      const meta = await createSession({ name, cwd: p, cols: DEFAULT_COLS, rows: DEFAULT_ROWS })
                      upsertSession(meta)
                      addTab(meta.sessionId)
                      updateSettings({ projectRoot: p })
                      onSwitchToSessions()
                    } catch {}
                  }}
                  onRemove={() => removeProject(p)}
                />
              )
            })}
          </div>
          <div className="flex-shrink-0 border-t border-brand-panel/60 p-2">
            <button
              onClick={addProject}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-zinc-500 hover:bg-brand-panel hover:text-brand-muted transition-colors rounded"
            >
              <FolderOpen size={13} /> Open Project
            </button>
          </div>
        </div>
      )}

      {/* Session group assignment context menu */}
      {sessionCtxMenu && (
        <SessionGroupMenu
          x={sessionCtxMenu.x}
          y={sessionCtxMenu.y}
          meta={sessionCtxMenu.meta}
          groups={groups}
          tabId={findTabForSession(paneTree, sessionCtxMenu.meta.sessionId)}
          windowId={windowId}
          isMainWindow={isMainWindow}
          onAssign={(groupId) => { handleAssignGroup(sessionCtxMenu.meta.sessionId, groupId); setSessionCtxMenu(null) }}
          onNewGroup={() => { setSessionCtxMenu(null); setCreateGroupModal({ pendingSessionId: sessionCtxMenu.meta.sessionId }) }}
          onDetach={() => { handleDetachSession(sessionCtxMenu.meta); setSessionCtxMenu(null) }}
          onReattach={() => { handleReattachSession(sessionCtxMenu.meta); setSessionCtxMenu(null) }}
          onSetTaskStatus={(status) => { handleSetTaskStatus(sessionCtxMenu.meta.sessionId, status); setSessionCtxMenu(null) }}
          onDismiss={() => setSessionCtxMenu(null)}
        />
      )}

      {/* Create group modal */}
      {createGroupModal && (
        <CreateGroupModal
          pendingSessionId={createGroupModal.pendingSessionId}
          onConfirm={(name, color, pendingSessionId) => {
            setCreateGroupModal(null)
            handleCreateGroup(name, color, pendingSessionId)
          }}
          onDismiss={() => setCreateGroupModal(null)}
        />
      )}
      {closeModal}
    </div>
  )
}
