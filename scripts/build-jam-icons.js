/**
 * One-off migration: build the JAM app/file icons from jam-app-assets/ into
 * build/, replacing the old Homebuddy/Jtools icon set.
 *
 * - App icon: uses the provided mac/jam-icon.icns as-is (verified proper
 *   multi-resolution), but regenerates the Windows .ico via png2icons since
 *   the provided windows/jam-icon.ico only contained a single 16x16 image.
 * - File-type icon: no .icns/.ico were provided, so both are generated from
 *   the 1024px PNG via png2icons (same tool the existing pipeline uses).
 */

const path = require('path')
const fs = require('fs')

const ASSETS = path.join(__dirname, '..', 'jam-app-assets')
const BUILD = path.join(__dirname, '..', 'build')

async function main() {
  const png2icons = require('png2icons')

  // ── App icon ──────────────────────────────────────────────────────────────
  const appPng = fs.readFileSync(path.join(ASSETS, 'app-icon-pngs', 'jam-icon-1024.png'))
  fs.writeFileSync(path.join(BUILD, 'icon.png'), appPng)
  fs.copyFileSync(path.join(ASSETS, 'app-icon-master.svg'), path.join(BUILD, 'icon.svg'))
  fs.copyFileSync(path.join(ASSETS, 'mac', 'jam-icon.icns'), path.join(BUILD, 'icon.icns'))

  const appIco = png2icons.createICO(appPng, png2icons.BILINEAR, 0, true, true)
  if (!appIco) throw new Error('ICO generation failed for app icon')
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), appIco)
  console.log('✅ App icon: icon.png, icon.svg, icon.icns (provided), icon.ico (regenerated)')

  // ── File-type (.json) icon ───────────────────────────────────────────────
  const filePng = fs.readFileSync(path.join(ASSETS, 'file-icon-json', 'json-file-icon-1024.png'))
  fs.writeFileSync(path.join(BUILD, 'icon-json.png'), filePng)
  fs.copyFileSync(path.join(ASSETS, 'file-icon-json-branded.svg'), path.join(BUILD, 'icon-json.svg'))

  const fileIco = png2icons.createICO(filePng, png2icons.BILINEAR, 0, true, true)
  if (!fileIco) throw new Error('ICO generation failed for file icon')
  fs.writeFileSync(path.join(BUILD, 'icon-json.ico'), fileIco)

  const fileIcns = png2icons.createICNS(filePng, png2icons.BILINEAR, 0)
  if (!fileIcns) throw new Error('ICNS generation failed for file icon')
  fs.writeFileSync(path.join(BUILD, 'icon-json.icns'), fileIcns)
  console.log('✅ File icon: icon-json.png, icon-json.svg, icon-json.ico, icon-json.icns (generated)')
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
