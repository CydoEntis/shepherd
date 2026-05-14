import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Search, ChevronRight, FolderOpen, FolderClosed, FileText, FolderPlus, Pencil, Trash2, ArrowRightLeft, ExternalLink } from 'lucide-react'
import { useStore } from '../../../store/root.store'
import { cn } from '../../../lib/utils'
import { EditNoteModal } from './EditNoteModal'
import { detachNotePane, moveNotePaneToWindow, listWindows } from '../../window/window.service'
import { useInstalledEditors } from '../../fs/hooks/useInstalledEditors'
import { openNoteInEditor } from '../notes.service'
import { WindowMoveSubmenu } from '../../window/components/WindowMoveSubmenu'
import type { Note } from '@shared/ipc-types'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import type { LayoutNode } from '../../layout/layout-tree'

export function noteTitle(note: Note): string {
  const first = note.content.split('\n').find(l => l.trim())
  return first?.trim().slice(0, 50) || 'Untitled'
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const NOTE_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#06b6d4', '#14b8a6', '#f59e0b']
const FOLDER_COLORS = ['#6b7280', '#3b82f6', '#06b6d4', '#22c55e', '#14b8a6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308']
function noteColorFromId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i)
  return NOTE_COLORS[Math.abs(hash) % NOTE_COLORS.length]
}

interface FileTreeProps {
  activeNoteId: string | null
  onActivate: (id: string) => void
  onCreate: () => void
  onNoteDragStart?: (noteId: string) => void
  onNoteDragEnd?: () => void
}

