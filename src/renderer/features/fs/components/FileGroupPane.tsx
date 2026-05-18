import { X } from 'lucide-react'
import { MonacoEditorPane } from './MonacoEditorPane'
import { useStore } from '../../../store/root.store'
import { cn } from '../../../lib/utils'

interface Props {
  filePaths: string[]
  activeIndex: number
  tabId: string
  leafId: string
}

export function FileGroupPane({ filePaths, activeIndex, tabId, leafId }: Props): JSX.Element {
  const removeFileFromEditorGroup = useStore((s) => s.removeFileFromEditorGroup)
  const setEditorGroupActive = useStore((s) => s.setEditorGroupActive)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)

  const safeIndex = Math.min(activeIndex, filePaths.length - 1)
  const activeFile = filePaths[safeIndex] ?? ''

  const handleCloseTab = (e: React.MouseEvent, index: number): void => {
    e.stopPropagation()
    if (filePaths.length <= 1) {
      removeLayoutLeaf(tabId, leafId)
    } else {
      removeFileFromEditorGroup(tabId, leafId, index)
    }
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* Tab strip */}
      <div className="flex items-stretch bg-brand-panel/60 border-b border-white/8 overflow-x-auto flex-shrink-0 min-h-0">
        {filePaths.map((fp, i) => {
          const name = fp.replace(/\\/g, '/').split('/').pop() ?? fp
          const isActive = i === safeIndex
          return (
            <button
              key={fp}
              onMouseDown={() => setEditorGroupActive(tabId, leafId, i)}
              className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 text-[11px] flex-shrink-0 border-r border-white/8 transition-colors select-none',
                isActive
                  ? 'bg-brand-bg text-zinc-200 border-t-2 border-t-brand-accent'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-brand-surface/60'
              )}
            >
              <span className="max-w-[120px] truncate">{name}</span>
              <span
                onMouseDown={(e) => handleCloseTab(e, i)}
                className="flex items-center justify-center w-3.5 h-3.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 hover:bg-white/10 transition-all flex-shrink-0"
              >
                <X size={9} />
              </span>
            </button>
          )
        })}
      </div>

      {/* Active editor */}
      <div className="flex-1 min-h-0">
        {activeFile && (
          <MonacoEditorPane
            key={activeFile}
            filePath={activeFile}
            tabId={tabId}
            leafId={leafId}
          />
        )}
      </div>
    </div>
  )
}
