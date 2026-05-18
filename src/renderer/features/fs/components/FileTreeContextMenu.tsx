import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useClickOutside } from '../../../hooks/useClickOutside'
import { Eye, FolderOpen, Copy, ExternalLink, Pencil, Trash2, FilePlus2, FolderPlus, ChevronRight, ArrowRightLeft } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { showInFolder, openPath, openInEditor } from '../fs.service'
import { listWindows } from '../../window/window.service'
import { WindowMoveSubmenu } from '../../window/components/WindowMoveSubmenu'
import type { FsEntry } from '@shared/ipc-types'
import type { InstalledEditor } from '../hooks/useInstalledEditors'

interface Props {
  x: number
  y: number
  entry: FsEntry
  projectRoot: string
  rel: string
  editors: InstalledEditor[]
  onFileClick: (path: string, xy: string | undefined) => void
  onRename?: () => void
  onDelete?: () => void
  onDismiss: () => void
  onNewFile?: () => void
  onNewFolder?: () => void
  onMoveToWindow?: (filePath: string, targetWindowId: string | null) => void
}

function Item({ icon, label, onClick, className }: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  className?: string
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors text-left',
        className
      )}
    >
      <span className="w-3.5 flex-shrink-0 flex items-center">{icon}</span>
      {label}
    </button>
  )
}

function SubMenu({ icon, label, children }: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors text-left">
        <span className="w-3.5 flex-shrink-0 flex items-center">{icon}</span>
        <span className="flex-1">{label}</span>
        <ChevronRight size={10} className="text-zinc-500 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute left-full top-0 -mt-1 ml-0.5 z-[10000] bg-brand-panel border border-white/10 rounded-md shadow-2xl shadow-black/60 py-1 min-w-[160px]">
          {children}
        </div>
      )}
    </div>
  )
}

function SubItem({ label, onClick, className }: { label: string; onClick: () => void; className?: string }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn('w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors text-left', className)}
    >
      {label}
    </button>
  )
}

function Divider(): JSX.Element {
  return <div className="h-px bg-white/10 my-1" />
}

export function FileTreeContextMenu({ x, y, entry, projectRoot, rel, editors, onFileClick, onRename, onDelete, onDismiss, onNewFile, onNewFolder, onMoveToWindow }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const moveTriggerRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMd = entry.name.toLowerCase().endsWith('.md')
  const [otherWindows, setOtherWindows] = useState<{ windowId: string; windowName: string; windowColor: string }[]>([])
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const [submenuY, setSubmenuY] = useState(0)

  useClickOutside(ref, onDismiss)

  useEffect(() => {
    if (!onMoveToWindow) return
    listWindows().then((wins) => {
      setOtherWindows(wins.map((w) => ({ windowId: w.windowId, windowName: w.windowName, windowColor: w.windowColor })))
    }).catch(() => {})
    return () => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current) }
  }, [onMoveToWindow])

  const clearHide = (): void => {
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null }
  }
  const scheduleHide = (): void => {
    clearHide()
    hideTimeoutRef.current = setTimeout(() => setShowMoveSubmenu(false), 150)
  }

  const getSubmenuX = (): number => {
    const menuWidth = ref.current?.offsetWidth ?? 208
    const submenuWidth = 160
    const rightX = adjustedX + menuWidth + 4
    return rightX + submenuWidth > window.innerWidth ? adjustedX - submenuWidth - 4 : rightX
  }

  const adjustedX = Math.min(x, window.innerWidth - 240)
  const adjustedY = Math.min(y, window.innerHeight - 320)

  const dismiss = (fn: () => void) => () => { fn(); onDismiss() }

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: adjustedY, left: adjustedX, zIndex: 9999 }}
      className="bg-brand-panel border border-white/10 rounded-md shadow-2xl shadow-black/60 py-1 w-52"
      onContextMenu={(e) => e.preventDefault()}
    >
      {entry.isDirectory && (onNewFile || onNewFolder) && (
        <>
          {onNewFile && (
            <Item icon={<FilePlus2 size={12} />} label="New File" onClick={dismiss(onNewFile)} />
          )}
          {onNewFolder && (
            <Item icon={<FolderPlus size={12} />} label="New Folder" onClick={dismiss(onNewFolder)} />
          )}
          <Divider />
        </>
      )}

      {!entry.isDirectory && isMd && (
        <>
          <Item
            icon={<Eye size={12} />}
            label="Preview"
            onClick={dismiss(() => onFileClick(entry.path, undefined))}
          />
          <Divider />
        </>
      )}

      <Item
        icon={<ExternalLink size={12} />}
        label="Open"
        onClick={dismiss(() => openPath(entry.path))}
      />

      {editors.length > 0 && (
        <SubMenu icon={<ExternalLink size={12} />} label="Open in">
          {editors.map((ed) => (
            <SubItem
              key={ed.command}
              label={ed.name}
              onClick={dismiss(() => openInEditor(ed.command, entry.path))}
            />
          ))}
        </SubMenu>
      )}

      <Divider />

      <SubMenu icon={<Copy size={12} />} label="Copy">
        <SubItem
          label="Relative Path"
          onClick={dismiss(() => navigator.clipboard.writeText(rel))}
        />
        <SubItem
          label="Absolute Path"
          onClick={dismiss(() => navigator.clipboard.writeText(entry.path))}
        />
      </SubMenu>

      <Item
        icon={<FolderOpen size={12} />}
        label="Reveal in Explorer"
        onClick={dismiss(() => showInFolder(entry.path))}
      />

      <Divider />

      {onRename && (
        <Item
          icon={<Pencil size={12} />}
          label="Rename"
          onClick={dismiss(onRename)}
        />
      )}
      {!entry.isDirectory && onMoveToWindow && (
        <button
          ref={moveTriggerRef}
          onMouseEnter={() => {
            clearHide()
            const rect = moveTriggerRef.current?.getBoundingClientRect()
            if (rect) setSubmenuY(rect.top)
            setShowMoveSubmenu(true)
          }}
          onMouseLeave={scheduleHide}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors text-left"
        >
          <span className="w-3.5 flex-shrink-0 flex items-center"><ArrowRightLeft size={12} /></span>
          <span className="flex-1">Move to Window</span>
          <ChevronRight size={10} className="text-zinc-500 flex-shrink-0" />
        </button>
      )}
      {onDelete && (
        <Item
          icon={<Trash2 size={12} />}
          label="Move to Trash"
          onClick={dismiss(onDelete)}
          className="text-red-400 hover:text-red-300"
        />
      )}
      {showMoveSubmenu && onMoveToWindow && (
        <WindowMoveSubmenu
          style={{ left: getSubmenuX(), top: submenuY }}
          windows={otherWindows}
          onSelect={(wId) => { onMoveToWindow(entry.path, wId); onDismiss() }}
          onMouseEnter={clearHide}
          onMouseLeave={scheduleHide}
          onNewWindow={() => { onMoveToWindow(entry.path, null); onDismiss() }}
        />
      )}
    </div>,
    document.body
  )
}
