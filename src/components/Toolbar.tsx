import React from 'react'

interface ToolbarProps {
  onFormat: () => void
  onMinify: () => void
  onRepair: () => void
  onSortKeys: () => void
  onEscape: () => void
  onUnescape: () => void
  onCopyAll: () => void
  onOpenFile: () => void
  onSaveFile: () => void
  onClear: () => void
  isJsonLines: boolean
  onToggleJsonLines: () => void
  indentSize: number
  onIndentSizeChange: (n: number) => void
  onAiRepair: () => void
  onOpenApiSettings: () => void
  aiLoading: boolean
  hasApiKey: boolean
}

function Btn({
  onClick,
  title,
  children,
  active,
  danger,
  ai,
  disabled
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  active?: boolean
  danger?: boolean
  ai?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`tb-btn${active ? ' tb-btn--active' : ''}${danger ? ' tb-btn--danger' : ''}${ai ? ' tb-btn--ai' : ''}`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="tb-divider" />
}

export function Toolbar({
  onFormat,
  onMinify,
  onRepair,
  onSortKeys,
  onEscape,
  onUnescape,
  onCopyAll,
  onOpenFile,
  onSaveFile,
  onClear,
  isJsonLines,
  onToggleJsonLines,
  indentSize,
  onIndentSizeChange,
  onAiRepair,
  onOpenApiSettings,
  aiLoading,
  hasApiKey,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      {/* File group */}
      <div className="tb-group">
        <Btn onClick={onOpenFile} title="Open file (Ctrl+O)">
          📂 Open
        </Btn>
        <Btn onClick={onSaveFile} title="Save file (Ctrl+S)">
          💾 Save
        </Btn>
        <Btn onClick={onCopyAll} title="Copy all to clipboard">
          📋 Copy
        </Btn>
        <Btn onClick={onClear} title="Clear editor" danger>
          🗑 Clear
        </Btn>
      </div>

      <Divider />

      {/* Transform group */}
      <div className="tb-group">
        <Btn onClick={onFormat} title="Pretty print JSON (Ctrl+Shift+F)">
          ✨ Format
        </Btn>
        <Btn onClick={onMinify} title="Minify to one line">
          ⬛ Minify
        </Btn>
        <Btn onClick={onRepair} title="Auto-fix JSON errors (rule-based, offline)">
          🔧 Repair
        </Btn>
        <Btn
          onClick={onAiRepair}
          title={hasApiKey ? 'Repair JSON using AI (Claude)' : 'Set Anthropic API key first (⚙)'}
          ai
          disabled={aiLoading}
        >
          {aiLoading ? '⏳ AI…' : '🤖 AI Repair'}
        </Btn>
        <button
          className="tb-btn"
          onClick={onOpenApiSettings}
          title="Configure Anthropic API key for AI repair"
          style={{ padding: '3px 7px' }}
        >
          ⚙
        </button>
        <Btn onClick={onSortKeys} title="Sort all object keys alphabetically">
          🔤 Sort Keys
        </Btn>
      </div>

      <Divider />

      {/* Escape group */}
      <div className="tb-group">
        <Btn onClick={onEscape} title="Escape JSON to embeddable string">
          🔒 Escape
        </Btn>
        <Btn onClick={onUnescape} title="Unescape embedded JSON string">
          🔓 Unescape
        </Btn>
      </div>

      <Divider />

      {/* Mode group */}
      <div className="tb-group">
        <Btn onClick={onToggleJsonLines} title="Toggle JSON Lines / NDJSON mode" active={isJsonLines}>
          📋 JSON Lines
        </Btn>
      </div>

      <Divider />

      {/* Indent group */}
      <div className="tb-group tb-group--indent">
        <span className="tb-label">Indent:</span>
        {[2, 4].map(n => (
          <button
            key={n}
            className={`tb-indent-btn${indentSize === n ? ' tb-indent-btn--active' : ''}`}
            onClick={() => onIndentSizeChange(n)}
            title={`${n} spaces`}
          >
            {n}
          </button>
        ))}
        <button
          className={`tb-indent-btn${indentSize === 1 ? ' tb-indent-btn--active' : ''}`}
          onClick={() => onIndentSizeChange(1)}
          title="Tabs (1)"
        >
          T
        </button>
      </div>
    </div>
  )
}
