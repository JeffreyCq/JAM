import React, { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import loader from '@monaco-editor/loader'
import * as monaco from 'monaco-editor'
import { Toolbar } from './components/Toolbar'
import { JsonTree } from './components/JsonTree'
import { StatusBar } from './components/StatusBar'
import { CrmBuilder } from './components/CrmBuilder'
import {
  format,
  minify,
  repair,
  sortKeys,
  escapeJson,
  unescapeJson,
  parseLines,
  type LinesResult
} from './utils/jsonUtils'

// Use bundled Monaco (no CDN)
loader.config({ monaco })

const SAMPLE = `{
  "app": "HomebuddyFormatter",
  "version": "1.0.0",
  "features": ["format", "minify", "repair", "sort", "escape", "tree view", "JSON Lines"],
  "config": {
    "indent": 2,
    "theme": "dark",
    "autoParse": true
  },
  "author": {
    "name": "Jeffrey",
    "active": true,
    "score": 9.9,
    "tags": null
  }
}`

export default function App() {
  const [activeTab, setActiveTab] = useState<'editor' | 'builder'>('editor')
  const [content, setContent] = useState(SAMPLE)
  const [parsedData, setParsedData] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [treeKey, setTreeKey] = useState(0)
  const [search, setSearch] = useState('')
  const [isJsonLines, setIsJsonLines] = useState(false)
  const [linesResult, setLinesResult] = useState<LinesResult | null>(null)
  const [selectedLine, setSelectedLine] = useState(0)
  const [indentSize, setIndentSize] = useState(2)
  const [notification, setNotification] = useState<string | null>(null)
  const [leftPct, setLeftPct] = useState(50)
  const dragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse JSON with 300ms debounce
  useEffect(() => {
    const t = setTimeout(() => {
      if (isJsonLines) {
        const res = parseLines(content)
        setLinesResult(res)
        const idx = Math.min(selectedLine, res.results.length - 1)
        setSelectedLine(Math.max(0, idx))
        setParsedData(res.results[Math.max(0, idx)] ?? null)
        setError(res.errors.length > 0 ? `${res.errors.length} line(s) with errors` : null)
      } else {
        try {
          const parsed = JSON.parse(content)
          setParsedData(parsed)
          setError(null)
        } catch (e) {
          setParsedData(null)
          setError((e as Error).message)
        }
      }
    }, 300)
    return () => clearTimeout(t)
  }, [content, isJsonLines, selectedLine])

  const notify = useCallback((msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 2000)
  }, [])

  const apply = useCallback(
    (fn: () => string, msg: string) => {
      try {
        const result = fn()
        setContent(result)
        setTreeKey(k => k + 1)
        notify(msg)
      } catch (e) {
        notify(`Error: ${(e as Error).message}`)
      }
    },
    [notify]
  )

  // Listen for files opened via double-click / file association
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.onFileOpen) return
    return api.onFileOpen((fileContent, filePath) => {
      setContent(fileContent)
      setTreeKey(k => k + 1)
      const name = filePath.split(/[/\\]/).pop() ?? filePath
      notify(`📂 ${name}`)
    })
  }, [notify])

  const handleFormat = () => apply(() => format(content, indentSize), '✨ Formatted!')
  const handleMinify = () => apply(() => minify(content), '⬛ Minified!')
  const handleRepair = () => apply(() => repair(content), '🔧 Repaired!')
  const handleSortKeys = () => apply(() => sortKeys(content, indentSize), '🔤 Keys sorted!')
  const handleEscape = () => apply(() => escapeJson(content), '🔒 Escaped!')
  const handleUnescape = () => apply(() => unescapeJson(content), '🔓 Unescaped!')
  const handleClear = () => { setContent(''); setTreeKey(k => k + 1) }
  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(content)
    notify('📋 Copied to clipboard!')
  }

  const handleOpenFile = async () => {
    const api = window.electronAPI
    if (!api) { notify('File API not available'); return }
    const text = await api.openFile()
    if (text !== null) {
      setContent(text)
      setTreeKey(k => k + 1)
      notify('📂 File loaded!')
    }
  }

  const handleSaveFile = async () => {
    const api = window.electronAPI
    if (!api) { notify('File API not available'); return }
    const ok = await api.saveFile(content)
    if (ok) notify('💾 Saved!')
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault(); handleFormat()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault(); handleOpenFile()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); handleSaveFile()
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

  const handleBuilderLoad = useCallback((json: string) => {
    setContent(json)
    setTreeKey(k => k + 1)
    setActiveTab('editor')
    notify('🔨 Script loaded in editor!')
  }, [notify])

  return (
    <div className="app">

      {/* ── Tab bar ── */}
      <div className="tab-bar">
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
      </div>

      {/* ── Editor tab ── */}
      {activeTab === 'editor' && (
        <>
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
            isJsonLines={isJsonLines}
            onToggleJsonLines={() => { setIsJsonLines(v => !v); setTreeKey(k => k + 1) }}
            indentSize={indentSize}
            onIndentSizeChange={setIndentSize}
          />

          <div className="main" ref={containerRef}>
            {/* Editor panel */}
            <div className="panel panel--editor" style={{ width: `${leftPct}%` }}>
              <Editor
                value={content}
                onChange={v => setContent(v ?? '')}
                language="json"
                theme="vs-dark"
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
                {isJsonLines && linesResult && linesResult.results.length > 0 && (
                  <div className="jsonlines-nav">
                    {linesResult.results.map((_, i) => (
                      <button
                        key={i}
                        className={`jl-btn${i === selectedLine ? ' jl-btn--active' : ''}`}
                        onClick={() => { setSelectedLine(i); setParsedData(linesResult.results[i]) }}
                      >
                        #{i + 1}
                        {linesResult.errors.some(e => e.line === i + 1) && ' ⚠'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && !isJsonLines && (
                <div className="parse-error">
                  <span>⚠ {error}</span>
                </div>
              )}

              {parsedData !== null ? (
                <JsonTree key={treeKey} data={parsedData} search={search} onNotify={notify} />
              ) : (
                <div className="tree-placeholder">
                  {error ? 'Fix the JSON error to see the tree' : 'Start typing or open a file…'}
                </div>
              )}
            </div>
          </div>

          <StatusBar
            content={content}
            parsedData={parsedData}
            error={error}
            isJsonLines={isJsonLines}
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
    </div>
  )
}
