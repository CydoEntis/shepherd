import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { UiStateSchema } from '@shared/ipc-types'
import type { UiState } from '@shared/ipc-types'

function uiStatePath(): string {
  return join(app.getPath('userData'), 'ui-state.json')
}

export function getUiState(): UiState {
  const path = uiStatePath()
  if (!existsSync(path)) return UiStateSchema.parse({})
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    const parsed = UiStateSchema.safeParse(raw)
    return parsed.success ? parsed.data : UiStateSchema.parse({})
  } catch {
    return UiStateSchema.parse({})
  }
}

export function setUiState(patch: Partial<UiState>): UiState {
  const merged = UiStateSchema.parse({ ...getUiState(), ...patch })
  const path = uiStatePath()
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}
