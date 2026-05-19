import { createPortal } from 'react-dom'
import { useRef } from 'react'
import { useClickOutside } from '../../../hooks/useClickOutside'
import { X, FolderOpen, Copy, Columns2, Rows2, Trash2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { showInFolder } from '../../fs/fs.service'
import { killSession } from '../../session/session.service'
import { useStore } from '../../../store/root.store'
import type { EditorTab } from '../layout-tree'

interface Props {
  x: number
  y: number
  tab: EditorTab
  tabIndex: number
  totalTabs: number
  tabId: string
  leafId: string
  onDismiss: () => void
}

function Item({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-white/10 transition-colors text-left',
        danger ? 'text-red-400 hover:text-red-300' : 'text-zinc-300 hover:text-zinc-100'
      )}
    >
      <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">{icon}</span>
      {label}
    </button>
  )
}

function Divider(): JSX.Element {
  return <div className="h-px bg-white/10 my-1" />
}

export function TabContextMenu({ x, y, tab, tabIndex, totalTabs, tabId, leafId, onDismiss }: Props): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  useClickOutside(menuRef, onDismiss)

  const removeFileFromEditorGroup = useStore((s) => s.removeFileFromEditorGroup)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const closeTabsInEditorGroup = useStore((s) => s.closeTabsInEditorGroup)
  const moveEditorTab = useStore((s) => s.moveEditorTab)
  const closePane = useStore((s) => s.closePane)

  const act = (fn: () => void): void => { fn(); onDismiss() }

  const closeThisTab = (): void => {
    if (totalTabs <= 1) removeLayoutLeaf(tabId, leafId)
    else removeFileFromEditorGroup(tabId, leafId, tabIndex)
  }

  const adjustedX = Math.min(x, window.innerWidth - 224)
  const adjustedY = Math.min(y, window.innerHeight - 320)

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998]"
        onMouseDown={onDismiss}
        onContextMenu={(e) => { e.preventDefault(); onDismiss() }}
      />
      <div
        ref={menuRef}
        className="fixed z-[9999] bg-brand-panel border border-white/10 rounded-md shadow-2xl shadow-black/60 py-1 w-56"
        style={{ left: adjustedX, top: adjustedY }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
      >
        <Item label="Close Tab" icon={<X size={12} />} onClick={() => act(closeThisTab)} />
        {totalTabs > 1 && (
          <>
            <Item
              label="Close Other Tabs"
              icon={<X size={12} />}
              onClick={() => act(() => closeTabsInEditorGroup(tabId, leafId, 'others', tabIndex))}
            />
            {tabIndex > 0 && (
              <Item
                label="Close Tabs to Left"
                icon={<X size={12} />}
                onClick={() => act(() => closeTabsInEditorGroup(tabId, leafId, 'left', tabIndex))}
              />
            )}
            {tabIndex < totalTabs - 1 && (
              <Item
                label="Close Tabs to Right"
                icon={<X size={12} />}
                onClick={() => act(() => closeTabsInEditorGroup(tabId, leafId, 'right', tabIndex))}
              />
            )}
          </>
        )}

        {totalTabs > 1 && (
          <>
            <Divider />
            <Item
              label="Move to New Pane Right"
              icon={<Columns2 size={12} />}
              onClick={() => act(() => moveEditorTab(tabId, leafId, tabIndex, tabId, leafId, 'right'))}
            />
            <Item
              label="Move to New Pane Down"
              icon={<Rows2 size={12} />}
              onClick={() => act(() => moveEditorTab(tabId, leafId, tabIndex, tabId, leafId, 'bottom'))}
            />
          </>
        )}

        {tab.kind === 'file' && (
          <>
            <Divider />
            <Item
              label="Reveal in Explorer"
              icon={<FolderOpen size={12} />}
              onClick={() => act(() => { showInFolder(tab.path).catch(() => {}) })}
            />
            <Item
              label="Copy Path"
              icon={<Copy size={12} />}
              onClick={() => act(() => { navigator.clipboard.writeText(tab.path.replace(/\\/g, '/')).catch(() => {}) })}
            />
          </>
        )}

        {tab.kind === 'terminal' && (
          <>
            <Divider />
            <Item
              label="Kill Session"
              icon={<Trash2 size={12} />}
              onClick={() => act(() => closePane(tabId, tab.sessionId))}
            />
          </>
        )}
      </div>
    </>,
    document.body
  )
}
