import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, FileText, FolderOpen, FilePlus2, FolderPlus } from 'lucide-react'
import { findFiles, copyFile } from '../fs.service'
import { FileTree } from './FileTree'
import { useStore } from '../../../store/root.store'
import { makeFileEditorLeaf, findLeafById } from '../../layout/layout-tree'
import { cn, normalizePath } from '../../../lib/utils'

interface Props {
  open: boolean
  rootPath: string
  onClose: () => void
}

function fuzzyMatch(str: string, query: string): boolean {
  const s = str.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) qi++
  }
  return qi === q.length
}

const IGNORE_SEGMENTS = new Set(['node_modules', '.git', 'dist', '.next', 'out', 'build', '__pycache__', '.venv'])

function isIgnored(p: string): boolean {
  return p.split('/').some((seg) => IGNORE_SEGMENTS.has(seg))
}

export function FileFinderModal({ open, rootPath, onClose }: Props): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [allFiles, setAllFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [refreshTick, setRefreshTick] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), [])

  const handleNewFile = useCallback(() => {
    document.dispatchEvent(new CustomEvent('acc:new-file-at-root', { detail: { parentDir: rootPath, type: 'file' } }))
  }, [rootPath])

  const handleNewFolder = useCallback(() => {
    document.dispatchEvent(new CustomEvent('acc:new-file-at-root', { detail: { parentDir: rootPath, type: 'folder' } }))
  }, [rootPath])

  const handleDropOnModal = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (!rootPath) return
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    const normalized = normalizePath(rootPath)
    await Promise.all(
      files.map(async (file) => {
        const src = (file as unknown as { path: string }).path
        if (!src) return
        const dest = normalized.replace(/\/$/, '') + '/' + file.name
        try { await copyFile(src, dest) } catch {}
      })
    )
    refresh()
  }, [rootPath, refresh])

  const normalizedRoot = normalizePath(rootPath)
  const prefix = normalizedRoot.endsWith('/') ? normalizedRoot : normalizedRoot + '/'
  const folderName = normalizedRoot.split('/').pop() ?? 'Project'

  useEffect(() => {
    if (!open) { setQuery(''); setSelectedIdx(0); setAllFiles([]); return }
    if (!rootPath) return
    setLoading(true)
    findFiles(rootPath)
      .then((files) => setAllFiles(files.filter((f) => !isIgnored(normalizePath(f)))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, rootPath])

  useEffect(() => setSelectedIdx(0), [query])

  const filtered = query
    ? allFiles
        .filter((f) => fuzzyMatch(normalizePath(f).replace(prefix, ''), query))
        .slice(0, 80)
    : []

  const openFile = useCallback((filePath: string) => {
    const state = useStore.getState()
    const tabId = state.activeSessionId
    if (!tabId || tabId === '__root__') return
    const currentTree = state.paneTree[tabId]
    if (!currentTree) return

    const sendToPane = (leafId: string): void => {
      document.dispatchEvent(new CustomEvent('acc:open-file-in-pane', { detail: { leafId, filePath } }))
    }

    if (state.focusedLeafId) {
      const focused = findLeafById(currentTree, state.focusedLeafId)
      if (focused?.type === 'leaf' && focused.panel === 'file-editor') { sendToPane(state.focusedLeafId); return }
    }
    if (currentTree.type === 'leaf' && currentTree.panel === 'file-editor') { sendToPane(currentTree.id); return }
    if (currentTree.type === 'leaf' && currentTree.panel === 'home') {
      state.replaceLayoutLeaf(tabId, currentTree.id, makeFileEditorLeaf(filePath)); return
    }
    state.insertLayoutAtRight(tabId, makeFileEditorLeaf(filePath))
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!open) return
    if (e.key === 'Escape') { onClose(); return }

    // New file / folder shortcuts (Alt+N / Alt+D) work whenever tree is open
    if (e.altKey && e.key === 'n' && rootPath) { e.preventDefault(); handleNewFile(); return }
    if (e.altKey && e.key === 'd' && rootPath) { e.preventDefault(); handleNewFolder(); return }

    if (!query) {
      // Only bridge to tree when the search input itself has focus.
      // If the user has moved focus away, FileTree's own keydown handler takes over directly.
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key) &&
          document.activeElement === inputRef.current) {
        e.preventDefault()
        e.stopPropagation()
        document.dispatchEvent(new CustomEvent('acc:tree-navigate', { detail: { key: e.key } }))
      }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[selectedIdx]) { e.preventDefault(); openFile(filtered[selectedIdx]) }
  }, [open, query, filtered, selectedIdx, onClose, openFile, rootPath, handleNewFile, handleNewFolder])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [handleKeyDown])

  // Close modal when a file drag starts so the layout drop targets become accessible
  useEffect(() => {
    if (!open) return
    const handler = (): void => onClose()
    document.addEventListener('acc:file-drag-start', handler)
    return () => document.removeEventListener('acc:file-drag-start', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onMouseDown={() => onClose()}
    >
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 top-[6vh] w-[600px] flex flex-col bg-brand-surface border rounded-xl shadow-2xl overflow-hidden',
          isDragOver ? 'border-brand-accent/60' : 'border-brand-panel/80'
        )}
        style={{ maxHeight: '85vh' }}
        onMouseDown={(e) => e.stopPropagation()}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDragOver(true) } }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDropOnModal}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-brand-panel min-w-0">
          <FolderOpen size={13} className="text-yellow-500/70 flex-shrink-0" />
          <span className="text-xs font-semibold text-zinc-300 truncate flex-1">{folderName}</span>
          {rootPath && (
            <>
              <button
                onClick={handleNewFile}
                title="New File (Alt+N)"
                className="flex items-center gap-1 px-1.5 py-0.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded flex-shrink-0 group"
              >
                <FilePlus2 size={12} />
                <span className="text-[10px] hidden group-hover:inline">Alt+N</span>
              </button>
              <button
                onClick={handleNewFolder}
                title="New Folder (Alt+D)"
                className="flex items-center gap-1 px-1.5 py-0.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded flex-shrink-0 group"
              >
                <FolderPlus size={12} />
                <span className="text-[10px] hidden group-hover:inline">Alt+D</span>
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="p-0.5 text-zinc-600 hover:text-zinc-300 transition-colors rounded flex-shrink-0"
          >
            <X size={13} />
          </button>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 border-b border-brand-panel/60">
          <Search size={13} className="text-zinc-500 flex-shrink-0" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Fuzzy search files…"
            className="bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none flex-1"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto relative">
          {!rootPath ? (
            <p className="text-xs text-zinc-600 text-center py-8">Open a project first</p>
          ) : query ? (
            /* Fuzzy results */
            <>
              {loading && <p className="text-xs text-zinc-600 text-center py-8">Loading…</p>}
              {!loading && filtered.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-8">No files match</p>
              )}
              {filtered.map((file, idx) => {
                const rel = normalizePath(file).replace(prefix, '')
                const parts = rel.split('/')
                const name = parts.pop() ?? rel
                const dir = parts.join('/')
                return (
                  <button
                    key={file}
                    onClick={() => openFile(file)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                      idx === selectedIdx ? 'bg-brand-accent/20 text-zinc-100' : 'text-zinc-300 hover:bg-brand-panel/60'
                    )}
                  >
                    <FileText size={12} className="text-zinc-500 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-xs">
                      {name}
                      {dir && <span className="text-zinc-600 ml-1.5">{dir}</span>}
                    </span>
                  </button>
                )
              })}
            </>
          ) : (
            /* Full tree */
            <>
              <FileTree
                projectRoot={rootPath}
                onFileClick={(path) => openFile(path)}
                refreshTick={refreshTick}
              />
              {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center bg-brand-bg/60 pointer-events-none rounded-xl">
                  <p className="text-xs text-brand-accent font-medium">Drop to copy into project</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
