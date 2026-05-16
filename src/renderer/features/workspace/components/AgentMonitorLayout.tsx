import { useCallback } from 'react'
import { PaneTreeRenderer } from '../../terminal/components/PaneTreeRenderer'
import { WorkspaceDashboard } from './WorkspaceDashboard'
import { useStore } from '../../../store/root.store'
import { removeWorktree } from '../../fs/fs.service'

interface Props {
  sessionId: string
  onSessionClose?: () => void
}

export function AgentMonitorLayout({ sessionId, onSessionClose }: Props): JSX.Element {
  const paneTree = useStore((s) => s.paneTree[sessionId] ?? null)

  const handleCloseLastPane = useCallback(() => {
    const session = useStore.getState().sessions[sessionId]
    if (session?.worktreePath && session?.projectRoot) {
      removeWorktree(session.projectRoot, session.worktreePath).catch(() => {})
    }
    onSessionClose?.()
  }, [sessionId, onSessionClose])

  if (!paneTree) return (
    <div className="relative w-full h-full">
      <WorkspaceDashboard />
    </div>
  )

  return (
    <PaneTreeRenderer
      node={paneTree}
      tabId={sessionId}
      onCloseLastPane={handleCloseLastPane}
    />
  )
}
