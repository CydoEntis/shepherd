import { app } from 'electron'
import { join } from 'path'

export function getDataDir(): string {
  return join(app.getPath('home'), 'Orbit', '.orbit')
}
