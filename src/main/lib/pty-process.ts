import * as nodePty from 'node-pty'
import { webContents } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { SCROLLBACK_BYTE_LIMIT } from '@shared/constants'
import type { AgentStatus, SessionDataPayload } from '@shared/ipc-types'
import { getShellIntegrationSequence } from './shell-integration'
import type { AgentAdapter, ParseBuffer } from './agent-adapters'

interface PtyOptions {
  sessionId: string
  command: string
  args: string[]
  cwd: string
  cols: number
  rows: number
  skipShellIntegration?: boolean
  agentAdapter?: AgentAdapter
  onCwdChange?: (cwd: string) => void
  onAgentStatus?: (status: AgentStatus) => void
  onConversationId?: (id: string) => void
}

// OSC 9;4 — Windows Terminal progress protocol, emitted by Claude Code itself.
//   9;4;3 → indeterminate / working  (Claude started processing)
//   9;4;0 → clear / done             (Claude finished, prompt returning)
//   9;4;1 → success, 9;4;2 → error   (also treated as done)
const OSC94_WORKING_RE = /\x1b\]9;4;3(?:\x07|\x1b\\)/
const OSC94_DONE_RE = /\x1b\]9;4;[012](?:\x07|\x1b\\)/

// OSC 633 — VS Code shell integration protocol, emitted by Orbit's own shell
// integration injection (shell-integration.ts). Zero-timer, data-driven signals:
//   633;C → command executing (fired instantly on Enter via PSConsoleHostReadLine
//            override in PowerShell, DEBUG trap in bash, preexec hook in zsh/fish)
//   633;A → prompt start (fired when shell is idle and showing its prompt)
const OSC633_C_RE = /\x1b\]633;C(?:\x07|\x1b\\)/
const OSC633_A_RE = /\x1b\]633;A(?:\x07|\x1b\\)/

// OSC 133 — Semantic Prompts / Shell Integration (iTerm2, many CLI tools).
// Equivalent semantics to OSC 633 but widely emitted by non-VS Code tooling.
//   133;A → prompt mark (shell idle, showing prompt)
//   133;C → command start (user submitted input, executing)
//   133;D[;exitCode] → command done (before next 133;A)
const OSC133_C_RE = /\x1b\]133;C(?:\x07|\x1b\\)/
const OSC133_A_RE = /\x1b\]133;A(?:\x07|\x1b\\)/
const OSC133_D_RE = /\x1b\]133;D(?:;\d+)?(?:\x07|\x1b\\)/

