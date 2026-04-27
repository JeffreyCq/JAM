import React from 'react'
import { getStats, formatBytes, type JsonStats } from '../utils/jsonUtils'

interface StatusBarProps {
  content: string
  parsedData: unknown
  error: string | null
  isJsonLines: boolean
  jsonLinesCount: number
  linesErrors: number
}

export function StatusBar({
  content,
  parsedData,
  error,
  isJsonLines,
  jsonLinesCount,
  linesErrors
}: StatusBarProps) {
  const stats: JsonStats | null =
    parsedData !== null && !error
      ? getStats(parsedData, content)
      : null

  return (
    <div className={`statusbar ${error ? 'statusbar--error' : 'statusbar--ok'}`}>
      <div className="sb-left">
        {error ? (
          <span className="sb-error">⚠ {error}</span>
        ) : (
          <>
            <span className="sb-item">✓ Valid JSON</span>
            {isJsonLines && (
              <span className="sb-item">
                📋 {jsonLinesCount} lines{linesErrors > 0 ? ` (${linesErrors} errors)` : ''}
              </span>
            )}
          </>
        )}
      </div>

      <div className="sb-right">
        {stats && (
          <>
            <span className="sb-item" title="File size">
              📄 {formatBytes(stats.size)}
            </span>
            <span className="sb-sep">|</span>
            <span className="sb-item" title="Total keys">
              🔑 {stats.keys} keys
            </span>
            <span className="sb-sep">|</span>
            <span className="sb-item" title="Max nesting depth">
              🌲 depth {stats.maxDepth}
            </span>
            <span className="sb-sep">|</span>
            <span className="sb-item" title="Objects / Arrays">
              {} {stats.objects} obj · [] {stats.arrays} arr
            </span>
            <span className="sb-sep">|</span>
            <span className="sb-item" title="Strings / Numbers / Booleans / Nulls">
              " {stats.strings} · # {stats.numbers} · ✓ {stats.booleans} · ∅ {stats.nulls}
            </span>
          </>
        )}
        {!stats && !error && (
          <span className="sb-item sb-muted">No data</span>
        )}
      </div>
    </div>
  )
}
