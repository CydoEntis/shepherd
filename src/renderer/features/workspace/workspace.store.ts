import type { StateCreator } from 'zustand'
import type { RootStore } from '../../store/root.store'
import type { Workspace } from '@shared/ipc-types'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import { listWorkspaces } from './workspace.service'

export interface WorkspaceSlice {
  workspaces: Workspace[]
  activeWorkspaceId: string
  loadWorkspaces: () => Promise<void>
  setWorkspaces: (workspaces: Workspace[]) => void
  setActiveWorkspaceId: (id: string) => void
  addWorkspace: (workspace: Workspace) => void
  updateWorkspaceInStore: (id: string, patch: Partial<Omit<Workspace, 'id' | 'isRoot' | 'createdAt'>>) => void
  removeWorkspaceFromStore: (id: string) => void
}

export const createWorkspaceSlice: StateCreator<RootStore, [['zustand/immer', never]], [], WorkspaceSlice> = (set) => ({
  workspaces: [],
  activeWorkspaceId: ROOT_WORKSPACE_ID,

  loadWorkspaces: async () => {
    const workspaces = await listWorkspaces()
    set((state) => { state.workspaces = workspaces })
  },

  setWorkspaces: (workspaces) =>
    set((state) => { state.workspaces = workspaces }),

  setActiveWorkspaceId: (id) =>
    set((state) => { state.activeWorkspaceId = id }),

  addWorkspace: (workspace) =>
    set((state) => { state.workspaces.push(workspace) }),

  updateWorkspaceInStore: (id, patch) =>
    set((state) => {
      const idx = state.workspaces.findIndex((w) => w.id === id)
      if (idx !== -1) Object.assign(state.workspaces[idx], patch)
    }),

  removeWorkspaceFromStore: (id) =>
    set((state) => {
      state.workspaces = state.workspaces.filter((w) => w.id !== id)
      if (state.activeWorkspaceId === id) state.activeWorkspaceId = ROOT_WORKSPACE_ID
    }),
})