export function FileTree({ activeNoteId, onActivate, onCreate, onNoteDragStart, onNoteDragEnd }: FileTreeProps): JSX.Element {
  const notes = useStore((s) => s.notes)
  const noteFolders = useStore((s) => s.settings.noteFolders ?? [])
  const noteFolderMap = useStore((s) => s.settings.noteFolderMap ?? {})
  const addNoteFolder = useStore((s) => s.addNoteFolder)
  const setNoteFolder = useStore((s) => s.setNoteFolder)
  const renameNoteFolder = useStore((s) => s.renameNoteFolder)
  const deleteNote = useStore((s) => s.deleteNote)
  const deleteNoteFolder = useStore((s) => s.deleteNoteFolder)
  const saveNote = useStore((s) => s.saveNote)
  const setNoteColor = useStore((s) => s.setNoteColor)
  const noteColorMap = useStore((s) => s.settings.noteColorMap ?? {})
  const noteWorkspaceMap = useStore((s) => s.settings.noteWorkspaceMap ?? {})
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const isMainWindow = useStore((s) => s.isMainWindow)
  const paneTree = useStore((s) => s.paneTree)
  const removeNotePaneFromLayout = useStore((s) => s.removeNotePaneFromLayout)
  const addDetachedNoteId = useStore((s) => s.addDetachedNoteId)
  const detachedNoteIds = useStore((s) => s.detachedNoteIds)

  const installedEditors = useInstalledEditors()
  const [query, setQuery] = useState('')
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [dragNoteId, setDragNoteId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ type: 'folder' | 'note'; id: string; x: number; y: number } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'folder' | 'note'; id: string } | null>(null)
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null)
  const [renamingNoteName, setRenamingNoteName] = useState('')
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const [showOpenInSubmenu, setShowOpenInSubmenu] = useState(false)
  const [submenuY, setSubmenuY] = useState(0)
  const [openInSubmenuY, setOpenInSubmenuY] = useState(0)
  const [otherWindows, setOtherWindows] = useState<{ windowId: string; windowName: string; windowColor: string }[]>([])
  // null id = new folder, string id = edit existing
  const [folderPopover, setFolderPopover] = useState<{ id: string | null; name: string; color: string; x: number; y: number } | null>(null)
  const renamingNoteRef = useRef<HTMLInputElement>(null)
  const moveTriggerRef = useRef<HTMLButtonElement>(null)
  const openInTriggerRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (renamingNoteId) setTimeout(() => renamingNoteRef.current?.focus(), 0)
  }, [renamingNoteId])

  useEffect(() => () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
  }, [])

  const clearHideTimeout = (): void => {
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null }
  }
  const scheduleHideSubmenu = (): void => {
    clearHideTimeout()
    hideTimeoutRef.current = setTimeout(() => { setShowMoveSubmenu(false); setShowOpenInSubmenu(false) }, 150)
  }
  const dismissContextMenu = (): void => {
    setContextMenu(null); setShowMoveSubmenu(false); setShowOpenInSubmenu(false)
  }
  const getSubmenuX = (): number => {
    const menuWidth = 180
    const submenuWidth = 160
    const rightX = (contextMenu?.x ?? 0) + menuWidth + 4
    return rightX + submenuWidth > window.innerWidth ? (contextMenu?.x ?? 0) - submenuWidth - 4 : rightX
  }

  const startRenameNote = (id: string): void => {
    const note = notes.find(n => n.id === id)
    if (!note) return
    setRenamingNoteId(id)
    setRenamingNoteName(noteTitle(note))
  }

  const commitRenameNote = async (): Promise<void> => {
    if (!renamingNoteId) return
    const note = notes.find(n => n.id === renamingNoteId)
    const newName = renamingNoteName.trim()
    if (note && newName) {
      const lines = note.content.split('\n')
      lines[0] = newName
      await saveNote(renamingNoteId, lines.join('\n'))
    }
    setRenamingNoteId(null)
  }

  const commitFolderPopover = async (): Promise<void> => {
    if (!folderPopover) return
    const name = folderPopover.name.trim()
    if (name) {
      if (folderPopover.id) {
        await renameNoteFolder(folderPopover.id, name, folderPopover.color)
      } else {
        await addNoteFolder(name, folderPopover.color)
      }
    }
    setFolderPopover(null)
  }

  const handleContextMenu = (e: React.MouseEvent, type: 'folder' | 'note', id: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 184)
    const y = Math.min(e.clientY, window.innerHeight - 160)
    setContextMenu({ type, id, x, y })
    setShowMoveSubmenu(false)
    if (type === 'note') {
      listWindows().then((wins) => {
        setOtherWindows(wins.map((w) => ({ windowId: w.windowId, windowName: w.windowName, windowColor: w.windowColor, isMain: w.isMain })))
      }).catch(() => {})
    }
  }

  const openFolderPopover = (pos: { x: number; y: number }, folder?: { id: string; name: string; color?: string }): void => {
    setFolderPopover({
      id: folder?.id ?? null,
      name: folder?.name ?? '',
      color: folder?.color ?? '#6b7280',
      x: Math.min(pos.x, window.innerWidth - 220),
      y: Math.min(pos.y, window.innerHeight - 160),
    })
  }

  const filteredNotes = (() => {
    let base: Note[]
    if (isMainWindow) {
      base = notes.filter((n) => !detachedNoteIds.includes(n.id))
    } else {
      const ids = new Set<string>()
      const collect = (node: LayoutNode): void => {
        if (node.type === 'leaf' && (node.panel === 'notes' || node.panel === 'markdown-preview') && node.noteId) ids.add(node.noteId)
        else if (node.type === 'split') node.children.forEach(collect)
      }
      for (const tree of Object.values(paneTree)) collect(tree)
      base = notes.filter(n => ids.has(n.id))
    }
    if (activeWorkspaceId === ROOT_WORKSPACE_ID) return base
    return base.filter((n) => (noteWorkspaceMap[n.id] ?? ROOT_WORKSPACE_ID) === activeWorkspaceId)
  })()
  const sorted = filteredNotes.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  const matchesQuery = (n: Note): boolean => !query || n.content.toLowerCase().includes(query.toLowerCase())
  const unfiledNotes = sorted.filter(n => !noteFolderMap[n.id] && matchesQuery(n))
  const sortedFolders = noteFolders.slice().sort((a, b) => a.name.localeCompare(b.name))

  const toggleFolder = (id: string): void => {
    setCollapsedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col h-full border-r border-brand-panel/60 bg-brand-surface/30">
      {/* Search + action icons */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-brand-panel/40 flex-shrink-0">
        <Search size={11} className="text-zinc-600 flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="flex-1 bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none min-w-0"
        />
        {query
          ? <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0"><X size={10} /></button>
          : <>
              <button
                onClick={onCreate}
                title="New note"
                className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0 p-0.5"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openFolderPopover({ x: r.left, y: r.bottom + 6 }) }}
                title="New folder"
                className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0 p-0.5"
              >
                <FolderPlus size={13} />
              </button>
            </>
        }
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-3">
            <p className="text-[11px] text-zinc-600 text-center">No notes yet</p>
          </div>
        ) : (
          <>
            {unfiledNotes.map(note => {
              const nc = noteColorMap[note.id] ?? noteColorFromId(note.id)
              const isActive = note.id === activeNoteId
              if (renamingNoteId === note.id) return (
                <div key={note.id} className="px-3 py-1.5 border-l-2 border-transparent">
                  <input
                    ref={renamingNoteRef}
                    value={renamingNoteName}
                    onChange={(e) => setRenamingNoteName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { void commitRenameNote() } if (e.key === 'Escape') setRenamingNoteId(null) }}
                    onBlur={() => { void commitRenameNote() }}
                    className="w-full bg-brand-panel border border-brand-panel/60 rounded px-2 py-0.5 text-xs text-zinc-200 outline-none focus:border-brand-muted/50"
                  />
                </div>
              )
              return (
                <button
                  key={note.id}
                  draggable
                  onDragStart={() => { setDragNoteId(note.id); onNoteDragStart?.(note.id) }}
                  onDragEnd={() => { setDragNoteId(null); setDragOverFolderId(null); onNoteDragEnd?.() }}
                  onClick={() => onActivate(note.id)}
                  onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
                  style={isActive ? { background: `linear-gradient(to right, ${nc}22, transparent)`, borderLeftColor: nc } : undefined}
                  className={cn('w-full text-left py-1.5 px-3 border-l-2 transition-colors', isActive ? '' : 'border-transparent hover:bg-brand-panel/20')}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText size={10} className="flex-shrink-0 text-zinc-600" />
                    <div className="text-xs font-medium text-zinc-200 truncate leading-snug">{noteTitle(note)}</div>
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5 pl-[18px]">{formatDate(note.updatedAt)}</div>
                </button>
              )
            })}

            {sortedFolders.map(folder => {
              const folderNotes = sorted.filter(n => noteFolderMap[n.id] === folder.id && matchesQuery(n))
              if (query && folderNotes.length === 0) return null
              const isCollapsed = collapsedFolders.has(folder.id)
              const fc = folder.color ?? '#6b7280'
              return (
                <div
                  key={folder.id}
                  onDragOver={(e) => { e.preventDefault(); setDragOverFolderId(folder.id) }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Element | null)) setDragOverFolderId(null) }}
                  onDrop={(e) => { e.preventDefault(); if (dragNoteId) { void setNoteFolder(dragNoteId, folder.id); setDragNoteId(null); setDragOverFolderId(null) } }}
                  className={cn(dragOverFolderId === folder.id && 'bg-brand-panel/20')}
                >
                  <button
                    onClick={() => toggleFolder(folder.id)}
                    onContextMenu={(e) => handleContextMenu(e, 'folder', folder.id)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-brand-panel/20 transition-colors"
                  >
                    <ChevronRight size={10} className={cn('flex-shrink-0 transition-transform text-zinc-500', !isCollapsed && 'rotate-90')} />
                    {isCollapsed
                      ? <FolderClosed size={11} className="flex-shrink-0" style={{ color: fc }} />
                      : <FolderOpen size={11} className="flex-shrink-0" style={{ color: fc }} />}
                    <span className="text-xs font-semibold uppercase tracking-wider truncate flex-1" style={{ color: fc }}>
                      {folder.name}
                    </span>
                    <span
                      className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold leading-none"
                      style={{ background: `${fc}33`, color: fc }}
                    >
                      {folderNotes.length}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="ml-4 border-l border-brand-panel/40">
                      {folderNotes.map(note => {
                        const nc = noteColorMap[note.id] ?? noteColorFromId(note.id)
                        const isActive = note.id === activeNoteId
                        if (renamingNoteId === note.id) return (
                          <div key={note.id} className="px-3 py-1.5 border-l-2 border-transparent">
                            <input
                              ref={renamingNoteRef}
                              value={renamingNoteName}
                              onChange={(e) => setRenamingNoteName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') { void commitRenameNote() } if (e.key === 'Escape') setRenamingNoteId(null) }}
                              onBlur={() => { void commitRenameNote() }}
                              className="w-full bg-brand-panel border border-brand-panel/60 rounded px-2 py-0.5 text-xs text-zinc-200 outline-none focus:border-brand-muted/50"
                            />
                          </div>
                        )
                        return (
                          <button
                            key={note.id}
                            draggable
                            onDragStart={() => { setDragNoteId(note.id); onNoteDragStart?.(note.id) }}
                            onDragEnd={() => { setDragNoteId(null); setDragOverFolderId(null); onNoteDragEnd?.() }}
                            onClick={() => onActivate(note.id)}
                            onContextMenu={(e) => handleContextMenu(e, 'note', note.id)}
                            style={isActive ? { background: `linear-gradient(to right, ${nc}22, transparent)`, borderLeftColor: nc } : undefined}
                            className={cn('w-full text-left py-1.5 px-3 border-l-2 transition-colors', isActive ? '' : 'border-transparent hover:bg-brand-panel/20')}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <FileText size={10} className="flex-shrink-0 text-zinc-600" />
                              <div className="text-xs font-medium text-zinc-200 truncate leading-snug">{noteTitle(note)}</div>
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-0.5 pl-[18px]">{formatDate(note.updatedAt)}</div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {query && sorted.filter(matchesQuery).length === 0 && (
              <div className="flex items-center justify-center py-6">
                <p className="text-[11px] text-zinc-600">No results</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={dismissContextMenu} onContextMenu={(e) => { e.preventDefault(); dismissContextMenu() }} />
          <div
            className="fixed z-[201] bg-brand-surface border border-brand-panel rounded shadow-xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === 'folder' ? (
              <>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
                  onClick={() => {
                    const f = noteFolders.find(f => f.id === contextMenu.id)
                    if (f) openFolderPopover({ x: contextMenu.x, y: contextMenu.y }, f)
                    setContextMenu(null)
                  }}
                >
                  <Pencil size={12} />Edit
                </button>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-brand-panel hover:text-red-300 transition-colors"
                  onClick={() => { setDeleteConfirm({ type: 'folder', id: contextMenu.id }); setContextMenu(null) }}
                >
                  <Trash2 size={12} />Delete
                </button>
              </>
            ) : (
              <>
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
                  onClick={() => { const n = notes.find(n => n.id === contextMenu.id); if (n) setEditingNote(n); setContextMenu(null) }}
                >
                  <Pencil size={12} />Edit
                </button>
                {installedEditors.length > 0 && (
                  <button
                    ref={openInTriggerRef}
                    onMouseEnter={() => {
                      clearHideTimeout()
                      const rect = openInTriggerRef.current?.getBoundingClientRect()
                      if (rect) setOpenInSubmenuY(rect.top)
                      setShowMoveSubmenu(false)
                      setShowOpenInSubmenu(true)
                    }}
                    onMouseLeave={scheduleHideSubmenu}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
                  >
                    <span className="flex items-center gap-2.5"><ExternalLink size={12} />Open In</span>
                    <ChevronRight size={10} className="text-zinc-600" />
                  </button>
                )}
                <div className="my-1 border-t border-brand-panel/60" />
                <button
                  ref={moveTriggerRef}
                  onMouseEnter={() => {
                    clearHideTimeout()
                    const rect = moveTriggerRef.current?.getBoundingClientRect()
                    if (rect) setSubmenuY(rect.top)
                    setShowMoveSubmenu(true)
                  }}
                  onMouseLeave={scheduleHideSubmenu}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
                >
                  <span className="flex items-center gap-2.5"><ArrowRightLeft size={12} />Move to Window</span>
                  <ChevronRight size={10} className="text-zinc-600" />
                </button>
                <div className="my-1 border-t border-brand-panel/60" />
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-brand-panel hover:text-red-300 transition-colors"
                  onClick={() => { setDeleteConfirm({ type: 'note', id: contextMenu.id }); setContextMenu(null) }}
                >
                  <Trash2 size={12} />Delete
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Open-in-editor submenu */}
      {showOpenInSubmenu && contextMenu?.type === 'note' && installedEditors.length > 0 && (
        <div
          className="fixed z-[202] bg-brand-surface border border-brand-panel rounded shadow-xl py-1 min-w-[140px]"
          style={{ left: getSubmenuX(), top: openInSubmenuY }}
          onMouseEnter={clearHideTimeout}
          onMouseLeave={scheduleHideSubmenu}
        >
          {installedEditors.map(ed => (
            <button
              key={ed.command}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors"
              onClick={() => { openNoteInEditor(ed.command, contextMenu.id); dismissContextMenu() }}
            >
              {ed.name}
            </button>
          ))}
        </div>
      )}

      {/* Move-to-window submenu */}
      {showMoveSubmenu && contextMenu?.type === 'note' && (isMainWindow || otherWindows.length > 0) && (
        <WindowMoveSubmenu
          style={{ left: getSubmenuX(), top: submenuY }}
          windows={otherWindows}
          onSelect={(windowId) => { removeNotePaneFromLayout(contextMenu.id, 'notes'); void moveNotePaneToWindow(contextMenu.id, 'notes', windowId); dismissContextMenu() }}
          onMouseEnter={clearHideTimeout}
          onMouseLeave={scheduleHideSubmenu}
          onNewWindow={isMainWindow ? () => { removeNotePaneFromLayout(contextMenu.id, 'notes'); addDetachedNoteId(contextMenu.id); void detachNotePane(contextMenu.id, 'notes'); dismissContextMenu() } : undefined}
        />
      )}

      {/* Folder popover — create or edit */}
      {folderPopover && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => { void commitFolderPopover() }} />
          <div
            className="fixed z-[201] bg-brand-surface border border-brand-panel/80 rounded-lg shadow-2xl p-3 flex flex-col gap-3"
            style={{ left: folderPopover.x, top: folderPopover.y, width: 208 }}
          >
            <input
              autoFocus
              value={folderPopover.name}
              onChange={(e) => setFolderPopover(p => p ? { ...p, name: e.target.value } : null)}
              onKeyDown={(e) => { if (e.key === 'Enter') { void commitFolderPopover() } if (e.key === 'Escape') setFolderPopover(null) }}
              placeholder="Folder name"
              className="bg-brand-panel border border-brand-panel/60 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-brand-muted/40 w-full"
            />
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setFolderPopover(p => p ? { ...p, color } : null) }}
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex-shrink-0 transition-transform hover:scale-110',
                    folderPopover.color === color ? 'border-zinc-200 scale-110' : 'border-transparent'
                  )}
                  style={{ background: color }}
                />
              ))}
            </div>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setFolderPopover(null)}
                className="px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); void commitFolderPopover() }}
                className="px-2.5 py-1 text-[11px] rounded transition-colors"
                style={{ background: `${folderPopover.color}22`, color: folderPopover.color, border: `1px solid ${folderPopover.color}44` }}
              >
                {folderPopover.id ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </>
      )}

      {editingNote && (
        <EditNoteModal
          note={editingNote}
          folders={noteFolders}
          currentFolderId={noteFolderMap[editingNote.id] ?? null}
          currentColor={noteColorMap[editingNote.id] ?? null}
          onDismiss={() => setEditingNote(null)}
          onSave={async (name, color, folderId) => {
            const lines = editingNote.content.split('\n')
            lines[0] = name
            await saveNote(editingNote.id, lines.join('\n'))
            await setNoteColor(editingNote.id, color)
            await setNoteFolder(editingNote.id, folderId)
            setEditingNote(null)
          }}
        />
      )}

      {deleteConfirm && (() => {
        const isFolder = deleteConfirm.type === 'folder'
        const folder = noteFolders.find(f => f.id === deleteConfirm.id)
        const note = notes.find(n => n.id === deleteConfirm.id)
        const label = isFolder ? (folder?.name ?? 'this folder') : noteTitle(note ?? { id: '', content: '', updatedAt: 0 })
        const subtext = isFolder ? 'Notes inside will become unfiled.' : 'This cannot be undone.'
        const confirmLabel = isFolder ? 'Delete Folder' : 'Delete Note'
        const onConfirm = (): void => {
          if (isFolder) void deleteNoteFolder(deleteConfirm.id)
          else void deleteNote(deleteConfirm.id)
          setDeleteConfirm(null)
        }
        return createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}
          >
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative bg-brand-surface border border-brand-panel/60 rounded-lg shadow-2xl w-80 p-5 flex flex-col gap-4">
              <span className="text-sm font-semibold text-zinc-200">Confirm Delete</span>
              <p className="text-xs text-zinc-400">
                Delete <span className="text-zinc-200 font-medium">{label}</span>? {subtext}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded border border-brand-panel hover:border-zinc-600"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 hover:text-red-300 transition-colors rounded"
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
