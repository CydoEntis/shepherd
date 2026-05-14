import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { UiStateSchema } from '@shared/ipc-types'
import { getUiState, setUiState } from './ui-state-store'

export function registerUiStateIpc(): void {
  ipcMain.handle(IPC.UI_STATE_GET, () => getUiState())

  ipcMain.handle(IPC.UI_STATE_SET, (_, patch: unknown) => {
    const partial = UiStateSchema.partial().parse(patch)
    return setUiState(partial)
  })
}
