import { useState, useCallback } from 'react'
import { ChevronRight, Folder } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '../../../components/ui/popover'
import { useStore } from '../../../store/root.store'
import { writeToSession } from '../../session/session.service'
import { readDir } from '../../fs/fs.service'
import { cn } from '../../../lib/utils'
import type { FsEntry } from '@shared/ipc-types'

interface Crumb { label: string; path: string }

function parseBreadcrumbs(cwd: string): Crumb[] {
  const normalized = cwd.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  const segments: Crumb[] = []
  let accumulated = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (i === 0 && part.endsWith(':')) {
      accumulated = part + '/'
    } else {
      accumulated = (accumulated.endsWith('/') ? accumulated : accumulated + '/') + part
    }
    segments.push({ label: part, path: accumulated })
  }
  return segments
}

export function TerminalBreadcrumbs({ sessionId }: { sessionId: string }): JSX.Element | null {
  const cwd = useStore((s) => s.sessions[sessionId]?.cwd ?? '')
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [entriesMap, setEntriesMap] = useState<Record<string, FsEntry[]>>({})
  const [loadingPath, setLoadingPath] = useState<string | null>(null)

  const handleOpenChange = useCallback(async (crumb: Crumb, open: boolean) => {
    if (!open) { setOpenPath(null); return }
    setOpenPath(crumb.path)
    if (entriesMap[crumb.path] !== undefined) return
    setLoadingPath(crumb.path)
    try {
      const all = await readDir(crumb.path)
      setEntriesMap((prev) => ({ ...prev, [crumb.path]: all.filter((f) => f.isDirectory).sort((a, b) => a.name.localeCompare(b.name)) }))
    } catch {
      setEntriesMap((prev) => ({ ...prev, [crumb.path]: [] }))
    } finally {
      setLoadingPath(null)
    }
  }, [entriesMap])

  if (!cwd) return null

  const breadcrumbs = parseBreadcrumbs(cwd)
  const showEllipsis = breadcrumbs.length > 3
  const visibleCrumbs = showEllipsis ? [breadcrumbs[0], ...breadcrumbs.slice(-2)] : breadcrumbs

  const navigateTo = (path: string): void => {
    writeToSession({ sessionId, data: `cd "${path}"\r` })
    setOpenPath(null)
  }

  return (
    <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-brand-bg border-t border-brand-panel/30 overflow-hidden">
      {visibleCrumbs.flatMap((crumb, i) => {
        const els: JSX.Element[] = []
        if (i > 0) {
          if (i === 1 && showEllipsis) {
            els.push(
              <ChevronRight key="sep-ell" size={12} className="text-zinc-700 flex-shrink-0" />,
              <span key="ell" className="text-xs text-zinc-600 px-1 flex-shrink-0 select-none">…</span>,
            )
          }
          els.push(<ChevronRight key={`sep-${i}`} size={12} className="text-zinc-700 flex-shrink-0" />)
        }

        const isOpen = openPath === crumb.path
        const loading = loadingPath === crumb.path
        const entries = entriesMap[crumb.path] ?? []
        const idx = breadcrumbs.findIndex((b) => b.path === crumb.path)
        const currentChildLabel = idx >= 0 && idx + 1 < breadcrumbs.length ? breadcrumbs[idx + 1].label : null

        els.push(
          <Popover key={crumb.path} open={isOpen} onOpenChange={(open) => void handleOpenChange(crumb, open)}>
            <PopoverTrigger asChild>
              <button
                title={crumb.path}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-md border shadow-sm transition-colors flex-shrink-0 max-w-[200px] truncate font-medium',
                  isOpen
                    ? 'text-zinc-100 bg-brand-panel border-brand-panel'
                    : 'text-zinc-300 bg-brand-panel border-brand-panel/80 hover:text-zinc-100 hover:bg-brand-panel/80'
                )}
              >
                {crumb.label}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start">
              {loading && <p className="px-3 py-1.5 text-xs text-zinc-500">Loading…</p>}
              {!loading && entries.length === 0 && <p className="px-3 py-1.5 text-xs text-zinc-600">No subfolders</p>}
              {entries.map((entry) => {
                const base = crumb.path
                const fullPath = base.endsWith('/') ? base + entry.name : base + '/' + entry.name
                const isCurrent = entry.name.toLowerCase() === currentChildLabel?.toLowerCase()
                return (
                  <button
                    key={entry.name}
                    onMouseDown={() => navigateTo(fullPath)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors text-left',
                      isCurrent
                        ? 'text-brand-accent bg-brand-panel/40 hover:bg-brand-panel'
                        : 'text-zinc-400 hover:bg-brand-panel hover:text-zinc-100'
                    )}
                  >
                    <Folder size={12} className="flex-shrink-0 text-zinc-500" />
                    {entry.name}
                  </button>
                )
              })}
            </PopoverContent>
          </Popover>
        )
        return els
      })}
    </div>
  )
}
