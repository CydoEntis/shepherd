export const IPC = {
  // Session: renderer → main (invoke)
  SESSION_CREATE: 'session:create',
  SESSION_KILL: 'session:kill',
  SESSION_LIST: 'session:list',
  SESSION_REPLAY_REQUEST: 'session:replay-request',

  // Session: renderer → main (invoke)
  SESSION_PATCH: 'session:patch',

  // Session: renderer → main (fire-and-forget send)
  SESSION_WRITE: 'session:write',
  SESSION_RESIZE: 'session:resize',

  // Session: main → renderer (push)
  SESSION_DATA: 'session:data',
  SESSION_EXIT: 'session:exit',
  SESSION_META_UPDATE: 'session:meta-update',

  // Window: renderer → main (invoke)
  WINDOW_GET_ID: 'window:get-id',
  WINDOW_DETACH_TAB: 'window:detach-tab',
  WINDOW_CONTROL: 'window:control',
  WINDOW_OPEN_SETTINGS: 'window:open-settings',

  WINDOW_REATTACH_TAB: 'window:reattach-tab',
  WINDOW_MOVE_SESSION_ALONGSIDE: 'window:move-session-alongside',
  WINDOW_LIST: 'window:list',
  WINDOW_MOVE_TO_WINDOW: 'window:move-to-window',
  WINDOW_HIGHLIGHT: 'window:highlight',
  WINDOW_COUNT_CHANGED: 'window:count-changed',
  WINDOW_SET_META: 'window:set-meta',
  WINDOW_META_UPDATED: 'window:meta-updated',

  // Drag: renderer → main (invoke)
  DRAG_SESSION_START: 'drag:session-start',
  DRAG_SESSION_END: 'drag:session-end',

  // Window: main → renderer (push)
  WINDOW_INITIAL_SESSIONS: 'window:initial-sessions',
  WINDOW_TAB_REATTACHED: 'window:tab-reattached',
  WINDOW_ADD_SESSION: 'window:add-session',
  WINDOW_SESSION_REMOVED: 'window:session-removed',
  DRAG_HOVER_ENTER: 'drag:hover-enter',
  DRAG_HOVER_LEAVE: 'drag:hover-leave',
  WINDOW_MAXIMIZED_CHANGE: 'window:maximized-change',

  // Settings: renderer → main (invoke)
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  // Settings: main → renderer (push)
  SETTINGS_UPDATED: 'settings:updated',

  // Dialog: renderer → main (invoke)
  DIALOG_PICK_FOLDER: 'dialog:pick-folder',
  DIALOG_PICK_FILE: 'dialog:pick-file',

  // Persistence: renderer → main (invoke)
  PERSISTENCE_SAVE: 'persistence:save',
  PERSISTENCE_LOAD: 'persistence:load',
  PERSISTENCE_CLEAR: 'persistence:clear',

  // Updater: main → renderer (push)
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_DOWNLOADED: 'update:downloaded',
  // Updater: renderer → main (invoke)
  UPDATE_INSTALL: 'update:install',
  UPDATE_GET_PENDING: 'update:get-pending',

  // Filesystem: renderer → main (invoke)
  FS_DETECT_SHELLS: 'fs:detect-shells',
  FS_READ_DIR: 'fs:read-dir',
  FS_READ_FILE: 'fs:read-file',
  FS_GIT_STATUS: 'fs:git-status',
  FS_GIT_DIFF_FILE: 'fs:git-diff-file',
  FS_SHOW_IN_FOLDER: 'fs:show-in-folder',
  FS_OPEN_PATH: 'fs:open-path',
  FS_OPEN_IN_EDITOR: 'fs:open-in-editor',
  FS_DETECT_EDITORS: 'fs:detect-editors',
  FS_RENAME: 'fs:rename',
  FS_TRASH: 'fs:trash',
  FS_FIND_FILES: 'fs:find-files',
  FS_SEARCH_IN_FILES: 'fs:search-in-files',

  // Git review: renderer → main (invoke)
  FS_GIT_REVIEW: 'fs:git-review',
  FS_GIT_STAGE: 'fs:git-stage',
  FS_GIT_STAGE_ALL: 'fs:git-stage-all',
  FS_GIT_UNSTAGE: 'fs:git-unstage',
  FS_GIT_UNSTAGE_ALL: 'fs:git-unstage-all',
  FS_GIT_COMMIT: 'fs:git-commit',
  FS_GIT_PUSH: 'fs:git-push',
  FS_GIT_BRANCH_INFO: 'fs:git-branch-info',
  FS_GIT_LOG: 'fs:git-log',

  // Git worktrees: renderer → main (invoke)
  FS_GIT_WORKTREE_LIST: 'fs:git-worktree-list',
  FS_GIT_WORKTREE_CREATE: 'fs:git-worktree-create',
  FS_GIT_WORKTREE_REMOVE: 'fs:git-worktree-remove',

  // Filesystem write: renderer → main (invoke)
  FS_MKDIR: 'fs:mkdir',
  FS_WRITE_FILE: 'fs:write-file',
  FS_COPY_FILE: 'fs:copy-file',
  FS_COPY_PATH: 'fs:copy-path',
  FS_MOVE_FILE_TO_WINDOW: 'fs:move-file-to-window',
  FS_GET_PENDING_FILES: 'fs:get-pending-files',

  // Filesystem: main → renderer (push)
  FS_FILE_OPEN_REQUESTED: 'fs:file-open-requested',

  // Shell: renderer → main (invoke)
  SHELL_OPEN_EXTERNAL: 'shell:open-external',

  // Clipboard: renderer → main (invoke)
  CLIPBOARD_READ_TEXT: 'clipboard:read-text',

  // Sbx: renderer → main (invoke)
  SBX_AVAILABLE: 'sbx:available',

  // Workspace: renderer → main (invoke)
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_UPDATE: 'workspace:update',
  WORKSPACE_DELETE: 'workspace:delete',

  // UI State: renderer → main (invoke)
  UI_STATE_GET: 'ui-state:get',
  UI_STATE_SET: 'ui-state:set',

  // Open path: main → renderer (push) — folder path received from CLI args or OS context menu
  OPEN_PATH: 'open:path',

  // Shortcuts: main → renderer (push) — sent via before-input-event to bypass Chromium intercepts
  SHORTCUT_COMMAND_PALETTE: 'shortcut:command-palette',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
