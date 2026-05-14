import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { IPC } from '@shared/ipc-channels'
import { WorkspaceSchema, ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import { getWorkspaces, saveWorkspaces } from './workspace-store'

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IPC.WORKSPACE_LIST, () => getWorkspaces())

  ipcMain.handle(IPC.WORKSPACE_CREATE, (_, payload: unknown) => {
    const { name, rootPath, color } = z.object({
      name: z.string().min(1).max(64),
      rootPath: z.string().default(''),
      color: z.string().optional(),
    }).parse(payload)
    const workspace = WorkspaceSchema.parse({
      id: randomUUID(),
      name,
      rootPath,
      color,
      createdAt: Date.now(),
      isRoot: false,
    })
    const workspaces = getWorkspaces()
    workspaces.push(workspace)
    saveWorkspaces(workspaces)
    return workspace
  })

  ipcMain.handle(IPC.WORKSPACE_UPDATE, (_, payload: unknown) => {
    const { id, ...patch } = z.object({
      id: z.string(),
      name: z.string().min(1).max(64).optional(),
      rootPath: z.string().optional(),
      color: z.string().optional(),
    }).parse(payload)
    const workspaces = getWorkspaces()
    const idx = workspaces.findIndex((w) => w.id === id)
    if (idx === -1) throw new Error(`Workspace ${id} not found`)
    workspaces[idx] = { ...workspaces[idx], ...patch }
    saveWorkspaces(workspaces)
    return workspaces[idx]
  })

  ipcMain.handle(IPC.WORKSPACE_DELETE, (_, payload: unknown) => {
    const { id } = z.object({ id: z.string() }).parse(payload)
    if (id === ROOT_WORKSPACE_ID) throw new Error('Cannot delete the root workspace')
    saveWorkspaces(getWorkspaces().filter((w) => w.id !== id))
  })
}
