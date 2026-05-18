import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import { createWindow, focusMainWindow } from './window-manager'
import { registerSessionIpc } from './features/session/session-ipc'
import { registerWindowIpc } from './features/window/window-ipc'
import { registerSettingsIpc } from './features/settings/settings-ipc'
import { registerPersistenceIpc } from './features/persistence/persistence-ipc'
import { registerFsIpc } from './features/fs/fs-ipc'
import { registerWorkspaceIpc } from './features/workspace/workspace-ipc'
import { registerUiStateIpc } from './features/ui-state/ui-state-ipc'
import { initUpdater } from './features/updater/updater'
import { IPC } from '../shared/ipc-channels'

app.setName('Orbit')
// Ubuntu 22.04+ restricts unprivileged user namespaces, breaking Electron's sandbox
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox')

function getFolderFromArgs(argv: string[]): string | null {
  // Skip electron/app path args; look for the first non-flag argument that is an existing directory
  const candidates = app.isPackaged ? argv.slice(1) : argv.slice(2)
  for (const arg of candidates) {
    if (arg.startsWith('--') || arg.startsWith('-')) continue
    try {
      if (fs.statSync(arg).isDirectory()) return arg
    } catch {}
  }
  return null
}

function sendOpenPath(win: BrowserWindow, folderPath: string): void {
  win.webContents.send(IPC.OPEN_PATH, { path: folderPath })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', (_, argv) => {
  focusMainWindow()
  const folderPath = getFolderFromArgs(argv)
  if (folderPath) {
    const wins = BrowserWindow.getAllWindows()
    const main = wins.find((w) => !w.isDestroyed())
    if (main) sendOpenPath(main, folderPath)
  }
})

function registerAllIpc(): void {
  registerSessionIpc()
  registerWindowIpc()
  registerSettingsIpc()
  registerPersistenceIpc()
  registerFsIpc()
  registerWorkspaceIpc()
  registerUiStateIpc()
}

app.whenReady().then(() => {
  registerAllIpc()
  const mainWin = createWindow()
  initUpdater()

  const initialPath = getFolderFromArgs(process.argv)
  if (initialPath) {
    mainWin.webContents.once('did-finish-load', () => {
      sendOpenPath(mainWin, initialPath)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
