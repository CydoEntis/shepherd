import type { StateCreator } from 'zustand'
import type { AppSettings } from '@shared/ipc-types'
import { DEFAULT_SETTINGS } from '@shared/ipc-types'
import type { RootStore } from '../../store/root.store'
import { getSettings, setSettings } from './settings.service'

export interface SettingsSlice {
  settings: AppSettings
  settingsLoaded: boolean

  loadSettings: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
}

const VALID_THEMES = new Set(['system', 'light', 'dark', 'space', 'nebula', 'solar', 'aurora', 'mars', 'pulsar', 'cosmos', 'void'])
const storedTheme = localStorage.getItem('orbit-theme')
const initialTheme = (storedTheme && VALID_THEMES.has(storedTheme) ? storedTheme : null) as AppSettings['theme'] | null

export const createSettingsSlice: StateCreator<RootStore, [['zustand/immer', never]], [], SettingsSlice> = (set) => ({
  settings: initialTheme ? { ...DEFAULT_SETTINGS, theme: initialTheme } : DEFAULT_SETTINGS,
  settingsLoaded: false,

  loadSettings: async () => {
    const settings = await getSettings()
    if (settings.theme) localStorage.setItem('orbit-theme', settings.theme)
    set((state) => {
      state.settings = settings
      state.settingsLoaded = true
    })
  },

  updateSettings: async (patch) => {
    const updated = await setSettings(patch)
    if (updated.theme) localStorage.setItem('orbit-theme', updated.theme)
    set((state) => {
      state.settings = updated
    })
  },
})
