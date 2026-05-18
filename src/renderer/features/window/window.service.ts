import { ipc } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { DetachTabResponse, WindowControlAction } from '@shared/ipc-types'

export async function getWindowId(): Promise<string> {
  const res = (await ipc.invoke(IPC.WINDOW_GET_ID)) as { windowId: string }
  return res.windowId
}

export async function getWindowInfo(): Promise<{ windowId: string; isMainWindow: boolean }> {
  return ipc.invoke(IPC.WINDOW_GET_ID) as Promise<{ windowId: string; isMainWindow: boolean }>
}

export async function detachTab(sessionId: string, fromWindowId: string): Promise<DetachTabResponse> {
  return ipc.invoke(IPC.WINDOW_DETACH_TAB, { sessionId, fromWindowId }) as Promise<DetachTabResponse>
}

export async function reattachTab(sessionId: string, fromWindowId?: string): Promise<{ success: boolean }> {
  return ipc.invoke(IPC.WINDOW_REATTACH_TAB, { sessionId, fromWindowId }) as Promise<{ success: boolean }>
}

export function sendWindowControl(action: WindowControlAction): void {
  ipc.send(IPC.WINDOW_CONTROL, action)
}

export async function pickFolder(): Promise<string | null> {
  return ipc.invoke(IPC.DIALOG_PICK_FOLDER) as Promise<string | null>
}

export async function pickFile(): Promise<string | null> {
  return ipc.invoke(IPC.DIALOG_PICK_FILE) as Promise<string | null>
}

export async function moveSessionAlongside(sessionId: string, targetSessionId: string): Promise<void> {
  await ipc.invoke(IPC.WINDOW_MOVE_SESSION_ALONGSIDE, { sessionId, targetSessionId })
}

export async function listWindows(): Promise<{ windowId: string; isMain: boolean; windowName: string; windowColor: string }[]> {
  return ipc.invoke(IPC.WINDOW_LIST) as Promise<{ windowId: string; isMain: boolean; windowName: string; windowColor: string }[]>
}

export async function highlightWindow(targetWindowId: string, active: boolean): Promise<void> {
  await ipc.invoke(IPC.WINDOW_HIGHLIGHT, { targetWindowId, active })
}

export async function setWindowMeta(name: string, color: string): Promise<void> {
  await ipc.invoke(IPC.WINDOW_SET_META, { name, color })
}

export async function moveToWindow(sessionId: string, targetWindowId: string): Promise<void> {
  await ipc.invoke(IPC.WINDOW_MOVE_TO_WINDOW, { sessionId, targetWindowId })
}
