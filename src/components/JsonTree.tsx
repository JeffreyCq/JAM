import React, { useState, useCallback, useMemo, memo } from 'react'

function getType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function childPath(parentPath: string, key: string | number): string {
  if (parentPath === '') return typeof key === 'number' ? `[${key}]` : key
  if (typeof key === 'number') return `${parentPath}[${key}]`
  return `${parentPath}.${key}`
}

function jsonPathOf(path: string): string {
  // Strip embedded-JSON marker (~) from display path
  return '$.' + path.replace(/~+/g, '')
}

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
}

// Detect if a string value looks like JSON object/array and try parsing it
function tryParseEmbeddedJson(str: string): unknown | null {
  const t = str.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return null
  try { return JSON.parse(str) } catch { return null }
}

// ─── Value renderer ───────────────────────────────────────────────────────────

function ValueDisplay({ value, truncate = true }: { value: unknown; truncate?: boolean }) {
  const type = getType(value)
  if (type === 'string') {
    const str = value as string
    if (truncate && str.length > 120)
      return <span className="tree-string" title={str}>"{str.slice(0, 120)}<span className="tree-ellipsis">…</span>"</span>
    return <span className="tree-string">"{str}"</span>
  }
  if (type === 'number') return <span className="tree-number">{String(value)}</span>
  if (type === 'boolean') return <span className="tree-boolean">{String(value)}</span>
  if (type === 'null') return <span className="tree-null">null</span>
  return null
}

// ─── Tree node ────────────────────────────────────────────────────────────────

interface NodeProps {
  nodeKey: string | number | null
  value: unknown
  path: string
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  // Paths of string nodes whose values are shown as embedded JSON trees
  jsonExpanded: Set<string>
  onJsonExpand: (path: string) => void
  search: string
  isLast: boolean
  onNotify: (msg: string) => void
  // True when this node is inside an embedded JSON subtree (for visual styling)
  isEmbedded?: boolean
}

