import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react'
import { createPortal } from 'react-dom'
import { readDir, getGitStatus, renameEntry, trashEntry, writeFile, mkdir } from '../fs.service'
import { FileTreeContextMenu } from './FileTreeContextMenu'
import { useInstalledEditors } from '../hooks/useInstalledEditors'
import { useLayoutDnd } from '../../layout/dnd/LayoutDndContext'
import { cn } from '../../../lib/utils'
import { Input } from '../../../components/ui/input'
import type { FsEntry, GitStatusEntry } from '@shared/ipc-types'

function statusColor(xy: string): string {
  if (xy === '??') return 'text-green-400'
  if (xy[0] !== ' ' && xy[0] !== '?') return 'text-blue-400'
  if (xy[1] === 'M') return 'text-yellow-400'
  if (xy[1] === 'D') return 'text-red-400'
  return 'text-green-400'
}

function statusLabel(xy: string): string {
  if (xy === '??') return 'U'
  if (xy[0] !== ' ') return 'S'
  if (xy[1] === 'M') return 'M'
  if (xy[1] === 'D') return 'D'
  return 'A'
}

function norm(p: string): string {
  return p.replace(/\\/g, '/')
}

function expandedKey(root: string): string {
  return `orbit:tree-expanded:${root}`
}

function loadExpanded(root: string): Set<string> {
  try {
    const raw = localStorage.getItem(expandedKey(root))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function saveExpanded(root: string, set: Set<string>): void {
  try {
    localStorage.setItem(expandedKey(root), JSON.stringify([...set]))
  } catch {}
}

interface CtxTarget {
  x: number
  y: number
  entry: FsEntry
  rel: string
}

interface TreeNodeProps {
  entry: FsEntry
  depth: number
  gitMap: Map<string, string>
  projectRoot: string
  activeFilePath: string | null
  focusedPath: string | null
  renamingPath: string | null
  expanded: Set<string>
  childrenMap: Map<string, FsEntry[]>
  onFileClick: (path: string, xy: string | undefined) => void
  onContextMenu: (e: React.MouseEvent, entry: FsEntry, rel: string) => void
  onRenameSubmit: (entry: FsEntry, newName: string) => void
  onRenameCancel: () => void
  onToggle: (path: string) => void
  onQuickNew: (parentDir: string, type: 'file' | 'folder') => void
  onLoadChildren: (path: string) => void
  onSetFocus: (path: string) => void
}

function TreeNode({ entry, depth, gitMap, projectRoot, activeFilePath, focusedPath, renamingPath, expanded, childrenMap, onFileClick, onContextMenu, onRenameSubmit, onRenameCancel, onToggle, onQuickNew, onLoadChildren, onSetFocus }: TreeNodeProps): JSX.Element {
  const [renameValue, setRenameValue] = useState(entry.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const { startDrag, endDrag } = useLayoutDnd()

  const isExpanded = expanded.has(norm(entry.path))
  const isRenaming = renamingPath === entry.path
  const isFocused = focusedPath === norm(entry.path)
  const children = childrenMap.get(norm(entry.path)) ?? null

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(entry.name)
      setTimeout(() => inputRef.current?.select(), 0)
    }
  }, [isRenaming, entry.name])

  useEffect(() => {
    if (isExpanded && entry.isDirectory && !children) {
      onLoadChildren(entry.path)
    }
  }, [isExpanded, entry.path, entry.isDirectory, children, onLoadChildren])

  const toggle = (): void => {
    onSetFocus(norm(entry.path))
    if (!entry.isDirectory) {
      const rel = norm(entry.path).replace(projectRoot, '').replace(/^\//, '')
      onFileClick(entry.path, gitMap.get(rel))
      return
    }
    if (!isExpanded && !children) onLoadChildren(entry.path)
    onToggle(norm(entry.path))
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      const trimmed = renameValue.trim()
      if (trimmed && trimmed !== entry.name) onRenameSubmit(entry, trimmed)
      else onRenameCancel()
    } else if (e.key === 'Escape') {
      onRenameCancel()
    }
  }

  const rel = norm(entry.path).replace(projectRoot, '').replace(/^\//, '')
  const xy = gitMap.get(rel)
  const isActive = !entry.isDirectory && activeFilePath !== null &&
    norm(entry.path) === norm(activeFilePath)

  const childProps = { gitMap, projectRoot, activeFilePath, focusedPath, renamingPath, expanded, childrenMap, onFileClick, onContextMenu, onRenameSubmit, onRenameCancel, onToggle, onQuickNew, onLoadChildren, onSetFocus }

  return (
    <>
      <div
        data-path={norm(entry.path)}
        draggable={!entry.isDirectory}
        onDragStart={!entry.isDirectory ? (e) => {
          e.dataTransfer.effectAllowed = 'copy'
          e.dataTransfer.setData('application/orbit-file', entry.path)
          e.dataTransfer.setData('text/plain', entry.path)
          startDrag({ type: 'file-path', filePath: entry.path })
          document.dispatchEvent(new CustomEvent('acc:file-drag-start'))
        } : undefined}
        onDragEnd={!entry.isDirectory ? () => endDrag() : undefined}
        className={cn(
          'w-full flex items-center gap-1.5 py-1 text-left transition-colors rounded-sm group',
          isFocused
            ? 'bg-brand-accent/15 ring-1 ring-inset ring-brand-accent/30'
            : isActive ? 'bg-brand-panel/60' : 'hover:bg-brand-panel/40'
        )}
        style={{ paddingLeft: `${6 + depth * 12}px`, paddingRight: 8 }}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, entry, rel) }}
      >
        <button onClick={toggle} className="flex items-center gap-1 flex-1 min-w-0 text-left">
          {entry.isDirectory
            ? <span className="flex-shrink-0 text-zinc-500 w-3">{isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</span>
            : <span className="flex-shrink-0 w-3" />}
          <span className="flex-shrink-0 text-zinc-400 w-3.5 flex items-center">
            {entry.isDirectory
              ? isExpanded ? <FolderOpen size={13} className="text-yellow-500/70" /> : <Folder size={13} className="text-yellow-500/70" />
              : <File size={13} />}
          </span>
          {isRenaming ? (
            <Input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={() => onRenameCancel()}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 h-6 px-1 text-xs min-w-0"
            />
          ) : (
            <span className={cn('text-xs truncate flex-1', xy ? statusColor(xy) : 'text-zinc-300')}>
              {entry.name}
            </span>
          )}
        </button>
        {xy && !isRenaming && (
          <span className={cn('text-[10px] font-bold flex-shrink-0', statusColor(xy))}>
            {statusLabel(xy)}
          </span>
        )}
      </div>
      {isExpanded && children && children.map((child) => (
        <TreeNode key={child.path} entry={child} depth={depth + 1} {...childProps} />
      ))}
    </>
  )
}

