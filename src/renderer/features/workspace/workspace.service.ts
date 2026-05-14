import { ipc } from '@renderer/lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { Workspace, UiState } from '@shared/ipc-types'

export function listWorkspaces(): Promise<Workspace[]> {
  return ipc.invoke(IPC.WORKSPACE_LIST) as Promise<Workspace[]>
}

export function createWorkspace(payload: { name: string; rootPath?: string; color?: string }): Promise<Workspace> {
  return ipc.invoke(IPC.WORKSPACE_CREATE, payload) as Promise<Workspace>
}

export function updateWorkspace(id: string, patch: { name?: string; rootPath?: string; color?: string }): Promise<Workspace> {
  return ipc.invoke(IPC.WORKSPACE_UPDATE, { id, ...patch }) as Promise<Workspace>
}

export function deleteWorkspace(id: string): Promise<void> {
  return ipc.invoke(IPC.WORKSPACE_DELETE, { id }) as Promise<void>
}

export function getUiState(): Promise<UiState> {
  return ipc.invoke(IPC.UI_STATE_GET) as Promise<UiState>
}

export function setUiState(patch: Partial<UiState>): Promise<UiState> {
  return ipc.invoke(IPC.UI_STATE_SET, patch) as Promise<UiState>
}
