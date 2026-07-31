import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Anthropic from '@anthropic-ai/sdk'
import Editor, { DiffEditor } from '@monaco-editor/react'
import loader from '@monaco-editor/loader'
import * as monaco from 'monaco-editor'
import { Toolbar } from './components/Toolbar'
import { JsonTree } from './components/JsonTree'
import { StatusBar } from './components/StatusBar'
import { CrmBuilder } from './components/CrmBuilder'
import { Tip } from './components/Tip'
import { Welcome, type RecentFile } from './components/Welcome'
import {
  format,
  minify,
  repair,
  sortKeys,
  escapeJson,
  unescapeJson,
  parseLines,
  toYaml,
  toCsv,
  validateWithSchema,
  type LinesResult,
  type SchemaError
} from './utils/jsonUtils'

// Use bundled Monaco (no CDN)
loader.config({ monaco })

const RECENTS_KEY = 'recent_files'
const RECENTS_MAX = 8

function loadRecents(): RecentFile[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecents(list: RecentFile[]): void {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list))
}

const SESSION_KEY = 'session_v1'
const DROPPABLE_EXTS = /\.(json|jsonl|ndjson|log|txt)$/i

interface SessionEntry {
  name: string
  filePath: string | null
  content: string
  savedContent: string
  isJsonLines: boolean
}

interface SessionData {
  entries: SessionEntry[]
  activeIndex: number
}

function loadSession(): SessionData {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : { entries: [], activeIndex: 0 }
  } catch {
    return { entries: [], activeIndex: 0 }
  }
}

function saveSession(data: SessionData): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch {
    // Quota exceeded or unavailable — losing session restore is non-fatal.
  }
}

interface FileTab {
  id: string
  name: string
  filePath: string | null
  content: string
  savedContent: string
  isJsonLines: boolean
  selectedLine: number
}

let tabSeq = 0
function nextTabId(): string {
  tabSeq += 1
  return `tab-${tabSeq}`
}

let untitledSeq = 0
function nextUntitledName(): string {
  untitledSeq += 1
  return `Untitled-${untitledSeq}.json`
}

function makeTab(name: string, content: string, filePath: string | null = null): FileTab {
  return {
    id: nextTabId(),
    name,
    filePath,
    content,
    savedContent: content,
    isJsonLines: false,
    selectedLine: 0
  }
}

interface IncomingFile {
  path: string | null
  name: string
  content: string
}

// Merges newly opened files into the existing tab list: files already open (by path)
// are refreshed and focused instead of duplicated, and the very first file opened
// replaces a still-untouched default tab instead of piling on top of it.
function computeNextFiles(
  prev: FileTab[],
  incoming: IncomingFile[]
): { files: FileTab[]; focusId: string | null } {
  let next = prev
  let focusId: string | null = null
  for (const f of incoming) {
    const existingIdx = f.path ? next.findIndex(t => t.filePath === f.path) : -1
    if (existingIdx !== -1) {
      const existing = next[existingIdx]
      next = next.map((t, i) => (i === existingIdx ? { ...t, content: f.content, savedContent: f.content } : t))
      focusId = existing.id
      continue
    }
    const tab = makeTab(f.name, f.content, f.path)
    const onlyPristineTabOpen =
      next.length === 1 && next[0].filePath === null && next[0].content === next[0].savedContent
    next = onlyPristineTabOpen ? [tab] : [...next, tab]
    focusId = tab.id
  }
  return { files: next, focusId }
}

