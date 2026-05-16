import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { webContents } from 'electron'
import { PtyProcess } from '../../lib/pty-process'
import { detectAdapter } from '../../lib/agent-adapters'
import {
  registerSession,
  getSession,
  removeSession,
  listSessions,
  updateSessionMeta
} from './session-registry'
import { IPC } from '@shared/ipc-channels'
import { getSettings } from '../settings/settings-store'
import { getSbxExecutable } from '../../lib/sbx'
import { getMainWindow } from '../../window-manager'
import { startAgentStatusServer, registerAgentStatusCallback, getAgentStatusPort } from '../../lib/agent-status-server'
import { writeClaudeHooksConfig, removeClaudeHooksConfig } from '../../lib/claude-hooks'
import type {
  CreateSessionPayload,
  SessionMeta,
  SessionExitPayload
} from '@shared/ipc-types'

// Per-session idle timers for status signals received via the HTTP hooks path.
// Mirrors PtyProcess's idleTimer for signals that bypass the PTY data stream.
const hookIdleTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Start status server at module load so the port is ready before any session is created.
startAgentStatusServer()
  .then(() => {
    registerAgentStatusCallback((sessionId, status) => {
      clearTimeout(hookIdleTimers.get(sessionId))
      hookIdleTimers.delete(sessionId)
      const updated = updateSessionMeta(sessionId, { agentStatus: status })
      if (updated) { broadcastMetaUpdate(updated); syncTaskbarProgress() }
      if (status === 'waiting-input') {
        hookIdleTimers.set(sessionId, setTimeout(() => {
          hookIdleTimers.delete(sessionId)
          const idled = updateSessionMeta(sessionId, { agentStatus: 'idle' })
          if (idled) { broadcastMetaUpdate(idled); syncTaskbarProgress() }
        }, 5_000))
      }
    })
  })
  .catch(() => { /* hooks won't fire; OSC detection is the fallback */ })

function syncTaskbarProgress(): void {
  const win = getMainWindow()
  if (!win) return
  const anyRunning = listSessions().some((s) => s.agentStatus === 'running')
  win.setProgressBar(anyRunning ? 2 : -1)
}

function resolveShellSpawn(agentCommand?: string, yoloMode?: boolean, noSandbox?: boolean, useSandbox?: boolean): { command: string; args: string[]; sandboxed: boolean } {
  const settings = getSettings()
  const defaultShell = settings.defaultShell
  let cmd = agentCommand
  let sandboxed = false
  if (cmd) {
    const sbxExe = getSbxExecutable()
    const isClaudeCmd = cmd === 'claude' || cmd.startsWith('claude ')
    const autoSandbox = yoloMode && settings.sandboxYoloMode
    const shouldSandbox = (useSandbox || autoSandbox) && sbxExe !== null && !noSandbox
    if (shouldSandbox && sbxExe) {
      sandboxed = true
      if (isClaudeCmd) {
        // Preserve any extra args (e.g. --resume <id>) that come after 'claude'
        const extraArgs = cmd.startsWith('claude ') ? cmd.slice(7).trim() : ''
        const claudeFlags = [
          ...(yoloMode ? ['--dangerously-skip-permissions'] : []),
          ...(extraArgs ? [extraArgs] : [])
        ].filter(Boolean).join(' ')
        cmd = claudeFlags ? `${sbxExe} run claude -- ${claudeFlags}` : `${sbxExe} run claude`
      } else {
        cmd = `${sbxExe} run ${cmd}`
      }
    } else if (yoloMode && isClaudeCmd) {
      cmd = `${cmd} --dangerously-skip-permissions`
    }
  }
  if (process.platform === 'win32') {
    const shell = defaultShell || process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe'
    const shellBase = shell.toLowerCase().split(/[/\\]/).pop() ?? ''
    const isPowerShell = shellBase.startsWith('powershell') || shellBase.startsWith('pwsh')
    return cmd
      ? isPowerShell
        ? { command: shell, args: ['-NoExit', '-Command', cmd], sandboxed }
        : { command: shell, args: ['/k', cmd], sandboxed }
      : { command: shell, args: [], sandboxed }
  }
  const shell = defaultShell || process.env.SHELL || '/bin/bash'
  return cmd
    ? { command: shell, args: ['-c', `${cmd}; exec ${shell}`], sandboxed }
    : { command: shell, args: [], sandboxed }
}

