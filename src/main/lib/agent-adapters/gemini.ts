import type { AgentAdapter, AgentEvent, ParseBuffer } from './base'

function toTerminal(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

function parseJsonEvent(line: string, buf: ParseBuffer): AgentEvent[] {
  let ev: Record<string, unknown>
  try { ev = JSON.parse(line) } catch { return [] }
  if (!ev || typeof ev.type !== 'string') return []

  if (ev.type === 'init') { buf.jsonMode = true; return [] }
  if (!buf.jsonMode) return []

  const events: AgentEvent[] = []

  switch (ev.type) {

    case 'message': {
      if (ev.role !== 'assistant') break
      const text = typeof ev.content === 'string' ? ev.content : ''
      events.push({ kind: 'status', status: 'running' })
      if (text) events.push({ kind: 'display', content: '\r\n' + toTerminal(text) + '\r\n' })
      break
    }

    case 'tool_use': {
      const name = String(ev.tool_name ?? 'tool')
      const params = ev.parameters && typeof ev.parameters === 'object'
        ? JSON.stringify(ev.parameters).slice(0, 120)
        : ''
      events.push({ kind: 'status', status: 'running' })
      events.push({
        kind: 'display',
        content: `\r\n\x1b[36m⚡ ${name}\x1b[0m${params ? `  \x1b[90m${params}\x1b[0m` : ''}\r\n`
      })
      break
    }

    case 'tool_result': {
      const out = typeof ev.output === 'string' ? ev.output : ''
      if (out.trim()) {
        const t = out.length > 600 ? out.slice(0, 600) + '…' : out
        events.push({ kind: 'display', content: `\x1b[90m${toTerminal(t.trim())}\x1b[0m\r\n` })
      }
      break
    }

    case 'result': {
      const stats = ev.stats as Record<string, unknown> | undefined
      const ms = typeof stats?.duration_ms === 'number' ? stats.duration_ms : null
      const meta = ms != null ? `${(ms / 1000).toFixed(1)}s` : ''
      events.push({ kind: 'status', status: 'waiting-input' })
      events.push({
        kind: 'display',
        content: `\r\n\x1b[32m✓ Done\x1b[0m${meta ? `  \x1b[90m${meta}\x1b[0m` : ''}\r\n\r\n`
      })
      break
    }

    case 'error': {
      const msg = String(ev.message ?? 'Unknown error')
      events.push({ kind: 'status', status: 'waiting-input' })
      events.push({ kind: 'display', content: `\r\n\x1b[31m✗ ${msg}\x1b[0m\r\n\r\n` })
      break
    }
  }

  return events
}

export const geminiAdapter: AgentAdapter = {
  name: 'gemini',

  detect(command: string): boolean {
    const base = command.trimStart().split(/\s+/)[0].replace(/\.exe$/i, '').toLowerCase()
    return base === 'gemini'
  },

  modifyCommand(command: string): string {
    return command
  },

  parseChunk(chunk: string, buf: ParseBuffer): AgentEvent[] {
    const events: AgentEvent[] = []
    buf.partial += chunk
    const lines = buf.partial.split('\n')
    buf.partial = lines.pop() ?? ''

    for (const raw of lines) {
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      if (!line.trim()) {
        events.push({ kind: 'display', content: raw + '\n' })
        continue
      }
      if (line.startsWith('{')) {
        const jsonEvents = parseJsonEvent(line, buf)
        if (jsonEvents.length > 0) {
          events.push(...jsonEvents)
          continue
        }
      }
      events.push({ kind: 'display', content: raw + '\n' })
    }

    return events
  }
}
