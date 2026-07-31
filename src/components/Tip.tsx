import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface TipProps {
  label: string
  shortcut?: string
  children: React.ReactNode
}

const SHOW_DELAY = 350

// Small, styled popover that replaces the native browser tooltip — shows a
// tool's name plus (optionally) its keyboard shortcut on hover/focus.
//
// Rendered through a portal into <body>, positioned from the trigger's real
// screen coordinates: the toolbar scrolls horizontally (overflow-x: auto),
// which forces overflow-y to auto too (a CSS quirk — one axis can't stay
// visible once the other isn't), so a tooltip nested and absolutely
// positioned inside it would get silently clipped instead of floating above.
export function Tip({ label, shortcut, children }: TipProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const wrapRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    timerRef.current = setTimeout(() => {
      const rect = wrapRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos({ x: rect.left + rect.width / 2, y: rect.top })
      setVisible(true)
    }, SHOW_DELAY)
  }

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  return (
    <span className="tip-wrap" ref={wrapRef} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && createPortal(
        <span className="tip-bubble" role="tooltip" style={{ left: pos.x, top: pos.y }}>
          <span className="tip-bubble__title">{label}</span>
          {shortcut && <span className="tip-bubble__hint">{shortcut}</span>}
        </span>,
        document.body
      )}
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
