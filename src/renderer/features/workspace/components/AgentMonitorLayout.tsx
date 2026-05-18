import { useCallback } from 'react'
import { PaneTreeRenderer } from '../../terminal/components/PaneTreeRenderer'
import { WorkspaceDashboard } from './WorkspaceDashboard'
import { useStore } from '../../../store/root.store'

interface Props {
  sessionId: string
  onSessionClose?: () => void
}

export function AgentMonitorLayout({ sessionId, onSessionClose }: Props): JSX.Element {
  const paneTree = useStore((s) => s.paneTree[sessionId] ?? null)

  const handleCloseLastPane = useCallback(() => {
    onSessionClose?.()
  }, [onSessionClose])

  if (!paneTree) return (
    <div className="relative w-full h-full">
      <div className="w-full h-full bg-brand-surface">
        <WorkspaceDashboard />
      </div>
    </div>
  )

  return (
    <div className="w-full h-full">
      <PaneTreeRenderer
        node={paneTree}
        tabId={sessionId}
        onCloseLastPane={handleCloseLastPane}
      />
    </div>
  )
}
