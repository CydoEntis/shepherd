import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useStore } from '../../../store/root.store'
import { pickFolder } from '../../window/window.service'
import { createSession, killSession } from '../session.service'
import { findTabForSession } from '../../layout/layout-tree'
import { normalizePath } from '../../../lib/utils'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@shared/constants'
import { ROOT_WORKSPACE_ID } from '@shared/ipc-types'

const MAX_PROJECTS = 10

export interface UseProjectsReturn {
  openProjects: string[]
  refreshTicks: Record<string, number>
  bumpRefresh: (root: string) => void
  addProject: () => Promise<void>
  removeProject: (root: string) => Promise<void>
  closeSession: (sessionId: string) => Promise<void>
}

export function useProjects(): UseProjectsReturn {
  const sessions = useStore((s) => s.sessions)
  const paneTree = useStore((s) => s.paneTree)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const upsertSession = useStore((s) => s.upsertSession)
  const addTab = useStore((s) => s.addTab)
  const closePane = useStore((s) => s.closePane)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)

  const [refreshTicks, setRefreshTicks] = useState<Record<string, number>>({})

  const openProjects = settings.openProjects.map(normalizePath)

  const bumpRefresh = (root: string): void =>
    setRefreshTicks((t) => ({ ...t, [root]: (t[root] ?? 0) + 1 }))

  const closeSession = async (sessionId: string): Promise<void> => {
    const tabId = findTabForSession(paneTree, sessionId)
    try { await killSession(sessionId) } catch {}
    if (tabId) closePane(tabId, sessionId)
  }

  const addProject = async (): Promise<void> => {
    if (openProjects.length >= MAX_PROJECTS) {
      toast.error(`Maximum ${MAX_PROJECTS} projects allowed`)
      return
    }
    const folder = await pickFolder()
    if (!folder) return
    const normalized = normalizePath(folder)
    if (!openProjects.includes(normalized)) {
      const recent = [normalized, ...settings.recentProjects.filter((p) => normalizePath(p) !== normalized)].slice(0, 10)
      await updateSettings({
        openProjects: [...settings.openProjects, folder],
        projectRoot: folder,
        recentProjects: recent,
      })
      try {
        const workspaceId = activeWorkspaceId !== ROOT_WORKSPACE_ID ? activeWorkspaceId : undefined
        const meta = await createSession({
          name: folder.split(/[\\/]/).pop() ?? 'project',
          cwd: folder,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          workspaceId,
        })
        upsertSession(meta)
        addTab(meta.sessionId)
      } catch {}
    }
  }

  const removeProject = async (root: string): Promise<void> => {
    const normalized = normalizePath(root)
    const projectSessions = Object.values(sessions).filter((m) => {
      const cwd = normalizePath(m.cwd ?? '')
      return cwd.startsWith(normalized)
    })
    for (const m of projectSessions) {
      const tabId = findTabForSession(paneTree, m.sessionId)
      try { await killSession(m.sessionId) } catch {}
      if (tabId) closePane(tabId, m.sessionId)
    }
    await updateSettings({
      openProjects: settings.openProjects.filter((p) => normalizePath(p) !== normalized),
    })
  }

  // Use a ref so the event listener always calls the latest version of addProject
  const addProjectRef = useRef(addProject)
  useEffect(() => { addProjectRef.current = addProject })

  useEffect(() => {
    const handler = (): void => { addProjectRef.current() }
    document.addEventListener('acc:open-project', handler)
    return () => document.removeEventListener('acc:open-project', handler)
  }, [])

  return { openProjects, refreshTicks, bumpRefresh, addProject, removeProject, closeSession }
}
