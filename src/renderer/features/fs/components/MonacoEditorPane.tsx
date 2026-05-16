import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import { Save, ChevronRight } from 'lucide-react'
import { readFile, writeFile, showInFolder, openInEditor } from '../fs.service'
import { useInstalledEditors } from '../hooks/useInstalledEditors'
import { useStore } from '../../../store/root.store'
import { cn } from '../../../lib/utils'
import { toast } from 'sonner'
import BlackboardTheme from 'monaco-themes/themes/Blackboard.json'
import AmyTheme from 'monaco-themes/themes/Amy.json'
import CloudsMidnightTheme from 'monaco-themes/themes/Clouds Midnight.json'
import Cobalt2Theme from 'monaco-themes/themes/Cobalt2.json'
import DawnTheme from 'monaco-themes/themes/Dawn.json'
import MerbivoreSoftTheme from 'monaco-themes/themes/Merbivore Soft.json'
import MonokaiBrightTheme from 'monaco-themes/themes/Monokai Bright.json'
import NightOwlTheme from 'monaco-themes/themes/Night Owl.json'
import OceanicNextTheme from 'monaco-themes/themes/Oceanic Next.json'
import PastelsOnDarkTheme from 'monaco-themes/themes/Pastels on Dark.json'
import UpstreamSunburstTheme from 'monaco-themes/themes/Upstream Sunburst.json'
import TwilightTheme from 'monaco-themes/themes/Twilight.json'
import VibrantInkTheme from 'monaco-themes/themes/Vibrant Ink.json'

type EditorInstance = Parameters<OnMount>[0]
type MonacoInstance = Parameters<OnMount>[1]

function extToLang(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', cs: 'csharp',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', html: 'html', css: 'css', scss: 'scss',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    sql: 'sql', xml: 'xml', dockerfile: 'dockerfile',
  }
  return map[ext] ?? 'plaintext'
}

const MONACO_THEMES = [
  { id: 'vs-dark',            label: 'Dark (default)' },
  { id: 'vs',                 label: 'Light' },
  { id: 'hc-black',           label: 'High Contrast' },
  { id: 'github-dark',        label: 'GitHub Dark' },
  { id: 'dracula',            label: 'Dracula' },
  { id: 'one-dark',           label: 'One Dark' },
  { id: 'monokai',            label: 'Monokai' },
  { id: 'monokai-bright',     label: 'Monokai Bright' },
  { id: 'night-owl',          label: 'Night Owl' },
  { id: 'oceanic-next',       label: 'Oceanic Next' },
  { id: 'cobalt2',            label: 'Cobalt 2' },
  { id: 'blackboard',         label: 'Blackboard' },
  { id: 'twilight',           label: 'Twilight' },
  { id: 'vibrant-ink',        label: 'Vibrant Ink' },
  { id: 'clouds-midnight',    label: 'Cloud Midnight' },
  { id: 'merbivore-soft',     label: 'Merbivore Soft' },
  { id: 'upstream-sunburst',  label: 'Upstream Sunburst' },
  { id: 'pastels-on-dark',    label: 'Pastels on Dark' },
  { id: 'dawn',               label: 'Dawn' },
  { id: 'amy',                label: 'Amy' },
] as const

type MonacoThemeId = typeof MONACO_THEMES[number]['id']

type ThemeData = {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  inherit: boolean
  rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>
  colors: Record<string, string>
  encodedTokensColors?: string[]
}

