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

---

### Up Next

#### Layout & file integration
- [ ] Files draggable into layout engine — drag a file from the tree and drop it into any pane slot to open it there
- [ ] Opened files appear as tabs in the tab bar alongside terminal sessions — same drag-to-reorder, right-click context menu, close button
- [ ] File viewer: remove the fake filename header — save button floats absolute top-right over the content instead
- [ ] Drag to rearrange files and terminals freely — file tabs and terminal tabs interchangeable in the layout tree
- [ ] Right-click markdown files → "Preview" option — opens in the markdown preview pane (restore previous behavior)

#### File tree
- [ ] Drag files/folders from outside the app into the file tree — drop onto a directory to copy into it (already works for OS drag-drop; audit and ensure subfolder targeting is solid end-to-end)
- [ ] Drag from the file tree into a terminal to add the file path to context (paste path or `@filename` depending on agent mode)

#### Terminal
- [ ] Clickable links in terminal — URLs open in system browser, file paths open the file inside Orbit
- [ ] Fix copy/paste in terminal — Ctrl+C/Ctrl+V and right-click copy should work reliably in all shells
- [ ] Fix copy/paste in file editor — Ctrl+C/Ctrl+V between Monaco editors and between editor ↔ terminal

#### Polish
- [ ] Audit every modal, input, dropdown, and button in the app — anything still using default Radix/browser styling gets updated to Orbit design language
