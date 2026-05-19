# Changelog

## v0.6.1 — Stability & Window Management

### Fixes

- **Per-workspace file views** — Opening files in one workspace no longer bleeds into other workspaces. Each workspace maintains its own independent file layout.
- **New terminal opens in current pane** — The "+ New Terminal" button in any pane's tab bar now adds the terminal as a tab inside that pane, instead of spawning a separate top-level session tab.
- **Terminal close behavior** — Closing a terminal removes it from the layout without killing the underlying PTY process. Sessions remain alive in the background and can be reopened.
- **Unified terminal context menu** — Terminals no longer show two different right-click menus depending on where you click. Both the tab right-click and the in-terminal right-click now show a consistent "Kill Session" action and "Move to" submenu.
- **Removed "Close Pane" from terminal menu** — The broken "Close Pane" option that was closing files instead of the terminal has been removed.
- **Move file back to main window** — Files moved to a secondary window can now be moved back to the main window via the context menu.
- **Secondary window auto-closes** — When the last item (file or terminal) is moved out of a secondary window, that window closes automatically.
- **Editor window gradient** — Secondary file windows now correctly receive their window identity on startup, restoring the title bar gradient.

---

## v0.6.0 — Editor Experience

### New Features

#### Editor & File Management
- **Monaco editor** — Edit files directly in Orbit using VS Code's Monaco engine. Full syntax highlighting for 100+ languages, accurate coloring without needing a language server.
- **Editor-group pane system** — File tabs and terminal tabs now coexist in the same pane groups. Mix editors and terminals side by side in any split layout.
- **File tabs as first-class session tabs** — Open files appear as tabs in the main tab bar alongside terminal sessions, not just inside panes.
- **Floating save button** — When a file has unsaved changes, a floating Save button appears in the editor. Keyboard shortcut (`Ctrl+S`) also works.
- **Drag-to-reorder tabs** — Terminal and file tabs can be reordered by dragging across the tab bar, including across tab types.

#### File Tree
- **Drag files and folders** — Move files and folders between directories by dragging within the file tree. Visual drop indicator shows the target.
- **OS file drag-drop** — Drag files from Windows Explorer or Finder into the file tree to copy them into your project.
- **Drop file path into terminal** — Drag a file from the tree into any terminal pane to paste its path at the cursor.
- **Collapse All / Expand All** — Two new buttons in the file tree header instantly collapse or expand all folders. State persists across restarts.
- **Inline file and folder creation** — Create new files and folders from the tree header buttons with an inline ghost-row input, no modal required.
- **File icons** — Color-coded icons per extension and file type throughout the tree.

#### Terminal
- **Clickable links** — URLs in terminal output are underlined and open in the browser on click (powered by WebLinksAddon).
- **+ button dropdown** — Clicking `+` in any pane tab bar now opens a two-item menu: New Terminal or New File. Replaces the previous single-action button.

#### Sidebar
- **Sidebar redesign** — Split workspace switcher with a separate header row, larger file tree, and cleaner action button layout.
- **Focus existing split on file click** — Clicking a file that's already open in a split pane focuses that pane instead of opening a duplicate.
- **Workspace label** — Active workspace name displayed in the sidebar header.

#### Notifications & Indicators
- **Agent status indicators** — Amber pulsing dot on waiting-for-input, green solid dot on done — visible on session tabs without needing a toast.
- **Notification badge contrast** — WCAG luminance check picks dark or light text on badge backgrounds automatically.

#### Settings & Workspaces
- **showAgentToasts setting** — Toggle in Settings to control whether agent done/waiting toasts appear. (Currently disabled by default pending notification reliability investigation.)
- **Default workspace path** — New installs default to `~/Orbit` as the root workspace directory.

#### UI & Design System
- **Orbit design system** — Standardized Radix UI primitive wrappers (`Button`, `Input`, `Select`, `Switch`, `Label`, `Badge`) used throughout Settings and forms.
- **Settings and New Session form** — Both forms rebuilt with the new Orbit design language — consistent sizing, spacing, and interactive states.
- **Floating card layout** — Split tab bar, edge-to-edge panes, outer spacing, and rounded card surfaces replace the previous full-bleed layout.

#### Themes
- **Cosmos theme** — Near-black base with deep blue highlights.
- **Void theme** — Pure black with minimal color.
- **Solarized Light theme** — Warm light theme with Solarized terminal colors.
- **Birds of Paradise** — Warm amber and violet.
- **13 additional Monaco editor themes** — Dracula, Nord, One Dark, Monokai, Solarized Dark, and more — selectable per-editor from Settings.
- **Auto Monaco theme** — Monaco editor theme tracks the active app theme automatically.
- **Terminal theme sync** — All terminal color schemes updated to match each app theme; no background color seams.

#### Project Search
- **Find in Files** — Project-wide search panel with line-level navigation. Click any result to jump directly to that line in the editor.

---

### Removed

- **Notes Panel** — The built-in markdown notes feature has been removed to simplify the UI and focus the product on terminal and file management.

---

### Fixes

- OS file drag-drop and cross-tab file-path drops behave correctly across all pane configurations.
- File tabs render the correct content when scoped to the active workspace.
- Cosmos theme base color significantly darkened — previous version was too light.
- Close tab now navigates left to the nearest adjacent tab instead of jumping to the first.
- Monaco semantic validation disabled — no language server means type errors were false positives.
- Monaco themes now load from local assets, bypassing Vite package export restrictions.
- Select dropdowns scroll correctly when content exceeds viewport height.

---

### UX Changes (this session)

- **Empty state removed** — The "No active sessions" screen (with icon and button) is gone. When no panes are open, the content area is simply blank.
- **Agent toast notifications disabled** — Toasts for agent done/waiting-input events are temporarily disabled while the detection reliability is investigated. In-app notification badges still work.
