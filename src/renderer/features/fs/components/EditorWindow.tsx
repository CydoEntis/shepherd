import { useState, useEffect } from 'react'
import { getPendingFileOpens } from '../fs.service'
import { MonacoEditorPane } from './MonacoEditorPane'
import { useTheme } from '../../../hooks/useTheme'
import { useStore } from '../../../store/root.store'
import { TitleBar } from '../../../components/TitleBar'
import { ipc } from '../../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import { normalizePath } from '../../../lib/utils'
import type { WindowInitialSessionsPayload } from '@shared/ipc-types'

export function EditorWindow(): JSX.Element {
  const [filePath, setFilePath] = useState<string | null>(null)
  const appTheme = useStore((s) => s.settings.theme)
  const loadSettings = useStore((s) => s.loadSettings)
  const openFileTab = useStore((s) => s.openFileTab)
  const setWindowId = useStore((s) => s.setWindowId)
  const setWindowMeta = useStore((s) => s.setWindowMeta)

  useTheme(appTheme)

  useEffect(() => {
    void loadSettings()
    void getPendingFileOpens().then((files) => {
      if (files[0]) {
        setFilePath(files[0])
        openFileTab(files[0])
      }
    })
    return ipc.on(IPC.WINDOW_INITIAL_SESSIONS, (payload) => {
      const { windowId, windowName, windowColor } = payload as WindowInitialSessionsPayload
      if (windowId) setWindowId(windowId)
      if (windowName && windowColor) setWindowMeta(windowName, windowColor)
    })
  }, [])

  useEffect(() => {
    return ipc.on(IPC.FS_FILE_OPEN_REQUESTED, (payload) => {
      const { filePath: fp } = payload as { filePath: string }
      setFilePath(fp)
      openFileTab(fp)
    })
  }, [])

  const norm = filePath ? normalizePath(filePath) : ''
  const fileName = norm ? (norm.split('/').pop() ?? '') : 'Opening…'

  return (
    <div className="flex flex-col h-screen bg-brand-bg text-zinc-100 overflow-hidden">
      <TitleBar title={fileName} subtitle={norm} />
      <div className="flex-1 min-h-0">
        {filePath ? (
          <MonacoEditorPane
            filePath={filePath}
            tabId={`file:${norm}`}
            leafId="editor-window-leaf"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
            Opening…
          </div>
        )}
      </div>
    </div>
  )
}
