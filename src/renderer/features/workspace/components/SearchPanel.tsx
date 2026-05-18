import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, X, CaseSensitive, ChevronRight, ChevronDown } from 'lucide-react'
import { searchInFiles } from '../../fs/fs.service'
import { FileIcon } from '../../fs/components/FileTree'
import { cn } from '../../../lib/utils'
import type { SearchResult } from '../../fs/fs.service'

interface Props {
  projectRoot: string
  onResultClick: (filePath: string, lineNumber: number) => void
}

interface FileGroup {
  filePath: string
  fileName: string
  relPath: string
  results: SearchResult[]
}

export function SearchPanel({ projectRoot, onResultClick }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState('')
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => { inputRef.current?.focus() }, [])

  const runSearch = useCallback((q: string, cs: boolean) => {
    if (!q.trim() || !projectRoot) { setResults([]); setSearchedQuery(''); return }
    setLoading(true)
    searchInFiles(projectRoot, q, cs)
      .then((r) => { setResults(r); setSearchedQuery(q); setCollapsedFiles(new Set()) })
      .catch(() => { setResults([]) })
      .finally(() => setLoading(false))
  }, [projectRoot])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); setSearchedQuery(''); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => runSearch(query, caseSensitive), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, caseSensitive, runSearch])

  const groups = useMemo<FileGroup[]>(() => {
    const map = new Map<string, SearchResult[]>()
    for (const r of results) {
      const existing = map.get(r.filePath) ?? []
      existing.push(r)
      map.set(r.filePath, existing)
    }
    const norm = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
    return Array.from(map.entries()).map(([filePath, rs]) => ({
      filePath,
      fileName: filePath.split('/').pop() ?? filePath,
      relPath: filePath.startsWith(norm) ? filePath.slice(norm.length + 1) : filePath,
      results: rs,
    }))
  }, [results, projectRoot])

  const toggleFile = (filePath: string): void =>
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })

  const highlightLine = (line: string, start: number, end: number): JSX.Element => {
    const before = line.slice(0, start)
    const match = line.slice(start, end)
    const after = line.slice(end)
    return (
      <span>
        <span className="text-zinc-400">{before}</span>
        <span className="bg-yellow-500/30 text-yellow-200">{match}</span>
        <span className="text-zinc-400">{after}</span>
      </span>
    )
  }

  const capped = results.length >= 500

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search input */}
      <div className="flex-shrink-0 px-2 py-1.5 border-b border-brand-panel/40">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-brand-panel/40 border border-brand-panel/60 rounded">
          <Search size={11} className="text-zinc-600 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            placeholder="Search in files…"
            className="flex-1 bg-transparent text-[11px] text-zinc-300 placeholder:text-zinc-600 outline-none min-w-0"
          />
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            title="Case sensitive"
            className={cn('flex-shrink-0 p-0.5 rounded transition-colors', caseSensitive ? 'text-brand-accent bg-brand-accent/10' : 'text-zinc-600 hover:text-zinc-400')}
          >
            <CaseSensitive size={12} />
          </button>
          {query && (
            <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-400 flex-shrink-0">
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-[11px] text-zinc-600 text-center py-4">Searching…</p>
        )}
        {!loading && searchedQuery && results.length === 0 && (
          <p className="text-[11px] text-zinc-600 text-center py-4">No results for "{searchedQuery}"</p>
        )}
        {!loading && results.length > 0 && (
          <>
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-brand-panel/20">
              <span className="text-[10px] text-zinc-600">
                {capped ? '500+ ' : `${results.length} `}
                {results.length === 1 ? 'result' : 'results'} in {groups.length} {groups.length === 1 ? 'file' : 'files'}
              </span>
            </div>
            {groups.map((group) => {
              const collapsed = collapsedFiles.has(group.filePath)
              return (
                <div key={group.filePath}>
                  <button
                    onClick={() => toggleFile(group.filePath)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-brand-panel/40 transition-colors text-left"
                  >
                    {collapsed
                      ? <ChevronRight size={11} className="text-zinc-600 flex-shrink-0" />
                      : <ChevronDown size={11} className="text-zinc-600 flex-shrink-0" />}
                    <span className="flex-shrink-0 w-3.5 flex items-center">
                      <FileIcon name={group.fileName} />
                    </span>
                    <span className="text-[11px] text-zinc-300 truncate flex-1">{group.fileName}</span>
                    <span className="text-[10px] text-zinc-600 flex-shrink-0 ml-1">{group.results.length}</span>
                  </button>
                  {!collapsed && group.results.map((r) => (
                    <button
                      key={`${r.filePath}:${r.lineNumber}:${r.matchStart}`}
                      onClick={() => onResultClick(r.filePath, r.lineNumber)}
                      className="w-full flex items-start gap-2 pl-7 pr-3 py-0.5 hover:bg-brand-panel/40 transition-colors text-left group"
                    >
                      <span className="text-[10px] text-zinc-600 flex-shrink-0 w-6 text-right tabular-nums leading-[18px]">{r.lineNumber}</span>
                      <span className="text-[11px] leading-[18px] truncate font-mono min-w-0 flex-1">
                        {highlightLine(r.lineContent, r.matchStart, r.matchEnd)}
                      </span>
                    </button>
                  ))}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
