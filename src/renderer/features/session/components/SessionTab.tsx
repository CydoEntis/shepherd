import { useState } from 'react'
import { X, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../../lib/utils'
import type { SessionMeta } from '@shared/ipc-types'
import { killSession, patchSession, SESSION_COLORS as TAB_COLORS } from '../session.service'
import { useStore } from '../../../store/root.store'
import { useConfirmClose } from '../hooks/useConfirmClose'
import { EditSessionModal } from './EditSessionModal'

interface Props {
  meta: SessionMeta
  isActive: boolean
  isDragOver?: boolean
  onActivate: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  onDragEnd?: () => void
}

export function SessionTab({ meta, isActive, isDragOver, onActivate, onContextMenu, onDragStart, onDragOver, onDrop, onDragEnd }: Props): JSX.Element {
  const removeTab = useStore((s) => s.removeTab)
  const upsertSession = useStore((s) => s.upsertSession)
  const [editOpen, setEditOpen] = useState(false)
  const { requestClose, modal: closeModal } = useConfirmClose()

  const color = meta.color ?? TAB_COLORS[0]
  const isExited = meta.status !== 'running'
  const agentStatus = meta.agentStatus ?? 'idle'
  const isWorking = !isExited && agentStatus === 'running'
  const isWaitingInput = !isExited && agentStatus === 'waiting-input'
  const handleClose = (e: React.MouseEvent): void => {
    e.stopPropagation()
    requestClose(async () => {
      await killSession(meta.sessionId)
      removeTab(meta.sessionId)
    })
  }

  const handleDoubleClick = (e: React.MouseEvent): void => {
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
        role="tab"
        aria-selected={isActive}
        draggable
        onClick={onActivate}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e) }}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
        onDragOver={onDragOver}
        onDrop={(e) => { e.preventDefault(); onDrop?.() }}
        onDragEnd={onDragEnd}
        className={cn(
          'flex items-center gap-1.5 h-full px-3 text-sm font-medium cursor-pointer border-b-2 transition-colors select-none flex-shrink-0 min-w-[120px] max-w-[200px]',
          isActive
            ? 'text-zinc-100 bg-brand-panel/20'
            : isWaitingInput
              ? 'border-transparent text-amber-300/90 hover:text-amber-200 hover:bg-brand-panel/40'
              : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-brand-panel/40',
          isDragOver && !isActive && 'bg-brand-accent/10 border-b-brand-accent/50',
          isExited && 'opacity-60'
        )}
        style={{
          borderBottomColor: isActive
            ? color
            : isWaitingInput
              ? 'rgba(251,191,36,0.55)'
              : isDragOver
                ? 'rgba(34,197,94,0.4)'
                : 'transparent',
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties}
      >
        {/* Identity — always left */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: isExited ? '#71717a' : color }}
        />
        {meta.sandboxed && (
          <span title="Running in Docker sandbox"><ShieldCheck size={10} className="flex-shrink-0 text-emerald-500" /></span>
        )}

        <span className="truncate text-sm leading-snug min-w-0 flex-1">{meta.name}</span>

        {/* Activity — right, only when active */}
        {isWorking && (
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: color }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          </span>
        )}
        {isWaitingInput && (
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400/80 animate-pulse" title="Waiting for input" />
        )}

        <button
          onClick={handleClose}
          title="Close session"
          className="flex-shrink-0 p-0.5 rounded hover:bg-white/15 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {editOpen && (
        <EditSessionModal
          meta={meta}
          onSave={handleSave}
          onDismiss={() => setEditOpen(false)}
        />
      )}
      {closeModal}
    </>
  )
}
