import { app, BrowserWindow } from 'electron'
import { createWindow, focusMainWindow } from './window-manager'
import { registerSessionIpc } from './features/session/session-ipc'
import { registerWindowIpc } from './features/window/window-ipc'
import { registerSettingsIpc } from './features/settings/settings-ipc'
import { registerPersistenceIpc } from './features/persistence/persistence-ipc'
import { registerFsIpc } from './features/fs/fs-ipc'
import { registerNotesIpc } from './features/notes/notes-ipc'
import { registerWorkspaceIpc } from './features/workspace/workspace-ipc'
import { registerUiStateIpc } from './features/ui-state/ui-state-ipc'
import { initUpdater } from './features/updater/updater'

app.setName('Orbit')
// Ubuntu 22.04+ restricts unprivileged user namespaces, breaking Electron's sandbox
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  focusMainWindow()
})

function registerAllIpc(): void {
  registerSessionIpc()
  registerWindowIpc()
  registerSettingsIpc()
  registerPersistenceIpc()
  registerFsIpc()
  registerNotesIpc()
  registerWorkspaceIpc()
  registerUiStateIpc()
}

app.whenReady().then(() => {
  registerAllIpc()
  createWindow()
  initUpdater()

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
