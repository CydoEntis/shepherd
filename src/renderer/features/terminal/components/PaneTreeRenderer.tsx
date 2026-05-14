import { useState } from 'react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { WorkspaceDashboard } from '../../workspace/components/WorkspaceDashboard'
import { TerminalPane } from './TerminalPane'
import { NotesPane } from '../../layout/components/NotesPane'
import { MarkdownPreviewPane } from '../../layout/components/MarkdownPreviewPane'
import { MonacoEditorPane } from '../../fs/components/MonacoEditorPane'
import { PaneDropTarget } from '../../layout/dnd/PaneDropTarget'
import { NotePaneCtxMenu } from '../../notes/components/NotePaneCtxMenu'
import { useStore } from '../../../store/root.store'
import { detachTab, reattachTab, detachNotePane, reattachNotePane, moveNotePaneToWindow } from '../../window/window.service'
import type { LayoutNode } from '../../layout/layout-tree'
import type { NotePanelType } from '@shared/ipc-types'

interface Props {
  node: LayoutNode
  tabId: string
  onContextMenu?: (e: React.MouseEvent, sessionId: string, tabId: string) => void
  /** Override isMainWindow from store — useful in contexts where store value may be stale */
  forceMainWindow?: boolean
  /** Called when the last pane in this tree is closed */
  onCloseLastPane?: () => void
}

