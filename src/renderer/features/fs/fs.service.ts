import { ipc } from '../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import type { FsEntry, GitStatusEntry } from '@shared/ipc-types'

export async function readDir(dirPath: string): Promise<FsEntry[]> {
  return ipc.invoke(IPC.FS_READ_DIR, { dirPath }) as Promise<FsEntry[]>
}

export async function readFile(filePath: string): Promise<string | null> {
  return ipc.invoke(IPC.FS_READ_FILE, { filePath }) as Promise<string | null>
}

export async function getGitStatus(projectRoot: string): Promise<GitStatusEntry[]> {
  return ipc.invoke(IPC.FS_GIT_STATUS, { projectRoot }) as Promise<GitStatusEntry[]>
}

export async function getGitDiff(projectRoot: string, filePath: string): Promise<string | null> {
  return ipc.invoke(IPC.FS_GIT_DIFF_FILE, { projectRoot, filePath }) as Promise<string | null>
}

export function showInFolder(filePath: string): Promise<void> {
  return ipc.invoke(IPC.FS_SHOW_IN_FOLDER, { filePath }) as Promise<void>
}

export function openPath(filePath: string): Promise<string> {
  return ipc.invoke(IPC.FS_OPEN_PATH, { filePath }) as Promise<string>
}

export function openInEditor(command: string, filePath: string): Promise<void> {
  return ipc.invoke(IPC.FS_OPEN_IN_EDITOR, { command, filePath }) as Promise<void>
}

export async function detectShells(): Promise<{ name: string; path: string }[]> {
  return ipc.invoke(IPC.FS_DETECT_SHELLS) as Promise<{ name: string; path: string }[]>
}

export async function detectEditors(): Promise<{ name: string; command: string }[]> {
  return ipc.invoke(IPC.FS_DETECT_EDITORS) as Promise<{ name: string; command: string }[]>
}

export async function mkdir(dirPath: string): Promise<void> {
  return ipc.invoke(IPC.FS_MKDIR, { dirPath }) as Promise<void>
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  return ipc.invoke(IPC.FS_WRITE_FILE, { filePath, content }) as Promise<void>
}

export async function renameEntry(oldPath: string, newName: string): Promise<void> {
  return ipc.invoke(IPC.FS_RENAME, { oldPath, newName }) as Promise<void>
}

export async function trashEntry(filePath: string): Promise<void> {
  return ipc.invoke(IPC.FS_TRASH, { filePath }) as Promise<void>
}

export async function copyFile(srcPath: string, destPath: string): Promise<void> {
  await ipc.invoke(IPC.FS_COPY_FILE, { srcPath, destPath })
}

export async function findFiles(rootPath: string): Promise<string[]> {
  return ipc.invoke(IPC.FS_FIND_FILES, { rootPath }) as Promise<string[]>
}

export interface SearchResult { filePath: string; lineNumber: number; lineContent: string; matchStart: number; matchEnd: number }

export async function searchInFiles(rootPath: string, query: string, caseSensitive?: boolean): Promise<SearchResult[]> {
  return ipc.invoke(IPC.FS_SEARCH_IN_FILES, { rootPath, query, caseSensitive }) as Promise<SearchResult[]>
}

export function openExternal(url: string): Promise<void> {
  return ipc.invoke(IPC.SHELL_OPEN_EXTERNAL, { url }) as Promise<void>
}

export function readClipboard(): Promise<string> {
  return ipc.invoke(IPC.CLIPBOARD_READ_TEXT) as Promise<string>
}

export interface GitFileInfo { path: string; added: number; deleted: number }
export interface GitReviewData { staged: GitFileInfo[]; unstaged: GitFileInfo[]; untracked: string[] }

export async function getGitReview(projectRoot: string): Promise<GitReviewData> {
  return ipc.invoke(IPC.FS_GIT_REVIEW, { projectRoot }) as Promise<GitReviewData>
}

export async function stageFile(projectRoot: string, filePath: string): Promise<void> {
  await ipc.invoke(IPC.FS_GIT_STAGE, { projectRoot, filePath })
}

export async function stageAll(projectRoot: string): Promise<void> {
  await ipc.invoke(IPC.FS_GIT_STAGE_ALL, { projectRoot })
}

export async function unstageFile(projectRoot: string, filePath: string): Promise<void> {
  await ipc.invoke(IPC.FS_GIT_UNSTAGE, { projectRoot, filePath })
}

export async function unstageAll(projectRoot: string): Promise<void> {
  await ipc.invoke(IPC.FS_GIT_UNSTAGE_ALL, { projectRoot })
}

export async function getGitBranchInfo(projectRoot: string): Promise<{ current: string }> {
  return ipc.invoke(IPC.FS_GIT_BRANCH_INFO, { projectRoot }) as Promise<{ current: string }>
}

export interface GitCommit { hash: string; subject: string; relativeDate: string }

export async function getGitLog(projectRoot: string, baseBranch?: string, limit?: number): Promise<GitCommit[]> {
  return ipc.invoke(IPC.FS_GIT_LOG, { projectRoot, baseBranch, limit }) as Promise<GitCommit[]>
}

export async function gitCommit(projectRoot: string, message: string): Promise<{ success: boolean; error?: string }> {
  return ipc.invoke(IPC.FS_GIT_COMMIT, { projectRoot, message }) as Promise<{ success: boolean; error?: string }>
}

export async function gitPush(projectRoot: string): Promise<{ success: boolean; error?: string }> {
  return ipc.invoke(IPC.FS_GIT_PUSH, { projectRoot }) as Promise<{ success: boolean; error?: string }>
}

export interface WorktreeResult { worktreePath: string; branchName: string; baseBranch: string }
export interface WorktreeStats { added: number; deleted: number; commits: number }

export async function createWorktree(projectRoot: string, branchName: string): Promise<WorktreeResult> {
  return ipc.invoke(IPC.FS_GIT_WORKTREE_CREATE, { projectRoot, branchName }) as Promise<WorktreeResult>
}

export async function removeWorktree(projectRoot: string, worktreePath: string): Promise<{ success: boolean; error?: string }> {
  return ipc.invoke(IPC.FS_GIT_WORKTREE_REMOVE, { projectRoot, worktreePath }) as Promise<{ success: boolean; error?: string }>
}

export async function getWorktreeStats(worktreePath: string, baseBranch: string): Promise<WorktreeStats> {
  return ipc.invoke(IPC.FS_GIT_WORKTREE_STATS, { worktreePath, baseBranch }) as Promise<WorktreeStats>
}
