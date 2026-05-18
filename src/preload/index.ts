import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcBridge } from '@shared/ipc-bridge'

const ipc: IpcBridge = {
  invoke: (channel: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke(channel, payload),

  send: (channel: string, payload?: unknown): void =>
    ipcRenderer.send(channel, payload),

  on: (channel: string, listener: (payload: unknown) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown): void =>
      listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },

  once: (channel: string, listener: (payload: unknown) => void): void => {
    ipcRenderer.once(channel, (_event, payload) => listener(payload))
  }
}

contextBridge.exposeInMainWorld('ipc', ipc)

contextBridge.exposeInMainWorld('electronWebUtils', {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file)
})
