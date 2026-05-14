import type { StateCreator } from 'zustand'
import type { RootStore } from '../../store/root.store'

export interface AppNotification {
  id: string
  type: 'agent-done' | 'release-notes'
  title: string
  tabId?: string
  read: boolean
  createdAt: number
}

export interface NotificationsSlice {
  notifications: AppNotification[]
  addNotification: (n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>) => void
  markNotificationRead: (id: string) => void
  markTabNotificationsRead: (tabId: string) => void
  markAllNotificationsRead: () => void
  removeNotification: (id: string) => void
}

export const createNotificationsSlice: StateCreator<RootStore, [['zustand/immer', never]], [], NotificationsSlice> = (set) => ({
  notifications: [],

  addNotification: (n) =>
    set((state) => {
      state.notifications.unshift({
        ...n,
        id: crypto.randomUUID(),
        read: false,
        createdAt: Date.now(),
      })
      if (state.notifications.length > 50) state.notifications.length = 50
    }),

  markNotificationRead: (id) =>
    set((state) => {
      const n = state.notifications.find((x) => x.id === id)
      if (n) n.read = true
    }),

  markTabNotificationsRead: (tabId) =>
    set((state) => {
      state.notifications.forEach((n) => { if (n.tabId === tabId) n.read = true })
    }),

  markAllNotificationsRead: () =>
    set((state) => { state.notifications.forEach((n) => { n.read = true }) }),

  removeNotification: (id) =>
    set((state) => {
      const idx = state.notifications.findIndex((x) => x.id === id)
      if (idx !== -1) state.notifications.splice(idx, 1)
    }),
})
