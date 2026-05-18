import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useStore } from '../../../store/root.store'
import { useFilePane, EXT_LANG } from '../hooks/useFilePane'
import { MarkdownPane } from './MarkdownPane'
import { EmptyState } from '../../../components/EmptyState'
import { cn } from '../../../lib/utils'
import type { BundledTheme } from 'shiki'
import type { FilePaneTab } from '../hooks/useFilePane'

interface OpenFile {
  path: string
  root: string
  hasChanges: boolean
}

interface Props {
  files: OpenFile[]
  activeFilePath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
  tab: FilePaneTab
  onTabChange: (t: FilePaneTab) => void
}

export const VIEWER_THEMES: { id: BundledTheme; label: string; mode: 'light' | 'dark' }[] = [
  { id: 'vitesse-dark', label: 'Vitesse Dark', mode: 'dark' },
  { id: 'github-dark', label: 'GitHub Dark', mode: 'dark' },
  { id: 'one-dark-pro', label: 'One Dark Pro', mode: 'dark' },
  { id: 'dracula', label: 'Dracula', mode: 'dark' },
  { id: 'nord', label: 'Nord', mode: 'dark' },
  { id: 'tokyo-night', label: 'Tokyo Night', mode: 'dark' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', mode: 'dark' },
  { id: 'ayu-dark', label: 'Ayu Dark', mode: 'dark' },
  { id: 'github-light', label: 'GitHub Light', mode: 'light' },
  { id: 'vitesse-light', label: 'Vitesse Light', mode: 'light' },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', mode: 'light' },
  { id: 'solarized-light', label: 'Solarized Light', mode: 'light' },
  { id: 'one-light', label: 'One Light', mode: 'light' },
]

function classifyDiffLine(line: string): 'add' | 'remove' | 'hunk' | 'meta' | 'context' {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'remove'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('+++') || line.startsWith('---')) return 'meta'
  return 'context'
}

interface PaneProps {
  file: OpenFile
  theme: BundledTheme
  tab: FilePaneTab
  onTabChange: (t: FilePaneTab) => void
}

function FilePane({ file, theme, tab, onTabChange }: PaneProps): JSX.Element {
  const allThemes = VIEWER_THEMES.map((t) => t.id)
  const { html, diff, loading, ctxMenu, setCtxMenu, handleContextMenu, handleCopy } = useFilePane(file, theme, allThemes, tab, onTabChange)

  const diffLines = (diff ?? '').split('\n')

  const hunkIndices = useMemo(() => {
    const indices: number[] = []
    diffLines.forEach((line, i) => { if (line.startsWith('@@')) indices.push(i) })
    return indices
  }, [diff])

  const [currentHunk, setCurrentHunk] = useState(0)
  const hunkEls = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => { setCurrentHunk(0) }, [file.path])
  useEffect(() => { hunkEls.current = hunkEls.current.slice(0, hunkIndices.length) }, [hunkIndices.length])

  const goToHunk = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, hunkIndices.length - 1))
    setCurrentHunk(clamped)
    hunkEls.current[clamped]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [hunkIndices.length])

  let hunkCounter = -1

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {tab === 'preview' && <MarkdownPane filePath={file.path} />}

      {tab !== 'preview' && (
        <>
          {tab === 'diff' && hunkIndices.length > 0 && (
            <div className="flex items-center gap-2 px-3 h-7 border-b border-brand-panel/60 flex-shrink-0 bg-brand-surface">
              <span className="text-[10px] text-zinc-500 flex-1">
                Hunk <span className="text-zinc-300">{currentHunk + 1}</span> of <span className="text-zinc-300">{hunkIndices.length}</span>
                <span className="text-zinc-600 ml-2">· [ / ] to navigate</span>
              </span>
              <button
                onClick={() => goToHunk(currentHunk - 1)}
                disabled={currentHunk === 0}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Previous hunk"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => goToHunk(currentHunk + 1)}
                disabled={currentHunk >= hunkIndices.length - 1}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Next hunk"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}

          {ctxMenu && (
            <div
              className="fixed z-50 bg-brand-panel border border-white/10 rounded shadow-2xl shadow-black/60 py-1 min-w-[120px]"
              style={{ top: ctxMenu.y, left: ctxMenu.x }}
              onMouseLeave={() => setCtxMenu(null)}
            >
              <button onClick={handleCopy} className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors">
                Copy
              </button>
            </div>
          )}

          <div
            className="file-content flex-1 overflow-auto font-mono text-sm leading-5 select-text cursor-text outline-none"
            tabIndex={tab === 'diff' ? 0 : undefined}
            onContextMenu={handleContextMenu}
            onKeyDown={tab === 'diff' && hunkIndices.length > 0 ? (e) => {
              if (e.key === '[') { e.preventDefault(); goToHunk(currentHunk - 1) }
              if (e.key === ']') { e.preventDefault(); goToHunk(currentHunk + 1) }
            } : undefined}
          >
            {loading && <p className="text-zinc-500 px-4 py-3 text-xs">Loading…</p>}

            {!loading && tab === 'content' && html !== null && html !== '' && (
              <div className="shiki-wrap" dangerouslySetInnerHTML={{ __html: html }} />
            )}
            {!loading && tab === 'content' && html === '' && (
              <p className="text-zinc-500 px-4 py-3 text-xs">Empty file.</p>
            )}
            {!loading && tab === 'content' && html === null && (
              <p className="text-zinc-500 px-4 py-3 text-xs">Unable to load file.</p>
            )}

            {!loading && tab === 'diff' && (
              diffLines.length === 0 || (diffLines.length === 1 && !diffLines[0])
                ? <p className="text-zinc-500 px-4 py-3 text-xs">No diff available.</p>
                : diffLines.map((line, i) => {
                    const type = classifyDiffLine(line)
                    let hunkRef: ((el: HTMLDivElement | null) => void) | undefined
                    if (type === 'hunk') {
                      hunkCounter++
                      const idx = hunkCounter
                      hunkRef = (el) => { hunkEls.current[idx] = el }
                    }
                    return (
                      <div
                        key={i}
                        ref={hunkRef}
                        className={cn('px-4 whitespace-pre',
                          type === 'add' && 'bg-green-950/50 text-green-300',
                          type === 'remove' && 'bg-red-950/50 text-red-300',
                          type === 'hunk' && 'text-brand-muted bg-brand-panel/20',
                          type === 'meta' && 'text-zinc-500',
                          type === 'context' && 'text-zinc-400',
                        )}
                      >{line || ' '}</div>
                    )
                  })
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function FileViewer({ files, activeFilePath, tab, onTabChange }: Props): JSX.Element | null {
  const settings = useStore((s) => s.settings)

  if (files.length === 0) {
    return <div className="flex flex-col bg-brand-bg flex-1 min-h-0 relative"><EmptyState /></div>
  }

  const activeFile = files.find((f) => f.path === activeFilePath) ?? files[0]
  const isDark = document.documentElement.classList.contains('dark')
  const savedTheme = VIEWER_THEMES.find((t) => t.id === settings.fileViewerTheme)
  const currentTheme = (savedTheme?.mode === (isDark ? 'dark' : 'light')
    ? settings.fileViewerTheme
    : isDark ? 'vitesse-dark' : 'github-light') as BundledTheme

  return (
    <div className="flex flex-col bg-brand-bg flex-1 min-h-0">
      <FilePane key={activeFile.path} file={activeFile} theme={currentTheme} tab={tab} onTabChange={onTabChange} />
    </div>
  )
}