function DeleteConfirm({ entry, onConfirm, onCancel }: { entry: FsEntry; onConfirm: () => void; onCancel: () => void }): JSX.Element {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-brand-surface border border-brand-panel/60 rounded-lg shadow-2xl w-80 p-5 flex flex-col gap-4">
        <span className="text-sm font-semibold text-zinc-200">Move to Trash</span>
        <p className="text-xs text-zinc-400">
          Move <span className="text-zinc-200 font-medium">{entry.name}</span> to the trash?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded border border-brand-panel hover:border-zinc-600"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 hover:text-red-300 transition-colors rounded"
          >
            Move to Trash
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function CreateItemDialog({ parentDir, type, onConfirm, onCancel }: {
  parentDir: string
  type: 'file' | 'folder'
  onConfirm: (name: string) => void
  onCancel: () => void
}): JSX.Element {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0) }, [])
  const submit = (): void => { const name = value.trim(); if (name) onConfirm(name) }
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-brand-surface border border-brand-panel/60 rounded-lg shadow-2xl w-72 p-5 flex flex-col gap-4">
        <span className="text-sm font-semibold text-zinc-200">
          {type === 'file' ? 'New File' : 'New Folder'}
        </span>
        <p className="text-[10px] text-zinc-600 -mt-2 truncate">{parentDir}</p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') onCancel() }}
          placeholder={type === 'file' ? 'filename.ts' : 'folder-name'}
          className="w-full px-3 py-1.5 text-xs bg-brand-bg border border-brand-panel/60 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-accent/50"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded border border-brand-panel hover:border-zinc-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="px-3 py-1.5 text-xs bg-brand-accent/20 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/30 transition-colors rounded disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

interface Props {
  projectRoot: string
  activeFilePath?: string | null
  onFileClick: (path: string, xy: string | undefined) => void
  refreshTick?: number
}