function getInitialSession(): { files: FileTab[]; activeId: string } {
  const session = loadSession()
  if (session.entries.length === 0) return { files: [], activeId: '' }
  const restored: FileTab[] = session.entries.map(e => ({
    id: nextTabId(),
    name: e.name,
    filePath: e.filePath,
    content: e.content,
    savedContent: e.savedContent,
    isJsonLines: e.isJsonLines,
    selectedLine: 0
  }))
  const activeIdx = Math.min(Math.max(session.activeIndex, 0), restored.length - 1)
  return { files: restored, activeId: restored[activeIdx].id }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'editor' | 'builder'>('editor')
  const [initialSession] = useState(getInitialSession)
  const [files, setFiles] = useState<FileTab[]>(() => initialSession.files)
  const [activeId, setActiveId] = useState<string>(() => initialSession.activeId)
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => loadRecents())
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [compareLeftId, setCompareLeftId] = useState<string>('')
  const [compareRightId, setCompareRightId] = useState<string>('')
  const [showSearchAll, setShowSearchAll] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [showSchema, setShowSchema] = useState(false)
  const [schemaText, setSchemaText] = useState(() => localStorage.getItem('json_schema_draft') ?? '')
  const [schemaResult, setSchemaResult] = useState<{ valid: boolean; errors: SchemaError[] } | null>(null)
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem('auto_save') === 'true')
  const [parsedData, setParsedData] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const [search, setSearch] = useState('')
  const [linesResult, setLinesResult] = useState<LinesResult | null>(null)
  const [indentSize, setIndentSize] = useState(2)
  const [notification, setNotification] = useState<string | null>(null)
  const [leftPct, setLeftPct] = useState(50)
  const [aiLoading, setAiLoading] = useState(false)
  const [showApiSettings, setShowApiSettings] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropic_api_key') ?? '')
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('app_theme')
    return (saved === 'light' ? 'light' : 'dark') as 'dark' | 'light'
  })
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isMac = window.electronAPI?.platform === 'darwin'

  const activeFile = files.find(f => f.id === activeId)

  // Tags <html> so CSS can reserve room for macOS's traffic-light buttons
  // in the tab bar (the window uses titleBarStyle: 'hiddenInset' there).
  useEffect(() => {
    if (isMac) document.documentElement.classList.add('is-mac')
  }, [isMac])

  const pushRecent = useCallback((path: string, name: string) => {
    setRecentFiles(prev => {
      const next = [{ path, name }, ...prev.filter(r => r.path !== path)].slice(0, RECENTS_MAX)
      saveRecents(next)
      return next
    })
  }, [])

  // One-time, on mount: restored tabs that are disk-backed and clean carry
  // whatever content they had at last save — quietly refresh them from disk in
  // case the file changed elsewhere between sessions. Dirty/untitled tabs are
  // left untouched since their persisted content IS the source of truth.
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    initialSession.files.forEach(f => {
      if (!f.filePath || f.content !== f.savedContent) return
      api.readFile(f.filePath).then(result => {
        if (result && result.content !== f.content) {
          updateFile(f.id, { content: result.content, savedContent: result.content })
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist the open tabs (including unsaved edits) so relaunching restores
  // the session instead of always starting from the welcome screen.
  useEffect(() => {
    const t = setTimeout(() => {
      saveSession({
        entries: files.map(f => ({
          name: f.name,
          filePath: f.filePath,
          content: f.content,
          savedContent: f.savedContent,
          isJsonLines: f.isJsonLines
        })),
        activeIndex: Math.max(0, files.findIndex(f => f.id === activeId))
      })
    }, 500)
    return () => clearTimeout(t)
  }, [files, activeId])

  // Lets async/event-driven handlers (IPC file-open events, tab close) update
  // `files` via the functional setState form and still know which tab to focus
  // afterward, without depending on possibly-stale `files`/`activeId` closures.
  const focusIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (focusIdRef.current) {
      setActiveId(focusIdRef.current)
      focusIdRef.current = null
    }
  }, [files])

  // Apply theme to <html> element
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light')
    } else {
      root.removeAttribute('data-theme')
    }
    localStorage.setItem('app_theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('json_schema_draft', schemaText)
  }, [schemaText])

  useEffect(() => {
    localStorage.setItem('auto_save', String(autoSave))
  }, [autoSave])

  // Parse the active tab's JSON. Switching tabs re-parses immediately (it's a
  // discrete click, not a keystroke); typing still debounces at 300ms. Only the
  // active tab is ever parsed — background tabs stay as plain strings, so having
  // many files open costs no extra CPU/memory until you actually visit them.
  const prevActiveIdRef = useRef<string | undefined>(activeFile?.id)
  useEffect(() => {
    if (!activeFile) {
      setParsedData(null)
      setError(null)
      setLinesResult(null)
      return
    }
    const isTabSwitch = prevActiveIdRef.current !== activeFile.id
    prevActiveIdRef.current = activeFile.id
    const delay = isTabSwitch ? 0 : 300
    const t = setTimeout(() => {
      if (activeFile.isJsonLines) {
        const res = parseLines(activeFile.content)
        setLinesResult(res)
        const idx = Math.min(activeFile.selectedLine, res.results.length - 1)
        const clamped = Math.max(0, idx)
        if (clamped !== activeFile.selectedLine) {
          setFiles(prev => prev.map(f => (f.id === activeFile.id ? { ...f, selectedLine: clamped } : f)))
        }
        setParsedData(res.results[clamped] ?? null)
        setError(res.errors.length > 0 ? `${res.errors.length} line(s) with errors` : null)
      } else {
        try {
          const parsed = JSON.parse(activeFile.content)
          setParsedData(parsed)
          setError(null)
        } catch (e) {
          setParsedData(null)
          setError((e as Error).message)
        }
      }
    }, delay)
    return () => clearTimeout(t)
  }, [activeFile?.id, activeFile?.content, activeFile?.isJsonLines, activeFile?.selectedLine])

  const notify = useCallback((msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 2000)
  }, [])

  const updateFile = useCallback(
    (id: string, patch: Partial<FileTab> | ((f: FileTab) => Partial<FileTab>)) => {
      setFiles(prev =>
        prev.map(f => (f.id === id ? { ...f, ...(typeof patch === 'function' ? patch(f) : patch) } : f))
      )
    },
    []
  )

  // Auto-save: only for tabs already linked to a file on disk — untitled tabs
  // still require an explicit Save so the user picks a location once.
  useEffect(() => {
    if (!autoSave || !activeFile?.filePath) return
    if (activeFile.content === activeFile.savedContent) return
    const api = window.electronAPI
    if (!api) return
    const fileId = activeFile.id
    const filePath = activeFile.filePath
    const content = activeFile.content
    const t = setTimeout(() => {
      api.saveFile(content, filePath).then(result => {
        if (result) updateFile(fileId, { savedContent: content })
      })
    }, 800)
    return () => clearTimeout(t)
  }, [autoSave, activeFile?.id, activeFile?.content, activeFile?.savedContent, activeFile?.filePath, updateFile])

  const addOrFocusFiles = useCallback((incoming: IncomingFile[]) => {
    setFiles(prev => {
      const { files: next, focusId } = computeNextFiles(prev, incoming)
      focusIdRef.current = focusId
      return next
    })
  }, [])

  const reorderTabs = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    setFiles(prev => {
      const fromIdx = prev.findIndex(f => f.id === draggedId)
      const toIdx = prev.findIndex(f => f.id === targetId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }, [])

  const handleOpenCompare = useCallback(() => {
    if (files.length < 2) { notify('Open at least 2 files to compare'); return }
    const left = activeId || files[0].id
    const right = files.find(f => f.id !== left)?.id ?? files[0].id
    setCompareLeftId(left)
    setCompareRightId(right)
    setShowCompare(true)
  }, [files, activeId, notify])

  // Search across every open tab's raw content — deliberately text-based
  // rather than reusing the tree's key/value matcher, since background tabs
  // are never parsed (that's what keeps having many files open cheap).
  const searchResults = useMemo(() => {
    const term = globalSearch.trim().toLowerCase()
    if (!term) return []
    return files
      .map(f => {
        const matches = f.content
          .split('\n')
          .map((text, i) => ({ line: i + 1, text: text.trim() }))
          .filter(m => m.text.toLowerCase().includes(term))
          .slice(0, 30)
        return { file: f, matches }
      })
      .filter(r => r.matches.length > 0)
  }, [files, globalSearch])

  const handleJumpToMatch = useCallback((fileId: string) => {
    setActiveId(fileId)
    setSearch(globalSearch)
    setShowSearchAll(false)
  }, [globalSearch])

  const handleValidateSchema = useCallback(() => {
    if (!activeFile) return
    try {
      const data = JSON.parse(activeFile.content)
      setSchemaResult(validateWithSchema(data, schemaText))
    } catch (e) {
      setSchemaResult({ valid: false, errors: [{ path: '/', message: (e as Error).message }] })
    }
  }, [activeFile, schemaText])

  const handleExportYaml = async () => {
    if (!activeFile) return
    const api = window.electronAPI
    if (!api) { notify('File API not available'); return }
    try {
      const yamlText = toYaml(activeFile.content)
      const defaultName = activeFile.name.replace(/\.[^./\\]+$/, '') + '.yaml'
      const result = await api.saveFile(yamlText, null, defaultName)
      if (result) notify(`📤 Exported ${result.path.split(/[/\\]/).pop()}`)
    } catch (e) {
      notify(`Export error: ${(e as Error).message}`)
    }
  }

  const handleExportCsv = async () => {
    if (!activeFile) return
    const api = window.electronAPI
    if (!api) { notify('File API not available'); return }
    try {
      const csvText = toCsv(activeFile.content)
      const defaultName = activeFile.name.replace(/\.[^./\\]+$/, '') + '.csv'
      const result = await api.saveFile(csvText, null, defaultName)
      if (result) notify(`📤 Exported ${result.path.split(/[/\\]/).pop()}`)
    } catch (e) {
      notify(`Export error: ${(e as Error).message}`)
    }
  }

  const apply = useCallback(
    (fn: (current: string) => string, msg: string) => {
      if (!activeFile) return
      try {
        const result = fn(activeFile.content)
        updateFile(activeFile.id, { content: result })
        setTreeKey(k => k + 1)
        notify(msg)
      } catch (e) {
        notify(`Error: ${(e as Error).message}`)
      }
    },
    [activeFile, updateFile, notify]
  )

  // Listen for files opened via double-click / file association / "Open With"
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onFileOpen) return
    return api.onFileOpen((fileContent, filePath) => {
      const name = filePath.split(/[/\\]/).pop() ?? filePath
      addOrFocusFiles([{ path: filePath, name, content: fileContent }])
      pushRecent(filePath, name)
      notify(`📂 ${name}`)
    })
  }, [addOrFocusFiles, pushRecent, notify])

  // Drag & drop files from Finder anywhere onto the window
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.getPathForFile) return
    let dragDepth = 0

    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth += 1
      setIsDraggingOver(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) setIsDraggingOver(false)
    }
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth = 0
      setIsDraggingOver(false)
      const droppedFiles = Array.from(e.dataTransfer?.files ?? [])
      const paths = droppedFiles
        .map(f => api.getPathForFile(f))
        .filter(p => DROPPABLE_EXTS.test(p))
      if (paths.length === 0) {
        if (droppedFiles.length > 0) notify('⚠ Only .json, .jsonl, .ndjson, .log, .txt files are supported')
        return
      }
      const results = await Promise.all(paths.map(p => api.readFile(p)))
      const opened = results.filter((r): r is NonNullable<typeof r> => r !== null)
      if (opened.length === 0) return
      addOrFocusFiles(opened.map(f => ({ path: f.path, name: f.name, content: f.content })))
      opened.forEach(f => pushRecent(f.path, f.name))
      notify(opened.length === 1 ? `📂 ${opened[0].name}` : `📂 Opened ${opened.length} files`)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addOrFocusFiles, pushRecent, notify])

  const handleFormat = () => apply(c => format(c, indentSize), '✨ Formatted!')
  const handleMinify = () => apply(c => minify(c), '⬛ Minified!')
  const handleRepair = () => apply(c => repair(c), '🔧 Repaired!')
  const handleSortKeys = () => apply(c => sortKeys(c, indentSize), '🔤 Keys sorted!')
  const handleEscape = () => apply(c => escapeJson(c), '🔒 Escaped!')
  const handleUnescape = () => apply(c => unescapeJson(c), '🔓 Unescaped!')
  const handleClear = () => {
    if (!activeFile) return
    updateFile(activeFile.id, { content: '' })
    setTreeKey(k => k + 1)
  }
  const handleCopyAll = async () => {
    if (!activeFile) return
    await navigator.clipboard.writeText(activeFile.content)
    notify('📋 Copied to clipboard!')
  }

  const handleAiRepair = async () => {
    if (!activeFile) return
    if (!apiKey.trim()) { setShowApiSettings(true); return }
    const targetId = activeFile.id
    setAiLoading(true)
    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: `Fix this malformed JSON. Return ONLY valid JSON, no explanation, no markdown fences:\n\n${activeFile.content}`
        }]
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const match = raw.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
      const repaired = (match ? match[1] : raw).trim()
      updateFile(targetId, { content: repaired })
      setTreeKey(k => k + 1)
      notify('🤖 AI repaired!')
    } catch (e) {
      notify(`AI error: ${(e as Error).message}`)
    } finally {
      setAiLoading(false)
    }
  }

  const handleOpenFile = async () => {
    const api = window.electronAPI
    if (!api) { notify('File API not available'); return }
    const opened = await api.openFile()
    if (!opened || opened.length === 0) return
    addOrFocusFiles(opened.map(f => ({ path: f.path, name: f.name, content: f.content })))
    opened.forEach(f => pushRecent(f.path, f.name))
    notify(opened.length === 1 ? `📂 ${opened[0].name}` : `📂 Opened ${opened.length} files`)
  }

  const handleOpenRecent = useCallback(async (path: string) => {
    const existing = files.find(f => f.filePath === path)
    if (existing) { setActiveId(existing.id); return }
    const api = window.electronAPI
    if (!api) { notify('File API not available'); return }
    const result = await api.readFile(path)
    if (!result) {
      notify('⚠ File not found — it may have been moved or deleted')
      setRecentFiles(prev => {
        const next = prev.filter(r => r.path !== path)
        saveRecents(next)
        return next
      })
      return
    }
    addOrFocusFiles([{ path: result.path, name: result.name, content: result.content }])
    pushRecent(result.path, result.name)
  }, [files, addOrFocusFiles, pushRecent, notify])

  const handleSaveFile = async () => {
    if (!activeFile) return
    const api = window.electronAPI
    if (!api) { notify('File API not available'); return }
    const result = await api.saveFile(activeFile.content, activeFile.filePath, activeFile.name)
    if (!result) return
    const name = result.path.split(/[/\\]/).pop() ?? activeFile.name
    updateFile(activeFile.id, {
      filePath: result.path,
      name,
      savedContent: activeFile.content
    })
    pushRecent(result.path, name)
    notify('💾 Saved!')
  }

  const handleNewTab = useCallback(() => {
    const tab = makeTab(nextUntitledName(), '')
    setFiles(prev => [...prev, tab])
    setActiveId(tab.id)
  }, [])

  const handleCloseTab = useCallback((id: string) => {
    setFiles(prev => {
      const idx = prev.findIndex(f => f.id === id)
      if (idx === -1) return prev
      const file = prev[idx]
      if (file.content !== file.savedContent) {
        const ok = window.confirm(`"${file.name}" has unsaved changes. Close without saving?`)
        if (!ok) return prev
      }
      const next = prev.filter(f => f.id !== id)
      // No tabs left: fall back to the welcome screen instead of forcing a blank one.
      if (id === activeId && next.length > 0) {
        const neighborIdx = Math.min(idx, next.length - 1)
        focusIdRef.current = next[neighborIdx].id
      }
      return next
    })
  }, [activeId])

  const handleBuilderLoad = useCallback((json: string) => {
    const tab = makeTab('crm-script.json', json)
    setFiles(prev => [...prev, tab])
    setActiveId(tab.id)
    setActiveTab('editor')
    notify('🔨 Script loaded in editor!')
  }, [notify])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault(); handleOpenFile()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault(); handleNewTab()
      }
      if (!activeFile) return
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault(); handleFormat()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); handleSaveFile()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault(); handleCloseTab(activeFile.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Resize drag
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setLeftPct(Math.max(20, Math.min(80, pct)))
    }
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const linesErrors = linesResult?.errors.length ?? 0
  const linesCount = linesResult?.results.length ?? 0

  return (
    <div className="app">

      {/* ── Mode tab bar ── */}
      <div className="tab-bar">
        <div className="app-brand">
          <span className="app-brand__logo">{'{ }'}</span>
          <span className="app-brand__name">Jtools</span>
        </div>
        <button
          className={`tab-btn${activeTab === 'editor' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          ✏ Editor
        </button>
        <button
          className={`tab-btn${activeTab === 'builder' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          🔨 CRM Builder
        </button>
        <div className="tab-bar__spacer" />
        <Tip label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </Tip>
      </div>

      {/* ── Editor tab ── */}
      {activeTab === 'editor' && !activeFile && (
        <Welcome
          onOpenFile={handleOpenFile}
          onNewFile={handleNewTab}
          recentFiles={recentFiles}
          onOpenRecent={handleOpenRecent}
          isMac={isMac}
        />
      )}

      {activeTab === 'editor' && activeFile && (
        <>
          {/* ── Open-file tabs ── */}
          <div className="file-tab-bar">
            <div className="file-tab-bar__scroll">
              {files.map(f => {
                const dirty = f.content !== f.savedContent
                return (
                  <div
                    key={f.id}
                    className={`file-tab${f.id === activeFile.id ? ' file-tab--active' : ''}${f.id === draggedTabId ? ' file-tab--dragging' : ''}${f.id === dragOverTabId && f.id !== draggedTabId ? ' file-tab--drag-over' : ''}`}
                    onClick={() => setActiveId(f.id)}
                    title={f.filePath ?? f.name}
                    draggable
                    onDragStart={e => {
                      setDraggedTabId(f.id)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('application/x-jtools-tab', f.id)
                    }}
                    onDragOver={e => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      if (draggedTabId && draggedTabId !== f.id) setDragOverTabId(f.id)
                    }}
                    onDragLeave={() => setDragOverTabId(prev => (prev === f.id ? null : prev))}
                    onDrop={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (draggedTabId) reorderTabs(draggedTabId, f.id)
                      setDraggedTabId(null)
                      setDragOverTabId(null)
                    }}
                    onDragEnd={() => { setDraggedTabId(null); setDragOverTabId(null) }}
                  >
                    <span className="file-tab__icon">🗎</span>
                    <span className="file-tab__name">{f.name}</span>
                    {dirty && <span className="file-tab__dot" title="Unsaved changes" />}
                    <button
                      className="file-tab__close"
                      onClick={e => { e.stopPropagation(); handleCloseTab(f.id) }}
                      title="Close (Ctrl/Cmd+W)"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
            <Tip label="New file" shortcut={isMac ? '⌘T' : 'Ctrl+T'}>
              <button className="file-tab-new" onClick={handleNewTab} aria-label="New file">
                +
              </button>
            </Tip>
          </div>

          <Toolbar
            onFormat={handleFormat}
            onMinify={handleMinify}
            onRepair={handleRepair}
            onSortKeys={handleSortKeys}
            onEscape={handleEscape}
            onUnescape={handleUnescape}
            onCopyAll={handleCopyAll}
            onOpenFile={handleOpenFile}
            onSaveFile={handleSaveFile}
            onClear={handleClear}
            isJsonLines={activeFile.isJsonLines}
            onToggleJsonLines={() => {
              updateFile(activeFile.id, { isJsonLines: !activeFile.isJsonLines })
              setTreeKey(k => k + 1)
            }}
            indentSize={indentSize}
            onIndentSizeChange={setIndentSize}
            onAiRepair={handleAiRepair}
            onOpenApiSettings={() => { setApiKeyDraft(apiKey); setShowApiSettings(true) }}
            aiLoading={aiLoading}
            hasApiKey={!!apiKey.trim()}
            onCompare={handleOpenCompare}
            canCompare={files.length >= 2}
            onSearchAll={() => setShowSearchAll(true)}
            onValidateSchema={() => { setSchemaResult(null); setShowSchema(true) }}
            onExportYaml={handleExportYaml}
            onExportCsv={handleExportCsv}
            autoSave={autoSave}
            onToggleAutoSave={() => setAutoSave(v => !v)}
          />

          <div className="main" ref={containerRef}>
            {/* Editor panel */}
            <div className="panel panel--editor" style={{ width: `${leftPct}%` }}>
              <Editor
                path={activeFile.id}
                value={activeFile.content}
                onChange={v => updateFile(activeFile.id, { content: v ?? '' })}
                language="json"
                theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: indentSize,
                  lineNumbers: 'on',
                  renderWhitespace: 'none',
                  folding: true,
                  bracketPairColorization: { enabled: true }
                }}
              />
            </div>

            {/* Resize handle */}
            <div className="resize-handle" onMouseDown={onResizeStart} title="Drag to resize" />

            {/* Tree panel */}
            <div className="panel panel--tree" style={{ width: `${100 - leftPct}%` }}>
              <div className="tree-header">
                <input
                  className="tree-search-input"
                  type="search"
                  placeholder="🔍 Search keys & values…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {activeFile.isJsonLines && linesResult && linesResult.results.length > 0 && (
                  <div className="jsonlines-nav">
                    {linesResult.results.map((_, i) => (
                      <button
                        key={i}
                        className={`jl-btn${i === activeFile.selectedLine ? ' jl-btn--active' : ''}`}
                        onClick={() => {
                          updateFile(activeFile.id, { selectedLine: i })
                          setParsedData(linesResult.results[i])
                        }}
                      >
                        #{i + 1}
                        {linesResult.errors.some(e => e.line === i + 1) && ' ⚠'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && !activeFile.isJsonLines && (
                <div className="parse-error">
                  <span>⚠ {error}</span>
                </div>
              )}

              {parsedData !== null ? (
                <JsonTree key={`${activeFile.id}-${treeKey}`} data={parsedData} search={search} onNotify={notify} />
              ) : (
                <div className="tree-placeholder">
                  <div className="tree-placeholder__icon">{error ? '⚠' : '🗂'}</div>
                  <div>{error ? 'Fix the JSON error to see the tree' : 'Start typing or open a file…'}</div>
                </div>
              )}
            </div>
          </div>

          <StatusBar
            content={activeFile.content}
            parsedData={parsedData}
            error={error}
            isJsonLines={activeFile.isJsonLines}
            jsonLinesCount={linesCount}
            linesErrors={linesErrors}
          />
        </>
      )}

      {/* ── CRM Builder tab ── */}
      {activeTab === 'builder' && (
        <CrmBuilder onLoadInEditor={handleBuilderLoad} />
      )}

      {/* ── Toast ── */}
      {notification && (
        <div className="toast" key={notification}>
          {notification}
        </div>
      )}

      {/* ── API key settings modal ── */}
      {showApiSettings && (
        <div className="api-modal-overlay" onClick={() => setShowApiSettings(false)}>
          <div className="api-modal" onClick={e => e.stopPropagation()}>
            <h3>🤖 Anthropic API Key</h3>
            <p>Required for AI JSON repair. Key is stored locally and never sent anywhere except the Anthropic API.</p>
            <input
              type="password"
              placeholder="sk-ant-..."
              value={apiKeyDraft}
              onChange={e => setApiKeyDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  localStorage.setItem('anthropic_api_key', apiKeyDraft)
                  setApiKey(apiKeyDraft)
                  setShowApiSettings(false)
                }
              }}
              autoFocus
            />
            <p style={{ fontSize: 11 }}>
              Get a key at <span style={{ color: 'var(--accent)' }}>console.anthropic.com</span> — Haiku model (~$0.001/repair).
            </p>
            <div className="api-modal__btns">
              {apiKey && (
                <button onClick={() => {
                  localStorage.removeItem('anthropic_api_key')
                  setApiKey('')
                  setApiKeyDraft('')
                  setShowApiSettings(false)
                }}>Clear</button>
              )}
              <button onClick={() => setShowApiSettings(false)}>Cancel</button>
              <button className="btn-save" onClick={() => {
                localStorage.setItem('anthropic_api_key', apiKeyDraft)
                setApiKey(apiKeyDraft)
                setShowApiSettings(false)
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Compare files modal ── */}
      {showCompare && (() => {
        const leftFile = files.find(f => f.id === compareLeftId)
        const rightFile = files.find(f => f.id === compareRightId)
        return (
          <div className="compare-modal-overlay" onClick={() => setShowCompare(false)}>
            <div className="compare-modal" onClick={e => e.stopPropagation()}>
              <div className="compare-modal__header">
                <h3>🔀 Compare Files</h3>
                <button className="compare-modal__close" onClick={() => setShowCompare(false)}>×</button>
              </div>
              <div className="compare-modal__pickers">
                <select
                  className="compare-modal__select"
                  value={compareLeftId}
                  onChange={e => setCompareLeftId(e.target.value)}
                >
                  {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <span className="compare-modal__vs">vs</span>
                <select
                  className="compare-modal__select"
                  value={compareRightId}
                  onChange={e => setCompareRightId(e.target.value)}
                >
                  {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div className="compare-modal__diff">
                <DiffEditor
                  original={leftFile?.content ?? ''}
                  modified={rightFile?.content ?? ''}
                  language="json"
                  theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    fontSize: 12.5,
                    wordWrap: 'on',
                    scrollBeyondLastLine: false
                  }}
                />
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Search all files modal ── */}
      {showSearchAll && (
        <div className="search-all-overlay" onClick={() => setShowSearchAll(false)}>
          <div className="search-all-modal" onClick={e => e.stopPropagation()}>
            <div className="search-all__header">
              <input
                className="search-all__input"
                type="search"
                autoFocus
                placeholder="🔎 Search across all open files…"
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
              />
              <button className="compare-modal__close" onClick={() => setShowSearchAll(false)}>×</button>
            </div>
            <div className="search-all__results">
              {globalSearch.trim() === '' ? (
                <p className="search-all__hint">Type to search every open tab</p>
              ) : searchResults.length === 0 ? (
                <p className="search-all__hint">No matches in any open file</p>
              ) : (
                searchResults.map(({ file, matches }) => (
                  <div key={file.id} className="search-all__group">
                    <button className="search-all__file" onClick={() => handleJumpToMatch(file.id)}>
                      🗎 {file.name} <span className="search-all__count">{matches.length}</span>
                    </button>
                    {matches.slice(0, 5).map(m => (
                      <div key={m.line} className="search-all__line" onClick={() => handleJumpToMatch(file.id)}>
                        <span className="search-all__line-no">{m.line}</span>
                        <span className="search-all__line-text">{m.text.slice(0, 160)}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── JSON Schema validation modal ── */}
      {showSchema && (
        <div className="schema-modal-overlay" onClick={() => setShowSchema(false)}>
          <div className="schema-modal" onClick={e => e.stopPropagation()}>
            <div className="compare-modal__header">
              <h3>🧪 Validate against JSON Schema</h3>
              <button className="compare-modal__close" onClick={() => setShowSchema(false)}>×</button>
            </div>
            <div className="schema-modal__body">
              <textarea
                className="schema-modal__textarea"
                placeholder="Paste a JSON Schema here…"
                value={schemaText}
                onChange={e => setSchemaText(e.target.value)}
                spellCheck={false}
              />
              <div className="schema-modal__actions">
                <button className="cb-action-btn cb-action-btn--primary" onClick={handleValidateSchema}>
                  Validate active file
                </button>
              </div>
              {schemaResult && (
                <div className={`schema-result${schemaResult.valid ? ' schema-result--ok' : ' schema-result--error'}`}>
                  {schemaResult.valid ? (
                    <p>✓ Valid — matches the schema</p>
                  ) : (
                    <ul className="schema-result__list">
                      {schemaResult.errors.map((e, i) => (
                        <li key={i}>
                          <code>{e.path}</code> {e.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Drag & drop overlay ── */}
      {isDraggingOver && (
        <div className="drop-overlay">
          <div className="drop-overlay__card">📂 Drop to open</div>
        </div>
      )}
    </div>
  )
}
