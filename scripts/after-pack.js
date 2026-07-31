/**
 * after-pack.js
 * electron-builder afterPack hook — embeds icon.ico directly into the
 * packaged HomebuddyFormatter.exe using rcedit.exe, bypassing the
 * winCodeSign symlink issue on Windows machines without Developer Mode.
 *
 * Runs automatically after `npm run dist:win`.
 *
 * macOS signing is handled by electron-builder itself (see build.mac.identity
 * in package.json — a local self-signed "Jtools Internal Code Signing"
 * certificate), so there's nothing to do here for darwin builds.
 */

const path       = require('path')
const fs         = require('fs')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

module.exports = async function afterPack(context) {
  // ── Windows: embed icon via rcedit ───────────────────────────────────────────
  if (context.electronPlatformName !== 'win32') return

  // Derived from package.json's build.productName — stays correct across renames
  // instead of hardcoding the app/exe filename here.
  const productFilename = context.packager.appInfo.productFilename

  const exePath   = path.join(context.appOutDir, `${productFilename}.exe`)
  const icoPath   = path.resolve(__dirname, '..', 'build', 'icon.ico')
  const rceditExe = path.resolve(__dirname, '..', 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe')

  if (!fs.existsSync(exePath))   { console.warn('[after-pack] exe not found:', exePath);        return }
  if (!fs.existsSync(icoPath))   { console.warn('[after-pack] icon.ico not found:', icoPath);   return }
  if (!fs.existsSync(rceditExe)) { console.warn('[after-pack] rcedit.exe not found:', rceditExe); return }

  console.log('[after-pack] Embedding icon into', path.basename(exePath), '…')

  const args = [
    exePath,
    '--set-icon',             icoPath,
    '--set-file-version',     '1.0.0.0',
    '--set-product-version',  '1.0.0',
    '--set-version-string', 'ProductName',      productFilename,
    '--set-version-string', 'FileDescription',  'JSON Analyzer & Formatter',
    '--set-version-string', 'CompanyName',      'Homebuddy',
    '--set-version-string', 'LegalCopyright',   'Copyright © 2026',
    '--set-version-string', 'OriginalFilename', `${productFilename}.exe`,
  ]

  await execFileAsync(rceditExe, args)
  console.log('[after-pack] ✅ Icon embedded successfully')
}
