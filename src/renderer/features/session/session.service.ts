import { ipc } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import { useStore } from '../../store/root.store'
import type { CreateSessionPayload, SessionMeta, SessionWritePayload, SessionResizePayload } from '@shared/ipc-types'

export const SESSION_COLORS = [
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#06b6d4', '#71717a', '#14b8a6',
]

export const GROUP_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6']

export const MAX_SESSIONS = 10
export const MAX_NAME_LENGTH = 32

export async function createSession(payload: CreateSessionPayload): Promise<SessionMeta> {
  const { tabOrder } = useStore.getState()
  if (tabOrder.length >= MAX_SESSIONS) {
    throw new Error(`Maximum ${MAX_SESSIONS} sessions allowed`)
  }
  const color = payload.color ?? SESSION_COLORS[tabOrder.length % SESSION_COLORS.length]
  return ipc.invoke(IPC.SESSION_CREATE, { ...payload, color }) as Promise<SessionMeta>
}

export async function killSession(sessionId: string): Promise<{ ok: boolean }> {
  return ipc.invoke(IPC.SESSION_KILL, { sessionId }) as Promise<{ ok: boolean }>
}

export async function listSessions(): Promise<SessionMeta[]> {
  return ipc.invoke(IPC.SESSION_LIST) as Promise<SessionMeta[]>
}

export async function replayRequest(sessionId: string): Promise<{ chunks: string[] }> {
  return ipc.invoke(IPC.SESSION_REPLAY_REQUEST, { sessionId }) as Promise<{ chunks: string[] }>
}

export function writeToSession(payload: SessionWritePayload): void {
  ipc.send(IPC.SESSION_WRITE, payload)
}

export function resizeSession(payload: SessionResizePayload): void {
  ipc.send(IPC.SESSION_RESIZE, payload)
}

export async function patchSession(payload: { sessionId: string; name?: string; color?: string; groupId?: string | null; taskStatus?: string | null; worktreePath?: string; worktreeBranch?: string; worktreeBaseBranch?: string; projectRoot?: string; workspaceId?: string }): Promise<SessionMeta> {
  return ipc.invoke(IPC.SESSION_PATCH, payload) as Promise<SessionMeta>
}

export async function checkSbxAvailable(): Promise<boolean> {
  return ipc.invoke(IPC.SBX_AVAILABLE) as Promise<boolean>
}

export async function startCrossWindowDrag(sessionId: string): Promise<void> {
  await ipc.invoke(IPC.DRAG_SESSION_START, { sessionId })
}

export async function endCrossWindowDrag(sessionId: string): Promise<void> {
  await ipc.invoke(IPC.DRAG_SESSION_END, { sessionId })
}
