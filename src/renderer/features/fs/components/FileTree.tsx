import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, File, FileCode, FileJson, FileText, FileImage, Folder, FolderOpen } from 'lucide-react'
import { createPortal } from 'react-dom'
import { readDir, getGitStatus, renameEntry, trashEntry, writeFile, mkdir, findFiles } from '../fs.service'
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

const EXT_COLOR: Record<string, string> = {
  ts: 'text-blue-400', tsx: 'text-blue-400',
  js: 'text-yellow-400', jsx: 'text-yellow-400', mjs: 'text-yellow-400', cjs: 'text-yellow-400',
  py: 'text-green-400', pyi: 'text-green-400',
  rs: 'text-orange-400',
  go: 'text-cyan-400',
  rb: 'text-red-400', php: 'text-violet-400',
  java: 'text-orange-300', kt: 'text-violet-300', swift: 'text-orange-300',
  cpp: 'text-blue-300', c: 'text-blue-300', h: 'text-blue-300', cs: 'text-blue-300',
  css: 'text-violet-400', scss: 'text-violet-400', sass: 'text-violet-400', less: 'text-violet-400',
  html: 'text-orange-400', htm: 'text-orange-400', vue: 'text-green-400', svelte: 'text-orange-400',
  json: 'text-yellow-300', jsonc: 'text-yellow-300',
  yaml: 'text-yellow-300', yml: 'text-yellow-300', toml: 'text-yellow-300',
  md: 'text-blue-300', mdx: 'text-blue-300', txt: 'text-zinc-400', rst: 'text-zinc-400',
  png: 'text-pink-400', jpg: 'text-pink-400', jpeg: 'text-pink-400', gif: 'text-pink-400',
  svg: 'text-pink-400', ico: 'text-pink-400', webp: 'text-pink-400', bmp: 'text-pink-400',
  sh: 'text-green-300', bash: 'text-green-300', zsh: 'text-green-300', fish: 'text-green-300', ps1: 'text-blue-300',
  env: 'text-zinc-400', lock: 'text-zinc-500', nsh: 'text-zinc-400', sql: 'text-sky-400',
}

const NAME_COLOR: Record<string, string> = {
  'package.json': 'text-yellow-400', 'package-lock.json': 'text-zinc-500',
  'tsconfig.json': 'text-blue-300', 'jsconfig.json': 'text-yellow-300',
  '.gitignore': 'text-orange-300', '.gitattributes': 'text-orange-300',
  '.env': 'text-zinc-400', '.env.local': 'text-zinc-400', '.env.example': 'text-zinc-400',
  'dockerfile': 'text-blue-400', 'docker-compose.yml': 'text-blue-400', 'docker-compose.yaml': 'text-blue-400',
  'cargo.toml': 'text-orange-400', 'cargo.lock': 'text-zinc-500',
  'makefile': 'text-red-300', 'readme.md': 'text-blue-300', 'license': 'text-zinc-400',
}

type FileIconType = 'code' | 'json' | 'text' | 'image' | 'default'

const CODE_EXTS = new Set(['ts','tsx','js','jsx','mjs','cjs','py','pyi','rs','go','rb','php','java','kt','swift','cpp','c','h','cs','css','scss','sass','less','html','htm','vue','svelte','sh','bash','zsh','fish','ps1','sql'])
const JSON_EXTS = new Set(['json','jsonc','yaml','yml','toml'])
const TEXT_EXTS = new Set(['md','mdx','txt','rst'])
const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','svg','ico','webp','bmp','tiff'])

function getFileIconMeta(name: string): { type: FileIconType; color: string } {
  const lower = name.toLowerCase()
  const color = NAME_COLOR[lower] ?? EXT_COLOR[lower.split('.').pop() ?? ''] ?? 'text-zinc-400'
  const ext = lower.split('.').pop() ?? ''
  let type: FileIconType = 'default'
  if (CODE_EXTS.has(ext)) type = 'code'
  else if (JSON_EXTS.has(ext)) type = 'json'
  else if (TEXT_EXTS.has(ext)) type = 'text'
  else if (IMAGE_EXTS.has(ext)) type = 'image'
  return { type, color }
}

