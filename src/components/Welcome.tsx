import React from 'react'
import jamIcon from '../assets/jam-icon.png'

export interface RecentFile {
  path: string
  name: string
}

interface WelcomeProps {
  onOpenFile: () => void
  onNewFile: () => void
  recentFiles: RecentFile[]
  onOpenRecent: (path: string) => void
  isMac: boolean
}

export function Welcome({ onOpenFile, onNewFile, recentFiles, onOpenRecent, isMac }: WelcomeProps) {
  const mod = isMac ? '⌘' : 'Ctrl'
  const shortcuts: [string, string][] = [
    ['Open file', `${mod}+O`],
    ['New file', `${mod}+T`],
    ['Save', `${mod}+S`],
    ['Close tab', `${mod}+W`],
    ['Format JSON', `${mod}+⇧+F`],
  ]

  return (
    <div className="welcome">
      <div className="welcome__hero">
        <img src={jamIcon} className="welcome__logo" alt="" />
        <h1 className="welcome__title">JAM</h1>
        <p className="welcome__subtitle">JSON Any Modifier</p>

        <div className="welcome__actions">
          <button className="welcome__btn welcome__btn--primary" onClick={onOpenFile}>
            <span className="welcome__btn-icon">📂</span>
            Open File…
          </button>
          <button className="welcome__btn" onClick={onNewFile}>
            <span className="welcome__btn-icon">📄</span>
            New File
          </button>
        </div>
      </div>

      <div className="welcome__panels">
        <div className="welcome__panel">
          <h2 className="welcome__panel-title">Recent Files</h2>
          {recentFiles.length === 0 ? (
            <p className="welcome__empty">Files you open will show up here</p>
          ) : (
            <ul className="welcome__recent-list">
              {recentFiles.map(f => (
                <li key={f.path}>
                  <button
                    className="welcome__recent-item"
                    onClick={() => onOpenRecent(f.path)}
                    title={f.path}
                  >
                    <span className="welcome__recent-icon">🗎</span>
                    <span className="welcome__recent-info">
                      <span className="welcome__recent-name">{f.name}</span>
                      <span className="welcome__recent-path">{f.path}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="welcome__panel">
          <h2 className="welcome__panel-title">Keyboard Shortcuts</h2>
          <ul className="welcome__shortcuts">
            {shortcuts.map(([label, keys]) => (
              <li key={label}>
                <span className="welcome__shortcut-label">{label}</span>
                <kbd className="welcome__kbd">{keys}</kbd>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
