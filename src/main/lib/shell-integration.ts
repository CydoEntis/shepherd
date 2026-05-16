import path from 'path'

// PowerShell integration script — defines the custom prompt and PSConsoleHostReadLine
// override that emit OSC 633 + OSC 7. Extracted so it can be used both as a delayed
// stdin write (fallback) and as spawn-time -Command args (preferred, no echo).
function buildPowerShellIntegrationScript(): string {
  const ESC = '[char]27'
  const BEL = '[char]7'
  const osc = (seq: string): string => `[Console]::Write(${ESC}+"]${seq}"+${BEL});`
  return (
    '$Global:__OrbitRL=$function:Global:PSConsoleHostReadLine;' +
    'function Global:PSConsoleHostReadLine {' +
    '$l=if($null -ne $Global:__OrbitRL){& $Global:__OrbitRL}else{[Microsoft.PowerShell.PSConsoleReadLine]::ReadLine($host.Runspace,$ExecutionContext)};' +
    osc('633;C') +
    '$l' +
    '};' +
    'function global:prompt {' +
    osc('633;D') + osc('633;A') +
    '$p=$executionContext.SessionState.Path.CurrentLocation.Path;' +
    "$e=$p.Replace('\\\\','/').Replace('\\','/');" +
    "if(-not $e.StartsWith('/')){$e=\"/$e\"};" +
    osc('7;file://localhost$e') +
    osc('633;B') +
    '"PS $p> "' +
    '}'
  )
}

/**
 * For PowerShell/pwsh on Windows: returns spawn args that pre-load the shell
 * integration script silently (no PSReadLine echo). Pass these as the args array
 * to pty.spawn() instead of using the delayed stdin write.
 * Returns null for all other shells — use getShellIntegrationSequence instead.
 */
export function getShellIntegrationSpawnArgs(
  shellPath: string,
  platform: NodeJS.Platform,
  existingArgs: string[]
): string[] | null {
  if (platform !== 'win32') return null
  const base = path.basename(shellPath).replace(/\.exe$/i, '').toLowerCase()
  if (base !== 'powershell' && base !== 'pwsh') return null
  return ['-NoExit', '-Command', buildPowerShellIntegrationScript(), ...existingArgs]
}

/**
 * Returns a shell integration init command for the given shell, or null when
 * the shell cannot support it (e.g. CMD, PowerShell — PowerShell uses spawn args).
 *
 * Emits OSC 633 sequences (VS Code shell integration protocol):
 *   633;C → command executing  (on Enter press, before output)
 *   633;A → prompt start       (when shell is idle, waiting for input)
 *   633;D → command done       (emitted just before 633;A)
 *
 * Orbit's PTY detector listens for these for instant, timer-free status tracking.
 * OSC 7 (CWD) is also emitted alongside for directory tracking.
 */
export function getShellIntegrationSequence(
  shellPath: string,
  platform: NodeJS.Platform
): string | null {
  const base = path.basename(shellPath).replace(/\.exe$/i, '').toLowerCase()
  const nl = platform === 'win32' ? '\r\n' : '\n'

  switch (base) {
    case 'bash': {
      // DEBUG trap fires before every command → emit 633;C instantly on Enter.
      // Guard with __orbit_in_prompt flag + command-name prefix to prevent
      // the trap from firing for internal PROMPT_COMMAND function calls.
      // PROMPT_COMMAND emits 633;D + OSC 7 + 633;A when the prompt is shown.
      const cmd =
        ' __orbit_in_prompt=0;' +
        ' __orbit_preexec() {' +
        ' if [ "$__orbit_in_prompt" = "0" ] && [[ "$BASH_COMMAND" != "__orbit_"* ]];' +
        " then builtin printf '\\033]633;C\\a'; fi" +
        ' };' +
        " trap '__orbit_preexec' DEBUG;" +
        ' __orbit_prompt() {' +
        '  __orbit_in_prompt=1;' +
        "  builtin printf '\\033]633;D\\a';" +
        "  printf '\\033]7;file://%s%s\\a' \"${HOSTNAME:-localhost}\" \"$(pwd | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read().strip()))' 2>/dev/null || pwd)\";" +
        "  builtin printf '\\033]633;A\\a';" +
        '  __orbit_in_prompt=0' +
        ' };' +
        ' PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND};}__orbit_prompt"'
      return cmd + nl
    }

    case 'zsh': {
      // zsh has native preexec/precmd hook arrays — no trap needed.
      // preexec fires after Enter press, before command runs → 633;C.
      // precmd fires before prompt is shown → 633;D + OSC 7 + 633;A.
      const cmd =
        ' __orbit_preexec() { printf \'\\033]633;C\\a\'; };' +
        ' preexec_functions+=(__orbit_preexec);' +
        ' __orbit_precmd() {' +
        "  printf '\\033]633;D\\a';" +
        "  printf '\\033]7;file://%s%s\\a' \"${HOST:-localhost}\" \"${PWD}\";" +
        "  printf '\\033]633;A\\a'" +
        ' };' +
        ' precmd_functions+=(__orbit_precmd);' +
        ' __orbit_precmd'
      return cmd + nl
    }

    case 'fish': {
      // fish_preexec fires after Enter, before command executes → 633;C.
      // fish_prompt fires before showing the prompt → 633;D + OSC 7 + 633;A.
      const cmd =
        "function __orbit_preexec --on-event fish_preexec; printf '\\e]633;C\\a'; end;" +
        'function __orbit_prompt --on-event fish_prompt;' +
        " printf '\\e]633;D\\a';" +
        " printf '\\e]7;file://%s%s\\a' (hostname 2>/dev/null; or echo localhost) $PWD;" +
        " printf '\\e]633;A\\a';" +
        'end'
      return cmd + nl
    }

    case 'pwsh':
    case 'powershell':
      // PowerShell integration is injected via spawn args (-NoExit -Command) to
      // avoid PSReadLine echoing the script. See getShellIntegrationSpawnArgs.
      return null

    case 'cmd':
      return null

    default:
      return null
  }
}
