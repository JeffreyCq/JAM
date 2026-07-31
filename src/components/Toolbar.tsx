import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Tip } from './Tip'

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
  onCompare: () => void
  canCompare: boolean
  onSearchAll: () => void
  onValidateSchema: () => void
  onExportYaml: () => void
  onExportCsv: () => void
  autoSave: boolean
  onToggleAutoSave: () => void
}

interface MenuItemDef {
  icon: string
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  variant?: 'danger' | 'ai'
}

// Dropdown menu button — the list is rendered through a portal into <body>,
// positioned from the trigger's real screen coordinates. The toolbar scrolls
// horizontally (overflow-x: auto), which forces overflow-y to auto too (a CSS
// quirk: one axis can't stay visible once the other isn't) — anything
// absolutely positioned inside it would get silently clipped instead of
// floating above the bar.
function Menu({
  id,
  label,
  icon,
  items,
  openMenu,
  setOpenMenu
}: {
  id: string
  label: string
  icon: string
  items: MenuItemDef[]
  openMenu: string | null
  setOpenMenu: (id: string | null) => void
}) {
  const open = openMenu === id
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.bottom + 6 })
    }
    setOpenMenu(open ? null : id)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpenMenu(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, setOpenMenu])

  return (
    <>
      <button
        ref={btnRef}
        className={`tb-menu__trigger${open ? ' tb-menu__trigger--open' : ''}`}
        onClick={toggle}
      >
        <span>{icon}</span> {label} <span className="tb-menu__caret">▾</span>
      </button>
      {open && createPortal(
        <div className="tb-menu__list" ref={listRef} style={{ left: pos.x, top: pos.y }}>
          {items.map((item, i) => (
            <button
              key={i}
              className={`tb-menu__item${item.variant ? ` tb-menu__item--${item.variant}` : ''}`}
              disabled={item.disabled}
              onClick={() => { setOpenMenu(null); item.onClick() }}
            >
              <span className="tb-menu__item-icon">{item.icon}</span>
              <span className="tb-menu__item-label">{item.label}</span>
              {item.shortcut && <span className="tb-menu__item-shortcut">{item.shortcut}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

function IconBarButton({ item }: { item: MenuItemDef }) {
  return (
    <Tip label={item.label} shortcut={item.shortcut}>
      <button
        className={`tb-icon-btn${item.variant ? ` tb-icon-btn--${item.variant}` : ''}`}
        onClick={item.onClick}
        disabled={item.disabled}
        aria-label={item.label}
      >
        {item.icon}
      </button>
    </Tip>
  )
}

function ToggleChip({
  onClick,
  label,
  hint,
  active
}: {
  onClick: () => void
  label: string
  hint: string
  active?: boolean
}) {
  return (
    <Tip label={hint}>
      <button
        className={`tb-btn${active ? ' tb-btn--active' : ''}`}
        onClick={onClick}
      >
        {label}
      </button>
    </Tip>
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
  onCompare,
  canCompare,
  onSearchAll,
  onValidateSchema,
  onExportYaml,
  onExportCsv,
  autoSave,
  onToggleAutoSave,
}: ToolbarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showIconBar, setShowIconBar] = useState(() => localStorage.getItem('show_icon_bar') === 'true')

  useEffect(() => {
    localStorage.setItem('show_icon_bar', String(showIconBar))
  }, [showIconBar])

  const fileItems: MenuItemDef[] = [
    { icon: '📂', label: 'Open File…', shortcut: 'Ctrl+O', onClick: onOpenFile },
    { icon: '💾', label: 'Save', shortcut: 'Ctrl+S', onClick: onSaveFile },
    { icon: '📋', label: 'Copy to Clipboard', onClick: onCopyAll },
    { icon: '🗑', label: 'Clear Editor', onClick: onClear, variant: 'danger' },
  ]

  const transformItems: MenuItemDef[] = [
    { icon: '✨', label: 'Format', shortcut: 'Ctrl+⇧+F', onClick: onFormat },
    { icon: '⬛', label: 'Minify to one line', onClick: onMinify },
    { icon: '🔧', label: 'Repair (offline, rule-based)', onClick: onRepair },
    {
      icon: aiLoading ? '⏳' : '🤖',
      label: aiLoading ? 'AI Repair — running…' : hasApiKey ? 'AI Repair (Claude)' : 'AI Repair — set API key first',
      onClick: onAiRepair,
      disabled: aiLoading,
      variant: 'ai'
    },
    { icon: '🔤', label: 'Sort Keys Alphabetically', onClick: onSortKeys },
    { icon: '🔒', label: 'Escape to Embeddable String', onClick: onEscape },
    { icon: '🔓', label: 'Unescape Embedded String', onClick: onUnescape },
    { icon: '⚙', label: 'Configure AI API Key…', onClick: onOpenApiSettings },
  ]

  const toolsItems: MenuItemDef[] = [
    { icon: '🔀', label: 'Compare Two Files', onClick: onCompare, disabled: !canCompare },
    { icon: '🔎', label: 'Search All Open Files', onClick: onSearchAll },
    { icon: '🧪', label: 'Validate JSON Schema', onClick: onValidateSchema },
    { icon: '📤', label: 'Export as YAML', onClick: onExportYaml },
    { icon: '📤', label: 'Export as CSV', onClick: onExportCsv },
  ]

  return (
    <>
      <div className="toolbar">
        <div className="tb-group">
          <Menu id="file" label="File" icon="📁" items={fileItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          <Menu id="transform" label="Transform" icon="🪄" items={transformItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          <Menu id="tools" label="Tools" icon="🧰" items={toolsItems} openMenu={openMenu} setOpenMenu={setOpenMenu} />
        </div>

        <Divider />

        <div className="tb-group">
          <ToggleChip
            onClick={() => setShowIconBar(v => !v)}
            active={showIconBar}
            label="📌 Icon Bar"
            hint={showIconBar ? 'Hide the quick-access icon toolbar' : 'Show every tool as icons in a bar below — no menus to open'}
          />
        </div>

        <Divider />

        <div className="tb-group">
          <ToggleChip
            onClick={onToggleJsonLines}
            active={isJsonLines}
            label="📋 JSON Lines"
            hint="Toggle JSON Lines / NDJSON mode"
          />
          <ToggleChip
            onClick={onToggleAutoSave}
            active={autoSave}
            label="💾⚡ Auto-save"
            hint={autoSave ? 'Auto-save is on — saved files write to disk as you type' : 'Auto-save files that already have a path on disk'}
          />
        </div>

        <Divider />

        {/* Indent group */}
        <div className="tb-group tb-group--indent">
          <span className="tb-label">Indent:</span>
          {[2, 4].map(n => (
            <Tip key={n} label={`Indent with ${n} spaces`}>
              <button
                className={`tb-indent-btn${indentSize === n ? ' tb-indent-btn--active' : ''}`}
                onClick={() => onIndentSizeChange(n)}
                aria-label={`${n} spaces`}
              >
                {n}
              </button>
            </Tip>
          ))}
          <Tip label="Indent with tabs">
            <button
              className={`tb-indent-btn${indentSize === 1 ? ' tb-indent-btn--active' : ''}`}
              onClick={() => onIndentSizeChange(1)}
              aria-label="Tabs"
            >
              T
            </button>
          </Tip>
        </div>
      </div>

      {showIconBar && (
        <div className="toolbar-icons">
          {fileItems.map((item, i) => <IconBarButton key={`file-${i}`} item={item} />)}
          <Divider />
          {transformItems.map((item, i) => <IconBarButton key={`transform-${i}`} item={item} />)}
          <Divider />
          {toolsItems.map((item, i) => <IconBarButton key={`tools-${i}`} item={item} />)}
        </div>
      )}
    </>
  )
}
