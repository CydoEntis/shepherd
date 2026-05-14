import { claudeAdapter } from './claude'
import { geminiAdapter } from './gemini'
import { codexAdapter } from './codex'
import type { AgentAdapter } from './base'

const ADAPTERS: AgentAdapter[] = [claudeAdapter, geminiAdapter, codexAdapter]

export function detectAdapter(agentCommand: string): AgentAdapter | undefined {
  return ADAPTERS.find((a) => a.detect(agentCommand))
}

export type { AgentAdapter, AgentEvent, AgentStatusEvent, AgentDisplayEvent, ParseBuffer } from './base'
