import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createSessionSlice, type SessionSlice } from '../features/session/session.store'
import { createTerminalSlice, type TerminalSlice } from '../features/terminal/terminal.store'
import { createWindowSlice, type WindowSlice } from '../features/window/window.store'
import { createSettingsSlice, type SettingsSlice } from '../features/settings/settings.store'
import { createWorkspaceSlice, type WorkspaceSlice } from '../features/workspace/workspace.store'
import { createNotificationsSlice, type NotificationsSlice } from '../features/notifications/notifications.store'

export type RootStore = SessionSlice & TerminalSlice & WindowSlice & SettingsSlice & WorkspaceSlice & NotificationsSlice

export const useStore = create<RootStore>()(
  immer((...a) => ({
    ...createSessionSlice(...a),
    ...createTerminalSlice(...a),
    ...createWindowSlice(...a),
    ...createSettingsSlice(...a),
    ...createWorkspaceSlice(...a),
    ...createNotificationsSlice(...a),
  }))
)
