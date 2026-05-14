import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Editor from '@monaco-editor/react'
import { Save, X, ChevronRight } from 'lucide-react'
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

interface TabState {
  path: string
  content: string | null
  dirty: boolean
}

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
  const [tabs, setTabs] = useState<TabState[]>([{ path: filePath, content: null, dirty: false }])
  const [activeIdx, setActiveIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; idx: number } | null>(null)
  const [monacoThemeOverride, setMonacoThemeOverride] = useState<MonacoThemeId | null>(null)
  const removeLayoutLeaf = useStore((s) => s.removeLayoutLeaf)
  const theme = useStore((s) => s.settings.theme)
  const editors = useInstalledEditors()
  const ctxRef = useRef<HTMLDivElement>(null)
  const tabCtxRef = useRef<HTMLDivElement>(null)

  const autoTheme: MonacoThemeId = theme === 'light' ? 'vs' : 'vs-dark'
  const monacoTheme = monacoThemeOverride ?? autoTheme
  const activeTab = tabs[activeIdx] ?? tabs[0]
  const tabPaths = tabs.map((t) => t.path).join('\0')

  // Load content for active tab when not yet loaded
  useEffect(() => {
    const tab = tabs[activeIdx]
    if (!tab || tab.content !== null) return
    const idx = activeIdx
    readFile(tab.path).then((text) => {
      setTabs((prev) => prev.map((t, i) => (i === idx ? { ...t, content: text ?? '' } : t)))
    })
    // tabPaths covers "new tab added at activeIdx" scenario
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx, tabPaths])

  // Listen for open-file-in-pane events
  useEffect(() => {
    const handler = (e: Event): void => {
      const { leafId: targetId, filePath: newPath } = (e as CustomEvent<{ leafId: string; filePath: string }>).detail
      if (targetId !== leafId) return
      setTabs((prev) => {
        const existing = prev.findIndex((t) => t.path === newPath)
        if (existing !== -1) { setActiveIdx(existing); return prev }
        const next = [...prev, { path: newPath, content: null, dirty: false }]
        setActiveIdx(next.length - 1)
        return next
      })
    }
    document.addEventListener('acc:open-file-in-pane', handler)
    return () => document.removeEventListener('acc:open-file-in-pane', handler)
  }, [leafId])

  // Close context menus on outside click
  useEffect(() => {
    if (!ctxMenu && !tabCtxMenu) return
    const handler = (e: MouseEvent): void => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null)
      if (tabCtxRef.current && !tabCtxRef.current.contains(e.target as Node)) setTabCtxMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu, tabCtxMenu])

  const handleSave = async (): Promise<void> => {
    const tab = tabs[activeIdx]
    if (!tab || tab.content === null || saving) return
    const idx = activeIdx
    const name = tab.path.replace(/\\/g, '/').split('/').pop() ?? 'file'
    setSaving(true)
    try {
      await writeFile(tab.path, tab.content)
      setTabs((prev) => prev.map((t, i) => (i === idx ? { ...t, dirty: false } : t)))
      toast.success(`Saved ${name}`)
    } catch {
      toast.error(`Failed to save ${name}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRef = useRef(handleSave)
  useEffect(() => { handleSaveRef.current = handleSave })

  const closeTab = (idx: number): void => {
    if (tabs.length === 1) { removeLayoutLeaf(tabId, leafId); return }
    const newIdx = idx < activeIdx ? activeIdx - 1 : idx === activeIdx ? Math.max(0, activeIdx - 1) : activeIdx
    setActiveIdx(newIdx)
    setTabs((prev) => prev.filter((_, i) => i !== idx))
  }

  const closeOthers = (idx: number): void => {
    setTabs([tabs[idx]])
    setActiveIdx(0)
  }

  const closeToLeft = (idx: number): void => {
    if (idx === 0) return
    setTabs((prev) => prev.slice(idx))
    setActiveIdx(0)
  }

  const closeToRight = (idx: number): void => {
    if (idx === tabs.length - 1) return
    setTabs((prev) => prev.slice(0, idx + 1))
    setActiveIdx((prev) => Math.min(prev, idx))
  }

  const ctxX = ctxMenu ? Math.min(ctxMenu.x, window.innerWidth - 200) : 0
  const ctxY = ctxMenu ? Math.min(ctxMenu.y, window.innerHeight - 240) : 0
  const tabCtxX = tabCtxMenu ? Math.min(tabCtxMenu.x, window.innerWidth - 180) : 0
  const tabCtxY = tabCtxMenu ? Math.min(tabCtxMenu.y, window.innerHeight - 200) : 0

  return (
    <div className="flex flex-col w-full h-full bg-brand-bg">
      {/* Tab bar */}
      <div
        className="flex-shrink-0 flex items-stretch border-b border-brand-panel/60 bg-brand-surface overflow-x-auto"
        style={{ minHeight: 32 }}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }}
      >
        {tabs.map((tab, idx) => {
          const name = tab.path.replace(/\\/g, '/').split('/').pop() ?? tab.path
          const isActive = idx === activeIdx
          return (
            <div
              key={tab.path}
              onClick={() => setActiveIdx(idx)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setTabCtxMenu({ x: e.clientX, y: e.clientY, idx }) }}
              className={cn(
                'flex items-center gap-1.5 px-3 h-8 text-xs whitespace-nowrap cursor-pointer border-r border-brand-panel/40 select-none flex-shrink-0 group',
                isActive
                  ? 'text-zinc-200 bg-brand-bg border-b-2 border-b-brand-accent -mb-px'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-brand-panel/30'
              )}
            >
              <span className={cn('max-w-[140px] truncate', tab.dirty && 'italic')}>
                {name}{tab.dirty ? ' •' : ''}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(idx) }}
                className={cn(
                  'flex-shrink-0 rounded transition-colors p-0.5',
                  isActive
                    ? 'text-zinc-400 hover:text-zinc-100 hover:bg-brand-panel/60'
                    : 'text-transparent group-hover:text-zinc-600 hover:!text-zinc-300'
                )}
              >
                <X size={11} />
              </button>
            </div>
          )
        })}
        {activeTab?.dirty && (
          <div className="ml-auto flex items-center px-2 flex-shrink-0">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-colors disabled:opacity-40"
            >
              <Save size={10} />{saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {!activeTab || activeTab.content === null ? (
          <div className="flex items-center justify-center h-full text-xs text-zinc-600">Loading…</div>
        ) : (
          <Editor
            key={activeTab.path}
            value={activeTab.content}
            language={extToLang(activeTab.path)}
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
              if (val !== undefined) {
                const idx = activeIdx
                setTabs((prev) => prev.map((t, i) => (i === idx ? { ...t, content: val, dirty: true } : t)))
              }
            }}
          />
        )}
      </div>

      {/* Tab right-click menu */}
      {tabCtxMenu && createPortal(
        <div
          ref={tabCtxRef}
          style={{ position: 'fixed', top: tabCtxY, left: tabCtxX, zIndex: 9999 }}
          className="bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-44"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button onClick={() => { closeTab(tabCtxMenu.idx); setTabCtxMenu(null) }}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
            Close
          </button>
          <button onClick={() => { closeOthers(tabCtxMenu.idx); setTabCtxMenu(null) }}
            disabled={tabs.length <= 1}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left disabled:opacity-40 disabled:cursor-default">
            Close Others
          </button>
          <button onClick={() => { closeToLeft(tabCtxMenu.idx); setTabCtxMenu(null) }}
            disabled={tabCtxMenu.idx === 0}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left disabled:opacity-40 disabled:cursor-default">
            Close to Left
          </button>
          <button onClick={() => { closeToRight(tabCtxMenu.idx); setTabCtxMenu(null) }}
            disabled={tabCtxMenu.idx === tabs.length - 1}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left disabled:opacity-40 disabled:cursor-default">
            Close to Right
          </button>
          <div className="h-px bg-brand-panel my-1" />
          <button onClick={() => { removeLayoutLeaf(tabId, leafId); setTabCtxMenu(null) }}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left">
            Close All
          </button>
        </div>,
        document.body
      )}

      {/* Tab bar right-click (empty area) → file actions */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          style={{ position: 'fixed', top: ctxY, left: ctxX, zIndex: 9999 }}
          className="bg-brand-surface border border-brand-panel/60 rounded-md shadow-2xl py-1 w-48"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={() => { void handleSave(); setCtxMenu(null) }}
            disabled={!activeTab?.dirty}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left disabled:opacity-40 disabled:cursor-default"
          >
            Save
          </button>
          <div className="h-px bg-brand-panel my-1" />
          <button
            onClick={() => { if (activeTab) showInFolder(activeTab.path).catch(() => {}); setCtxMenu(null) }}
            className="w-full flex items-center px-3 py-1.5 text-xs text-zinc-300 hover:bg-brand-panel hover:text-zinc-100 transition-colors text-left"
          >
            Reveal in Explorer
          </button>
          {editors.length > 0 && (
            <CtxSubMenu label="Open in">
              {editors.map((ed) => (
                <button
                  key={ed.command}
                  onClick={() => { if (activeTab) openInEditor(ed.command, activeTab.path).catch(() => {}); setCtxMenu(null) }}
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
