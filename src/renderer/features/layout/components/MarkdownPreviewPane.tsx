import { useState, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { marked } from 'marked'
import { useStore } from '../../../store/root.store'
import { readFile } from '../../fs/fs.service'

interface Props {
  tabId: string
  leafId: string
  filePath: string
}

export function MarkdownPreviewPane({ tabId, leafId, filePath }: Props): JSX.Element {
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const [content, setContent] = useState('')
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!filePath) return
    readFile(filePath).then((c) => setContent(c ?? '')).catch(() => setContent(''))
  }, [filePath])

  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
  const html = useMemo(() => marked.parse(content) as string, [content])

  const handleClose = useCallback((): void => {
    removeLayoutLeaf(tabId, leafId)
  }, [removeLayoutLeaf, tabId, leafId])

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    setCtxPos({ x: e.clientX, y: e.clientY })
  }, [])

  useEffect(() => {
    if (!ctxPos) return
    const close = (): void => setCtxPos(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctxPos])

  return (
    <div
      className="flex flex-col w-full h-full bg-brand-surface"
      onContextMenu={handleContextMenu}
    >
      <div className="flex items-center justify-between px-3 h-9 border-b border-brand-panel flex-shrink-0 gap-2">
        <span className="text-xs text-zinc-500 truncate flex-1 min-w-0">
          Preview · <span className="text-zinc-200 font-medium">{fileName}</span>
        </span>
        <button
          onClick={handleClose}
          title="Close Preview"
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
        >
          <X size={12} />
        </button>
      </div>
      <div
        className="flex-1 overflow-y-auto px-5 py-4 markdown-body select-text"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {ctxPos && createPortal(
        <div
          className="fixed z-[9999] min-w-[160px] rounded border border-brand-panel bg-brand-surface shadow-lg py-1 text-sm"
          style={{ top: ctxPos.y, left: ctxPos.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-brand-panel transition-colors"
            onClick={() => { setCtxPos(null); handleClose() }}
          >
            Close
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
