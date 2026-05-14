import { ipcMain, shell, clipboard } from 'electron'
import { promises as fs } from 'fs'
import { join, dirname, resolve, basename } from 'path'
import { exec, execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { IPC } from '@shared/ipc-channels'
import type { FsEntry, GitStatusEntry } from '@shared/ipc-types'
import { getWorktreesDir } from '../../lib/paths'

const CANDIDATE_EDITORS = [
  { name: 'VS Code', command: 'code' },
  { name: 'Cursor', command: 'cursor' },
  { name: 'Zed', command: 'zed' },
  { name: 'Sublime Text', command: 'subl' },
  { name: 'Notepad++', command: 'notepad++' },
]

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
const IGNORE = new Set(['.git', 'node_modules', 'dist', 'out', '.next', '__pycache__'])
const MAX_FILE_BYTES = 5_000_000

async function detectShells(): Promise<{ name: string; path: string }[]> {
  const available: { name: string; path: string }[] = []

  if (process.platform === 'win32') {
    // PowerShell Core — scan versioned install dir
    try {
      const psDir = 'C:\\Program Files\\PowerShell'
      const versions = await fs.readdir(psDir)
      for (const v of [...versions].sort().reverse()) {
        const p = `${psDir}\\${v}\\pwsh.exe`
        try { await fs.access(p); available.push({ name: `PowerShell ${v}`, path: p }); break } catch {}
      }
    } catch {}

    const winCandidates = [
      { name: 'Windows PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
      { name: 'Command Prompt (cmd)', path: 'C:\\Windows\\System32\\cmd.exe' },
      { name: 'Git Bash', path: 'C:\\Program Files\\Git\\bin\\bash.exe' },
      { name: 'Git Bash (x86)', path: 'C:\\Program Files (x86)\\Git\\bin\\bash.exe' },
      { name: 'WSL', path: 'C:\\Windows\\System32\\wsl.exe' },
    ]
    for (const c of winCandidates) {
      try { await fs.access(c.path); available.push(c) } catch {}
    }
  } else {
    const unixCandidates = [
      { name: 'zsh', path: '/bin/zsh' },
      { name: 'bash', path: '/bin/bash' },
      { name: 'sh', path: '/bin/sh' },
      { name: 'fish', path: '/usr/bin/fish' },
      { name: 'zsh (Homebrew)', path: '/usr/local/bin/zsh' },
      { name: 'bash (Homebrew)', path: '/usr/local/bin/bash' },
      { name: 'fish (Homebrew)', path: '/usr/local/bin/fish' },
      { name: 'zsh (Homebrew M1)', path: '/opt/homebrew/bin/zsh' },
      { name: 'bash (Homebrew M1)', path: '/opt/homebrew/bin/bash' },
      { name: 'fish (Homebrew M1)', path: '/opt/homebrew/bin/fish' },
    ]
    for (const c of unixCandidates) {
      try { await fs.access(c.path); available.push(c) } catch {}
    }
  }

  return available
}

export function registerFsIpc(): void {
  ipcMain.handle(IPC.FS_DETECT_SHELLS, async () => detectShells())

  ipcMain.handle(IPC.FS_READ_DIR, async (_, { dirPath }: { dirPath: string }): Promise<FsEntry[]> => {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((e) => !IGNORE.has(e.name))
      .map((e) => ({ name: e.name, path: join(dirPath, e.name), isDirectory: e.isDirectory() }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  })

  ipcMain.handle(IPC.FS_READ_FILE, async (_, { filePath }: { filePath: string }): Promise<string | null> => {
    try {
      const stat = await fs.stat(filePath)
      if (stat.size > MAX_FILE_BYTES) return `[File too large to display: ${(stat.size / 1024).toFixed(0)} KB]`
      return await fs.readFile(filePath, 'utf-8')
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.FS_GIT_STATUS, async (_, { projectRoot }: { projectRoot: string }): Promise<GitStatusEntry[]> => {
    try {
      const { stdout } = await execAsync('git status --porcelain -u', { cwd: projectRoot })
      return stdout.trim().split('\n').filter(Boolean).map((line) => ({
        xy: line.slice(0, 2),
        path: line.slice(3).trim().replace(/^"(.+)"$/, '$1')
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.FS_SHOW_IN_FOLDER, (_event, { filePath }: { filePath: string }) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle(IPC.FS_OPEN_PATH, (_event, { filePath }: { filePath: string }) => {
    return shell.openPath(filePath)
  })

  ipcMain.handle(IPC.FS_OPEN_IN_EDITOR, (_event, { command, filePath }: { command: string; filePath: string }) => {
    spawn(command, [filePath], { detached: true, stdio: 'ignore', shell: true }).unref()
  })

  ipcMain.handle(IPC.FS_DETECT_EDITORS, async () => {
    const probe = process.platform === 'win32' ? 'where' : 'which'
    const results = await Promise.all(
      CANDIDATE_EDITORS.map(async (e) => {
        try {
          const { stdout } = await execAsync(`${probe} ${e.command}`)
          const resolved = stdout.trim().split('\n')[0].trim()
          if (!resolved) return null
          await fs.access(resolved)
          return e
        } catch {
          return null
        }
      })
    )
    return results.filter(Boolean)
  })

  ipcMain.handle(IPC.FS_RENAME, async (_event, { oldPath, newName }: { oldPath: string; newName: string }) => {
    const newPath = join(dirname(oldPath), newName)
    await fs.rename(oldPath, newPath)
  })

  ipcMain.handle(IPC.FS_TRASH, async (_event, { filePath }: { filePath: string }) => {
    await shell.trashItem(filePath)
  })

  ipcMain.handle(IPC.FS_MKDIR, async (_, { dirPath }: { dirPath: string }): Promise<void> => {
    await fs.mkdir(dirPath, { recursive: true })
  })

  ipcMain.handle(IPC.FS_WRITE_FILE, async (_, { filePath, content }: { filePath: string; content: string }): Promise<void> => {
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  })

  ipcMain.handle(IPC.FS_COPY_FILE, async (_, { srcPath, destPath }: { srcPath: string; destPath: string }): Promise<void> => {
    await fs.mkdir(dirname(destPath), { recursive: true })
    await fs.copyFile(srcPath, destPath)
  })

  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, (_event, { url }: { url: string }) => {
    return shell.openExternal(url)
  })

  ipcMain.handle(IPC.CLIPBOARD_READ_TEXT, () => clipboard.readText())

  ipcMain.handle(IPC.FS_FIND_FILES, async (_, { rootPath }: { rootPath: string }): Promise<string[]> => {
    const results: string[] = []
    const MAX = 5000
    async function walk(dir: string): Promise<void> {
      if (results.length >= MAX) return
      let entries: import('fs').Dirent[]
      try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (IGNORE.has(e.name)) continue
        const full = join(dir, e.name)
        if (e.isDirectory()) { await walk(full) }
        else { results.push(full); if (results.length >= MAX) return }
      }
    }
    await walk(rootPath)
    return results
  })

  ipcMain.handle(IPC.FS_GIT_REVIEW, async (_, { projectRoot }: { projectRoot: string }) => {
    interface GitFileInfo { path: string; added: number; deleted: number }
    try {
      const [statusResult, stagedResult, unstagedResult] = await Promise.allSettled([
        execAsync('git status --porcelain -u', { cwd: projectRoot }),
        execAsync('git diff --cached --numstat', { cwd: projectRoot }),
        execAsync('git diff --numstat', { cwd: projectRoot }),
      ])

      const statusLines = statusResult.status === 'fulfilled'
        ? statusResult.value.stdout.trim().split('\n').filter(Boolean)
        : []
      const stagedLines = stagedResult.status === 'fulfilled'
        ? stagedResult.value.stdout.trim().split('\n').filter(Boolean)
        : []
      const unstagedLines = unstagedResult.status === 'fulfilled'
        ? unstagedResult.value.stdout.trim().split('\n').filter(Boolean)
        : []

      // Parse numstat: "<added>\t<deleted>\t<path>"
      function parseNumstat(lines: string[]): Map<string, { added: number; deleted: number }> {
        const m = new Map<string, { added: number; deleted: number }>()
        for (const line of lines) {
          const parts = line.split('\t')
          if (parts.length < 3) continue
          const added = parseInt(parts[0], 10) || 0
          const deleted = parseInt(parts[1], 10) || 0
          const p = parts.slice(2).join('\t').trim()
          m.set(p, { added, deleted })
        }
        return m
      }

      const stagedStats = parseNumstat(stagedLines)
      const unstagedStats = parseNumstat(unstagedLines)

      const staged: GitFileInfo[] = []
      const unstaged: GitFileInfo[] = []
      const untracked: string[] = []

      for (const line of statusLines) {
        const xy = line.slice(0, 2)
        const filePath = line.slice(3).trim().replace(/^"(.+)"$/, '$1')
        if (xy === '??') {
          untracked.push(filePath)
        } else {
          const x = xy[0]
          const y = xy[1]
          if (x !== ' ' && x !== '?') {
            const stats = stagedStats.get(filePath) ?? { added: 0, deleted: 0 }
            staged.push({ path: filePath, ...stats })
          }
          if (y !== ' ' && y !== '?') {
            const stats = unstagedStats.get(filePath) ?? { added: 0, deleted: 0 }
            unstaged.push({ path: filePath, ...stats })
          }
        }
      }

      return { staged, unstaged, untracked }
    } catch {
      return { staged: [], unstaged: [], untracked: [] }
    }
  })

  ipcMain.handle(IPC.FS_GIT_STAGE, async (_, { projectRoot, filePath }: { projectRoot: string; filePath: string }) => {
    await execAsync(`git add -- "${filePath}"`, { cwd: projectRoot })
  })

  ipcMain.handle(IPC.FS_GIT_STAGE_ALL, async (_, { projectRoot }: { projectRoot: string }) => {
    await execAsync('git add -A', { cwd: projectRoot })
  })

  ipcMain.handle(IPC.FS_GIT_UNSTAGE_ALL, async (_, { projectRoot }: { projectRoot: string }) => {
    await execAsync('git restore --staged .', { cwd: projectRoot })
  })

  ipcMain.handle(IPC.FS_GIT_BRANCH_INFO, async (_, { projectRoot }: { projectRoot: string }): Promise<{ current: string }> => {
    try {
      const { stdout } = await execAsync('git branch --show-current', { cwd: projectRoot })
      return { current: stdout.trim() || 'HEAD' }
    } catch {
      return { current: 'HEAD' }
    }
  })

  ipcMain.handle(IPC.FS_GIT_LOG, async (_, { projectRoot, baseBranch, limit }: { projectRoot: string; baseBranch?: string; limit?: number }): Promise<{ hash: string; subject: string; relativeDate: string }[]> => {
    try {
      const range = baseBranch ? `${baseBranch}..HEAD` : '-10'
      const flag = baseBranch ? '' : '-n 10'
      const cmd = baseBranch
        ? `git log ${range} --format=%H|%s|%cr`
        : `git log -n ${limit ?? 10} --format=%H|%s|%cr`
      const { stdout } = await execAsync(cmd, { cwd: projectRoot })
      return stdout.trim().split('\n').filter(Boolean).map((line) => {
        const [hash, subject, relativeDate] = line.split('|')
        return { hash: (hash ?? '').slice(0, 7), subject: subject ?? '', relativeDate: relativeDate ?? '' }
      })
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.FS_GIT_UNSTAGE, async (_, { projectRoot, filePath }: { projectRoot: string; filePath: string }) => {
    await execAsync(`git restore --staged -- "${filePath}"`, { cwd: projectRoot })
  })

  ipcMain.handle(IPC.FS_GIT_COMMIT, async (_, { projectRoot, message }: { projectRoot: string; message: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      await execFileAsync('git', ['commit', '-m', message], { cwd: projectRoot })
      return { success: true }
    } catch (err: unknown) {
      const e = err as any
      const stderr = (e.stderr as string | undefined)?.trim()
      const stdout = (e.stdout as string | undefined)?.trim()
      const msg = stderr || stdout || (err instanceof Error ? err.message : String(err))
      return { success: false, error: msg }
    }
  })

  ipcMain.handle(IPC.FS_GIT_PUSH, async (_, { projectRoot }: { projectRoot: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      await execAsync('git push', { cwd: projectRoot })
      return { success: true }
    } catch {
      try {
        const { stdout } = await execAsync('git branch --show-current', { cwd: projectRoot })
        const branch = stdout.trim()
        if (branch) {
          await execAsync(`git push --set-upstream origin ${branch}`, { cwd: projectRoot })
          return { success: true }
        }
      } catch (innerErr: unknown) {
        return { success: false, error: innerErr instanceof Error ? innerErr.message : String(innerErr) }
      }
      return { success: false, error: 'Push failed' }
    }
  })

  ipcMain.handle(IPC.FS_GIT_WORKTREE_CREATE, async (_, { projectRoot, branchName }: { projectRoot: string; branchName: string }): Promise<{ worktreePath: string; branchName: string; baseBranch: string }> => {
    const { stdout: baseOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot })
    const baseBranch = baseOut.trim() || 'main'
    const suffix = branchName.split('/').pop() ?? 'session'
    const projectName = basename(projectRoot)

    // Place worktrees under the Orbit data dir, grouped by project
    const worktreesBase = join(getWorktreesDir(), projectName)
    await fs.mkdir(worktreesBase, { recursive: true })
    let worktreePath = join(worktreesBase, suffix)
    let counter = 2
    while (true) {
      try { await fs.access(worktreePath); worktreePath = join(worktreesBase, `${suffix}-${counter++}`) }
      catch { break }
    }

    const alreadyUsed = (stderr: string): string | null => {
      const m = /already used by worktree at '([^']+)'/.exec(stderr)
      return m ? m[1] : null
    }

    try {
      await execAsync(`git worktree add "${worktreePath}" -b "${branchName}"`, { cwd: projectRoot })
    } catch (err: unknown) {
      const msg = (err as any).stderr as string ?? String(err)
      if (msg.includes('already exists')) {
        // Branch exists from a prior session — check it out directly
        try {
          await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, { cwd: projectRoot })
        } catch (err2: unknown) {
          const msg2 = (err2 as any).stderr as string ?? String(err2)
          const existing = alreadyUsed(msg2)
          if (existing) return { worktreePath: existing, branchName, baseBranch }
          throw err2
        }
      } else {
        throw err
      }
    }

    return { worktreePath, branchName, baseBranch }
  })

  ipcMain.handle(IPC.FS_GIT_WORKTREE_REMOVE, async (_, { projectRoot, worktreePath }: { projectRoot: string; worktreePath: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectRoot })
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.FS_GIT_WORKTREE_STATS, async (_, { worktreePath, baseBranch }: { worktreePath: string; baseBranch: string }): Promise<{ added: number; deleted: number; commits: number }> => {
    function parseShortstat(s: string): { added: number; deleted: number } {
      return {
        added: parseInt(s.match(/(\d+) insertion/)?.[1] ?? '0', 10),
        deleted: parseInt(s.match(/(\d+) deletion/)?.[1] ?? '0', 10),
      }
    }
    try {
      const [branchRes, workRes, stageRes, countRes] = await Promise.allSettled([
        execAsync(`git diff ${baseBranch}...HEAD --shortstat`, { cwd: worktreePath }),
        execAsync('git diff --shortstat', { cwd: worktreePath }),
        execAsync('git diff --cached --shortstat', { cwd: worktreePath }),
        execAsync(`git rev-list ${baseBranch}..HEAD --count`, { cwd: worktreePath }),
      ])
      const branch = branchRes.status === 'fulfilled' ? parseShortstat(branchRes.value.stdout) : { added: 0, deleted: 0 }
      const work = workRes.status === 'fulfilled' ? parseShortstat(workRes.value.stdout) : { added: 0, deleted: 0 }
      const stage = stageRes.status === 'fulfilled' ? parseShortstat(stageRes.value.stdout) : { added: 0, deleted: 0 }
      const commits = countRes.status === 'fulfilled' ? parseInt(countRes.value.stdout.trim(), 10) || 0 : 0
      return { added: branch.added + work.added + stage.added, deleted: branch.deleted + work.deleted + stage.deleted, commits }
    } catch {
      return { added: 0, deleted: 0, commits: 0 }
    }
  })

  ipcMain.handle(IPC.FS_GIT_DIFF_FILE, async (_, { projectRoot, filePath }: { projectRoot: string; filePath: string }): Promise<string | null> => {
    const rel = filePath.replace(/\\/g, '/')
    try {
      const { stdout: wd } = await execAsync(`git diff -- "${rel}"`, { cwd: projectRoot })
      if (wd) return wd
      const { stdout: st } = await execAsync(`git diff --cached -- "${rel}"`, { cwd: projectRoot })
      if (st) return st
      // Untracked files: git diff --no-index exits with code 1 when files differ
      try {
        const { stdout: un } = await execAsync(`git diff --no-index -- /dev/null "${rel}"`, { cwd: projectRoot })
        if (un) return un
      } catch (unErr: any) {
        if (unErr?.stdout) return unErr.stdout as string
      }
      return null
    } catch {
      return null
    }
  })
}