function FileIcon({ name }: { name: string }): JSX.Element {
  const { type, color } = getFileIconMeta(name)
  const props = { size: 13, className: color }
  if (type === 'code') return <FileCode {...props} />
  if (type === 'json') return <FileJson {...props} />
  if (type === 'text') return <FileText {...props} />
  if (type === 'image') return <FileImage {...props} />
  return <File {...props} />
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

interface InlineCreateRowProps {
  type: 'file' | 'folder'
  depth: number
  value: string
  onChange: (v: string) => void
  onSubmit: (name: string) => void
  onCancel: () => void
}

function InlineCreateRow({ type, depth, value, onChange, onSubmit, onCancel }: InlineCreateRowProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0) }, [])
  return (
    <div
      className="w-full flex items-center gap-1.5 py-1 rounded-sm bg-brand-accent/10 ring-1 ring-inset ring-brand-accent/20"
      style={{ paddingLeft: `${6 + depth * 12}px`, paddingRight: 8 }}
    >
      <span className="flex-shrink-0 w-3" />
      <span className="flex-shrink-0 text-zinc-400 w-3.5 flex items-center">
        {type === 'folder' ? <Folder size={13} className="text-yellow-500/70" /> : <FileIcon name="new-file" />}
      </span>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') { const t = value.trim(); if (t) onSubmit(t) }
          else if (e.key === 'Escape') onCancel()
        }}
        onBlur={onCancel}
        onClick={(e) => e.stopPropagation()}
        placeholder={type === 'file' ? 'filename.ts' : 'folder-name'}
        className="flex-1 h-6 px-1 text-xs min-w-0"
      />
    </div>
  )
}

interface TreeNodeProps {
  entry: FsEntry
  depth: number
  gitMap: Map<string, string>
  projectRoot: string
  activeFilePath: string | null
  focusedPath: string | null
  renamingPath: string | null
  creating: { parentDir: string; type: 'file' | 'folder' } | null
  creatingValue: string
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
  onCreatingChange: (v: string) => void
  onCreateSubmit: (name: string) => void
  onCreateCancel: () => void
}