// Regex fallback for Claude Code's own interactive output (Claude Code does not
// emit OSC 633 — these fire for per-message status within a claude session).
// Patterns cover both old UI (•, esc to interrupt) and Claude Code v2.x UI
// (+ Verb…, Bash(…), Read(…), etc.).
const AGENT_RUNNING_RE = /\r[*]\r|\n[•+] |esc to interrupt|Bash\(|Read\(|Write\(|Edit\(|Glob\(|Grep\(|Task\(/
const AGENT_WRAP_UP_RE = /※/
// The > prompt ends with cursor-repositioning sequences that ANSI_RE may not fully
// strip, so we don't anchor to $ — just require "> " at the start of a line.
const AGENT_PROMPT_RE = /(^|[\r\n])> /

// Strips ANSI escape sequences so control codes don't break pattern matching.
// The trailing branch also catches single-character sequences like ESC= and ESC>
// (application/normal keypad mode) that Claude Code emits after the > prompt.
const ANSI_RE = /\x1b\[[\x3c-\x3f]?[0-9;]*[A-Za-z]|\x1b[()][AB012]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[^[\]()]/g

// UUID v4 pattern — used to detect Claude conversation IDs from PTY output
const UUID_V4_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
// OSC 7 — emitted by shells/Claude Code when the working directory changes
const OSC7_RE = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*?)(?:\x07|\x1b\\)/

export class PtyProcess {
  private pty: nodePty.IPty
  private scrollback: string[] = []
  private scrollbackBytes = 0
  private conversationId: string | undefined
  private readonly onCwdChange?: (cwd: string) => void
  private readonly onAgentStatus?: (status: AgentStatus) => void
  private readonly onConversationId?: (id: string) => void
  private agentStatus: AgentStatus = 'idle'
  private waitingTimer: ReturnType<typeof setTimeout> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null
  private detectionBuffer = ''
  private cwdBuffer = ''
  private readonly isAgentSession: boolean
  private readonly agentAdapter: AgentAdapter | undefined
  private readonly adapterBuf: ParseBuffer = { partial: '' }
  readonly sessionId: string
  readonly subscriberIds = new Set<number>()

  constructor(opts: PtyOptions) {
    this.sessionId = opts.sessionId
    this.isAgentSession = !!opts.skipShellIntegration
    this.agentAdapter = opts.agentAdapter
    this.onCwdChange = opts.onCwdChange
    this.onAgentStatus = opts.onAgentStatus
    this.onConversationId = opts.onConversationId

    this.pty = nodePty.spawn(opts.command, opts.args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      // WT_SESSION signals to Claude Code (and other agents) that they are running
      // inside a Windows Terminal-compatible host, which causes them to emit OSC 9;4
      // progress sequences used for running/idle status detection.
      env: { ...process.env, WT_SESSION: process.env.WT_SESSION ?? opts.sessionId }
    })

    this.pty.onData((data) => {
      if (this.agentAdapter) {
        // Try structured JSON path first. If the adapter emits status events the agent
        // is running in JSON mode and the adapter owns both status and display.
        // If no status events arrive (command was not modified, interactive mode),
        // fall through to legacy OSC + regex detection so the terminal keeps working.
        this.trackMetadata(data)
        const events = this.agentAdapter.parseChunk(data, this.adapterBuf)
        const hasStatus = events.some((e) => e.kind === 'status')
        if (hasStatus) {
          for (const ev of events) {
            if (ev.kind === 'status') {
              this.clearActivityTimers()
              this.setAgentStatus(ev.status)
              if (ev.status === 'waiting-input') {
                this.idleTimer = setTimeout(() => this.setAgentStatus('idle'), 5_000)
              }
            } else if (ev.kind === 'display') {
              this.storeScrollback(ev.content)
              this.fanOut(ev.content)
            }
          }
        } else {
          // No JSON status — interactive mode. Use legacy detection; pass raw data through.
          this.storeScrollback(data)
          this.detectAgentStatus(data)
          this.fanOut(data)
        }
        // Inactivity watchdog: reset on every chunk so silence → done transition works
        // regardless of which path above ran. clearActivityTimers() cancels this.
        this.resetInactivityTimer()
      } else {
        // Plain shell session — legacy OSC + regex detection.
        this.appendScrollback(data)
        this.detectAgentStatus(data)
        this.fanOut(data)
      }
    })

    const integrationSeq = opts.skipShellIntegration ? null : getShellIntegrationSequence(opts.command, process.platform)
    if (integrationSeq) {
      // 600ms on Windows: PowerShell/pwsh startup is slower than Unix shells.
      const integrationDelay = process.platform === 'win32' ? 600 : 300
      setTimeout(() => {
        try { this.pty.write(integrationSeq) } catch { /* pty may have exited already */ }
      }, integrationDelay)
    }
  }

  private setAgentStatus(status: AgentStatus): void {
    if (this.agentStatus === status) return
    this.agentStatus = status
    this.onAgentStatus?.(status)
  }

  private clearActivityTimers(): void {
    if (this.waitingTimer) { clearTimeout(this.waitingTimer); this.waitingTimer = null }
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null }
  }

  // Resets the output-inactivity watchdog for agent sessions. If the agent goes
  // quiet for 5 seconds while in running state, it's done — transition to waiting-input.
  // This is the primary safety net when OSC 9;4;0 fails to fire (e.g. hook errors).
  private resetInactivityTimer(): void {
    if (this.agentStatus !== 'running') return
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer)
    this.inactivityTimer = setTimeout(() => {
      this.inactivityTimer = null
      if (this.agentStatus === 'running') {
        this.setAgentStatus('waiting-input')
        this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
      }
    }, 5_000)
  }

  // Extracts conversation ID and CWD from raw PTY data without storing to scrollback.
  private trackMetadata(chunk: string): void {
    const match = UUID_V4_RE.exec(chunk)
    if (match && match[0] !== this.conversationId) {
      this.scrollback = []
      this.scrollbackBytes = 0
      this.conversationId = match[0]
      this.onConversationId?.(match[0])
    }

    const osc7 = OSC7_RE.exec(chunk)
    if (osc7) {
      try {
        let cwd = decodeURIComponent(osc7[1])
        if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(cwd)) cwd = cwd.slice(1)
        this.onCwdChange?.(cwd)
      } catch { /* ignore malformed URI */ }
      this.cwdBuffer = ''
    } else {
      this.cwdBuffer = (this.cwdBuffer + chunk.replace(ANSI_RE, '')).slice(-512)
      const lines = this.cwdBuffer.split(/\r?\n/)
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim()
        const winMatch = /^([A-Za-z]:[^>]*)>$/.exec(line)
        if (winMatch) { this.onCwdChange?.(winMatch[1]); this.cwdBuffer = ''; break }
        const unixMatch = /^([/~][^$#]*)\s*[$#]$/.exec(line)
        if (unixMatch) { this.onCwdChange?.(unixMatch[1].trim()); this.cwdBuffer = ''; break }
      }
    }
  }

  // Appends content to the scrollback ring buffer.
  private storeScrollback(content: string): void {
    const bytes = Buffer.byteLength(content, 'utf8')
    this.scrollback.push(content)
    this.scrollbackBytes += bytes
    while (this.scrollbackBytes > SCROLLBACK_BYTE_LIMIT && this.scrollback.length > 1) {
      const removed = this.scrollback.shift()!
      this.scrollbackBytes -= Buffer.byteLength(removed, 'utf8')
    }
  }

  private appendScrollback(chunk: string): void {
    this.trackMetadata(chunk)
    this.storeScrollback(chunk)
  }

  private detectAgentStatus(chunk: string): void {
    this.detectionBuffer = (this.detectionBuffer + chunk).slice(-600)

    // OSC 9;4 and OSC 633 signals are always checked for all session types.
    // Regex-based detection (below) is only used for plain shell sessions —
    // agent sessions (Claude Code v2.x+) have a persistent > input bar that
    // makes prompt/running regexes unreliable. Those sessions use hooks + OSC exclusively.

    if (OSC94_DONE_RE.test(this.detectionBuffer)) {
      this.detectionBuffer = ''
      this.clearActivityTimers()
      this.setAgentStatus('waiting-input')
      this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
      return
    }
    if (OSC94_WORKING_RE.test(this.detectionBuffer)) {
      this.detectionBuffer = ''
      this.clearActivityTimers()
      this.setAgentStatus('running')
      return
    }

    if (OSC633_C_RE.test(this.detectionBuffer)) {
      this.detectionBuffer = ''
      this.clearActivityTimers()
      this.setAgentStatus('running')
      this.waitingTimer = setTimeout(() => {
        this.setAgentStatus('waiting-input')
        this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
      }, 60_000)
      return
    }

    if (OSC633_A_RE.test(this.detectionBuffer)) {
      this.detectionBuffer = ''
      this.clearActivityTimers()
      this.setAgentStatus('waiting-input')
      this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
      return
    }

    if (OSC133_C_RE.test(this.detectionBuffer)) {
      this.detectionBuffer = ''
      this.clearActivityTimers()
      this.setAgentStatus('running')
      this.waitingTimer = setTimeout(() => {
        this.setAgentStatus('waiting-input')
        this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
      }, 60_000)
      return
    }

    if (OSC133_A_RE.test(this.detectionBuffer) || OSC133_D_RE.test(this.detectionBuffer)) {
      this.detectionBuffer = ''
      this.clearActivityTimers()
      this.setAgentStatus('waiting-input')
      this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
      return
    }

    // OSC fallback for agent sessions: ※ (wrap-up) and > prompt are Claude Code-specific
    // markers reliable enough to use even when OSC 9;4 fails to fire (e.g. hook errors).
    // Only checked when already running so the persistent > input bar doesn't false-fire.
    const plain = this.detectionBuffer.replace(ANSI_RE, '')
    if (this.agentStatus === 'running') {
      if (AGENT_WRAP_UP_RE.test(plain)) {
        this.detectionBuffer = ''
        this.clearActivityTimers()
        this.waitingTimer = setTimeout(() => {
          this.setAgentStatus('waiting-input')
          this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
        }, 1_000)
        return
      }
      if (AGENT_PROMPT_RE.test(plain)) {
        this.detectionBuffer = ''
        this.clearActivityTimers()
        this.setAgentStatus('waiting-input')
        this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
        return
      }
    }

    if (this.isAgentSession) return

    if (this.agentStatus === 'running' && AGENT_PROMPT_RE.test(plain)) {
      this.clearActivityTimers()
      this.detectionBuffer = ''
      this.setAgentStatus('waiting-input')
      this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
      return
    }

    const isRunning = AGENT_RUNNING_RE.test(plain)
    const isWrappingUp = AGENT_WRAP_UP_RE.test(plain)
    if (!isRunning && !isWrappingUp) return

    if (AGENT_PROMPT_RE.test(plain)) {
      this.detectionBuffer = ''
      this.clearActivityTimers()
      this.setAgentStatus('waiting-input')
      this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
      return
    }

    this.detectionBuffer = ''
    this.setAgentStatus('running')
    this.clearActivityTimers()

    const waitMs = isWrappingUp ? 1_000 : 1_500
    this.waitingTimer = setTimeout(() => {
      this.setAgentStatus('waiting-input')
      this.idleTimer = setTimeout(() => { this.setAgentStatus('idle') }, 5_000)
    }, waitMs)
  }

  getConversationId(): string | undefined {
    return this.conversationId
  }

  private fanOut(data: string): void {
    const payload: SessionDataPayload = { sessionId: this.sessionId, data }
    for (const id of this.subscriberIds) {
      const wc = webContents.fromId(id)
      if (wc && !wc.isDestroyed()) {
        wc.send(IPC.SESSION_DATA, payload)
      } else {
        this.subscriberIds.delete(id)
      }
    }
  }

  subscribe(webContentsId: number): void {
    this.subscriberIds.add(webContentsId)
  }

  unsubscribe(webContentsId: number): void {
    this.subscriberIds.delete(webContentsId)
  }

  getScrollback(): string[] {
    return [...this.scrollback]
  }

  injectOutput(data: string): void {
    this.storeScrollback(data)
    this.fanOut(data)
  }

  write(data: string): void {
    if (/[\r\n]/.test(data) && (this.isAgentSession || this.agentStatus !== 'running')) {
      this.clearActivityTimers()
      this.setAgentStatus('running')
    }
    this.pty.write(data)
  }

  resize(cols: number, rows: number): void {
    this.pty.resize(cols, rows)
  }

  get pid(): number | undefined {
    return this.pty.pid
  }

  onExit(cb: (exitCode: number) => void): void {
    this.pty.onExit(({ exitCode }) => cb(exitCode))
  }

  kill(signal?: string): void {
    if (this.waitingTimer) clearTimeout(this.waitingTimer)
    if (this.idleTimer) clearTimeout(this.idleTimer)
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer)
    this.pty.kill(signal)
  }
}
