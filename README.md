# JAM — JSON Any Modifier

A fast, native desktop app for viewing, formatting, repairing, and transforming JSON — built with Electron, React, and Monaco.

## Features

### Editing
- **Multi-file tabs** — open and edit several JSON files at once, with drag-to-reorder.
- **Drag & drop** — drop `.json`, `.jsonl`, `.ndjson`, `.log`, or `.txt` files anywhere on the window to open them.
- **Session restore** — reopens your tabs (including unsaved edits) after a restart.
- **Auto-save** — files already linked to a path on disk can save automatically as you type.
- **JSON Lines / NDJSON mode** — line-by-line parsing and navigation for JSONL files.

### Transform & repair
- Format (pretty-print), minify, sort keys, escape/unescape embedded strings.
- Rule-based repair (offline) for common JSON syntax errors.
- AI-powered repair via the Anthropic API (bring your own key) for malformed JSON that rule-based repair can't fix.

### Inspect
- Interactive tree view with search, expand/collapse, and per-node copy (value, path, formatted).
- Automatic detection of embedded JSON inside string values, expandable in place.
- **Compare / diff** — side-by-side comparison between any two open files.
- **Search across all open files**, grouped by file with jump-to-match.
- **JSON Schema validation** against a pasted schema, with per-path error messages.

### Export
- Export the active file as **YAML** or **CSV** (CSV requires an array of objects).

### CRM Builder
- A guided form for building JSON payloads for CRM automation workflows, with a live preview you can load straight into the editor.

### Interface
- Five themes: **Dark**, **Light**, **Matrix**, **Pink Flamingo**, **Sunset**.
- Toolbar organized into **File / Transform / Tools** dropdown menus, plus an optional icon-only quick-access bar.
- Remembers window size and position across launches.
- Native macOS integrated title bar.

## Keyboard shortcuts

| Action        | Shortcut  |
|---------------|-----------|
| Open file     | `Ctrl/⌘+O` |
| New file      | `Ctrl/⌘+T` |
| Save          | `Ctrl/⌘+S` |
| Close tab     | `Ctrl/⌘+W` |
| Format JSON   | `Ctrl/⌘+Shift+F` |

## Installation

Download the latest build for your platform from the [Releases](../../releases) page.

**macOS:** builds are signed with a local certificate, which prevents "app is damaged" errors but does not satisfy Gatekeeper's identified-developer check for downloaded files. On first launch, right-click the app and choose **Open**, or ask your IT team to run:
```bash
sudo spctl --add --label "JAM" /Applications/JAM.app
```

**Windows:** run the installer (`JAM Setup.exe`) or use the portable build.

## Development

```bash
npm install
npm run dev          # start in development mode
npm run build         # production build (renderer + main)
npm run dist:mac      # package macOS .dmg/.zip (Intel + Apple Silicon)
npm run dist:win      # package Windows installer + portable .exe
```

### macOS code signing

Production `.dmg`/`.zip` builds are signed with a local self-signed certificate ("JAM Internal Code Signing") configured via `build.mac.identity` in `package.json`. This certificate only exists in the keychain of the machine that created it — CI does not build or sign macOS artifacts for this reason (see `.github/workflows/build.yml`). macOS releases are built and uploaded locally:

```bash
npm run dist:mac
gh release upload <tag> release/*.dmg release/*.zip --clobber
```

## Tech stack

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/)
- [React](https://react.dev/) + TypeScript
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) (editor + diff view)
- [ajv](https://ajv.js.org/) (JSON Schema validation)
- [js-yaml](https://github.com/nodeca/js-yaml) (YAML export)
- [jsonrepair](https://github.com/josdejong/jsonrepair) (offline repair)
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) (AI repair)
