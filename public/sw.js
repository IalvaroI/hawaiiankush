// Service worker: makes the shop installable, opens instantly on repeat visits and shows a page of its own offline.
// It never caches prices, stock, the bag or anything else from the store: every /api/ request goes to the network,
// so a shopper never sees a stale price. Only the app's own files, photos and icons are kept (the browser already keeps
// the web fonts for a year, and cross-origin copies would cost megabytes of storage each).
const VERSION = 'v2'
const SHELL = `hk-shell-${VERSION}`
const RUNTIME = `hk-runtime-${VERSION}`
const MAX_RUNTIME = 150
const SCOPE = new URL(self.registration.scope)
const OFFLINE_URL = new URL('offline.html', SCOPE).href
const PRECACHE = [OFFLINE_URL, new URL('icons/icon-192.png', SCOPE).href, new URL('hawaii.ico', SCOPE).href]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, RUNTIME])
    for (const key of await caches.keys()) if (key.startsWith('hk-') && !keep.has(key)) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const sameScope = url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname)

  // Pages: always from the network (fresh HTML and titles); the offline page when there is no network.
  if (request.mode === 'navigate' && sameScope) {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
    return
  }
  if (sameScope) {
    const path = url.pathname.slice(SCOPE.pathname.length)
    // Store data (products, prices, stock, the bag, sign-in) is never cached.
    if (path.startsWith('api/')) return
    // Hashed build files never change: cache first.
    if (path.startsWith('assets/')) { event.respondWith(cacheFirst(request)); return }
    // Site photos and icons: show the kept copy at once, refresh it in the background.
    if (path.startsWith('images/') || path.startsWith('icons/')) { event.respondWith(staleWhileRevalidate(request)); return }
  }
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request)
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) await put(request, response.clone())
    return response
  }).catch(() => cached)
  return cached || refresh
}

// Keeps the runtime cache to its newest entries.
async function put(request, response) {
  const cache = await caches.open(RUNTIME)
  await cache.put(request, response)
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME))) await cache.delete(key)
}
