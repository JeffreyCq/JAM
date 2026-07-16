import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execFile } from 'child_process'

function resolveIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.png'),       // packaged app
    join(__dirname, '../../build/icon.png'),         // dev: out/main → build
    join(__dirname, '../../../build/icon.png'),      // alt dev path
  ]
  return candidates.find(p => { try { return existsSync(p) } catch { return false } })
}

const FILE_EXTS = /\.(json|jsonl|ndjson|log|txt)$/i

function getFileArgFromArgv(argv: string[]): string | null {
  // In packaged app argv[0] = exe; in dev argv[0]=electron argv[1]=main.js
  const args = argv.slice(app.isPackaged ? 1 : 2)
  return args.find(a => !a.startsWith('-') && FILE_EXTS.test(a)) ?? null
}

function sendFile(win: BrowserWindow, filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8')
    win.webContents.send('file-opened', content, filePath)
  } catch (e) {
    win.webContents.send('file-opened-error', String(e))
  }
}

// macOS fires open-file before app is ready when user double-clicks or uses Open With.
// Queue paths here and drain them once the window finishes loading.
const pendingMacFiles: string[] = []

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    sendFile(wins[wins.length - 1], filePath)
  } else {
    pendingMacFiles.push(filePath)
  }
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: resolveIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#1e1e2e',
    show: false
  })

  win.webContents.once('did-finish-load', () => {
    // Windows/Linux: file passed via argv
    const argvFile = getFileArgFromArgv(process.argv)
    if (argvFile) { sendFile(win, argvFile); return }
    // macOS: file queued from open-file event before window existed
    if (pendingMacFiles.length > 0) {
      sendFile(win, pendingMacFiles.shift()!)
    }
  })

  win.once('ready-to-show', () => win.show())

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
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return null
  return readFileSync(result.filePaths[0], 'utf-8')
})

ipcMain.handle('save-file', async (_, content: string, defaultName = 'output.json') => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [
      { name: 'JSON Files', extensions: ['json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return false
  writeFileSync(result.filePath, content, 'utf-8')
  return true
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
  // If the ProgId was set by our app (contains "HomebuddyFormatter"), patch its DefaultIcon.
  // Also write directly to the two most common ProgId formats electron-builder uses,
  // so we cover per-machine installs too.
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
  # also patch both common ProgId formats electron-builder may have used
  foreach ($prog in @("HomebuddyFormatter.$e","com.homebuddy.formatter.$e")) {
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