const TreeNode = memo(function TreeNode(props: NodeProps) {
  const {
    nodeKey, value, path, depth,
    expanded, onToggle,
    jsonExpanded, onJsonExpand,
    search, isLast, onNotify, isEmbedded
  } = props

  const [hovered, setHovered] = useState(false)

  const type = getType(value)
  const isExpandable = type === 'object' || type === 'array'
  const isOpen = expanded.has(path)

  const entries = useMemo<[string | number, unknown][]>(() => {
    if (!isExpandable) return []
    if (Array.isArray(value)) return (value as unknown[]).map((v, i) => [i, v])
    return Object.entries(value as Record<string, unknown>)
  }, [value, isExpandable])

  const count = entries.length
  const bracket = type === 'array' ? ['[', ']'] : ['{', '}']

  // For string nodes: detect embedded JSON
  const embeddedJson = useMemo(() => {
    if (type !== 'string') return null
    return tryParseEmbeddedJson(value as string)
  }, [type, value])

  const isJsonOpen = jsonExpanded.has(path)

  // Search match
  const matched = useMemo(() => {
    if (!search) return false
    const s = search.toLowerCase()
    const keyMatch = nodeKey !== null && String(nodeKey).toLowerCase().includes(s)
    const valMatch = !isExpandable && String(value).toLowerCase().includes(s)
    return keyMatch || valMatch
  }, [search, nodeKey, value, isExpandable])

  const handleCopyPath = useCallback(async () => {
    await copy(jsonPathOf(path))
    onNotify(`Copied: ${jsonPathOf(path)}`)
  }, [path, onNotify])

  const handleCopyValue = useCallback(async () => {
    await copy(JSON.stringify(value, null, 2))
    onNotify('Value copied!')
  }, [value, onNotify])

  const handleCopyFormatted = useCallback(async () => {
    if (embeddedJson !== null) {
      await copy(JSON.stringify(embeddedJson, null, 2))
      onNotify('Formatted body copied!')
    }
  }, [embeddedJson, onNotify])

  // Shared child props
  const childProps = {
    expanded, onToggle, jsonExpanded, onJsonExpand,
    search, onNotify
  }

  return (
    <div className={`tn${isEmbedded ? ' tn--embedded-root' : ''}`}>
      <div
        className={`tn-row${matched ? ' tn-row--match' : ''}`}
        style={{ paddingLeft: depth * 16 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Toggle arrow */}
        {isExpandable ? (
          <button className="tn-toggle" onClick={() => onToggle(path)}>
            {isOpen ? '▾' : '▸'}
          </button>
        ) : type === 'string' && embeddedJson !== null ? (
          // String with embedded JSON — show expand/collapse arrow
          <button
            className={`tn-toggle tn-toggle--json${isJsonOpen ? ' tn-toggle--json-open' : ''}`}
            onClick={() => onJsonExpand(path)}
            title={isJsonOpen ? 'Collapse embedded JSON' : 'Expand embedded JSON as tree'}
          >
            {isJsonOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tn-toggle tn-toggle--leaf" />
        )}

        {/* Key */}
        {nodeKey !== null && (
          <span className={`tn-key${matched ? ' tn-key--match' : ''}`}>
            {typeof nodeKey === 'number'
              ? <span className="tn-index">{nodeKey}</span>
              : <span>"{nodeKey}"</span>
            }
            <span className="tn-colon">: </span>
          </span>
        )}

        {/* Value / bracket */}
        {isExpandable ? (
          isOpen ? (
            <span className="tn-bracket">{bracket[0]}</span>
          ) : (
            <span className="tn-collapsed" onClick={() => onToggle(path)} title="Click to expand">
              <span className="tn-bracket">{bracket[0]}</span>
              <span className="tn-count">{count}</span>
              <span className="tn-bracket">{bracket[1]}</span>
              {!isLast && <span className="tn-comma">,</span>}
            </span>
          )
        ) : type === 'string' && embeddedJson !== null ? (
          // String with embedded JSON
          isJsonOpen ? (
            // Show badge instead of raw string when expanded
            <span className="tn-json-badge">{Array.isArray(embeddedJson) ? '[ JSON ]' : '{ JSON }'}</span>
          ) : (
            <>
              <ValueDisplay value={value} />
              <span className="tn-json-hint" title="Contains embedded JSON — click ▸ to expand">
                {Array.isArray(embeddedJson) ? '[…]' : '{…}'}
              </span>
              {!isLast && <span className="tn-comma">,</span>}
            </>
          )
        ) : (
          <>
            <ValueDisplay value={value} />
            {!isLast && <span className="tn-comma">,</span>}
          </>
        )}

        {/* Hover actions */}
        {hovered && (
          <div className="tn-actions">
            {embeddedJson !== null && !isJsonOpen && (
              <button className="tn-act tn-act--json" onClick={() => onJsonExpand(path)} title="Parse string as JSON tree">
                parse
              </button>
            )}
            {embeddedJson !== null && (
              <button className="tn-act" onClick={handleCopyFormatted} title="Copy formatted JSON">
                fmt
              </button>
            )}
            <button className="tn-act" onClick={handleCopyPath} title="Copy JSONPath">
              path
            </button>
            <button className="tn-act" onClick={handleCopyValue} title="Copy raw value">
              copy
            </button>
          </div>
        )}
      </div>

      {/* Embedded JSON subtree */}
      {type === 'string' && embeddedJson !== null && isJsonOpen && (
        <div className="tn-embedded">
          <TreeNode
            nodeKey={null}
            value={embeddedJson}
            path={path + '~'}
            depth={depth + 1}
            {...childProps}
            isLast={true}
            isEmbedded={true}
          />
          <div className="tn-row" style={{ paddingLeft: depth * 16 }}>
            <span className="tn-toggle tn-toggle--leaf" />
            {!isLast && <span className="tn-comma">,</span>}
          </div>
        </div>
      )}

      {/* Object / array children */}
      {isExpandable && isOpen && (
        <>
          {entries.map(([k, v], i) => (
            <TreeNode
              key={String(k)}
              nodeKey={k}
              value={v}
              path={childPath(path, k)}
              depth={depth + 1}
              {...childProps}
              isLast={i === entries.length - 1}
            />
          ))}
          <div className="tn-row" style={{ paddingLeft: depth * 16 }}>
            <span className="tn-toggle tn-toggle--leaf" />
            <span className="tn-bracket">{bracket[1]}</span>
            {!isLast && <span className="tn-comma">,</span>}
          </div>
        </>
      )}
    </div>
  )
})

// ─── Public component ─────────────────────────────────────────────────────────

interface JsonTreeProps {
  data: unknown
  search: string
  onNotify: (msg: string) => void
}

function defaultExpanded(data: unknown): Set<string> {
  const paths = new Set<string>([''])
  if (data !== null && typeof data === 'object') {
    const entries = Array.isArray(data)
      ? (data as unknown[]).map((v, i) => [i, v] as [number, unknown])
      : Object.entries(data as object)
    entries.forEach(([k]) => paths.add(childPath('', k as string | number)))
  }
  return paths
}

function collectAllPaths(value: unknown, path = '', maxDepth = 50, depth = 0): Set<string> {
  const paths = new Set<string>()
  if (depth >= maxDepth) return paths
  if (Array.isArray(value)) {
    paths.add(path)
    ;(value as unknown[]).forEach((v, i) =>
      collectAllPaths(v, childPath(path, i), maxDepth, depth + 1).forEach(p => paths.add(p))
    )
  } else if (value !== null && typeof value === 'object') {
    paths.add(path)
    Object.entries(value as object).forEach(([k, v]) =>
      collectAllPaths(v, childPath(path, k), maxDepth, depth + 1).forEach(p => paths.add(p))
    )
  }
  return paths
}

export function JsonTree({ data, search, onNotify }: JsonTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(data))
  const [jsonExpanded, setJsonExpanded] = useState<Set<string>>(new Set())

  const toggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  const toggleJson = useCallback((path: string) => {
    setJsonExpanded(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpanded(collectAllPaths(data))
  }, [data])

  const collapseAll = useCallback(() => {
    setExpanded(new Set(['']))
    setJsonExpanded(new Set())
  }, [])

  if (data === undefined || data === null) {
    return <div className="tree-empty">No valid JSON to display</div>
  }

  return (
    <div className="tree-wrap">
      <div className="tree-controls">
        <button className="tree-ctrl" onClick={expandAll}>Expand All</button>
        <button className="tree-ctrl" onClick={collapseAll}>Collapse All</button>
      </div>
      <div className="tree-scroll">
        <TreeNode
          nodeKey={null}
          value={data}
          path=""
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          jsonExpanded={jsonExpanded}
          onJsonExpand={toggleJson}
          search={search}
          isLast={true}
          onNotify={onNotify}
        />
      </div>
    </div>
  )
}
