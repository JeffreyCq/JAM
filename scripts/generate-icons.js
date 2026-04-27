/**
 * generate-icons.js
 * Converts SVG sources in build/ into PNG + ICO + ICNS files.
 *
 *  build/icon.svg      →  icon.png  +  icon.ico  +  icon.icns   (app icon)
 *  build/icon-json.svg →  icon-json.png  +  icon-json.ico        (file-type icon)
 *
 * Uses:
 *   @resvg/resvg-js  – pure WASM SVG renderer (no native deps)
 *   png2icons        – pure JS PNG → ICO + ICNS
 */

const path  = require('path')
const fs    = require('fs')

const BUILD = path.join(__dirname, '..', 'build')

async function renderSvg(svgPath) {
  const { Resvg } = require('@resvg/resvg-js')
  const svgData   = fs.readFileSync(svgPath)
  const resvg     = new Resvg(svgData, { fitTo: { mode: 'width', value: 1024 } })
  return resvg.render().asPng()
}

async function main() {
  const png2icons = require('png2icons')

  console.log('\n🎨  HomebuddyFormatter — Icon Generator\n')

  // ── APP ICON (blue gradient, HB + ide) ───────────────────────────────────
  console.log('── App icon (icon.svg) ──')

  console.log('Step 1/3 — SVG → PNG (1024×1024)…')
  const appPng = await renderSvg(path.join(BUILD, 'icon.svg'))
  fs.writeFileSync(path.join(BUILD, 'icon.png'), appPng)
  console.log('   ✅  build/icon.png\n')

  console.log('Step 2/3 — PNG → ICO (Windows)…')
  const appIco = png2icons.createICO(appPng, png2icons.BILINEAR, 0, true, true)
  if (!appIco) throw new Error('ICO generation failed for app icon')
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), appIco)
  console.log('   ✅  build/icon.ico\n')

  console.log('Step 3/3 — PNG → ICNS (macOS)…')
  const appIcns = png2icons.createICNS(appPng, png2icons.BILINEAR, 0)
  if (!appIcns) throw new Error('ICNS generation failed for app icon')
  fs.writeFileSync(path.join(BUILD, 'icon.icns'), appIcns)
  console.log('   ✅  build/icon.icns\n')

  // ── FILE-TYPE ICON (white background, HB blue + JSON) ────────────────────
  console.log('── File-type icon (icon-json.svg) ──')

  console.log('Step 1/2 — SVG → PNG (1024×1024)…')
  const jsonPng = await renderSvg(path.join(BUILD, 'icon-json.svg'))
  fs.writeFileSync(path.join(BUILD, 'icon-json.png'), jsonPng)
  console.log('   ✅  build/icon-json.png\n')

  console.log('Step 2/3 — PNG → ICO (Windows)…')
  const jsonIco = png2icons.createICO(jsonPng, png2icons.BILINEAR, 0, true, true)
  if (!jsonIco) throw new Error('ICO generation failed for json icon')
  fs.writeFileSync(path.join(BUILD, 'icon-json.ico'), jsonIco)
  console.log('   ✅  build/icon-json.ico\n')

  console.log('Step 3/3 — PNG → ICNS (macOS)…')
  const jsonIcns = png2icons.createICNS(jsonPng, png2icons.BILINEAR, 0)
  if (!jsonIcns) throw new Error('ICNS generation failed for json icon')
  fs.writeFileSync(path.join(BUILD, 'icon-json.icns'), jsonIcns)
  console.log('   ✅  build/icon-json.icns\n')

  console.log('🎉  All icons generated!\n')
  console.log('   build/icon.png        (app, 1024×1024)')
  console.log('   build/icon.ico        (app, Windows exe)')
  console.log('   build/icon.icns       (app, macOS DMG)')
  console.log('   build/icon-json.png   (file type, 1024×1024)')
  console.log('   build/icon-json.ico   (file type, Windows)')
  console.log('   build/icon-json.icns  (file type, macOS)\n')
}

main().catch(err => {
  console.error('\n❌  Error:', err.message)
  process.exit(1)
})
