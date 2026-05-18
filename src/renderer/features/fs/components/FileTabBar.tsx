import { useState, useCallback, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { TabBarContextMenu } from '../../../components/TabBarContextMenu'
import { useStore } from '../../../store/root.store'
import type { OpenFile } from '../../session/hooks/useFileTabs'

interface CtxTarget {
  x: number
  y: number
  path: string
}

interface Props {
  openFiles: OpenFile[]
  activeFilePath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
}

function shortName(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

function rootName(r: string): string {
  return r.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? r
}

function shortPath(filePath: string, root: string | null): string {
  const norm = filePath.replace(/\\/g, '/')
  const base = norm.substring(0, norm.lastIndexOf('/')) // parent dir
  if (root) {
    const normRoot = root.replace(/\\/g, '/')
    const rel = base.startsWith(normRoot) ? base.slice(normRoot.length).replace(/^\//, '') : base
    return rel || rootName(root)
  }
  const parts = base.split('/').filter(Boolean)
  return parts.slice(-2).join('/')
}

export const PROJECT_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#06b6d4', '#eab308', '#84cc16']

export function projectColorIndex(root: string, openProjects: string[]): number {
  const norm = root.replace(/\\/g, '/')
  const idx = openProjects.findIndex((p) => p.replace(/\\/g, '/') === norm)
  return idx >= 0 ? idx % PROJECT_COLORS.length : 0
}

function deriveRoot(filePath: string, openProjects: string[]): string | null {
  const norm = filePath.replace(/\\/g, '/')
  return openProjects.find((p) => norm.startsWith(p.replace(/\\/g, '/'))) ?? null
}

export function FileTabBar({ openFiles, activeFilePath, onActivate, onClose }: Props): JSX.Element {
  const openProjects = useStore((s) => s.settings.openProjects)
  const [ctx, setCtx] = useState<CtxTarget | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      el.scrollLeft += e.deltaY + e.deltaX
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault()
    setCtx({ x: e.clientX, y: e.clientY, path })
  }, [])

  const handleClosePaths = useCallback((paths: string[]) => {
    paths.forEach((p) => onClose(p))
  }, [onClose])

  const paths = openFiles.map((f) => f.path)

  const roots = openFiles.map((f) => deriveRoot(f.path, openProjects))

  if (openFiles.length === 0) {
    return <span className="text-xs text-zinc-600 px-3">No files open</span>
  }

  return (
    <>
      <div ref={scrollRef} className="flex items-center h-full overflow-x-scroll flex-1 min-w-0">
        {openFiles.map((f, i) => {
          const isActive = f.path === activeFilePath
          const root = roots[i]
          const colorIdx = root ? projectColorIndex(root, openProjects) : 0
          const color = PROJECT_COLORS[colorIdx]
          return (
            <div
              key={f.path}
              onClick={() => onActivate(f.path)}
              onContextMenu={(e) => handleContextMenu(e, f.path)}
              title={f.path}
              style={{
                WebkitAppRegion: 'no-drag',
                background: `linear-gradient(to right, ${color}${isActive ? '2e' : '12'}, transparent)`,
              } as React.CSSProperties}
              className={cn(
                'relative flex items-center gap-2 px-4 h-full border-r border-brand-panel cursor-pointer flex-shrink-0 min-w-[120px] max-w-[200px] group transition-all',
                isActive ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {/* Active bottom indicator */}
              {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ backgroundColor: color }} />}
              {f.hasChanges && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium truncate leading-snug">{shortName(f.path)}</span>
                <span className="text-[10px] truncate leading-tight text-zinc-600">{shortPath(f.path, root)}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onClose(f.path) }}
                className={cn(
                  'flex-shrink-0 transition-colors hover:text-zinc-100',
                  isActive ? 'text-zinc-400' : 'text-zinc-700 opacity-0 group-hover:opacity-100'
                )}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>

      {ctx && (
        <TabBarContextMenu
          x={ctx.x}
          y={ctx.y}
          tabId={ctx.path}
          tabOrder={paths}
          onClose={handleClosePaths}
          onDismiss={() => setCtx(null)}
        />
      )}
    </>
  )
}
