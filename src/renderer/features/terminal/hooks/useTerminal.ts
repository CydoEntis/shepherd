import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { ipc } from '../../../lib/ipc'
import { IPC } from '@shared/ipc-channels'
import { replayRequest, writeToSession, resizeSession } from '../../session/session.service'
import { openExternal, readClipboard } from '../../fs/fs.service'
import { useStore } from '../../../store/root.store'
import type { SessionDataPayload } from '@shared/ipc-types'

interface PoolEntry {
  terminal: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  rendererAddon: WebglAddon | CanvasAddon | null
  oscDisposables: { dispose(): void }[]
}
// Module-level pool: preserves xterm instances across React remounts caused by layout changes.
// Entries are fully disposed only when the session leaves the store (closed, not just moved).
const terminalPool = new Map<string, PoolEntry>()

const TOOL_FILE_RE = /●\s+(?:Edit|Write|Update)\(([^)\n]+)\)/
const DIFF_LINE_RE = /^\s{2,}(\d+) ([+\- ])(.*)$/
const DIFF_SUMMARY_RE = /[└⎿─]|Added\s+\d+|Removed\s+\d+|Modified\s+\d+/

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[^a-zA-Z]*[a-zA-Z]/g, '').replace(/\r/g, '')
}

function resolveFilePath(raw: string, cwd: string): string {
  return /^([A-Za-z]:[/\\]|\/)/.test(raw)
    ? raw.replace(/\\/g, '/')
    : `${cwd}/${raw}`.replace(/\\/g, '/').replace(/\/+/g, '/')
}

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/
const FILE_PATH_RE = /([A-Za-z]:[/\\][^\s"'<>]+|(?:^|\s)(\/[^\s"'<>]+))/

export interface TerminalCtxItem {
  label: string
  action: () => void
}

export interface TerminalCtxMenu {
  x: number
  y: number
  items: TerminalCtxItem[]
}

const DARK_TERMINAL_THEME = {
  background: '#0f1117', foreground: '#fafafa', cursor: '#fafafa',
  black: '#18181b', brightBlack: '#3f3f46',
  red: '#ef4444', brightRed: '#f87171',
  green: '#22c55e', brightGreen: '#4ade80',
  yellow: '#eab308', brightYellow: '#facc15',
  blue: '#3b82f6', brightBlue: '#60a5fa',
  magenta: '#a855f7', brightMagenta: '#c084fc',
  cyan: '#06b6d4', brightCyan: '#22d3ee',
  white: '#d4d4d8', brightWhite: '#fafafa',
}

const LIGHT_TERMINAL_THEME = {
  background: '#f5f2e8', foreground: '#1c1c1c', cursor: '#4a4a4a',
  black: '#000000', brightBlack: '#767676',
  red: '#cd3131', brightRed: '#f14c4c',
  green: '#117700', brightGreen: '#23d18b',
  yellow: '#795e26', brightYellow: '#ddb500',
  blue: '#0451a5', brightBlue: '#2979ff',
  magenta: '#bc05bc', brightMagenta: '#d670d6',
  cyan: '#0598bc', brightCyan: '#29b8db',
  white: '#555555', brightWhite: '#767676',
}

const SPACE_TERMINAL_THEME = {
  background: '#090616', foreground: '#e8e0ff', cursor: '#bf8cff',
  black: '#0d0a26', brightBlack: '#2a2050',
  red: '#ff6b8a', brightRed: '#ff9aad',
  green: '#78ffd6', brightGreen: '#a0ffe6',
  yellow: '#ffd166', brightYellow: '#ffe299',
  blue: '#82a8ff', brightBlue: '#aac4ff',
  magenta: '#bf8cff', brightMagenta: '#d8b4ff',
  cyan: '#78d8ff', brightCyan: '#a8e8ff',
  white: '#c8c0e8', brightWhite: '#e8e0ff',
}

const DRACULA_TERMINAL_THEME = {
  background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
  black: '#21222c', brightBlack: '#6272a4',
  red: '#ff5555', brightRed: '#ff6e6e',
  green: '#50fa7b', brightGreen: '#69ff94',
  yellow: '#f1fa8c', brightYellow: '#ffffa5',
  blue: '#bd93f9', brightBlue: '#d6acff',
  magenta: '#ff79c6', brightMagenta: '#ff92df',
  cyan: '#8be9fd', brightCyan: '#a4ffff',
  white: '#f8f8f2', brightWhite: '#ffffff',
}

const ONE_DARK_TERMINAL_THEME = {
  background: '#282c34', foreground: '#abb2bf', cursor: '#528bff',
  black: '#1e2127', brightBlack: '#5c6370',
  red: '#e06c75', brightRed: '#e06c75',
  green: '#98c379', brightGreen: '#98c379',
  yellow: '#e5c07b', brightYellow: '#e5c07b',
  blue: '#61afef', brightBlue: '#61afef',
  magenta: '#c678dd', brightMagenta: '#c678dd',
  cyan: '#56b6c2', brightCyan: '#56b6c2',
  white: '#abb2bf', brightWhite: '#ffffff',
}

const NORD_TERMINAL_THEME = {
  background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9',
  black: '#3b4252', brightBlack: '#4c566a',
  red: '#bf616a', brightRed: '#bf616a',
  green: '#a3be8c', brightGreen: '#a3be8c',
  yellow: '#ebcb8b', brightYellow: '#ebcb8b',
  blue: '#81a1c1', brightBlue: '#81a1c1',
  magenta: '#b48ead', brightMagenta: '#b48ead',
  cyan: '#88c0d0', brightCyan: '#8fbcbb',
  white: '#e5e9f0', brightWhite: '#eceff4',
}

const SOLARIZED_DARK_TERMINAL_THEME = {
  background: '#002b36', foreground: '#839496', cursor: '#839496',
  black: '#073642', brightBlack: '#586e75',
  red: '#dc322f', brightRed: '#cb4b16',
  green: '#859900', brightGreen: '#586e75',
  yellow: '#b58900', brightYellow: '#657b83',
  blue: '#268bd2', brightBlue: '#839496',
  magenta: '#d33682', brightMagenta: '#6c71c4',
  cyan: '#2aa198', brightCyan: '#93a1a1',
  white: '#eee8d5', brightWhite: '#fdf6e3',
}

const MONOKAI_TERMINAL_THEME = {
  background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0',
  black: '#272822', brightBlack: '#75715e',
  red: '#f92672', brightRed: '#f92672',
  green: '#a6e22e', brightGreen: '#a6e22e',
  yellow: '#f4bf75', brightYellow: '#f4bf75',
  blue: '#66d9e8', brightBlue: '#66d9e8',
  magenta: '#ae81ff', brightMagenta: '#ae81ff',
  cyan: '#a1efe4', brightCyan: '#a1efe4',
  white: '#f8f8f2', brightWhite: '#f9f8f5',
}

const NEBULA_TERMINAL_THEME = {
  background: '#080514', foreground: '#c8f0ff', cursor: '#64dcff',
  black: '#0c0920', brightBlack: '#1a1240',
  red: '#ff6b8a', brightRed: '#ff9aad',
  green: '#64ffda', brightGreen: '#96ffe8',
  yellow: '#ffe07a', brightYellow: '#fff0a0',
  blue: '#64dcff', brightBlue: '#96e8ff',
  magenta: '#c084fc', brightMagenta: '#d8b4fe',
  cyan: '#64dcff', brightCyan: '#96e8ff',
  white: '#c8f0ff', brightWhite: '#e8f8ff',
}

const SOLAR_TERMINAL_THEME = {
  background: '#0c0804', foreground: '#fff0d0', cursor: '#ffb900',
  black: '#1a1008', brightBlack: '#3d2a10',
  red: '#ff6b47', brightRed: '#ff8c6a',
  green: '#a8e063', brightGreen: '#c4f07d',
  yellow: '#ffb900', brightYellow: '#ffd040',
  blue: '#63c0f5', brightBlue: '#8dd4ff',
  magenta: '#d9a0ff', brightMagenta: '#ebb8ff',
  cyan: '#4ecdc4', brightCyan: '#7ae0d8',
  white: '#fff0d0', brightWhite: '#ffffff',
}

const AURORA_TERMINAL_THEME = {
  background: '#040c0e', foreground: '#d0fff0', cursor: '#00e6a0',
  black: '#061a1e', brightBlack: '#0a2830',
  red: '#ff6b8a', brightRed: '#ff9aad',
  green: '#00e6a0', brightGreen: '#40ffc0',
  yellow: '#ffe566', brightYellow: '#fff0a0',
  blue: '#60c8ff', brightBlue: '#90daff',
  magenta: '#c084ff', brightMagenta: '#d8b0ff',
  cyan: '#00e6a0', brightCyan: '#40ffc0',
  white: '#d0fff0', brightWhite: '#f0fff8',
}

const MARS_TERMINAL_THEME = {
  background: '#100804', foreground: '#ffe8d0', cursor: '#ff6929',
  black: '#1a0c06', brightBlack: '#3d1c0e',
  red: '#ff4a2a', brightRed: '#ff7055',
  green: '#a8d080', brightGreen: '#c8f080',
  yellow: '#ffb040', brightYellow: '#ffd060',
  blue: '#80b8ff', brightBlue: '#a0d0ff',
  magenta: '#ff80c0', brightMagenta: '#ffaad8',
  cyan: '#60d8c8', brightCyan: '#80f0e0',
  white: '#ffe8d0', brightWhite: '#ffffff',
}

const PULSAR_TERMINAL_THEME = {
  background: '#04080e', foreground: '#c8f0ff', cursor: '#00d7ff',
  black: '#060e1c', brightBlack: '#0e1e3a',
  red: '#ff6b8a', brightRed: '#ff9aad',
  green: '#60ffb8', brightGreen: '#90ffd0',
  yellow: '#ffe066', brightYellow: '#fff090',
  blue: '#00d7ff', brightBlue: '#60e8ff',
  magenta: '#c084ff', brightMagenta: '#d8b0ff',
  cyan: '#00d7ff', brightCyan: '#60e8ff',
  white: '#c8f0ff', brightWhite: '#e8f8ff',
}

const NAMED_THEMES: Record<string, typeof DARK_TERMINAL_THEME> = {
  dracula: DRACULA_TERMINAL_THEME,
  'one-dark': ONE_DARK_TERMINAL_THEME,
  nord: NORD_TERMINAL_THEME,
  'solarized-dark': SOLARIZED_DARK_TERMINAL_THEME,
  monokai: MONOKAI_TERMINAL_THEME,
}

export const TERMINAL_THEME_LIST: { id: string; label: string }[] = [
  { id: 'dracula', label: 'Dracula' },
  { id: 'one-dark', label: 'One Dark' },
  { id: 'nord', label: 'Nord' },
  { id: 'solarized-dark', label: 'Solarized Dark' },
  { id: 'monokai', label: 'Monokai' },
]

function resolveTerminalTheme(appTheme: string): typeof DARK_TERMINAL_THEME {
  if (appTheme === 'space')  return SPACE_TERMINAL_THEME
  if (appTheme === 'nebula') return NEBULA_TERMINAL_THEME
  if (appTheme === 'solar')  return SOLAR_TERMINAL_THEME
  if (appTheme === 'aurora') return AURORA_TERMINAL_THEME
  if (appTheme === 'mars')   return MARS_TERMINAL_THEME
  if (appTheme === 'pulsar') return PULSAR_TERMINAL_THEME
  const isDark = appTheme === 'dark' || (appTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return isDark ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME
}

function getThemeById(id: string, appTheme: string): typeof DARK_TERMINAL_THEME {
  return NAMED_THEMES[id] ?? resolveTerminalTheme(appTheme)
}

const SEARCH_DECORATIONS = {
  matchBackground: '#3b3b00',
  matchBorder: '#facc15',
  matchOverviewRuler: '#facc15',
  activeMatchBackground: '#5a4a00',
  activeMatchBorder: '#fde047',
  activeMatchColorOverviewRuler: '#fde047',
}

export interface TerminalSearch {
  visible: boolean
  show: () => void
  hide: () => void
  findNext: (term: string) => void
  findPrevious: (term: string) => void
}

export function useTerminal(sessionId: string, containerRef: React.RefObject<HTMLDivElement>, inputEnabledRef?: React.MutableRefObject<boolean>): {
  ctxMenu: TerminalCtxMenu | null
  dismissCtxMenu: () => void
  search: TerminalSearch
} {
  const settings = useStore((s) => s.settings)
  const appTheme = useStore((s) => s.settings.theme)
  const sessionTerminalTheme = useStore((s) => s.terminalThemes[sessionId])
  const registerTerminal = useStore((s) => s.registerTerminal)
  const unregisterTerminal = useStore((s) => s.unregisterTerminal)
  const setTerminalReady = useStore((s) => s.setTerminalReady)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const addTouchedFile = useStore((s) => s.addTouchedFile)
  const appendTouchedFilePatch = useStore((s) => s.appendTouchedFilePatch)

  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const [ctxMenu, setCtxMenu] = useState<TerminalCtxMenu | null>(null)
  const [searchVisible, setSearchVisible] = useState(false)

  const dismissCtxMenu = (): void => setCtxMenu(null)

  const showSearch = useCallback((): void => setSearchVisible(true), [])
  const hideSearch = useCallback((): void => {
    setSearchVisible(false)
    searchAddonRef.current?.clearDecorations()
    terminalRef.current?.focus()
  }, [])
  const findNext = useCallback((term: string): void => {
    searchAddonRef.current?.findNext(term, { caseSensitive: false, incremental: true, decorations: SEARCH_DECORATIONS })
  }, [])
  const findPrevious = useCallback((term: string): void => {
    searchAddonRef.current?.findPrevious(term, { caseSensitive: false, decorations: SEARCH_DECORATIONS })
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    // Reuse an existing terminal instance if this session was previously mounted
    // (e.g. layout changed from leaf→split, causing React to unmount/remount TerminalPane).
    // Re-parenting the element avoids replaying the full session history again.
    const existing = terminalPool.get(sessionId)
    let terminal: Terminal
    let fitAddon: FitAddon
    let searchAddon: SearchAddon

    if (existing) {
      terminal = existing.terminal
      fitAddon = existing.fitAddon
      searchAddon = existing.searchAddon
      if (terminal.element) container.appendChild(terminal.element)
    } else {
      terminal = new Terminal({
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
        theme: resolveTerminalTheme(useStore.getState().settings.theme),
        cursorBlink: true,
        allowProposedApi: true,
      })
      fitAddon = new FitAddon()
      searchAddon = new SearchAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(searchAddon)
      terminal.open(container)
      // GPU-accelerated renderer: WebGL → Canvas → DOM fallback
      let rendererAddon: WebglAddon | CanvasAddon | null = null
      try {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => {
          webgl.dispose()
          try { terminal.loadAddon(new CanvasAddon()) } catch {}
        })
        terminal.loadAddon(webgl)
        rendererAddon = webgl
      } catch {
        try {
          const canvas = new CanvasAddon()
          terminal.loadAddon(canvas)
          rendererAddon = canvas
        } catch {}
      }
      const unicode11 = new Unicode11Addon()
      terminal.loadAddon(unicode11)
      terminal.unicode.activeVersion = '11'
      const oscDisposables: { dispose(): void }[] = []

      // OSC 7;file://hostname/path — emitted by shell integration on directory change.
      // Updates the session's cwd in the store so the file tree can follow the shell.
      oscDisposables.push(
        terminal.parser.registerOscHandler(7, (data) => {
          try {
            const url = new URL(data)
            let path = decodeURIComponent(url.pathname).replace(/\\/g, '/')
            // Windows: /C:/foo → C:/foo
            if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1)
            if (path) useStore.getState().updateSessionCwd(sessionId, path)
          } catch {}
          return true
        })
      )

      // OSC 777;notify;Title;Message — scripts and agents can push toast notifications
      // directly from the terminal without going through IPC. Handled here (renderer)
      // because it's display-only and avoids an extra round-trip through the main process.
      oscDisposables.push(
        terminal.parser.registerOscHandler(777, (data) => {
          const semi = data.indexOf(';')
          if (data.slice(0, semi) !== 'notify') return true
          const rest = data.slice(semi + 1)
          const semi2 = rest.indexOf(';')
          const title = semi2 === -1 ? rest : rest.slice(0, semi2)
          const message = semi2 === -1 ? '' : rest.slice(semi2 + 1)
          const sessionName = useStore.getState().sessions[sessionId]?.name
          toast(title || sessionName || 'Terminal', { description: message || undefined })
          return true
        })
      )

      terminalPool.set(sessionId, { terminal, fitAddon, searchAddon, rendererAddon, oscDisposables })
    }

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    // react-resizable-panels v4 may apply panel pixel dimensions in its own useEffect
    // (which runs outer-to-inner — AFTER this inner effect). Fitting synchronously here
    // could read dimensions before the panel has its final size, producing wrong col/row
    // counts. Replay data written at wrong cols causes cursor-positioned UI (status bars,
    // prompts) to appear at incorrect positions that don't reflow on later resize.
    // Running fit + replay in a RAF ensures all parent effects have completed and the
    // browser has performed layout, so the container reports its true pixel dimensions.
    let disposed = false

    // Fallback fit only for fresh terminals. Pool hits already have rendered content
    // and triggering extra fits at wrong widths causes scrollback duplication in
    // cursor-positioned TUI apps (Claude Code welcome screen, etc.).
    // The ResizeObserver handles any container resize that happens after panel layout settles.
    const fallbackFitTimer = existing
      ? undefined
      : setTimeout(() => { if (!disposed) { try { fitAddon.fit() } catch {} } }, 200)

    requestAnimationFrame(() => {
      if (disposed) return
      const prevCols = terminal.cols
      try { fitAddon.fit() } catch {}
      // If re-parenting changed the terminal width, cursor-positioned TUI apps (Claude Code
      // welcome screen, etc.) would leave stale content in scrollback at the old width.
      // Erase saved lines before the app redraws so scrollback stays clean.
      if (existing && terminal.cols !== prevCols) {
        terminal.write('\x1b[3J')
      }
      // Force a full canvas repaint after DOM re-parent — the WebGL/canvas renderer can
      // lose its drawing state when the element moves to a new container.
      if (existing) try { terminal.refresh(0, terminal.rows - 1) } catch {}
      try { terminal.focus() } catch {}

      const { cols, rows } = terminal
      registerTerminal(sessionId, cols, rows)

      if (!existing) {
        replayRequest(sessionId).then(({ chunks }) => {
          if (disposed) return
          if (fallbackFitTimer !== undefined) clearTimeout(fallbackFitTimer)
          chunks.forEach((chunk) => terminal.write(chunk))
          setTerminalReady(sessionId, true)
        })
      } else {
        setTerminalReady(sessionId, true)
      }
    })

    // Suppress the next DOM paste event when Ctrl+Shift+V already handled it via IPC clipboard.
    // Needed because Chromium/Electron fires a paste DOM event for Ctrl+Shift+V on some platforms.
    let suppressNextPaste = false

    // Ctrl+Shift+V → paste via IPC (Linux-compatible); Ctrl+V → handled by paste DOM event below;
    // Ctrl+C → copy selection if non-empty, otherwise SIGINT.
    // Re-called each mount — xterm stores only one custom key handler so this replaces the old one.
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F' && e.type === 'keydown') {
        setSearchVisible(true)
        return false
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'V' && e.type === 'keydown') {
        suppressNextPaste = true
        readClipboard().then((text) => { terminal.paste(text); requestAnimationFrame(() => terminal.focus()) }).catch(() => terminal.focus())
        return false
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'v' && e.type === 'keydown') {
        // Block ^V from going to PTY; the paste DOM event (fired by browser for Ctrl+V)
        // is handled by handlePaste below, giving exactly one paste.
        return false
      }
      if (e.ctrlKey && !e.shiftKey && e.key === 'c' && e.type === 'keydown') {
        const sel = terminal.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel).then(() => terminal.focus()).catch(() => terminal.focus())
          return false
        }
      }
      return true
    })

    // Per-mount disposables — captured so cleanup can remove them without disposing the terminal.
    // Without explicit dispose, calling onData/onResize again on a pooled terminal would stack listeners.
    const dataDisposable = terminal.onData((data) => {
      if (inputEnabledRef?.current === false) return
      writeToSession({ sessionId, data })
    })
    const resizeDisposable = terminal.onResize(({ cols, rows }) => { resizeSession({ sessionId, cols, rows }) })

    // Per-chunk line buffer + active capture state (lives in closure across chunks)
    let lineBuffer = ''
    let capture: { filePath: string; lines: string[] } | null = null

    const finalizeCapture = (): void => {
      if (capture && capture.lines.length > 0) {
        appendTouchedFilePatch(sessionId, capture.filePath, capture.lines.join('\n'))
      }
      capture = null
    }

    const offData = ipc.on(IPC.SESSION_DATA, (payload) => {
      const { sessionId: sid, data } = payload as SessionDataPayload
      if (sid !== sessionId) return
      terminal.write(data)

      const text = lineBuffer + stripAnsi(data)
      const parts = text.split('\n')
      lineBuffer = parts.pop() ?? ''

      for (const line of parts) {
        const toolMatch = line.match(TOOL_FILE_RE)
        if (toolMatch) {
          finalizeCapture()
          const raw = toolMatch[1].trim()
          const cwd = useStore.getState().sessions[sessionId]?.cwd ?? ''
          const fullPath = resolveFilePath(raw, cwd)
          addTouchedFile(sessionId, fullPath)
          capture = { filePath: fullPath, lines: [] }
          continue
        }
        if (capture) {
          if (DIFF_LINE_RE.test(line) || DIFF_SUMMARY_RE.test(line)) {
            capture.lines.push(line)
          } else if (line.trim()) {
            finalizeCapture()
          }
        }
      }
    })

    // Track the last non-empty selection so Shift+mouseup can read it after xterm finalizes it
    let lastSel = ''
    const selectionDisposable = terminal.onSelectionChange(() => {
      const s = terminal.getSelection()
      if (s) lastSel = s
    })

    // Shift+click: open URL or file path from current selection
    const handleMouseUp = (e: MouseEvent): void => {
      if (!e.shiftKey) return
      const sel = lastSel.trim()
      if (!sel) return
      const urlMatch = sel.match(URL_RE)
      if (urlMatch) {
        e.preventDefault()
        openExternal(urlMatch[0]).catch(() => {})
        lastSel = ''
        return
      }
      const fileMatch = sel.match(FILE_PATH_RE)
      if (fileMatch) {
        e.preventDefault()
        const path = (fileMatch[1] ?? fileMatch[2] ?? '').trim()
        if (path) document.dispatchEvent(new CustomEvent('acc:open-file', { detail: { path } }))
        lastSel = ''
      }
    }

    // Right-click: show context menu with Copy / Open URL / Paste
    const handleContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const sel = terminal.getSelection().trim()
      const x = e.clientX
      const y = e.clientY

      navigator.clipboard.readText().catch(() => '').then((clipText) => {
        const items: TerminalCtxItem[] = []

        if (sel) {
          items.push({ label: 'Copy', action: () => { navigator.clipboard.writeText(sel).catch(() => {}); terminal.focus() } })
          const urlMatch = sel.match(URL_RE)
          if (urlMatch) {
            const url = urlMatch[0]
            items.push({ label: 'Open URL', action: () => openExternal(url).catch(() => {}) })
          }
        }

        if (clipText) {
          items.push({ label: 'Paste', action: () => { terminal.paste(clipText); requestAnimationFrame(() => terminal.focus()) } })
        }

        setCtxMenu({ x, y, items })
      })
    }

    // Capture-phase paste: intercept before xterm's textarea handler fires, giving one paste per Ctrl+V.
    // stopPropagation prevents the event reaching xterm's own textarea listener (which would paste again).
    // suppressNextPaste skips events already handled by the Ctrl+Shift+V custom key handler.
    const handlePaste = (e: ClipboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (suppressNextPaste) { suppressNextPaste = false; return }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text) { terminal.paste(text); requestAnimationFrame(() => terminal.focus()) }
    }

    // All three in capture phase: prevents xterm.js internal handlers from swallowing Shift+click,
    // right-click paste, or Ctrl+V before we've had a chance to handle them.
    container.addEventListener('mouseup', handleMouseUp, true)
    container.addEventListener('contextmenu', handleContextMenu, true)
    container.addEventListener('paste', handlePaste, true)

    // When cols change, xterm reflows cursor-positioned TUI output (Claude Code welcome screen)
    // producing duplicate lines. Clearing the viewport lets the app redraw clean via SIGWINCH.
    const safeRefit = (): void => {
      if (disposed) return
      const t = terminalRef.current
      if (!t) return
      const prevCols = t.cols
      try { fitAddonRef.current?.fit() } catch {}
      if (t.cols !== prevCols) {
        t.write('\x1b[2J\x1b[H')
      }
    }

    // Debounce to 150ms so reflows only happen when drag settles, not on every animation frame.
    // During a 500ms drag the old RAF approach fired ~30 reflows; this fires at most 1-2.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry && (entry.contentRect.width === 0 || entry.contentRect.height === 0)) return
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(safeRefit, 150)
    })

    // Re-fit when pane becomes visible again (e.g. switching back from projects view).
    let visRafId = 0
    const visibilityObserver = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        cancelAnimationFrame(visRafId)
        visRafId = requestAnimationFrame(safeRefit)
      }
    })

    observer.observe(container)
    visibilityObserver.observe(container)

    return () => {
      disposed = true
      clearTimeout(resizeTimer)
      cancelAnimationFrame(visRafId)
      if (fallbackFitTimer !== undefined) clearTimeout(fallbackFitTimer)
      offData()
      dataDisposable.dispose()
      resizeDisposable.dispose()
      selectionDisposable.dispose()
      observer.disconnect()
      visibilityObserver.disconnect()
      container.removeEventListener('mouseup', handleMouseUp, true)
      container.removeEventListener('contextmenu', handleContextMenu, true)
      container.removeEventListener('paste', handlePaste, true)
      searchAddonRef.current = null

      // Detach the xterm element from this container — keeps it alive in the pool so
      // the next mount can re-parent it without replaying history.
      if (terminal.element?.parentNode === container) {
        container.removeChild(terminal.element)
      }

      // Fully dispose only when the session has been removed from the store (closed,
      // not just moved to a different layout position).
      if (!useStore.getState().sessions[sessionId]) {
        const poolEntry = terminalPool.get(sessionId)
        terminalPool.delete(sessionId)
        terminalRef.current = null
        fitAddonRef.current = null
        // terminal.dispose() automatically disposes all addons registered via loadAddon
        // (renderer, fit, search, unicode). Manually disposing them first causes a
        // second dispose() call inside terminal.dispose() which crashes with _isDisposed.
        try { terminal.dispose() } catch {}
        // OSC handlers are registered on the parser directly, dispose them after.
        poolEntry?.oscDisposables.forEach((d) => { try { d.dispose() } catch {} })
        unregisterTerminal(sessionId)
      }
    }
  }, [sessionId])

  // Re-fit and re-focus when this pane becomes active
  useEffect(() => {
    if (activeSessionId === sessionId && terminalRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit()
          terminalRef.current?.refresh(0, terminalRef.current.rows - 1)
          terminalRef.current?.focus()
        } catch {}
      })
    }
  }, [activeSessionId, sessionId])

  // Update font settings when they change (without remounting)
  useEffect(() => {
    if (terminalRef.current) {
      try {
        terminalRef.current.options.fontSize = settings.fontSize
        terminalRef.current.options.fontFamily = settings.fontFamily
        fitAddonRef.current?.fit()
        terminalRef.current.refresh(0, terminalRef.current.rows - 1)
      } catch {}
    }
  }, [settings.fontSize, settings.fontFamily])

  // Update terminal theme: per-session override → auto from app theme
  useEffect(() => {
    if (terminalRef.current) {
      try {
        terminalRef.current.options.theme = sessionTerminalTheme
          ? getThemeById(sessionTerminalTheme, appTheme)
          : resolveTerminalTheme(appTheme)
      } catch {}
    }
  }, [appTheme, sessionTerminalTheme])

  return {
    ctxMenu,
    dismissCtxMenu,
    search: { visible: searchVisible, show: showSearch, hide: hideSearch, findNext, findPrevious }
  }
}
