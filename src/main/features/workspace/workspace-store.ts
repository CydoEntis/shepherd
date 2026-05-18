import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { z } from 'zod'
import { WorkspaceSchema, ROOT_WORKSPACE_ID } from '@shared/ipc-types'
import type { Workspace } from '@shared/ipc-types'

const WorkspacesFileSchema = z.object({
  workspaces: z.array(WorkspaceSchema),
})

function workspacesPath(): string {
  return join(app.getPath('userData'), 'workspaces.json')
}

function orbitDir(): string {
  return join(app.getPath('home'), 'Orbit')
}

function makeRootWorkspace(): Workspace {
  return { id: ROOT_WORKSPACE_ID, name: 'Orbit', rootPath: orbitDir(), isRoot: true, createdAt: Date.now() }
}

export function getWorkspaces(): Workspace[] {
  const path = workspacesPath()
  if (!existsSync(path)) {
    const initial = [makeRootWorkspace()]
    saveWorkspaces(initial)
    return initial
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const parsed = WorkspacesFileSchema.safeParse(raw)
    if (!parsed.success) return [makeRootWorkspace()]
    const workspaces = parsed.data.workspaces
    if (!workspaces.find((w) => w.id === ROOT_WORKSPACE_ID)) {
      workspaces.unshift(makeRootWorkspace())
      saveWorkspaces(workspaces)
    }
    const root = workspaces.find((w) => w.id === ROOT_WORKSPACE_ID)
    if (root && (root.name === 'Home' || root.rootPath === app.getPath('home') || !root.rootPath)) {
      root.name = 'Orbit'
      root.rootPath = orbitDir()
      saveWorkspaces(workspaces)
    }
    return workspaces
  } catch {
    return [makeRootWorkspace()]
  }
}

export function saveWorkspaces(workspaces: Workspace[]): void {
  const path = workspacesPath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify({ workspaces }, null, 2), 'utf-8')
}
