import { createServer } from 'http'
import type { AgentStatus } from '@shared/ipc-types'

type StatusCallback = (sessionId: string, status: AgentStatus) => void

let _port: number | null = null
const _callbacks = new Set<StatusCallback>()

export function registerAgentStatusCallback(cb: StatusCallback): void {
  _callbacks.add(cb)
}

export function getAgentStatusPort(): number | null {
  return _port
}

export function startAgentStatusServer(): Promise<number> {
  if (_port !== null) return Promise.resolve(_port)
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const match = req.url?.match(/^\/orbit\/status\/([^/]+)\/(running|waiting-input|idle|done)$/)
      if (match && req.method === 'POST') {
        const [, sessionId, status] = match
        for (const cb of _callbacks) cb(sessionId, status as AgentStatus)
      }
      res.writeHead(204).end()
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        _port = addr.port
        resolve(_port)
      } else {
        reject(new Error('agent-status-server: no address'))
      }
    })
    server.on('error', reject)
  })
}