function defineCustomThemes(monaco: MonacoInstance): void {
  monaco.editor.defineTheme('github-dark', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '8b949e' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'keyword', foreground: 'ff7b72' },
      { token: 'number', foreground: '79c0ff' },
      { token: 'type', foreground: 'ffa657' },
      { token: 'function', foreground: 'd2a8ff' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editor.lineHighlightBackground': '#161b22',
      'editor.selectionBackground': '#264f7855',
      'editorLineNumber.foreground': '#30363d',
      'editorLineNumber.activeForeground': '#8b949e',
      'editorCursor.foreground': '#c9d1d9',
      'editorIndentGuide.background': '#21262d',
    },
  })
  monaco.editor.defineTheme('dracula', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'keyword', foreground: 'ff79c6' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'type', foreground: '8be9fd' },
      { token: 'function', foreground: '50fa7b' },
      { token: 'variable', foreground: 'f8f8f2' },
    ],
    colors: {
      'editor.background': '#282a36',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#44475a55',
      'editor.selectionBackground': '#44475a',
      'editorLineNumber.foreground': '#6272a4',
      'editorCursor.foreground': '#f8f8f2',
      'editorIndentGuide.background': '#44475a',
    },
  })
  monaco.editor.defineTheme('one-dark', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '5c6370' },
      { token: 'string', foreground: '98c379' },
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'type', foreground: 'e5c07b' },
      { token: 'function', foreground: '61afef' },
      { token: 'variable', foreground: 'e06c75' },
    ],
    colors: {
      'editor.background': '#282c34',
      'editor.foreground': '#abb2bf',
      'editor.lineHighlightBackground': '#2c313a',
      'editor.selectionBackground': '#3e4451',
      'editorLineNumber.foreground': '#495162',
      'editorCursor.foreground': '#528bff',
      'editorIndentGuide.background': '#3b4048',
    },
  })
  monaco.editor.defineTheme('monokai', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '75715e' },
      { token: 'string', foreground: 'e6db74' },
      { token: 'keyword', foreground: 'f92672' },
      { token: 'number', foreground: 'ae81ff' },
      { token: 'type', foreground: '66d9ef' },
      { token: 'function', foreground: 'a6e22e' },
      { token: 'variable', foreground: 'f8f8f2' },
    ],
    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#3e3d3255',
      'editor.selectionBackground': '#49483e',
      'editorLineNumber.foreground': '#75715e',
      'editorCursor.foreground': '#f8f8f2',
      'editorIndentGuide.background': '#3b3a32',
    },
  })
  monaco.editor.defineTheme('blackboard',        BlackboardTheme as ThemeData)
  monaco.editor.defineTheme('amy',               AmyTheme as ThemeData)
  monaco.editor.defineTheme('clouds-midnight',   CloudsMidnightTheme as ThemeData)
  monaco.editor.defineTheme('cobalt2',           Cobalt2Theme as ThemeData)
  monaco.editor.defineTheme('dawn',              DawnTheme as ThemeData)
  monaco.editor.defineTheme('merbivore-soft',    MerbivoreSoftTheme as ThemeData)
  monaco.editor.defineTheme('monokai-bright',    MonokaiBrightTheme as ThemeData)
  monaco.editor.defineTheme('night-owl',         NightOwlTheme as ThemeData)
  monaco.editor.defineTheme('oceanic-next',      OceanicNextTheme as ThemeData)
  monaco.editor.defineTheme('pastels-on-dark',   PastelsOnDarkTheme as ThemeData)
  monaco.editor.defineTheme('upstream-sunburst', UpstreamSunburstTheme as ThemeData)
  monaco.editor.defineTheme('twilight',          TwilightTheme as ThemeData)
  monaco.editor.defineTheme('vibrant-ink',       VibrantInkTheme as ThemeData)
}

function CtxSubMenu({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [flipLeft, setFlipLeft] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)

  const handleMouseEnter = (): void => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setFlipLeft(rect.right + 152 > window.innerWidth - 8)
    }
    setOpen(true)
  }

  return (
    <div ref={triggerRef} className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={() => setOpen(false)}>
      <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
        <span className="flex-1">{label}</span>
        <ChevronRight size={10} className="text-zinc-500 flex-shrink-0" />
      </button>
      {open && (
        <div className={cn(
          'absolute top-0 -mt-1 z-[10000] bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 min-w-[140px]',
          flipLeft ? 'right-full mr-0.5' : 'left-full ml-0.5'
        )}>
          {children}
        </div>
      )}
    </div>
  )
}

function CtxItem({ label, hint, disabled, onClick }: { label: string; hint?: string; disabled?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left disabled:opacity-40 disabled:cursor-default"
    >
      <span className="flex-1">{label}</span>
      {hint && <span className="text-zinc-600 flex-shrink-0">{hint}</span>}
    </button>
  )
}

interface Props {
  filePath: string
  tabId: string
  leafId: string
}

