import { Loader2 } from 'lucide-react'
import { useLayoutDnd } from '../../layout/dnd/LayoutDndContext'
import { SESSION_COLORS } from '../../session/session.service'
import { cn, shortPath } from '../../../lib/utils'
import type { SessionMeta } from '@shared/ipc-types'

export interface SessionRowProps {
  meta: SessionMeta
  activeSessionId: string | null
  isNoWorkspace: boolean
  dragging: boolean
  onSelectSession: (id: string) => void
  onEditMeta: (meta: SessionMeta) => void
  onCtxMenu: (v: { x: number; y: number; meta: SessionMeta }) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  paneCount?: number
}

export function SessionRow({ meta, activeSessionId, isNoWorkspace, dragging, onSelectSession, onEditMeta, onCtxMenu, onDragStart, onDragEnd, paneCount }: SessionRowProps): JSX.Element {
  const { startDrag, endDrag } = useLayoutDnd()
  const isSelected = activeSessionId === meta.sessionId
  const isRunning = meta.status === 'running'
  const agentStatus = meta.agentStatus ?? 'idle'
  const sessionColor = meta.color ?? SESSION_COLORS[0]
  const subtext = shortPath(meta.cwd)

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(meta.sessionId)
        startDrag({ type: 'sidebar-session', sessionId: meta.sessionId })
      }}
      onDragEnd={() => { onDragEnd(); endDrag() }}
      onClick={() => onSelectSession(meta.sessionId)}
      onDoubleClick={(e) => { e.stopPropagation(); onEditMeta(meta) }}
      onContextMenu={(e) => { e.preventDefault(); onCtxMenu({ x: e.clientX, y: e.clientY, meta }) }}
      className={cn('w-full flex flex-col gap-0.5 px-3 py-2 transition-all border-l-2 text-left', dragging && 'opacity-40')}
      style={{ borderLeftColor: isSelected ? sessionColor : 'transparent', background: `linear-gradient(to right, ${sessionColor}${isSelected ? '2e' : '12'}, transparent)` }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isRunning && agentStatus === 'running' ? (
          <Loader2 size={11} className="flex-shrink-0 animate-spin" style={{ color: sessionColor }} />
        ) : isRunning && agentStatus === 'waiting-input' ? (
          <span className="w-2.5 h-2.5 flex-shrink-0 animate-pulse" style={{ backgroundColor: sessionColor, borderRadius: '3px' }} />
        ) : (
          <span className="w-2.5 h-2.5 flex-shrink-0" style={{ backgroundColor: isRunning ? sessionColor : '#52525b', borderRadius: '3px' }} />
        )}
        <span className={cn('text-xs font-medium truncate flex-1 min-w-0', isSelected ? 'text-zinc-100' : 'text-zinc-500')}>{meta.name}</span>
        {paneCount && paneCount > 1 && (
          <span
            className="text-[10px] font-semibold rounded px-1.5 py-0.5 flex-shrink-0 leading-none tabular-nums"
            style={{ backgroundColor: `${sessionColor}28`, color: sessionColor }}
          >
            {paneCount}
          </span>
        )}
      </div>
      <div className={cn('pl-3.5 text-[10px] truncate font-mono', isSelected ? 'text-zinc-400' : 'text-zinc-600')}>{subtext}</div>
    </button>
  )
}
