import type { AgentAdapter, AgentEvent, ParseBuffer } from './base'

function toTerminal(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

function parseJsonEvent(line: string, buf: ParseBuffer): AgentEvent[] {
  let ev: Record<string, unknown>
  try { ev = JSON.parse(line) } catch { return [] }
  if (!ev || typeof ev.type !== 'string') return []

  if (ev.type === 'thread.started') { buf.jsonMode = true; return [] }
  if (!buf.jsonMode) return []

  const events: AgentEvent[] = []

  switch (ev.type) {

    case 'turn.started':
      events.push({ kind: 'status', status: 'running' })
      break

    case 'item.started': {
      const item = ev.item as Record<string, unknown> | undefined
      events.push({ kind: 'status', status: 'running' })
      if (item?.type === 'command_execution') {
        const cmd = String(item.command ?? '')
        if (cmd) {
          events.push({
            kind: 'display',
            content: `\r\n\x1b[36m⚡ ${toTerminal(cmd)}\x1b[0m\r\n`
          })
        }
      }
      break
    }

    case 'item.updated':
      // Suppress incremental updates — item.completed has the full content
      break

    case 'item.completed': {
      const item = ev.item as Record<string, unknown> | undefined
      if (!item) break
      switch (item.type) {
        case 'agent_message':
        case 'assistant_message': {
          const text = String(item.text ?? item.content ?? '')
          if (text) events.push({ kind: 'display', content: '\r\n' + toTerminal(text) + '\r\n' })
          break
        }
        case 'command_execution': {
          const out = String(item.output ?? '')
          if (out.trim()) {
            const t = out.length > 600 ? out.slice(0, 600) + '…' : out
            events.push({ kind: 'display', content: `\x1b[90m${toTerminal(t.trim())}\x1b[0m\r\n` })
          }
          break
        }
        case 'file_change': {
          const path = String(item.path ?? '')
          const changeType = String(item.change_type ?? item.type ?? 'modified')
          if (path) {
            events.push({
              kind: 'display',
              content: `\r\n\x1b[33m📝 ${changeType}: ${path}\x1b[0m\r\n`
            })
          }
          break
        }
        // reasoning, web_search, mcp_tool_call, todo_list: suppress
      }
      break
    }

    case 'turn.completed': {
      const usage = ev.usage as Record<string, unknown> | undefined
      const tokens = typeof usage?.output_tokens === 'number' ? usage.output_tokens : null
      const meta = tokens != null ? `${tokens} tokens` : ''
      events.push({ kind: 'status', status: 'waiting-input' })
      events.push({
        kind: 'display',
        content: `\r\n\x1b[32m✓ Done\x1b[0m${meta ? `  \x1b[90m${meta}\x1b[0m` : ''}\r\n\r\n`
      })
      break
    }

    case 'turn.failed': {
      const error = ev.error as Record<string, unknown> | undefined
      const msg = String(error?.message ?? 'Unknown error')
      events.push({ kind: 'status', status: 'waiting-input' })
      events.push({ kind: 'display', content: `\r\n\x1b[31m✗ ${msg}\x1b[0m\r\n\r\n` })
      break
    }

    case 'error': {
      const msg = String((ev as Record<string, unknown>).message ?? 'Unknown error')
      events.push({ kind: 'status', status: 'waiting-input' })
      events.push({ kind: 'display', content: `\r\n\x1b[31m✗ ${msg}\x1b[0m\r\n\r\n` })
      break
    }
  }

  return events
}

export const codexAdapter: AgentAdapter = {
  name: 'codex',

  detect(command: string): boolean {
    const base = command.trimStart().split(/\s+/)[0].replace(/\.exe$/i, '').toLowerCase()
    return base === 'codex'
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
