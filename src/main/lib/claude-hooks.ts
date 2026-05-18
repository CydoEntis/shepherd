import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Written to ~/.claude/orbit-hook.js on first session creation.
// Using a script file avoids shell quoting issues with `node -e "..."` on Windows —
// cmd.exe/PowerShell handle quoted file paths more reliably than inline JS.
//
// When the path arg ends with "/dynamic" the script reads stdin (Claude Code pipes
// {"tool_name":"..."} there for PreToolUse hooks) and picks the status based on the
// tool name — user-input tools → waiting-input, everything else → running.
// Fixed-path calls (Stop hook) skip stdin and POST immediately.
const HOOK_SCRIPT =
  `try{var a=process.argv.slice(2),port=+a[0],p=a[1];` +
  `function post(path){` +
    `var r=require('http').request({hostname:'127.0.0.1',port:port,path:path,method:'POST'},function(){process.exit(0)});` +
    `r.on('error',function(){process.exit(0)});` +
    `setTimeout(function(){process.exit(0)},2000);` +
    `r.end()}` +
  `if(p.slice(-8)==='/dynamic'){` +
    `var base=p.slice(0,-8),chunks=[];` +
    `process.stdin.on('data',function(d){chunks.push(d)});` +
    `process.stdin.on('end',function(){` +
      `var status='running';` +
      `try{var d=JSON.parse(Buffer.concat(chunks).toString());` +
      `if(/AskUser|AskFollowup|UserInput|input_required/i.test(d.tool_name||''))status='waiting-input';}` +
      `catch(e){}` +
      `post(base+'/'+status);` +
    `});` +
  `}else{post(p)}` +
  `}catch(e){process.exit(0)}`

// Always write to the GLOBAL settings file (~/.claude/settings.local.json).
// Claude Code reads this regardless of project structure, so it works even when
// the session CWD has no .git root (e.g. ~/Orbit).
function globalSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.local.json')
}

function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try { return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> } catch { return {} }
}

type HookEntry = Record<string, unknown>
type HooksMap = Record<string, HookEntry[]>

function nodeCmd(port: number, urlPath: string): string {
  // Reference the script file by path instead of inlining JS — avoids Windows shell
  // quoting issues. The path is double-quoted to handle spaces in the home directory.
  const scriptPath = join(homedir(), '.claude', 'orbit-hook.js')
  return `node "${scriptPath}" ${port} ${urlPath}`
}

export function writeClaudeHooksConfig(sessionId: string, port: number): void {
  const settingsPath = globalSettingsPath()
  const settings = readSettings(settingsPath)
  const hooks = ((settings.hooks as HooksMap | undefined) ?? {}) as HooksMap

  const base = `/orbit/status/${sessionId}`
  if (!hooks.PreToolUse) hooks.PreToolUse = []
  if (!hooks.Stop) hooks.Stop = []
  hooks.PreToolUse.push({ matcher: '.*', hooks: [{ type: 'command', command: nodeCmd(port, `${base}/dynamic`) }] })
  // Stop entries omit matcher — it is a lifecycle event, not a tool event
  hooks.Stop.push({ hooks: [{ type: 'command', command: nodeCmd(port, `${base}/done`) }] })
  settings.hooks = hooks

  try {
    const claudeDir = join(homedir(), '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'orbit-hook.js'), HOOK_SCRIPT)
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  } catch { /* best-effort; OSC detection is the fallback */ }
}

export function removeClaudeHooksConfig(sessionId: string): void {
  const settingsPath = globalSettingsPath()
  if (!existsSync(settingsPath)) return
  try {
    const settings = readSettings(settingsPath)
    const hooks = settings.hooks as HooksMap | undefined
    if (!hooks) return

    const pattern = `/orbit/status/${sessionId}/`
    const strip = (arr: HookEntry[]) =>
      arr.filter((e) => {
        const hookList = e.hooks as { command?: string }[] | undefined
        return !hookList?.some((h) => h.command?.includes(pattern))
      })

    if (hooks.PreToolUse) hooks.PreToolUse = strip(hooks.PreToolUse)
    if (hooks.Stop) hooks.Stop = strip(hooks.Stop)
    if (hooks.PreToolUse?.length === 0) delete hooks.PreToolUse
    if (hooks.Stop?.length === 0) delete hooks.Stop
    if (Object.keys(hooks).length === 0) delete settings.hooks

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  } catch {}
}