function TreeNode({ entry, depth, gitMap, projectRoot, activeFilePath, focusedPath, renamingPath, creating, creatingValue, expanded, childrenMap, onFileClick, onContextMenu, onRenameSubmit, onRenameCancel, onToggle, onQuickNew, onLoadChildren, onSetFocus, onCreatingChange, onCreateSubmit, onCreateCancel }: TreeNodeProps): JSX.Element {
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

  const childProps = { gitMap, projectRoot, activeFilePath, focusedPath, renamingPath, creating, creatingValue, expanded, childrenMap, onFileClick, onContextMenu, onRenameSubmit, onRenameCancel, onToggle, onQuickNew, onLoadChildren, onSetFocus, onCreatingChange, onCreateSubmit, onCreateCancel }

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
          <span className="flex-shrink-0 w-3.5 flex items-center">
            {entry.isDirectory
              ? isExpanded ? <FolderOpen size={13} className="text-yellow-500/70" /> : <Folder size={13} className="text-yellow-500/70" />
              : <FileIcon name={entry.name} />}
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
      {isExpanded && (
        <>
          {creating?.parentDir === norm(entry.path) && (
            <InlineCreateRow
              type={creating.type}
              depth={depth + 1}
              value={creatingValue}
              onChange={onCreatingChange}
              onSubmit={onCreateSubmit}
              onCancel={onCreateCancel}
            />
          )}
          {children && children.map((child) => (
            <TreeNode key={child.path} entry={child} depth={depth + 1} {...childProps} />
          ))}
        </>
      )}
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


interface Props {
  projectRoot: string
  activeFilePath?: string | null
  onFileClick: (path: string, xy: string | undefined) => void
  refreshTick?: number
  filterText?: string
}

export function FileTree({ projectRoot: rootProp, activeFilePath = null, onFileClick, refreshTick = 0, filterText = '' }: Props): JSX.Element {
  const [rootEntries, setRootEntries] = useState<FsEntry[]>([])
  const [childrenMap, setChildrenMap] = useState<Map<string, FsEntry[]>>(new Map())
  const [gitMap, setGitMap] = useState<Map<string, string>>(new Map())
  const [ctxTarget, setCtxTarget] = useState<CtxTarget | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<FsEntry | null>(null)
  const [creating, setCreating] = useState<{ parentDir: string; type: 'file' | 'folder' } | null>(null)
  const [creatingValue, setCreatingValue] = useState('')
  const [focusedPath, _setFocusedPath] = useState<string | null>(null)
  const treeBodyRef = useRef<HTMLDivElement>(null)
  const focusedPathRef = useRef<string | null>(null)
  const editors = useInstalledEditors()
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [allFilesLoaded, setAllFilesLoaded] = useState(false)

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
    setAllFiles([])
    setAllFilesLoaded(false)
  }, [projectRoot])

  // Eagerly index all files once filter mode is first activated
  useEffect(() => {
    if (!filterText || allFilesLoaded || !projectRoot) return
    findFiles(projectRoot).then((files) => {
      setAllFiles(files)
      setAllFilesLoaded(true)
    }).catch(() => {})
  }, [filterText, allFilesLoaded, projectRoot])

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
    setCreatingValue('')
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
    const key = norm(parentDir)
    if (key !== projectRoot) {
      if (!childrenMap.has(key)) loadChildren(parentDir)
      if (!expanded.has(key)) {
        setExpanded(prev => {
          const next = new Set([...prev, key])
          saveExpanded(projectRoot, next)
          return next
        })
      }
    }
    setCreating({ parentDir: key, type })
    setCreatingValue('')
  }, [childrenMap, expanded, projectRoot, loadChildren])

  useEffect(() => {
    const handler = (e: Event): void => {
      const { parentDir, type } = (e as CustomEvent<{ parentDir: string; type: 'file' | 'folder' }>).detail
      if (norm(parentDir) === projectRoot) {
        setCreating({ parentDir: projectRoot, type })
        setCreatingValue('')
      }
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

  // Filter mode: show a flat list of matching files
  if (filterText) {
    const lower = filterText.toLowerCase()
    const matched = allFilesLoaded
      ? allFiles.filter((f) => norm(f).toLowerCase().includes(lower))
      : []
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {!allFilesLoaded && (
            <p className="text-xs text-zinc-600 text-center py-6">Indexing…</p>
          )}
          {allFilesLoaded && matched.length === 0 && (
            <p className="text-xs text-zinc-600 text-center py-6">No files match</p>
          )}
          {matched.map((filePath) => {
            const name = norm(filePath).split('/').pop() ?? filePath
            const rel = norm(filePath).slice(projectRoot.length + 1)
            const dir = rel.includes('/') ? rel.substring(0, rel.lastIndexOf('/')) : ''
            const isActive = activeFilePath !== null && norm(filePath) === norm(activeFilePath)
            return (
              <button
                key={filePath}
                onClick={() => onFileClick(filePath, undefined)}
                className={cn(
                  'w-full flex items-center gap-1.5 px-2 py-1 text-left rounded-sm transition-colors',
                  isActive ? 'bg-brand-panel/60' : 'hover:bg-brand-panel/40'
                )}
              >
                <span className="flex-shrink-0 w-3.5 flex items-center"><FileIcon name={name} /></span>
                <span className="flex-1 min-w-0">
                  <span className="text-[11px] text-zinc-300 truncate block">{name}</span>
                  {dir && <span className="text-[10px] text-zinc-600 truncate block">{dir}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const nodeProps = { gitMap, projectRoot, activeFilePath, focusedPath, renamingPath, creating, creatingValue, expanded, childrenMap, onFileClick, onContextMenu: handleContextMenu, onRenameSubmit: handleRenameSubmit, onRenameCancel: () => setRenamingPath(null), onToggle: handleToggle, onQuickNew: handleQuickNew, onLoadChildren: loadChildren, onSetFocus: setFocusedPath, onCreatingChange: setCreatingValue, onCreateSubmit: handleCreateConfirm, onCreateCancel: () => { setCreating(null); setCreatingValue('') } }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={treeBodyRef} className="flex-1 overflow-y-auto py-1 px-1">
        {creating?.parentDir === projectRoot && (
          <InlineCreateRow
            type={creating.type}
            depth={0}
            value={creatingValue}
            onChange={setCreatingValue}
            onSubmit={handleCreateConfirm}
            onCancel={() => { setCreating(null); setCreatingValue('') }}
          />
        )}
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
    </div>
  )
}
