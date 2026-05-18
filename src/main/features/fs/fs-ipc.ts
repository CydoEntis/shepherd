import { ipcMain, shell, clipboard } from 'electron'
import { promises as fs } from 'fs'
import { join, dirname, resolve, extname, relative, sep } from 'path'
import ignore, { type Ignore } from 'ignore'
import { exec, execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { IPC } from '@shared/ipc-channels'
import type { FsEntry, GitStatusEntry } from '@shared/ipc-types'

const CANDIDATE_EDITORS = [
  { name: 'VS Code', command: 'code' },
  { name: 'Cursor', command: 'cursor' },
  { name: 'Zed', command: 'zed' },
  { name: 'Sublime Text', command: 'subl' },
  { name: 'Notepad++', command: 'notepad++' },
]

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
const IGNORE = new Set([
  // VCS
  '.git', '.svn', '.hg',
  // Dependencies
  'node_modules', 'vendor', 'bower_components',
  // Build outputs
  'dist', 'out', 'build', '.next', '.nuxt', '.svelte-kit', '.vite', '.expo',
  'target', '_build', '.build', 'storybook-static',
  // Python
  '__pycache__', '.venv', 'venv', 'env', '.mypy_cache', '.pytest_cache', '.ruff_cache',
  // Caches & temp
  '.cache', '.turbo', '.parcel-cache', '.sass-cache', '.temp', '.tmp', 'tmp', 'temp',
  // Coverage / test output
  'coverage', '.nyc_output',
  // Logs
  'logs',
])
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

  ipcMain.handle(IPC.FS_COPY_PATH, async (_, { srcPath, destPath }: { srcPath: string; destPath: string }): Promise<void> => {
    async function copyRecursive(src: string, dest: string): Promise<void> {
      const stat = await fs.stat(src)
      if (stat.isDirectory()) {
        await fs.mkdir(dest, { recursive: true })
        const entries = await fs.readdir(src, { withFileTypes: true })
        await Promise.all(entries.map((e) => copyRecursive(join(src, e.name), join(dest, e.name))))
      } else {
        await fs.mkdir(dirname(dest), { recursive: true })
        await fs.copyFile(src, dest)
      }
    }
    // Auto-rename the top-level dest if it already exists (e.g. file (1).txt, file (2).txt)
    async function findAvailableDest(dest: string): Promise<string> {
      try { await fs.access(dest) } catch { return dest }
      const ext = extname(dest)
      const base = dest.slice(0, dest.length - ext.length)
      for (let i = 1; i < 1000; i++) {
        const candidate = `${base} (${i})${ext}`
        try { await fs.access(candidate) } catch { return candidate }
      }
      return dest
    }
    await copyRecursive(srcPath, await findAvailableDest(destPath))
  })

  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, (_event, { url }: { url: string }) => {
    return shell.openExternal(url)
  })

  ipcMain.handle(IPC.CLIPBOARD_READ_TEXT, () => clipboard.readText())

  ipcMain.handle(IPC.FS_FIND_FILES, async (_, { rootPath }: { rootPath: string }): Promise<string[]> => {
    const results: string[] = []
    const MAX = 5000

    // Build a root-level ignore instance from .gitignore if present
    async function loadGitignore(dir: string): Promise<Ignore> {
      const ig = ignore()
      try {
        const raw = await fs.readFile(join(dir, '.gitignore'), 'utf-8')
        ig.add(raw)
      } catch { /* no .gitignore — that's fine */ }
      return ig
    }

    const rootIg = await loadGitignore(rootPath)
    // Per-directory ignore instances (for nested .gitignore files in monorepos)
    const igCache = new Map<string, Ignore>([[rootPath, rootIg]])

    async function getIg(dir: string): Promise<Ignore> {
      if (igCache.has(dir)) return igCache.get(dir)!
      const parentIg = await getIg(dirname(dir))
      const local = ignore()
      try {
        const raw = await fs.readFile(join(dir, '.gitignore'), 'utf-8')
        local.add(raw)
      } catch { /* none */ }
      // Merge parent rules into local so relative paths resolve correctly
      const merged = ignore()
      merged.add(parentIg)
      merged.add(local)
      igCache.set(dir, merged)
      return merged
    }

    async function walk(dir: string): Promise<void> {
      if (results.length >= MAX) return
      let entries: import('fs').Dirent[]
      try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
      const ig = await getIg(dir)
      for (const e of entries) {
        if (IGNORE.has(e.name)) continue
        if (e.isDirectory() && e.name.startsWith('.')) continue
        const full = join(dir, e.name)
        // Test relative path from rootPath using forward slashes (gitignore convention)
        const rel = relative(rootPath, full).split(sep).join('/')
        try { if (ig.ignores(rel)) continue } catch { /* ignore is strict about paths — skip bad ones */ }
        if (e.isDirectory()) { await walk(full) }
        else { results.push(full); if (results.length >= MAX) return }
      }
    }
    await walk(rootPath)
    return results
  })

  ipcMain.handle(IPC.FS_SEARCH_IN_FILES, async (_, { rootPath, query, caseSensitive = false }: { rootPath: string; query: string; caseSensitive?: boolean }) => {
    if (!query.trim()) return []
    interface SearchResult { filePath: string; lineNumber: number; lineContent: string; matchStart: number; matchEnd: number }
    const results: SearchResult[] = []
    const MAX_RESULTS = 500
    const searchText = caseSensitive ? query : query.toLowerCase()
    const BINARY_RE = /\.(png|jpg|jpeg|gif|webp|bmp|ico|svg|pdf|zip|tar|gz|7z|exe|dll|bin|so|dylib|wasm|ttf|woff|woff2|eot|mp3|mp4|avi|mov|mkv|db|sqlite)$/i
    async function walk(dir: string): Promise<void> {
      if (results.length >= MAX_RESULTS) return
      let entries: import('fs').Dirent[]
      try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
      const SEARCH_IGNORE = new Set([...IGNORE, '.vscode', 'coverage', '.turbo', 'build'])
      for (const e of entries) {
        if (SEARCH_IGNORE.has(e.name)) continue
        if (results.length >= MAX_RESULTS) return
        const full = join(dir, e.name)
        if (e.isDirectory()) { await walk(full) }
        else {
          if (BINARY_RE.test(e.name)) continue
          let content: string
          try {
            const stat = await fs.stat(full)
            if (stat.size > 500_000) continue
            content = await fs.readFile(full, 'utf-8')
          } catch { continue }
          const lines = content.split('\n')
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const searchLine = caseSensitive ? line : line.toLowerCase()
            const idx = searchLine.indexOf(searchText)
            if (idx !== -1) {
              results.push({ filePath: full.replace(/\\/g, '/'), lineNumber: i + 1, lineContent: line.slice(0, 300), matchStart: idx, matchEnd: idx + query.length })
              if (results.length >= MAX_RESULTS) return
            }
          }
        }
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

  ipcMain.handle(IPC.FS_GIT_WORKTREE_LIST, async (_, { projectRoot }: { projectRoot: string }): Promise<{ path: string; branch: string; isMain: boolean }[]> => {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: projectRoot })
      const worktrees: { path: string; branch: string; isMain: boolean }[] = []
      const blocks = stdout.trim().split(/\n\n/)
      for (let i = 0; i < blocks.length; i++) {
        const lines = blocks[i].split('\n')
        const path = lines.find((l) => l.startsWith('worktree '))?.slice(9).replace(/\\/g, '/') ?? ''
        const branch = lines.find((l) => l.startsWith('branch '))?.slice(7).replace('refs/heads/', '') ?? ''
        if (path) worktrees.push({ path, branch, isMain: i === 0 })
      }
      return worktrees
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC.FS_GIT_WORKTREE_CREATE, async (_, { projectRoot, branchName, worktreePath }: { projectRoot: string; branchName: string; worktreePath: string }): Promise<{ worktreePath: string; branchName: string }> => {
    await fs.mkdir(join(worktreePath, '..'), { recursive: true })
    const alreadyUsed = (stderr: string): string | null => {
      const m = /already used by worktree at '([^']+)'/.exec(stderr)
      return m ? m[1] : null
    }
    try {
      await execAsync(`git worktree add "${worktreePath}" -b "${branchName}"`, { cwd: projectRoot })
    } catch (err: unknown) {
      const msg = (err as any).stderr as string ?? String(err)
      if (msg.includes('already exists')) {
        try {
          await execAsync(`git worktree add "${worktreePath}" "${branchName}"`, { cwd: projectRoot })
        } catch (err2: unknown) {
          const msg2 = (err2 as any).stderr as string ?? String(err2)
          const existing = alreadyUsed(msg2)
          if (existing) return { worktreePath: existing, branchName }
          throw err2
        }
      } else {
        throw err
      }
    }
    return { worktreePath, branchName }
  })

  ipcMain.handle(IPC.FS_GIT_WORKTREE_REMOVE, async (_, { projectRoot, worktreePath }: { projectRoot: string; worktreePath: string }): Promise<{ success: boolean; error?: string }> => {
    try {
      await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: projectRoot })
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
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
