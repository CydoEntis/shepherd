import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { AppSettingsSchema, DEFAULT_SETTINGS } from '@shared/ipc-types'
import type { AppSettings } from '@shared/ipc-types'

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

const STALE_SHOW_SHORTCUTS = new Set(['Shift+?', 'Alt+/', '?'])

export function getSettings(): AppSettings {
  const path = settingsPath()
  if (!existsSync(path)) return DEFAULT_SETTINGS
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const parsed = AppSettingsSchema.safeParse(raw)
    if (!parsed.success) return DEFAULT_SETTINGS
    const data = parsed.data
    let dirty = false
    if (STALE_SHOW_SHORTCUTS.has(data.hotkeys.showShortcuts)) {
      data.hotkeys = { ...data.hotkeys, showShortcuts: 'Ctrl+Shift+K' }
      dirty = true
    }
    // Hotkeys were temporarily swapped during a refactor — detect and correct each independently.
    if (data.hotkeys.commandPalette === 'Ctrl+P') {
      data.hotkeys = { ...data.hotkeys, commandPalette: 'Ctrl+Shift+P' }
      dirty = true
    }
    if (data.hotkeys.projectPalette === 'Ctrl+Shift+P') {
      data.hotkeys = { ...data.hotkeys, projectPalette: 'Ctrl+P' }
      dirty = true
    }
    if (dirty) {
      const filePath = settingsPath()
      try { writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8') } catch { /* non-fatal */ }
    }
    return data
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings()
  const merged = AppSettingsSchema.parse({ ...current, ...patch })
  const path = settingsPath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}
