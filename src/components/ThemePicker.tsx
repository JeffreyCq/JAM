import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Tip } from './Tip'

export interface ThemeDef {
  id: string
  name: string
  icon: string
  dark: boolean
  swatch: [string, string, string]
}

export const THEMES: ThemeDef[] = [
  { id: 'dark', name: 'Dark', icon: '🌙', dark: true, swatch: ['#1e1e2e', '#89b4fa', '#a6e3a1'] },
  { id: 'light', name: 'Light', icon: '☀', dark: false, swatch: ['#eff1f5', '#1e66f5', '#40a02b'] },
  { id: 'matrix', name: 'Matrix', icon: '💚', dark: true, swatch: ['#0d0208', '#00ff41', '#008f11'] },
  { id: 'flamingo', name: 'Pink Flamingo', icon: '🦩', dark: false, swatch: ['#fff0f6', '#ff5da2', '#00b8a9'] },
  { id: 'sunset', name: 'Sunset', icon: '🌇', dark: true, swatch: ['#2b1332', '#ff8a5c', '#ffd166'] },
]

export function isDarkTheme(id: string): boolean {
  return THEMES.find(t => t.id === id)?.dark ?? true
}

// Dropdown theme picker — portal-based like the toolbar menus (the tab bar
// doesn't scroll, but keeping this consistent with the rest of the app avoids
// re-introducing the same clipping bug if the bar ever needs overflow).
export function ThemePicker({ theme, onSelect }: { theme: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const current = THEMES.find(t => t.id === theme) ?? THEMES[0]

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ x: rect.right, y: rect.bottom + 6 })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <Tip label={`Theme: ${current.name}`}>
        <button ref={btnRef} className="theme-toggle" onClick={toggle} aria-label="Change theme">
          {current.icon}
        </button>
      </Tip>
      {open && createPortal(
        <div className="theme-menu" ref={listRef} style={{ left: pos.x, top: pos.y, transform: 'translateX(-100%)' }}>
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`theme-menu__item${t.id === theme ? ' theme-menu__item--active' : ''}`}
              onClick={() => { onSelect(t.id); setOpen(false) }}
            >
              <span className="theme-menu__swatch">
                {t.swatch.map((c, i) => <span key={i} style={{ background: c }} />)}
              </span>
              <span className="theme-menu__name">{t.name}</span>
              {t.id === theme && <span className="theme-menu__check">✓</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
