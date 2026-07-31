import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join, basename } from 'path'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { execFile } from 'child_process'

// Must run before app.whenReady() — this is what the Dock/menu bar (macOS) and
// taskbar (Windows) show instead of the generic "Electron" label in dev mode.
app.setName('JAM')

function resolveIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),       // packaged app
    join(__dirname, '../../build/icon.png'),         // dev: out/main → build
    join(__dirname, '../../../build/icon.png'),      // alt dev path
  ]
  return candidates.find(p => { try { return existsSync(p) } catch { return false } })
}

const FILE_EXTS = /\.(json|jsonl|ndjson|log|txt)$/i

function getFileArgsFromArgv(argv: string[]): string[] {
  // In packaged app argv[0] = exe; in dev argv[0]=electron argv[1]=main.js
  const args = argv.slice(app.isPackaged ? 1 : 2)
  return args.filter(a => !a.startsWith('-') && FILE_EXTS.test(a))
}

// Reads every path in parallel (fast for many files) but sends the resulting
// 'file-opened' IPC messages in the original order — parallel reads finish in
// whatever order the OS returns them, and tabs must not shuffle because of that.
async function sendFiles(win: BrowserWindow, filePaths: string[]): Promise<void> {
  const results = await Promise.all(
    filePaths.map(async filePath => {
      try {
        return { filePath, content: await readFile(filePath, 'utf-8'), error: null as string | null }
      } catch (e) {
        return { filePath, content: null as string | null, error: String(e) }
      }
    })
  )
  for (const r of results) {
    if (r.error !== null) win.webContents.send('file-opened-error', r.error)
    else win.webContents.send('file-opened', r.content, r.filePath)
  }
}

// Brings the window to the front and gives it focus — used whenever a file is
// opened from outside the app (double-click, "Open With", or a second launch
// while already running), so the user actually sees what just opened instead
// of it silently loading behind other windows.
function focusWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
  if (process.platform === 'darwin') app.focus({ steal: true })
}

// macOS fires open-file (once per file, synchronously, back-to-back) before the
// app is ready when the user double-clicks or uses Open With — and can also fire
// it while the app is already running. Queue paths here and flush as a batch
// so a multi-file open always reads in parallel and lands in the right order.
const pendingMacFiles: string[] = []
let macFlushScheduled = false

function scheduleMacFlush(): void {
  if (macFlushScheduled) return
  macFlushScheduled = true
  queueMicrotask(() => {
    macFlushScheduled = false
    const wins = BrowserWindow.getAllWindows()
    if (wins.length === 0 || pendingMacFiles.length === 0) return
    const win = wins[wins.length - 1]
    focusWindow(win)
    sendFiles(win, pendingMacFiles.splice(0))
  })
}

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  pendingMacFiles.push(filePath)
  if (BrowserWindow.getAllWindows().length > 0) scheduleMacFlush()
})

// ─── Remember window size/position across launches ──────────────────────────
interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
}

const DEFAULT_WINDOW_STATE: WindowState = { width: 1400, height: 900 }

function windowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

async function loadWindowState(): Promise<WindowState> {
  try {
    const raw = await readFile(windowStatePath(), 'utf-8')
    const state = JSON.parse(raw)
    if (typeof state.width === 'number' && typeof state.height === 'number') return state
  } catch {
    // No saved state yet (first launch) — use the default.
  }
  return DEFAULT_WINDOW_STATE
}

// If the saved position is on a display that's no longer connected
// (e.g. an external monitor was unplugged), fall back to letting the OS
// place the window instead of restoring it off-screen.
function clampToVisibleDisplay(state: WindowState): WindowState {
  if (state.x === undefined || state.y === undefined) return state
  const onScreen = screen.getAllDisplays().some(d => {
    const { x, y, width, height } = d.workArea
    return state.x! >= x && state.y! >= y && state.x! < x + width && state.y! < y + height
  })
  return onScreen ? state : { width: state.width, height: state.height }
}

let saveWindowStateTimer: NodeJS.Timeout | null = null
function scheduleSaveWindowState(win: BrowserWindow): void {
  if (saveWindowStateTimer) clearTimeout(saveWindowStateTimer)
  saveWindowStateTimer = setTimeout(() => {
    if (win.isDestroyed()) return
    const bounds = win.getBounds()
    writeFile(windowStatePath(), JSON.stringify(bounds)).catch(() => { /* non-fatal */ })
  }, 500)
}

