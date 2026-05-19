import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { WorkspaceDashboard } from '../../workspace/components/WorkspaceDashboard'
import { MarkdownPreviewPane } from '../../layout/components/MarkdownPreviewPane'
import { TabGroupPane } from '../../fs/components/TabGroupPane'
import { PaneDropTarget } from '../../layout/dnd/PaneDropTarget'
import { useStore } from '../../../store/root.store'
import { detachTab, moveToWindow } from '../../window/window.service'
import { findTabForSession } from '../../layout/layout-tree'
import type { LayoutNode } from '../../layout/layout-tree'

interface Props {
  node: LayoutNode
  tabId: string
  onContextMenu?: (e: React.MouseEvent, sessionId: string, tabId: string) => void
  /** Override isMainWindow from store — useful in contexts where store value may be stale */
  forceMainWindow?: boolean
  /** Called when the last pane in this tree is closed */
  onCloseLastPane?: () => void
}

export function PaneTreeRenderer({ node, tabId, onContextMenu: _onContextMenu, forceMainWindow: _forceMainWindow, onCloseLastPane }: Props): JSX.Element {
  const setFocusedSession = useStore((s) => s.setFocusedSession)
  const setFocusedLeaf = useStore((s) => s.setFocusedLeaf)

  if (node.type === 'leaf') {
    if (node.panel === 'home') {
      return (
        <PaneDropTarget leafId={node.id} tabId={tabId}>
          <div className="relative w-full h-full overflow-hidden bg-brand-surface">
            <WorkspaceDashboard />
          </div>
        </PaneDropTarget>
      )
    }

    if (node.panel === 'markdown-preview') {
      return (
        <PaneDropTarget leafId={node.id} tabId={tabId}>
          <div
            className="relative w-full h-full overflow-hidden bg-brand-surface"
            onMouseDownCapture={() => setFocusedLeaf(node.id)}
          >
            <MarkdownPreviewPane tabId={tabId} leafId={node.id} filePath={node.filePath} />
          </div>
        </PaneDropTarget>
      )
    }

    if (node.panel === 'editor-group') {
      const activeTab = node.tabs[Math.min(node.activeIndex, node.tabs.length - 1)]

      const handleMouseDown = (): void => {
        if (activeTab?.kind === 'terminal') {
          setFocusedSession(activeTab.sessionId)
          document.dispatchEvent(new CustomEvent('acc:terminal-pane-focused'))
        } else {
          setFocusedLeaf(node.id)
        }
      }

      return (
        <PaneDropTarget leafId={node.id} tabId={tabId} acceptsCenter>
          <div
            className="relative w-full h-full overflow-hidden bg-brand-surface"
            onMouseDownCapture={handleMouseDown}
          >
            <TabGroupPane
              tabs={node.tabs}
              activeIndex={node.activeIndex}
              tabId={tabId}
              leafId={node.id}
            />
          </div>
        </PaneDropTarget>
      )
    }
  }

  if (node.type === 'split') {
    const handleClass =
      node.direction === 'vertical'
        ? 'h-[3px] bg-brand-panel/80 hover:bg-brand-accent/60 transition-colors cursor-row-resize flex-shrink-0'
        : 'w-[3px] bg-brand-panel/80 hover:bg-brand-accent/60 transition-colors cursor-col-resize flex-shrink-0'

    return (
      <PanelGroup key={`${node.id}-${node.children.length}`} orientation={node.direction} className="w-full h-full gap-0">
        {node.children.map((child, idx) => [
          idx > 0 && <PanelResizeHandle key={`handle-${node.id}-${idx}`} className={handleClass} />,
          <Panel key={child.id} defaultSize={Math.floor(100 / node.children.length)} minSize={10}>
            <div className="w-full h-full">
              <PaneTreeRenderer
                node={child}
                tabId={tabId}
                onCloseLastPane={onCloseLastPane}
              />
            </div>
          </Panel>,
        ])}
      </PanelGroup>
    )
  }

  // Exhaustive — should never reach here
  return <div />
}

// Keep unused imports quiet — these are referenced by callers that may still import them
export { detachTab, moveToWindow, findTabForSession }