export function PaneTreeRenderer({ node, tabId, onContextMenu, forceMainWindow, onCloseLastPane }: Props): JSX.Element {
  const isMainWindow = forceMainWindow ?? useStore((s) => s.isMainWindow)
  const windowId = useStore((s) => s.windowId)
  const noteColorMap = useStore((s) => s.settings.noteColorMap ?? {})
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const addDetachedNoteId = useStore((s) => s.addDetachedNoteId)
  const [noteCtxMenu, setNoteCtxMenu] = useState<{ x: number; y: number; noteId: string; panel: NotePanelType; leafId: string } | null>(null)
  const setFocusedSession = useStore((s) => s.setFocusedSession)
  const setFocusedLeaf = useStore((s) => s.setFocusedLeaf)
  const openMarkdownPreviewPane = useStore((s) => s.openMarkdownPreviewPane)
  const focusedSessionId = useStore((s) => s.focusedSessionId)
  const focusedLeafId = useStore((s) => s.focusedLeafId)
  const sessions = useStore((s) => s.sessions)
  const rootIsASplit = useStore((s) => s.paneTree[tabId]?.type === 'split')

  const NOTE_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#eab308', '#06b6d4', '#14b8a6', '#f59e0b']
  const noteColorFromId = (id: string): string => {
    let hash = 0
    for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i)
    return NOTE_COLORS[Math.abs(hash) % NOTE_COLORS.length]
  }

  if (node.type === 'leaf') {
    if (node.panel === 'home') {
      return (
        <PaneDropTarget leafId={node.id} tabId={tabId}>
          <div className="relative w-full h-full">
            <WorkspaceDashboard />
          </div>
        </PaneDropTarget>
      )
    }

    if (node.panel === 'notes') {
      const isNoteFocused = rootIsASplit && node.id === focusedLeafId
      const nc = node.noteId ? (noteColorMap[node.noteId] ?? noteColorFromId(node.noteId)) : '#4ade80'
      return (
        <PaneDropTarget leafId={node.id} tabId={tabId}>
          <div
            className="relative flex flex-col w-full h-full bg-brand-surface"
            onMouseDownCapture={() => setFocusedLeaf(node.id)}
            onContextMenu={(e) => { e.preventDefault(); setNoteCtxMenu({ x: e.clientX, y: e.clientY, noteId: node.noteId ?? '', panel: 'notes', leafId: node.id }) }}
          >
            <NotesPane tabId={tabId} leafId={node.id} initialNoteId={node.noteId} />
            {isNoteFocused && (
              <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 0 2px ${nc}, inset 0 3px 0 0 ${nc}` }} />
            )}
          </div>
          {noteCtxMenu && noteCtxMenu.leafId === node.id && (
            <NotePaneCtxMenu
              ctxMenu={noteCtxMenu}
              noteId={noteCtxMenu.noteId || null}
              isMainWindow={isMainWindow}
              onDismiss={() => setNoteCtxMenu(null)}
              onDetach={() => { removeLayoutLeaf(tabId, node.id); addDetachedNoteId(noteCtxMenu.noteId); void detachNotePane(noteCtxMenu.noteId, 'notes') }}
              onReattach={() => { removeLayoutLeaf(tabId, node.id); void reattachNotePane(noteCtxMenu.noteId, 'notes') }}
              onMoveToWindow={(targetWindowId) => { removeLayoutLeaf(tabId, node.id); void moveNotePaneToWindow(noteCtxMenu.noteId, 'notes', targetWindowId) }}
              onClose={() => removeLayoutLeaf(tabId, node.id)}
              onOpenPreview={node.noteId ? () => openMarkdownPreviewPane(node.noteId!) : undefined}
            />
          )}
        </PaneDropTarget>
      )
    }

    if (node.panel === 'markdown-preview') {
      const isNoteFocused = rootIsASplit && node.id === focusedLeafId
      const nc = node.noteId ? (noteColorMap[node.noteId] ?? noteColorFromId(node.noteId)) : '#4ade80'
      return (
        <PaneDropTarget leafId={node.id} tabId={tabId}>
          <div
            className="relative w-full h-full"
            onMouseDownCapture={() => {
              setFocusedLeaf(node.id)
              document.dispatchEvent(new CustomEvent('acc:note-active-changed', { detail: { noteId: node.noteId, tabId } }))
            }}
            onContextMenu={(e) => { e.preventDefault(); setNoteCtxMenu({ x: e.clientX, y: e.clientY, noteId: node.noteId ?? '', panel: 'markdown-preview', leafId: node.id }) }}
          >
            <MarkdownPreviewPane
              tabId={tabId}
              leafId={node.id}
              noteId={node.noteId}
              isMainWindow={isMainWindow}
              windowId={windowId}
            />
            {isNoteFocused && (
              <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: `inset 0 0 0 2px ${nc}, inset 0 3px 0 0 ${nc}` }} />
            )}
          </div>
          {noteCtxMenu && noteCtxMenu.leafId === node.id && (
            <NotePaneCtxMenu
              ctxMenu={noteCtxMenu}
              noteId={noteCtxMenu.noteId || null}
              isMainWindow={isMainWindow}
              onDismiss={() => setNoteCtxMenu(null)}
              onDetach={() => { removeLayoutLeaf(tabId, node.id); addDetachedNoteId(noteCtxMenu.noteId); void detachNotePane(noteCtxMenu.noteId, 'markdown-preview') }}
              onReattach={() => { removeLayoutLeaf(tabId, node.id); void reattachNotePane(noteCtxMenu.noteId, 'markdown-preview') }}
              onMoveToWindow={(targetWindowId) => { removeLayoutLeaf(tabId, node.id); void moveNotePaneToWindow(noteCtxMenu.noteId, 'markdown-preview', targetWindowId) }}
              onClose={() => removeLayoutLeaf(tabId, node.id)}
            />
          )}
        </PaneDropTarget>
      )
    }

    if (node.panel === 'file-editor') {
      return (
        <PaneDropTarget leafId={node.id} tabId={tabId}>
          <div className="relative w-full h-full" onMouseDownCapture={() => setFocusedLeaf(node.id)}>
            <MonacoEditorPane filePath={node.filePath} tabId={tabId} leafId={node.id} />
          </div>
        </PaneDropTarget>
      )
    }

    const sid = node.sessionId

    const paneItems = [
      {
        label: 'Split Horizontal',
        action: () => {
          document.dispatchEvent(new CustomEvent('acc:new-session-for-split', {
            detail: { tabId, sessionId: sid, direction: 'horizontal' }
          }))
        },
      },
      {
        label: 'Split Vertical',
        action: () => {
          document.dispatchEvent(new CustomEvent('acc:new-session-for-split', {
            detail: { tabId, sessionId: sid, direction: 'vertical' }
          }))
        },
      },
      isMainWindow
        ? {
            label: 'Detach to Window',
            action: async () => {
              useStore.getState().detachPane(tabId, sid)
              if (windowId) await detachTab(sid, windowId)
            },
          }
        : {
            label: 'Reattach to Main',
            action: async () => { await reattachTab(sid, windowId ?? undefined) },
          },
      {
        label: 'Close Pane',
        action: () => {
          const { detachPane, paneTree } = useStore.getState()
          const isLastPane = paneTree[tabId]?.type === 'leaf'
          detachPane(tabId, sid)
          if (isLastPane) onCloseLastPane?.()
        },
      },
    ]

    const isFocused = rootIsASplit && sid === focusedSessionId
    const sessionColor = sessions[sid]?.color ?? '#22c55e'

    return (
      <PaneDropTarget leafId={node.id} tabId={tabId}>
        <div
          className="flex flex-col w-full h-full"
          style={isFocused ? { boxShadow: `inset 0 0 0 2px ${sessionColor}, inset 0 3px 0 0 ${sessionColor}` } : undefined}
          onMouseDownCapture={() => {
            setFocusedSession(sid)
            document.dispatchEvent(new CustomEvent('acc:terminal-pane-focused'))
          }}
        >
          <TerminalPane sessionId={sid} paneItems={paneItems} />
        </div>
      </PaneDropTarget>
    )
  }

  const handleClass =
    node.direction === 'vertical'
      ? 'h-1 bg-brand-panel hover:bg-brand-accent transition-colors cursor-row-resize flex-shrink-0'
      : 'w-1 bg-brand-panel hover:bg-brand-accent transition-colors cursor-col-resize flex-shrink-0'

  return (
    <PanelGroup orientation={node.direction} className="w-full h-full">
      {node.children.map((child, idx) => [
        idx > 0 && <PanelResizeHandle key={`handle-${node.id}-${idx}`} className={handleClass} />,
        <Panel key={child.id} defaultSize={Math.floor(100 / node.children.length)} minSize={10}>
          <PaneTreeRenderer
            node={child}
            tabId={tabId}
            onContextMenu={onContextMenu}
            forceMainWindow={forceMainWindow}
            onCloseLastPane={onCloseLastPane}
          />
        </Panel>,
      ])}
    </PanelGroup>
  )
}