export function MonacoEditorPane({ filePath, tabId, leafId }: Props): JSX.Element {
  const [currentPath, setCurrentPath] = useState(filePath)
  const [content, setContent] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [pendingClose, setPendingClose] = useState(false)
  const editorRef = useRef<EditorInstance | null>(null)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const updateSettings = useStore((s) => s.updateSettings)

  const handleClose = (): void => {
    if (dirty) { setPendingClose(true); return }
    removeLayoutLeaf(tabId, leafId)
  }
  const theme = useStore((s) => s.settings.theme)
  const editorFontSize = useStore((s) => s.settings.editorFontSize ?? 13)
  const editorThemeSetting = useStore((s) => s.settings.editorTheme ?? '')
  const editors = useInstalledEditors()
  const ctxRef = useRef<HTMLDivElement>(null)

  const autoTheme: MonacoThemeId = ((): MonacoThemeId => {
    switch (theme) {
      case 'light':  return 'vs'
      case 'space':  return 'dracula'
      case 'nebula': return 'one-dark'
      case 'solar':  return 'monokai'
      case 'aurora': return 'github-dark'
      case 'mars':   return 'monokai'
      case 'pulsar': return 'one-dark'
      default:       return 'vs-dark'
    }
  })()
  const monacoThemeOverride: MonacoThemeId | null = (MONACO_THEMES.find((t) => t.id === editorThemeSetting)?.id ?? null)
  const monacoTheme = monacoThemeOverride ?? autoTheme

  useEffect(() => {
    setContent(null)
    setDirty(false)
    readFile(currentPath).then((text) => setContent(text ?? ''))
  }, [currentPath])

  useEffect(() => {
    const handler = (e: Event): void => {
      const { leafId: targetId, filePath: newPath } = (e as CustomEvent<{ leafId: string; filePath: string }>).detail
      if (targetId !== leafId) return
      setCurrentPath(newPath)
    }
    document.addEventListener('acc:open-file-in-pane', handler)
    return () => document.removeEventListener('acc:open-file-in-pane', handler)
  }, [leafId])

  useEffect(() => {
    const handler = (e: Event): void => {
      const { filePath: targetPath, lineNumber } = (e as CustomEvent<{ filePath: string; lineNumber: number }>).detail
      const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()
      if (norm(targetPath) !== norm(currentPath)) return
      const editor = editorRef.current
      if (!editor) return
      editor.revealLineInCenter(lineNumber)
      editor.setPosition({ lineNumber, column: 1 })
      editor.focus()
    }
    document.addEventListener('acc:editor-go-to-line', handler)
    return () => document.removeEventListener('acc:editor-go-to-line', handler)
  }, [currentPath])

  const handleSave = async (): Promise<void> => {
    if (content === null || saving) return
    const name = currentPath.replace(/\\/g, '/').split('/').pop() ?? 'file'
    setSaving(true)
    try {
      await writeFile(currentPath, content)
      setDirty(false)
      toast.success(`Saved ${name}`)
      document.dispatchEvent(new CustomEvent('acc:file-saved', { detail: { path: currentPath } }))
    } catch {
      toast.error(`Failed to save ${name}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRef = useRef(handleSave)
  useEffect(() => { handleSaveRef.current = handleSave })

  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent): void => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  const handleEditorAction = (actionId: string): void => {
    editorRef.current?.getAction(actionId)?.run()
    setCtxMenu(null)
  }

  const handleClipboard = (action: 'cut' | 'copy' | 'paste'): void => {
    const actionMap = {
      cut: 'editor.action.clipboardCutAction',
      copy: 'editor.action.clipboardCopyAction',
      paste: 'editor.action.clipboardPasteAction',
    }
    editorRef.current?.trigger('contextmenu', actionMap[action], null)
    setCtxMenu(null)
  }

  const ctxX = ctxMenu ? Math.min(ctxMenu.x, window.innerWidth - 220) : 0
  const ctxY = ctxMenu ? Math.min(ctxMenu.y, window.innerHeight - 320) : 0

  return (
    <div className="flex flex-col w-full h-full bg-brand-bg">
      {/* Save bar — only visible when dirty */}
      {dirty && (
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1 border-b border-brand-panel/60 bg-brand-surface">
          <span className="text-[10px] text-zinc-500 truncate flex-1 min-w-0">
            {currentPath.replace(/\\/g, '/').split('/').pop()}
          </span>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Save size={10} />{saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {content === null ? (
          <div className="flex items-center justify-center h-full text-xs text-zinc-600">Loading…</div>
        ) : (
          <Editor
            key={currentPath}
            value={content}
            language={extToLang(currentPath)}
            theme={monacoTheme}
            onMount={(editor, monaco) => {
              editorRef.current = editor
              defineCustomThemes(monaco)
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void handleSaveRef.current())
              editor.updateOptions({ contextmenu: false })
              editor.getDomNode()?.addEventListener('contextmenu', (e) => {
                e.preventDefault()
                setCtxMenu({ x: e.clientX, y: e.clientY })
              })
            }}
            options={{
              fontSize: editorFontSize,
              minimap: { enabled: false },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              renderLineHighlight: 'line',
              padding: { top: 8, bottom: 8 },
              overviewRulerBorder: false,
              folding: true,
              contextmenu: false,
            }}
            onChange={(val) => {
              if (val !== undefined) { setContent(val); setDirty(true) }
            }}
          />
        )}
      </div>

      {/* Right-click context menu */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          style={{ position: 'fixed', top: ctxY, left: ctxX, zIndex: 9999 }}
          className="bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-52"
          onContextMenu={(e) => e.preventDefault()}
        >
          <CtxItem label="Save" hint="Ctrl+S" disabled={!dirty} onClick={() => { void handleSave(); setCtxMenu(null) }} />
          <div className="h-px bg-brand-panel my-1" />
          <CtxItem label="Cut"   hint="Ctrl+X" onClick={() => handleClipboard('cut')} />
          <CtxItem label="Copy"  hint="Ctrl+C" onClick={() => handleClipboard('copy')} />
          <CtxItem label="Paste" hint="Ctrl+V" onClick={() => handleClipboard('paste')} />
          <div className="h-px bg-brand-panel my-1" />
          <CtxItem label="Format Document" hint="Shift+Alt+F" onClick={() => handleEditorAction('editor.action.formatDocument')} />
          <div className="h-px bg-brand-panel my-1" />
          <CtxItem label="Reveal in Explorer" onClick={() => { showInFolder(currentPath).catch(() => {}); setCtxMenu(null) }} />
          {editors.length > 0 && (
            <CtxSubMenu label="Open in">
              {editors.map((ed) => (
                <button
                  key={ed.command}
                  onClick={() => { openInEditor(ed.command, currentPath).catch(() => {}); setCtxMenu(null) }}
                  className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left"
                >
                  {ed.name}
                </button>
              ))}
            </CtxSubMenu>
          )}
          <CtxSubMenu label="Editor Theme">
            {MONACO_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => { void updateSettings({ editorTheme: t.id }); setCtxMenu(null) }}
                className={cn(
                  'w-full flex items-center px-3 py-1.5 text-xs transition-colors text-left',
                  monacoTheme === t.id ? 'text-zinc-100 bg-brand-panel/60' : 'text-zinc-300 hover:bg-brand-panel hover:text-zinc-100'
                )}
              >
                {t.label}
                {monacoThemeOverride === null && t.id === autoTheme && (
                  <span className="ml-1 text-[10px] text-zinc-600">(auto)</span>
                )}
              </button>
            ))}
            {monacoThemeOverride !== null && (
              <>
                <div className="h-px bg-brand-panel my-1" />
                <button
                  onClick={() => { void updateSettings({ editorTheme: '' }); setCtxMenu(null) }}
                  className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-500 hover:bg-brand-panel hover:text-zinc-300 transition-colors text-left"
                >
                  Reset to auto
                </button>
              </>
            )}
          </CtxSubMenu>
          <div className="h-px bg-brand-panel my-1" />
          <CtxItem label="Close Pane" onClick={() => { handleClose(); setCtxMenu(null) }} />
        </div>,
        document.body
      )}

      {pendingClose && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingClose(false) }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-brand-surface border border-brand-panel/60 rounded-lg shadow-2xl w-80 p-5 flex flex-col gap-4">
            <span className="text-sm font-semibold text-zinc-200">Unsaved Changes</span>
            <p className="text-xs text-zinc-400">
              <span className="text-zinc-200 font-medium">{currentPath.replace(/\\/g, '/').split('/').pop()}</span>
              {' '}has unsaved changes. Close without saving?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingClose(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors rounded border border-brand-panel hover:border-zinc-600"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave().then(() => removeLayoutLeaf(tabId, leafId))}
                className="px-3 py-1.5 text-xs bg-brand-accent/20 text-brand-accent border border-brand-accent/30 hover:bg-brand-accent/30 transition-colors rounded"
              >
                Save & Close
              </button>
              <button
                onClick={() => removeLayoutLeaf(tabId, leafId)}
                className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 hover:text-red-300 transition-colors rounded"
              >
                Discard
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
