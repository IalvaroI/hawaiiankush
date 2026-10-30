// Renders the install icons (public/icons/) from one SVG mark: the leaf in cream on the shop's deep teal.
// Run with `node scripts/make-icons.mjs` after changing the mark; the PNGs are committed.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'icons')
const TEAL = '#073f46'
const CREAM = '#f3e8d6'
// The lucide leaf (the same icon the shop uses for "All" and missing photos), on a 24-unit grid.
const LEAF = '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'

// `scale` is the leaf's share of the canvas: maskable icons keep it inside the 80% safe zone, so the system can crop
// the icon to any shape. `radius` rounds the corners of the standard icon.
function svg({ size, scale, radius }) {
  const leaf = size * scale
  const offset = (size - leaf) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius * size}" fill="${TEAL}"/>
  <g transform="translate(${offset} ${offset}) scale(${leaf / 24})" fill="none" stroke="${CREAM}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${LEAF}</g>
</svg>`
}

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.56, radius: 0.22 },
  { file: 'icon-512.png', size: 512, scale: 0.56, radius: 0.22 },
  { file: 'maskable-512.png', size: 512, scale: 0.46, radius: 0 },
  // iOS rounds the corners itself and shows transparency as black, so the touch icon is a full square.
  { file: 'apple-touch-icon.png', size: 180, scale: 0.56, radius: 0 },
]

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(icon)}</body></html>`)
  await page.locator('svg').screenshot({ path: join(out, icon.file), omitBackground: true })
}
await browser.close()
// The tab icon is the store's own public/hawaii.ico, not made here.
console.log(`Wrote ${ICONS.length} icons to ${out}`)
