import React from 'react'

interface TipProps {
  label: string
  shortcut?: string
  children: React.ReactNode
}

// Small, styled popover that replaces the native browser tooltip — shows a
// tool's name plus (optionally) its keyboard shortcut on hover/focus.
export function Tip({ label, shortcut, children }: TipProps) {
  return (
    <span className="tip-wrap">
      {children}
      <span className="tip-bubble" role="tooltip">
        <span className="tip-bubble__title">{label}</span>
        {shortcut && <span className="tip-bubble__hint">{shortcut}</span>}
      </span>
    </span>
  )
}

// Splits a legacy "Description (Shortcut)" string into its two parts so
// existing title text can be reused as-is inside a <Tip>.
export function splitHint(hint: string): { label: string; shortcut?: string } {
  const m = hint.match(/^(.*)\s\(([^)]+)\)$/)
  if (m) return { label: m[1], shortcut: m[2] }
  return { label: hint }
}