export function createSession(
  payload: CreateSessionPayload,
  subscriberWebContentsId?: number
): SessionMeta {
  const sessionId = randomUUID()
  const home = process.env.USERPROFILE || process.env.HOME || process.cwd()
  const defaultCwd = getSettings().defaultSessionDir || join(home, 'Orbit')
  const cwd = payload.cwd || defaultCwd
  try { mkdirSync(cwd, { recursive: true }) } catch {}
  const agentAdapter = payload.agentCommand ? detectAdapter(payload.agentCommand) : undefined
  const effectiveAgentCommand = agentAdapter && payload.agentCommand
    ? agentAdapter.modifyCommand(payload.agentCommand)
    : payload.agentCommand
  const { command, args, sandboxed } = resolveShellSpawn(effectiveAgentCommand, payload.yoloMode, payload.noSandbox, payload.useSandbox)

  if (agentAdapter?.name === 'claude') {
    const port = getAgentStatusPort()
    if (port !== null) writeClaudeHooksConfig(sessionId, port)
  }

  const meta: SessionMeta = {
    sessionId,
    name: payload.name,
    agentCommand: payload.agentCommand,
    command,
    args,
    cwd,
    status: 'running',
    exitCode: null,
    createdAt: Date.now(),
    pid: null,
    color: payload.color,
    agentStatus: 'idle',
    groupId: payload.groupId,
    yoloMode: payload.yoloMode,
    sandboxed: sandboxed || undefined,
    worktreePath: payload.worktreePath,
    worktreeBranch: payload.worktreeBranch,
    worktreeBaseBranch: payload.worktreeBaseBranch,
    projectRoot: payload.projectRoot,
    workspaceId: payload.workspaceId,
  }

  const pty = new PtyProcess({
    sessionId,
    command,
    args,
    cwd,
    cols: payload.cols,
    rows: payload.rows,
    skipShellIntegration: !!payload.agentCommand,
    agentAdapter,
    onCwdChange: (newCwd) => {
      const updated = updateSessionMeta(sessionId, { cwd: newCwd })
      if (updated) broadcastMetaUpdate(updated)
    },
    onAgentStatus: (agentStatus) => {
      const updated = updateSessionMeta(sessionId, { agentStatus })
      if (updated) {
        broadcastMetaUpdate(updated)
        syncTaskbarProgress()
      }
    },
    onConversationId: (conversationId) => {
      const updated = updateSessionMeta(sessionId, { conversationId })
      if (updated) broadcastMetaUpdate(updated)
    }
  })

  meta.pid = pty.pid ?? null

  if (subscriberWebContentsId != null) {
    pty.subscribe(subscriberWebContentsId)
  }

  pty.onExit((exitCode) => {
    if (agentAdapter?.name === 'claude') removeClaudeHooksConfig(sessionId)
    const updated = updateSessionMeta(sessionId, { status: 'exited', exitCode })
    if (updated) broadcastMetaUpdate(updated)
    syncTaskbarProgress()
    const exitPayload: SessionExitPayload = { sessionId, exitCode }
    for (const id of pty.subscriberIds) {
      const wc = webContents.fromId(id)
      if (wc && !wc.isDestroyed()) {
        wc.send(IPC.SESSION_EXIT, exitPayload)
      }
    }
  })

  registerSession({ meta, pty })

  if (sandboxed) {
    pty.injectOutput('\r\n\x1b[32m[Orbit] Starting Docker sandbox — microVM initializing…\x1b[0m\r\n\r\n')
  }

  return meta
}

export function killSession(sessionId: string): boolean {
  const entry = getSession(sessionId)
  if (!entry) return false
  entry.pty.kill()
  const updated = updateSessionMeta(sessionId, { status: 'killed' })
  if (updated) broadcastMetaUpdate(updated)
  removeSession(sessionId)
  return true
}

export function writeToSession(sessionId: string, data: string): void {
  getSession(sessionId)?.pty.write(data)
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  getSession(sessionId)?.pty.resize(cols, rows)
}

export { listSessions }

export function patchSession(
  sessionId: string,
  patch: Partial<Pick<SessionMeta, 'name' | 'color' | 'groupId' | 'taskStatus' | 'worktreePath' | 'worktreeBranch' | 'worktreeBaseBranch' | 'projectRoot' | 'workspaceId'>>
): SessionMeta | undefined {
  const updated = updateSessionMeta(sessionId, patch)
  if (updated) broadcastMetaUpdate(updated)
  return updated
}

export function replayAndSubscribe(sessionId: string, webContentsId: number): string[] {
  const entry = getSession(sessionId)
  if (!entry) return []
  entry.pty.subscribe(webContentsId) // subscribe FIRST — no race gap
  return entry.pty.getScrollback()
}

function broadcastMetaUpdate(meta: SessionMeta): void {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed()) {
      wc.send(IPC.SESSION_META_UPDATE, meta)
    }
  }
}
