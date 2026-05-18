<p align="center">
  <img src="logo-2.png" alt="Orbit" width="120" />
</p>

<h1 align="center">Orbit</h1>

<p align="center">
  Mission control for AI agents.
</p>

<p align="center">
  <a href="https://github.com/CydoEntis/orbit/releases/latest">
    <img src="https://img.shields.io/github/v/release/CydoEntis/orbit?style=flat-square&color=e4e4e7&labelColor=1c2028" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-e4e4e7?style=flat-square&labelColor=1c2028" alt="Platform" />
</p>

---

## What is Orbit?

Orbit is a desktop terminal manager designed for running multiple AI coding agents — Claude, Codex, Gemini, or any CLI tool — simultaneously in a single workspace. Instead of juggling a dozen terminal windows, you get one organized environment with sessions, groups, tabs, splits, a built-in file viewer, a markdown notepad, and full multi-window support.

---

## Features

### Multi-Session Terminal
Run as many agent sessions as you need side by side. Each session is a full terminal powered by xterm.js — keyboard shortcuts, scrollback, copy-paste, everything works as expected. Split any tab horizontally or vertically to view multiple sessions at once.

### Session Management
- **Tabs** — each session gets its own tab with a color-coded indicator
- **Activity badges** — spinning indicator when an agent is actively generating, pulsing amber dot when waiting for input
- **Groups** — organize sessions into named, color-coded groups in the sidebar
- **Rename on double-click** — double-click any session in the sidebar to rename it and change its color
- **Presets** — save your most-used agent configurations (shell, working directory, agent command) and launch them in one click
- **Persistent layout** — tabs, splits, and session state are restored exactly as you left them on next launch

### Multi-Window
Pop sessions or note panes out into their own windows. Drag sessions between windows to reorganize your workspace. Each window has its own identity — name it and assign a color so you always know which is which. Closing a detached window reattaches its sessions back to the main window automatically. Note panes remember which window they live in across restarts.

### Docker Sandbox Mode
Run sessions in full Docker isolation via `sbx`. Enable sandbox mode per-session to contain agent file system access inside a container — useful for untrusted or experimental agent runs. Compatible with YOLO mode (`--dangerously-skip-permissions`).

### Agent Support
Launch sessions with any agent command directly:
- `claude` — Claude Code
- `codex` — OpenAI Codex CLI
- `gemini` — Google Gemini CLI
- Plain shell — no agent, just a terminal

### Built-in File Viewer
Open any project directory from the sidebar. Browse the file tree, view files with full syntax highlighting (100+ languages via Shiki), preview Markdown in a dedicated pane, and inspect git diffs — all without leaving Orbit. Markdown preview panes can be split or detached to their own window.

### Command Palette
Hit `Ctrl+P` to open the command palette. Search and jump to any session, open projects, or trigger actions without touching the mouse.

### Themes
Six built-in themes with matching terminal color schemes:

| Theme | Description |
|-------|-------------|
| Dark | Default dark UI |
| Light | Clean light UI |
| Space | Deep space blacks and blues |
| Nebula | Purple and violet nebula tones |
| Solar | Warm amber and gold |
| Aurora | Cool green and teal |
| Mars | Rust red and orange |
| Pulsar | High-contrast neon |

### Customizable
- **Shell picker** — choose which shell to use (cmd, PowerShell, bash, zsh, or any custom path)
- **Notes directory** — configure where your notes live on disk
- **Font size & family** — adjust terminal font from settings
- **Hotkeys** — remap every keyboard shortcut
- **Themes** — switch between eight color themes

### Auto-Update
Orbit checks for updates automatically. When a new version is available it downloads in the background — a toast notification with a **Restart** button appears when it's ready to install. A version badge in the status bar opens the release notes at any time.

---

## Download

Head to the [Releases](https://github.com/CydoEntis/orbit/releases/latest) page and grab the installer for your platform.

| Platform | File |
|----------|------|
| Windows | `Orbit-Setup-x.x.x.exe` |
| macOS (Apple Silicon) | `Orbit-x.x.x-arm64.dmg` |
| Linux (AppImage) | `Orbit-x.x.x.AppImage` |
| Linux (Debian/Ubuntu) | `orbit_x.x.x_amd64.deb` |

> **Note:** Windows and macOS installers are currently unsigned. Windows will show a SmartScreen warning — click **More info → Run anyway**. macOS users right-click the app → **Open**.

---

## Development

```bash
# Install dependencies
npm install

# Start in dev mode
npm run dev

# Build for your platform
npm run dist
```

**Requirements:**
- [Node.js 20+](https://nodejs.org)
- Windows: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (for node-pty)
- macOS: Xcode Command Line Tools — `xcode-select --install`
- Linux: `build-essential` — `sudo apt install build-essential`
