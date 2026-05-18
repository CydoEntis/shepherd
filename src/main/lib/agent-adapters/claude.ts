import type { AgentAdapter, AgentEvent, ParseBuffer } from './base'
// ParseBuffer.jsonMode is set when we observe a 'system' event, which only appears
// in --output-format stream-json output. Until then, status events are suppressed so
// interactive-mode JSON-like output (tool results, code blocks, etc.) can't
// accidentally trigger state changes in the session sidebar.

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b): b is { type: 'text'; text: string } => b != null && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

// Normalize \n → \r\n for terminal display, without doubling existing \r\n
function toTerminal(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

function formatToolInput(name: string, input: Record<string, unknown>): string {
  const key: Record<string, string> = {
    Bash: 'command', bash: 'command',
    Read: 'file_path', Write: 'file_path', Edit: 'file_path',
    Grep: 'pattern', Glob: 'pattern',
    WebSearch: 'query', WebFetch: 'url',
  }
  const primary = key[name]
  if (primary && typeof input[primary] === 'string') return String(input[primary]).slice(0, 120)
  return JSON.stringify(input).slice(0, 120)
}

function parseJsonEvent(line: string, buf: ParseBuffer): AgentEvent[] {
  let ev: Record<string, unknown>
  try { ev = JSON.parse(line) } catch { return [] }
  if (!ev || typeof ev.type !== 'string') return []

  // 'system' is the first event in --output-format stream-json output — it confirms
  // structured mode. Before seeing it, suppress all events so interactive-mode
  // output (code blocks, tool results containing JSON) can't cause false transitions.
  if (ev.type === 'system') { buf.jsonMode = true; return [] }
  if (!buf.jsonMode) return []

  const events: AgentEvent[] = []

  switch (ev.type) {

    case 'assistant': {
      const msg = ev.message as Record<string, unknown> | undefined
      const text = extractText(msg?.content)
      events.push({ kind: 'status', status: 'running' })
      if (text) events.push({ kind: 'display', content: '\r\n' + toTerminal(text) + '\r\n' })
      break
    }

    case 'tool_use': {
      const name = String(ev.name ?? 'tool')
      const inputStr = ev.input && typeof ev.input === 'object'
        ? formatToolInput(name, ev.input as Record<string, unknown>)
        : ''
      events.push({ kind: 'status', status: 'running' })
      events.push({
        kind: 'display',
        content: `\r\n\x1b[36m⚡ ${name}\x1b[0m${inputStr ? `  \x1b[90m${inputStr}\x1b[0m` : ''}\r\n`
      })
      break
    }

    case 'tool_result': {
      const out = extractText(ev.content as unknown)
      if (out.trim()) {
        const t = out.length > 600 ? out.slice(0, 600) + '…' : out
        events.push({ kind: 'display', content: `\x1b[90m${toTerminal(t.trim())}\x1b[0m\r\n` })
      }
      break
    }

    case 'result': {
      const isError = ev.is_error === true
      const ms = typeof ev.duration_ms === 'number' ? ev.duration_ms : null
      const cost = typeof ev.total_cost_usd === 'number' ? (ev.total_cost_usd as number) : null
      const meta = [ms != null ? `${(ms / 1000).toFixed(1)}s` : null, cost != null ? `$${cost.toFixed(4)}` : null]
        .filter(Boolean).join(' · ')
      events.push({ kind: 'status', status: isError ? 'waiting-input' : 'done' })
      events.push({
        kind: 'display',
        content: `\r\n\x1b[32m✓ Done\x1b[0m${meta ? `  \x1b[90m${meta}\x1b[0m` : ''}\r\n\r\n`
      })
      break
    }

    case 'error': {
      const msg = String((ev.message ?? ev.error) ?? 'Unknown error')
      events.push({ kind: 'status', status: 'waiting-input' })
      events.push({ kind: 'display', content: `\r\n\x1b[31m✗ ${msg}\x1b[0m\r\n\r\n` })
      break
    }

    // Unknown event types — suppress raw JSON
  }

  return events
}

export const claudeAdapter: AgentAdapter = {
  name: 'claude',

  detect(command: string): boolean {
    const base = command.trimStart().split(/\s+/)[0].replace(/\.exe$/i, '').toLowerCase()
    return base === 'claude'
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
      // Not a JSON event we handle — pass through (prompt text, input echo, etc.)
      events.push({ kind: 'display', content: raw + '\n' })
    }

    return events
  }
}
