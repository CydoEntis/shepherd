import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Editor from '@monaco-editor/react'
import { Save, ChevronRight } from 'lucide-react'
import { readFile, writeFile, showInFolder, openInEditor } from '../fs.service'
import { useInstalledEditors } from '../hooks/useInstalledEditors'
import { useStore } from '../../../store/root.store'
import { cn } from '../../../lib/utils'
import { toast } from 'sonner'

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
  { id: 'vs-dark', label: 'Dark' },
  { id: 'vs', label: 'Light' },
  { id: 'hc-black', label: 'High Contrast' },
] as const

type MonacoThemeId = typeof MONACO_THEMES[number]['id']

function CtxSubMenu({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
        <span className="flex-1">{label}</span>
        <ChevronRight size={10} className="text-zinc-500 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute left-full top-0 -mt-1 ml-0.5 z-[10000] bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 min-w-[140px]">
          {children}
        </div>
      )}
    </div>
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
  const [monacoThemeOverride, setMonacoThemeOverride] = useState<MonacoThemeId | null>(null)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const theme = useStore((s) => s.settings.theme)
  const editors = useInstalledEditors()
  const ctxRef = useRef<HTMLDivElement>(null)

  const autoTheme: MonacoThemeId = theme === 'light' ? 'vs' : 'vs-dark'
  const monacoTheme = monacoThemeOverride ?? autoTheme

  // Load file content when path changes
  useEffect(() => {
    setContent(null)
    setDirty(false)
    readFile(currentPath).then((text) => setContent(text ?? ''))
  }, [currentPath])

  // Switch file when file-finder / file-tree targets this pane
  useEffect(() => {
    const handler = (e: Event): void => {
      const { leafId: targetId, filePath: newPath } = (e as CustomEvent<{ leafId: string; filePath: string }>).detail
      if (targetId !== leafId) return
      setCurrentPath(newPath)
    }
    document.addEventListener('acc:open-file-in-pane', handler)
    return () => document.removeEventListener('acc:open-file-in-pane', handler)
  }, [leafId])

  const handleSave = async (): Promise<void> => {
    if (content === null || saving) return
    const name = currentPath.replace(/\\/g, '/').split('/').pop() ?? 'file'
    setSaving(true)
    try {
      await writeFile(currentPath, content)
      setDirty(false)
      toast.success(`Saved ${name}`)
    } catch {
      toast.error(`Failed to save ${name}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRef = useRef(handleSave)
  useEffect(() => { handleSaveRef.current = handleSave })

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const handler = (e: MouseEvent): void => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu])

  const ctxX = ctxMenu ? Math.min(ctxMenu.x, window.innerWidth - 200) : 0
  const ctxY = ctxMenu ? Math.min(ctxMenu.y, window.innerHeight - 240) : 0

  return (
    <div
      className="flex flex-col w-full h-full bg-brand-bg"
      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
    >
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
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void handleSaveRef.current())
            }}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              renderLineHighlight: 'line',
              padding: { top: 8, bottom: 8 },
              overviewRulerBorder: false,
              folding: true,
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
          className="bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-48"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={() => { void handleSave(); setCtxMenu(null) }}
            disabled={!dirty}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left disabled:opacity-40 disabled:cursor-default"
          >
            Save
          </button>
          <div className="h-px bg-brand-panel my-1" />
          <button
            onClick={() => { showInFolder(currentPath).catch(() => {}); setCtxMenu(null) }}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left"
          >
            Reveal in Explorer
          </button>
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
                onClick={() => { setMonacoThemeOverride(t.id); setCtxMenu(null) }}
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
                  onClick={() => { setMonacoThemeOverride(null); setCtxMenu(null) }}
                  className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-500 hover:bg-brand-panel hover:text-zinc-300 transition-colors text-left"
                >
                  Reset to auto
                </button>
              </>
            )}
          </CtxSubMenu>
          <div className="h-px bg-brand-panel my-1" />
          <button
            onClick={() => { removeLayoutLeaf(tabId, leafId); setCtxMenu(null) }}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left"
          >
            Close Pane
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
