import type { StateCreator } from 'zustand'
import type { AppSettings, Note } from '@shared/ipc-types'
import { DEFAULT_SETTINGS } from '@shared/ipc-types'
import type { RootStore } from '../../store/root.store'
import { ipc } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import { getSettings, setSettings } from './settings.service'

export interface SettingsSlice {
  settings: AppSettings
  settingsLoaded: boolean
  notes: Note[]

  loadSettings: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  saveNote: (id: string, content: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  addNote: (id: string) => void
  patchNoteContent: (id: string, content: string) => void
  addNoteFolder: (name: string, color?: string) => Promise<string>
  deleteNoteFolder: (id: string) => Promise<void>
  renameNoteFolder: (id: string, name: string, color?: string) => Promise<void>
  setNoteFolder: (noteId: string, folderId: string | null) => Promise<void>
  setNoteColor: (noteId: string, color: string | null) => Promise<void>
  setNoteWorkspace: (noteId: string, workspaceId: string | null) => Promise<void>
}

const VALID_THEMES = new Set(['system', 'light', 'dark', 'space', 'nebula', 'solar', 'aurora', 'mars', 'pulsar', 'cosmos', 'void'])
const storedTheme = localStorage.getItem('orbit-theme')
const initialTheme = (storedTheme && VALID_THEMES.has(storedTheme) ? storedTheme : null) as AppSettings['theme'] | null

export const createSettingsSlice: StateCreator<RootStore, [['zustand/immer', never]], [], SettingsSlice> = (set, get) => ({
  settings: initialTheme ? { ...DEFAULT_SETTINGS, theme: initialTheme } : DEFAULT_SETTINGS,
  settingsLoaded: false,
  notes: [],

  loadSettings: async () => {
    const settings = await getSettings()
    if (settings.theme) localStorage.setItem('orbit-theme', settings.theme)
    set((state) => {
      state.settings = settings
      state.settingsLoaded = true
    })
    const notes = (await ipc.invoke(IPC.NOTES_LOAD)) as Note[]
    set((state) => { state.notes = notes })
  },

  updateSettings: async (patch) => {
    const updated = await setSettings(patch)
    if (updated.theme) localStorage.setItem('orbit-theme', updated.theme)
    set((state) => {
      state.settings = updated
    })
  },

  saveNote: async (id: string, content: string) => {
    set((state) => {
      const idx = state.notes.findIndex(n => n.id === id)
      if (idx !== -1) {
        state.notes[idx] = { ...state.notes[idx], content, updatedAt: Date.now() }
      }
    })
    await ipc.invoke(IPC.NOTES_SAVE, { id, content })
  },

  deleteNote: async (id: string) => {
    set((state) => { state.notes = state.notes.filter(n => n.id !== id) })
    await ipc.invoke(IPC.NOTES_DELETE, { id })
  },

  addNote: (id: string) => {
    set((state) => {
      state.notes.unshift({ id, content: '', updatedAt: Date.now() })
    })
  },

  patchNoteContent: (id: string, content: string) => {
    set((state) => {
      const idx = state.notes.findIndex(n => n.id === id)
      if (idx !== -1) state.notes[idx] = { ...state.notes[idx], content, updatedAt: Date.now() }
    })
  },

  addNoteFolder: async (name: string, color?: string) => {
    const id = crypto.randomUUID()
    const current = get().settings.noteFolders ?? []
    await get().updateSettings({ noteFolders: [...current, { id, name, color }] })
    return id
  },

  deleteNoteFolder: async (folderId: string) => {
    const { settings, updateSettings } = get()
    const noteFolders = (settings.noteFolders ?? []).filter(f => f.id !== folderId)
    const noteFolderMap = { ...(settings.noteFolderMap ?? {}) }
    for (const noteId of Object.keys(noteFolderMap)) {
      if (noteFolderMap[noteId] === folderId) delete noteFolderMap[noteId]
    }
    await updateSettings({ noteFolders, noteFolderMap })
  },

  renameNoteFolder: async (folderId: string, name: string, color?: string) => {
    const current = get().settings.noteFolders ?? []
    await get().updateSettings({ noteFolders: current.map(f => f.id === folderId ? { ...f, name, ...(color !== undefined ? { color } : {}) } : f) })
  },

  setNoteFolder: async (noteId: string, folderId: string | null) => {
    const current = { ...(get().settings.noteFolderMap ?? {}) }
    if (folderId === null) {
      delete current[noteId]
    } else {
      current[noteId] = folderId
    }
    await get().updateSettings({ noteFolderMap: current })
  },

  setNoteColor: async (noteId: string, color: string | null) => {
    const current = { ...(get().settings.noteColorMap ?? {}) }
    if (color === null) {
      delete current[noteId]
    } else {
      current[noteId] = color
    }
    await get().updateSettings({ noteColorMap: current })
  },

  setNoteWorkspace: async (noteId: string, workspaceId: string | null) => {
    const current = { ...(get().settings.noteWorkspaceMap ?? {}) }
    if (workspaceId === null) {
      delete current[noteId]
    } else {
      current[noteId] = workspaceId
    }
    await get().updateSettings({ noteWorkspaceMap: current })
  },
})
