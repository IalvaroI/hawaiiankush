// Production server: serves the built storefront from dist/ under BASE_PATH and proxies BASE_PATH/api to the Ecom API.
// App routes get server-rendered <head> tags (title, description, Open Graph, JSON-LD) from meta.js.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { basePath, createApiHandler } from './proxy.js'
import { createEcomFetcher, resolvePage } from './meta.js'
import { createDeepHealthCheck } from './health.js'

try { process.loadEnvFile() } catch { /* no .env file; rely on the real environment */ }
const env = process.env
const base = basePath(env)
const apiPrefix = `${base}api`
const healthPath = `${base}healthz`
const distDir = resolve(env.DIST_DIR || 'dist')
const port = Number(env.PORT || 3000)
const host = env.HOST || '127.0.0.1'
const handleApi = createApiHandler(env)
const fetchEcom = createEcomFetcher(env)
const checkDeepHealth = createDeepHealthCheck(
  () => fetchEcom(`/v2/stores/${encodeURIComponent(env.STORE_ID || '')}`),
  { ttlMs: Number(env.HEALTH_CACHE_TTL_MS) || 15_000 },
)
// Site photos (public/images) are not content-hashed, but replacing one means a new file name (hero-desktop-v2 → v3),
// so browsers may keep them for a week.
const IMAGE_CACHE = 'public, max-age=604800'
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' }

async function serveFile(res, file, cache) {
  const data = await readFile(file)
  res.statusCode = 200
  res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream')
  res.setHeader('Cache-Control', cache)
  res.end(data)
}

// The built index.html is identical for every app route, so it is cached and per-page tags are spliced in. The cache
// follows the file's modification time, so a rebuild while the server runs never serves a shell whose assets are gone.
let shell = { mtimeMs: 0, text: '' }
async function readShell() {
  const file = join(distDir, 'index.html')
  const { mtimeMs } = await stat(file)
  if (mtimeMs !== shell.mtimeMs) shell = { mtimeMs, text: await readFile(file, 'utf8') }
  return shell.text
}

// The install manifest. The name follows the store's own settings, so it needs no redeploy when the store changes;
// the icons are the shop's own (public/icons, made by scripts/make-icons.mjs), so installing never depends on the
// store's image host. Cached for ten minutes; a failed store read gives the manifest with a generic name, never an
// error. The service worker (public/sw.js) never caches store data, so installed shoppers always see live prices.
const MANIFEST_TTL_MS = 10 * 60 * 1000
const MANIFEST_COLORS = { background_color: '#f3e8d6', theme_color: '#f3e8d6' }
let manifestCache = { expires: 0, value: null }

function shortNameOf(name) {
  if (name.length <= 12) return name
  return name.split(/\s+/)[0].slice(0, 12)
}

// Home-screen shortcuts (long-press the app icon): the places a returning shopper goes first.
const SHORTCUTS = [
  ['Menu', 'shop'],
  ['Deals', 'deals'],
  ['Find your match', 'picker'],
  ['Your bag', 'bag'],
]

function buildManifest(store) {
  const name = String(store?.name || '').trim() || 'Shop'
  const icon = (file, sizes, purpose = 'any') => ({ src: `${base}icons/${file}`, sizes, type: 'image/png', purpose })
  return {
    id: base,
    name,
    short_name: shortNameOf(name),
    description: `Order ahead for pickup at ${name}. Live prices, stock and lab figures.`,
    lang: 'en-US',
    start_url: base,
    scope: base,
    display: 'standalone',
    orientation: 'any',
    categories: ['shopping', 'lifestyle'],
    ...MANIFEST_COLORS,
    icons: [icon('icon-192.png', '192x192'), icon('icon-512.png', '512x512'), icon('maskable-512.png', '512x512', 'maskable')],
    shortcuts: SHORTCUTS.map(([label, path]) => ({ name: label, url: `${base}${path}`, icons: [{ src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' }] })),
  }
}

async function manifestFor() {
  if (manifestCache.value && manifestCache.expires > Date.now()) return manifestCache.value
  try {
    const result = await fetchEcom(`/v2/stores/${encodeURIComponent(env.STORE_ID || '')}`)
    const value = buildManifest(result?.store)
    manifestCache = { value, expires: Date.now() + MANIFEST_TTL_MS }
    return value
  } catch {
    // Not cached, so the next request tries the store again.
    return buildManifest(null)
  }
}

// Swaps the generic title and description for the page's own tags. A function replacer keeps "$&"-style
// sequences in a product name from being read as replacement patterns.
function renderShell(template, head) {
  return template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/i, '')
    .replace('</head>', () => `    ${head}\n  </head>`)
}

async function serveAppRoute(req, res, pathname, search) {
  const page = await resolvePage(pathname, search, env)
  if (page.redirect) {
    res.writeHead(page.status, { Location: page.redirect, 'Cache-Control': 'no-cache' })
    res.end()
    return
  }
  const html = renderShell(await readShell(), page.head)
  res.writeHead(page.status, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' })
  res.end(req.method === 'HEAD' ? undefined : html)
}

createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost')
  try {
    if (pathname === healthPath || pathname === `${healthPath}/deep`) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' })
        res.end(req.method === 'HEAD' ? undefined : 'Method not allowed')
        return
      }
      const deep = pathname === `${healthPath}/deep`
      const ok = !deep || await checkDeepHealth()
      const status = ok ? 200 : 503
      const body = JSON.stringify(deep ? { ok, sweed: ok ? 'ok' : 'unavailable' } : { ok: true })
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : body)
      return
    }
    if (pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`)) {
      req.url = req.url.slice(apiPrefix.length) || '/'
      await handleApi(req, res)
      return
    }
    if (pathname === `${base}manifest.webmanifest` && (req.method === 'GET' || req.method === 'HEAD')) {
      const manifest = await manifestFor()
      res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' })
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(manifest))
      return
    }
    // Keep the query string: the router writes the root as /maui?q=… in some cases.
    if (pathname === base.slice(0, -1)) { res.writeHead(301, { Location: base + search }); res.end(); return }
    if (!pathname.startsWith(base) || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404); res.end('Not found'); return }
    const relative = normalize(decodeURIComponent(pathname.slice(base.length)))
    // The shell's own file name would be a duplicate, tag-less copy of the home page.
    if (relative === 'index.html') { res.writeHead(301, { Location: base }); res.end(); return }
    const file = join(distDir, relative)
    // Inside the dist directory itself: a bare prefix test would also pass a sibling such as dist-old.
    if (file !== distDir && !file.startsWith(distDir + sep)) { res.writeHead(404); res.end('Not found'); return }
    const info = relative && relative !== '.' ? await stat(file).catch(() => null) : null
    // Hashed build assets can be cached forever; everything else is an app route answered with the shell.
    if (info?.isFile()) await serveFile(res, file, relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : relative.startsWith('images/') ? IMAGE_CACHE : 'no-cache')
    else await serveAppRoute(req, res, pathname, search)
  } catch {
    if (!res.headersSent) { res.writeHead(500); res.end('Server error') }
  }
}).listen(port, host, () => console.log(`Storefront on http://${host}:${port}${base}`))
