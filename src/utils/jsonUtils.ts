import { jsonrepair } from 'jsonrepair'
import { dump as yamlDump } from 'js-yaml'
import Ajv from 'ajv'

export function format(json: string, indent = 2): string {
  return JSON.stringify(JSON.parse(json), null, indent)
}

export function minify(json: string): string {
  return JSON.stringify(JSON.parse(json))
}

export function repair(json: string): string {
  return jsonrepair(json)
}

export function sortKeys(json: string, indent = 2): string {
  return JSON.stringify(sortDeep(JSON.parse(json)), null, indent)
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as object).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export function escapeJson(raw: string): string {
  // Wraps the JSON string so it can be embedded inside another JSON string value
  return JSON.stringify(raw)
}

export function unescapeJson(str: string): string {
  const trimmed = str.trim()
  // If it's already a quoted JSON string, parse it; otherwise try adding quotes
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed) as string
  }
  return JSON.parse(`"${trimmed.replace(/"/g, '\\"')}"`) as string
}

export interface LinesResult {
  results: unknown[]
  errors: Array<{ line: number; message: string }>
}

export function parseLines(text: string): LinesResult {
  const lines = text.split('\n').filter(l => l.trim())
  const results: unknown[] = []
  const errors: Array<{ line: number; message: string }> = []
  lines.forEach((line, i) => {
    try {
      results.push(JSON.parse(line))
    } catch (e) {
      errors.push({ line: i + 1, message: (e as Error).message })
    }
  })
  return { results, errors }
}

export interface JsonStats {
  size: number
  keys: number
  maxDepth: number
  objects: number
  arrays: number
  strings: number
  numbers: number
  booleans: number
  nulls: number
}

export function getStats(data: unknown, raw: string): JsonStats {
  const stats: JsonStats = {
    size: new Blob([raw]).size,
    keys: 0,
    maxDepth: 0,
    objects: 0,
    arrays: 0,
    strings: 0,
    numbers: 0,
    booleans: 0,
    nulls: 0
  }

  function traverse(v: unknown, depth: number): void {
    if (depth > stats.maxDepth) stats.maxDepth = depth
    if (Array.isArray(v)) {
      stats.arrays++
      v.forEach(item => traverse(item, depth + 1))
    } else if (v !== null && typeof v === 'object') {
      stats.objects++
      const entries = Object.entries(v as object)
      stats.keys += entries.length
      entries.forEach(([, val]) => traverse(val, depth + 1))
    } else if (typeof v === 'string') stats.strings++
    else if (typeof v === 'number') stats.numbers++
    else if (typeof v === 'boolean') stats.booleans++
    else if (v === null) stats.nulls++
  }

  traverse(data, 0)
  return stats
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getJsonPath(path: string): string {
  if (!path) return '$'
  return '$.' + path
}

export function toYaml(json: string): string {
  return yamlDump(JSON.parse(json))
}

// CSV only makes sense for tabular data — an array of objects (or a single
// object, treated as one row). Anything else is rejected with a clear reason
// rather than emitting a nonsensical single-cell CSV.
export function toCsv(json: string): string {
  const data = JSON.parse(json)
  const rows: unknown[] = Array.isArray(data) ? data : [data]
  if (rows.length === 0) return ''

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
  if (!rows.every(isRecord)) {
    throw new Error('CSV export needs an array of objects (or a single object)')
  }

  const columns: string[] = []
  for (const row of rows as Record<string, unknown>[]) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }

  const escape = (v: unknown): string => {
    if (v === undefined || v === null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  const lines = [columns.join(',')]
  for (const row of rows as Record<string, unknown>[]) {
    lines.push(columns.map(c => escape(row[c])).join(','))
  }
  return lines.join('\n')
}

export interface SchemaError {
  path: string
  message: string
}

export function validateWithSchema(data: unknown, schemaText: string): { valid: boolean; errors: SchemaError[] } {
  const schema = JSON.parse(schemaText)
  const ajv = new Ajv({ allErrors: true })
  const validateFn = ajv.compile(schema)
  const valid = validateFn(data) as boolean
  const errors: SchemaError[] = (validateFn.errors ?? []).map(e => ({
    path: e.dataPath || '/',
    message: e.message ?? 'Invalid'
  }))
  return { valid, errors }
}
