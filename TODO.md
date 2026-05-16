### Things to fix

#### Easy
- [x] Different themes for Monaco editor
- [x] Reorganize right-aligned status bar (git icon, terminal theme, app theme → move into settings)
- [x] Notifications should only fire for AI agents after they've done an action — not when opening an idle shell for the first time

#### Medium
- [x] Remove "Open In" from the bottom status bar — move to the directory name in the sidebar alongside new file and new folder buttons (which also need to be added)
- [x] Command Palette needs a full overhaul — Ctrl+P for app commands (open terminal, open settings, etc.)
- [x] Open a project directly through the Windows menu (right now navigation is only via cd or breadcrumbs)
- [x] Persist editor theme selection across restarts
- [x] Close tab navigates left to nearest tab (not always to first)

#### Hard
- [x] Ctrl+Shift+P should open a file browser for the current directory — click to open a file in the layout
- [x] Files should be openable in the layout and draggable/rearrangeable like terminal panes
- [x] Inline file/folder creation in tree (ghost row, no modal)
- [x] Inline rename for files and folders in tree
- [x] Drag and drop files and folders from outside Orbit into the file tree sidebar
- [x] WebGL xterm.js renderer (already implemented — WebGL → Canvas → DOM fallback)
- [x] File icons in tree (color-coded by extension and file type)
- [x] Workspaces decision — keep, already fully implemented (switcher, scoped sessions + file tree, create/delete)

#### From Terax audit
- [x] Project-wide search — find-in-files panel with line-level navigation (SearchCode icon in sidebar header)