async function createWindow(): Promise<void> {
  const savedState = clampToVisibleDisplay(await loadWindowState())
  const win = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    x: savedState.x,
    y: savedState.y,
    minWidth: 900,
    minHeight: 600,
    icon: resolveIcon(),
    // Modern, integrated look on macOS: hide the native title bar and let the
    // app's own tab bar draw underneath the traffic-light buttons.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1e1e2e',
    show: false
  })

  win.webContents.once('did-finish-load', () => {
    // Windows/Linux: files passed via argv (can be more than one)
    const argvFiles = getFileArgsFromArgv(process.argv)
    if (argvFiles.length > 0) {
      focusWindow(win)
      sendFiles(win, argvFiles)
      return
    }
    // macOS: files queued from open-file events before window existed
    if (pendingMacFiles.length > 0) {
      focusWindow(win)
      sendFiles(win, pendingMacFiles.splice(0))
    }
  })

  win.once('ready-to-show', () => focusWindow(win))

  win.on('resize', () => scheduleSaveWindowState(win))
  win.on('move', () => scheduleSaveWindowState(win))

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog({
    filters: [
      { name: 'JSON / Log Files', extensions: ['json', 'jsonl', 'ndjson', 'log', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  // Read every selected file in parallel — opening 20 files should cost
  // roughly as much as opening 1, not 20x the disk latency.
  const files = await Promise.all(
    result.filePaths.map(async filePath => ({
      path: filePath,
      name: basename(filePath),
      content: await readFile(filePath, 'utf-8')
    }))
  )
  return files
})

// Re-opens a specific path without a dialog — used by the "Recent Files" list.
ipcMain.handle('read-file', async (_, filePath: string) => {
  try {
    return { path: filePath, name: basename(filePath), content: await readFile(filePath, 'utf-8') }
  } catch {
    return null
  }
})

ipcMain.handle('save-file', async (_, content: string, filePath: string | null, defaultName = 'output.json') => {
  // Already-known path (existing file re-saved with Ctrl/Cmd+S): write straight through, no dialog.
  if (filePath) {
    await writeFile(filePath, content, 'utf-8')
    return { path: filePath }
  }
  const ext = defaultName.split('.').pop() || 'json'
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [
      { name: `${ext.toUpperCase()} Files`, extensions: [ext] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, content, 'utf-8')
  return { path: result.filePath }
})

// On Windows, write the file-type icon registry entries at runtime.
// We do this here because NSIS customInstall runs before file associations
// are registered, making it impossible to read the ProgId there.
// This runs once per launch, silently, and is a no-op on non-Windows.
function patchFileTypeIcons(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  const iconPath = join(process.resourcesPath, 'icon-json.ico')
  if (!existsSync(iconPath)) return

  // PowerShell snippet:
  // For each extension, find what ProgId is currently registered under
  // HKCU\Software\Classes\.ext (where electron-builder writes for per-user installs).
  // If the ProgId was set by our app (contains "JAM"), patch its DefaultIcon.
  // Also write directly to the common ProgId formats electron-builder uses
  // (current "JAM"/appId, plus the old Homebuddy/Jtools names for anyone
  // upgrading from a pre-rename install), so we cover per-machine installs too.
  const ico = iconPath.replace(/\\/g, '\\\\')
  const ps = `
$ico = '${ico},0'
$exts = @('json','jsonl','ndjson')
foreach ($e in $exts) {
  # per-user ProgId (electron-builder per-user install)
  $pid = (Get-ItemProperty "HKCU:\\Software\\Classes\\.$e" -EA SilentlyContinue).'(default)'
  if ($pid) {
    New-Item -Path "HKCU:\\Software\\Classes\\$pid\\DefaultIcon" -Force -EA SilentlyContinue | Out-Null
    Set-ItemProperty "HKCU:\\Software\\Classes\\$pid\\DefaultIcon" '(default)' $ico -EA SilentlyContinue
  }
  # also patch common ProgId formats electron-builder may have used —
  # current app name/id, plus the pre-rename Homebuddy/Jtools names
  foreach ($prog in @("JAM.$e","com.jam.jsonmodifier.$e","HomebuddyFormatter.$e","com.homebuddy.formatter.$e","Jtools.$e")) {
    if (Test-Path "HKCU:\\Software\\Classes\\$prog") {
      New-Item -Path "HKCU:\\Software\\Classes\\$prog\\DefaultIcon" -Force -EA SilentlyContinue | Out-Null
      Set-ItemProperty "HKCU:\\Software\\Classes\\$prog\\DefaultIcon" '(default)' $ico -EA SilentlyContinue
    }
    if (Test-Path "HKCR:\\$prog") {
      New-Item -Path "HKCR:\\$prog\\DefaultIcon" -Force -EA SilentlyContinue | Out-Null
      Set-ItemProperty "HKCR:\\$prog\\DefaultIcon" '(default)' $ico -EA SilentlyContinue
    }
  }
}
# Notify shell to refresh icons
$code = '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e,int f,IntPtr a,IntPtr b);'
Add-Type -MemberDefinition $code -Name SH -Namespace Win -EA SilentlyContinue
[Win.SH]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
`
  execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps],
    { windowsHide: true },
    () => { /* silent — errors are non-fatal */ }
  )
}

app.whenReady().then(() => {
  patchFileTypeIcons()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