export function FileTree({ projectRoot: rootProp, activeFilePath = null, onFileClick, refreshTick = 0 }: Props): JSX.Element {
  const [rootEntries, setRootEntries] = useState<FsEntry[]>([])
  const [childrenMap, setChildrenMap] = useState<Map<string, FsEntry[]>>(new Map())
  const [gitMap, setGitMap] = useState<Map<string, string>>(new Map())
  const [ctxTarget, setCtxTarget] = useState<CtxTarget | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<FsEntry | null>(null)
  const [creating, setCreating] = useState<{ parentDir: string; type: 'file' | 'folder' } | null>(null)
  const [focusedPath, _setFocusedPath] = useState<string | null>(null)
  const treeBodyRef = useRef<HTMLDivElement>(null)
  const focusedPathRef = useRef<string | null>(null)
  const editors = useInstalledEditors()

  // Always update ref synchronously so navigate() reads the latest path without waiting for a render
  const setFocusedPath = useCallback((path: string | null) => {
    focusedPathRef.current = path
    _setFocusedPath(path)
  }, [])

  const projectRoot = rootProp.replace(/\\/g, '/')

  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded(projectRoot))

  useEffect(() => {
    setExpanded(loadExpanded(projectRoot))
    setChildrenMap(new Map())
    setFocusedPath(null)
  }, [projectRoot])

  useEffect(() => {
    if (!activeFilePath || !projectRoot) return
    const filePath = norm(activeFilePath)
    if (!filePath.startsWith(projectRoot)) return
    const relative = filePath.slice(projectRoot.length).replace(/^\//, '')
    const parts = relative.split('/')
    if (parts.length <= 1) return
    const toExpand: string[] = []
    for (let i = 1; i < parts.length; i++) {
      toExpand.push(projectRoot + '/' + parts.slice(0, i).join('/'))
    }
    setExpanded(prev => {
      const next = new Set([...prev, ...toExpand])
      saveExpanded(projectRoot, next)
      return next
    })
  }, [activeFilePath, projectRoot])

  const handleToggle = useCallback((path: string): void => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      saveExpanded(projectRoot, next)
      return next
    })
  }, [projectRoot])

  const loadChildren = useCallback((dirPath: string): void => {
    const key = norm(dirPath)
    setChildrenMap(prev => {
      if (prev.has(key)) return prev
      readDir(dirPath).then(children => {
        setChildrenMap(m => new Map(m).set(key, children))
      })
      return prev
    })
  }, [])

  const loadRoot = useCallback(async () => {
    if (!projectRoot) return
    setRootEntries(await readDir(projectRoot))
    const statuses = await getGitStatus(projectRoot)
    const map = new Map<string, string>()
    statuses.forEach((s: GitStatusEntry) => map.set(s.path.replace(/\\/g, '/'), s.xy))
    setGitMap(map)
  }, [projectRoot, refreshTick])

  useEffect(() => { loadRoot() }, [loadRoot])

  // Flat ordered list of all visible paths (for keyboard navigation)
  const flatVisible = useMemo(() => {
    const result: string[] = []
    function visit(entries: FsEntry[]): void {
      for (const e of entries) {
        const p = norm(e.path)
        result.push(p)
        if (e.isDirectory && expanded.has(p)) {
          visit(childrenMap.get(p) ?? [])
        }
      }
    }
    visit(rootEntries)
    return result
  }, [rootEntries, expanded, childrenMap])

  // Path → entry lookup for keyboard actions
  const entryMap = useMemo(() => {
    const map = new Map<string, FsEntry>()
    function visit(entries: FsEntry[]): void {
      for (const e of entries) {
        map.set(norm(e.path), e)
        const children = childrenMap.get(norm(e.path))
        if (children) visit(children)
      }
    }
    visit(rootEntries)
    return map
  }, [rootEntries, childrenMap])

  // Scroll focused item into view
  useEffect(() => {
    if (!focusedPath || !treeBodyRef.current) return
    const el = treeBodyRef.current.querySelector(`[data-path="${CSS.escape(focusedPath)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedPath])

  const navigate = useCallback((key: string): void => {
    // Always read from ref — guaranteed current even if state hasn't re-rendered yet
    const current = focusedPathRef.current

    if (key === 'ArrowDown') {
      const idx = current ? flatVisible.indexOf(current) : -1
      const next = idx >= 0 ? (flatVisible[idx + 1] ?? current) : (flatVisible[0] ?? null)
      if (next && next !== current) setFocusedPath(next)
      return
    }
    if (key === 'ArrowUp') {
      const idx = current ? flatVisible.indexOf(current) : flatVisible.length
      const next = idx > 0 ? (flatVisible[idx - 1] ?? current) : (flatVisible[flatVisible.length - 1] ?? null)
      if (next && next !== current) setFocusedPath(next)
      return
    }

    if (!current) { setFocusedPath(flatVisible[0] ?? null); return }
    const entry = entryMap.get(current)
    if (!entry) return

    if (key === 'Enter') {
      if (entry.isDirectory) {
        if (!expanded.has(current) && !childrenMap.has(current)) loadChildren(entry.path)
        handleToggle(current)
      } else {
        const rel = current.replace(projectRoot + '/', '')
        onFileClick(entry.path, gitMap.get(rel))
      }
      return
    }

    if (key === 'ArrowRight') {
      if (entry.isDirectory) {
        if (!expanded.has(current)) {
          if (!childrenMap.has(current)) loadChildren(entry.path)
          handleToggle(current)
        } else {
          const children = childrenMap.get(current)
          if (children?.[0]) setFocusedPath(norm(children[0].path))
        }
      }
      return
    }

    if (key === 'ArrowLeft') {
      if (entry.isDirectory && expanded.has(current)) {
        handleToggle(current)
      } else {
        const parent = current.substring(0, current.lastIndexOf('/'))
        if (parent.length >= projectRoot.length) setFocusedPath(parent)
      }
    }
  }, [flatVisible, entryMap, expanded, childrenMap, loadChildren, handleToggle, onFileClick, gitMap, projectRoot, setFocusedPath])

  // Keyboard: direct (when no input focused) + via acc:tree-navigate from modal
  useEffect(() => {
    if (!projectRoot) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
        e.preventDefault()
        navigate(e.key)
      }
    }
    const handleNav = (e: Event): void => {
      navigate((e as CustomEvent<{ key: string }>).detail.key)
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true })
    document.addEventListener('acc:tree-navigate', handleNav)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
      document.removeEventListener('acc:tree-navigate', handleNav)
    }
  }, [navigate, projectRoot])

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FsEntry, rel: string) => {
    setCtxTarget({ x: e.clientX, y: e.clientY, entry, rel })
  }, [])

  const handleRenameSubmit = useCallback(async (entry: FsEntry, newName: string) => {
    setRenamingPath(null)
    try {
      await renameEntry(entry.path, newName)
      await loadRoot()
    } catch {}
  }, [loadRoot])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingEntry) return
    const entry = deletingEntry
    setDeletingEntry(null)
    try {
      await trashEntry(entry.path)
      await loadRoot()
    } catch {}
  }, [deletingEntry, loadRoot])

  const handleCreateConfirm = useCallback(async (name: string) => {
    if (!creating) return
    const target = creating
    setCreating(null)
    const fullPath = target.parentDir.replace(/\/$/, '') + '/' + name
    try {
      if (target.type === 'folder') {
        await mkdir(fullPath)
      } else {
        await writeFile(fullPath, '')
        onFileClick(fullPath, undefined)
      }
      await loadRoot()
    } catch {}
  }, [creating, loadRoot, onFileClick])

  const handleQuickNew = useCallback((parentDir: string, type: 'file' | 'folder') => {
    setCreating({ parentDir, type })
  }, [])

  useEffect(() => {
    const handler = (e: Event): void => {
      const { parentDir, type } = (e as CustomEvent<{ parentDir: string; type: 'file' | 'folder' }>).detail
      if (norm(parentDir) === projectRoot) setCreating({ parentDir, type })
    }
    document.addEventListener('acc:new-file-at-root', handler)
    return () => document.removeEventListener('acc:new-file-at-root', handler)
  }, [projectRoot])

  if (!projectRoot) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-zinc-600">No project selected</p>
      </div>
    )
  }

  const nodeProps = { gitMap, projectRoot, activeFilePath, focusedPath, renamingPath, expanded, childrenMap, onFileClick, onContextMenu: handleContextMenu, onRenameSubmit: handleRenameSubmit, onRenameCancel: () => setRenamingPath(null), onToggle: handleToggle, onQuickNew: handleQuickNew, onLoadChildren: loadChildren, onSetFocus: setFocusedPath }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={treeBodyRef} className="flex-1 overflow-y-auto py-1 px-1">
        {rootEntries.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} {...nodeProps} />
        ))}
      </div>

      {ctxTarget && (
        <FileTreeContextMenu
          x={ctxTarget.x}
          y={ctxTarget.y}
          entry={ctxTarget.entry}
          projectRoot={projectRoot}
          rel={ctxTarget.rel}
          editors={editors}
          onFileClick={onFileClick}
          onRename={() => setRenamingPath(ctxTarget.entry.path)}
          onDelete={() => setDeletingEntry(ctxTarget.entry)}
          onDismiss={() => setCtxTarget(null)}
          onNewFile={ctxTarget.entry.isDirectory ? () => handleQuickNew(norm(ctxTarget.entry.path), 'file') : undefined}
          onNewFolder={ctxTarget.entry.isDirectory ? () => handleQuickNew(norm(ctxTarget.entry.path), 'folder') : undefined}
        />
      )}

      {deletingEntry && (
        <DeleteConfirm
          entry={deletingEntry}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingEntry(null)}
        />
      )}

      {creating && (
        <CreateItemDialog
          parentDir={creating.parentDir}
          type={creating.type}
          onConfirm={handleCreateConfirm}
          onCancel={() => setCreating(null)}
        />
      )}
    </div>
  )
}
