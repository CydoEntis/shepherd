import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getPersistedLayout, savePersistedLayout, clearPersistedLayout } from './persistence-store'
import { getSession } from '../session/session-registry'
import type { PersistedLayout } from '@shared/ipc-types'

export function registerPersistenceIpc(): void {
  ipcMain.handle(IPC.PERSISTENCE_LOAD, () => {
    return getPersistedLayout()
  })

  ipcMain.handle(IPC.PERSISTENCE_SAVE, (_event, payload: PersistedLayout) => {
    if (!payload || payload.version !== 1) return { ok: false }
    // Enrich sessions with conversation IDs from live PTY processes
    for (const session of payload.sessions) {
      const entry = getSession(session.sessionId)
      if (entry) {
        const convId = entry.pty.getConversationId()
        if (convId) session.conversationId = convId
      }
    }
    savePersistedLayout(payload)
    return { ok: true }
  })

  ipcMain.handle(IPC.PERSISTENCE_CLEAR, () => {
    clearPersistedLayout()
    return { ok: true }
  })
}
