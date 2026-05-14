import type { AgentStatus } from '@shared/ipc-types'

export interface AgentStatusEvent { kind: 'status'; status: AgentStatus }
export interface AgentDisplayEvent { kind: 'display'; content: string }
export type AgentEvent = AgentStatusEvent | AgentDisplayEvent

export interface ParseBuffer {
  partial: string
  /** Set to true once we observe a mode-confirming event, meaning the agent is
   *  running with structured JSON output. Until then, status events are suppressed
   *  so interactive-mode JSON-like output can't trigger false-positive state changes. */
  jsonMode?: boolean
}

export interface AgentAdapter {
  readonly name: string
  /** Returns true if this adapter owns the given agent command string. */
  detect(command: string): boolean
  /** Appends the structured-output flag to the command if not already present. */
  modifyCommand(command: string): string
  /** Parses a raw PTY chunk. Returns status + display events. Non-JSON lines pass through. */
  parseChunk(chunk: string, buf: ParseBuffer): AgentEvent[]
}
