### Completed

- [x] Different themes for Monaco editor
- [x] Reorganize right-aligned status bar
- [x] Notifications only fire for AI agents after an action
- [x] Remove "Open In" from status bar — moved to sidebar directory header
- [x] Command Palette overhaul — Ctrl+P for app commands
- [x] Open a project through the Windows menu
- [x] Persist editor theme selection across restarts
- [x] Close tab navigates left to nearest tab
- [x] Ctrl+Shift+P file browser for current directory — click to open file in layout
- [x] Files openable in layout
- [x] Inline file/folder creation in tree (ghost row)
- [x] Inline rename for files and folders in tree
- [x] Drag and drop files from outside Orbit into file tree sidebar
- [x] WebGL xterm.js renderer with Canvas/DOM fallback
- [x] File icons in tree (color-coded by extension)
- [x] Workspaces (switcher, scoped sessions + file tree, create/delete)
- [x] Project-wide search — find-in-files panel with line-level navigation
- [x] Split tab bar + Terminal button into separate floating pieces
- [x] Terminal bg matches card bg per theme (no seam)
- [x] Settings form and modals use Orbit design language throughout
- [x] Sidebar workspace switcher — split-piece action buttons (open in editor, close project)
- [x] Notification badge auto-picks dark/light text via WCAG luminance
- [x] File tree text and icons larger (text-sm, size 15 icons)
- [x] Sidebar file tree header icons and text larger
- [x] Files appear as tabs in the tab bar alongside terminal sessions
- [x] File tabs and terminal tabs freely interchangeable in drag-to-reorder
- [x] Drag file tab into layout pane opens the file as a split (not a blank terminal)
- [x] File tabs scoped per workspace — switching workspaces hides unrelated file tabs
- [x] Workspace button shows actual folder name instead of "Home"
- [x] File tree stays visible when no session is open
- [x] Clicking a file in the tree that is already open in a split focuses the split (no duplicate tab)
- [x] Clicking a file tab that is already open in a split focuses the split (no full-screen re-open)
- [x] File tab highlights when its pane is focused (accent border, matches session tab behavior)
- [x] File tabs in the same split show a shared underline indicator; only the focused one fully lights up
- [x] OS drag-drop from Windows Explorer into terminal inserts file path
- [x] OS drag-drop from Windows Explorer into sidebar copies file to current directory

---

### In Progress / Needs Verification

- [ ] OS drag-drop into sidebar and terminal — audit end-to-end on Windows (path copy to dir, path insert to terminal); PaneDropTarget now passes OS File drags through to child elements
- [ ] File tab active highlight — verify path comparison is reliable across all cases (case sensitivity on Windows drive letters)

---

### Up Next

#### File operations
- [ ] Rename files — right-click a file in the tree → "Rename", OR double-click the file tab to rename inline
- [ ] Right-click a file tab → "Move to" submenu — move the open file to a different window (same UX as terminal session move-to)
- [ ] File copy/move via drag into sidebar directory — drag from file tree onto a folder to move/copy it there; currently only OS drags are handled

#### Markdown
- [ ] Right-click a markdown file in the tree or tab bar → "Preview" — opens in the markdown preview pane
- [ ] Markdown preview pane: right-click context menu to toggle raw/preview

#### Title bar
- [ ] Title bar updates to show the currently focused file or session name + path
- [ ] Breadcrumb or status bar shows full path of open file when a file editor pane is focused

#### Notifications
- [ ] Audit notification system — review which events fire notifications, dedup/throttle noisy ones, ensure dismiss works reliably across all cases

#### Command palette
- [ ] Fix command palette to work as expected — audit all registered commands, ensure fuzzy search covers file open, session actions, and settings
- [ ] Keyboard shortcuts — audit and update shortcut map; document all shortcuts; resolve any conflicts

#### Startup & window
- [ ] Orbit opens full-screen by default — add a setting in Settings to toggle (remember last window state as an option)

#### Terminal
- [ ] Clickable links in terminal — URLs open in system browser, file paths open the file inside Orbit
- [ ] Fix copy/paste in terminal — Ctrl+C/Ctrl+V and right-click copy should work reliably in all shells
- [ ] Fix copy/paste in file editor — Ctrl+C/Ctrl+V between Monaco editors and between editor ↔ terminal

#### Polish
- [ ] Audit every modal, input, dropdown, and button in the app — anything still using default Radix/browser styling gets updated to Orbit design language
