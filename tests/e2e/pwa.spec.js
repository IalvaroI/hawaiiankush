import { test, expect } from './fixtures.js'

// The installable app: manifest, icons, service worker, offline page. The worker must never serve store data.
test.describe('installable app', () => {
  test.use({ serviceWorkers: 'allow' })

  test('the manifest names the shop, uses its own icons and offers shortcuts', async ({ page, request }) => {
    const response = await request.get('/maui/manifest.webmanifest')
    expect(response.ok()).toBe(true)
    const manifest = await response.json()
    expect(manifest).toMatchObject({ id: '/maui/', start_url: '/maui/', scope: '/maui/', display: 'standalone' })
    expect(manifest.name.length).toBeGreaterThan(0)
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
    for (const icon of [...manifest.icons, { src: '/maui/icons/apple-touch-icon.png' }]) {
      const file = await request.get(icon.src)
      expect(file.ok(), icon.src).toBe(true)
      expect(file.headers()['content-type']).toBe('image/png')
    }
    expect(manifest.shortcuts.map((item) => item.url)).toEqual(expect.arrayContaining(['/maui/shop', '/maui/deals', '/maui/bag']))
    await page.goto('/maui/')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/maui/icons/apple-touch-icon.png')
    // The tab icon is the store's Hawaii icon, the only one listed, so no browser picks another.
    const tabIcons = await page.locator('link[rel="icon"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    expect(tabIcons).toEqual(['/maui/hawaii.ico'])
    for (const href of tabIcons) expect((await request.get(href)).ok(), href).toBe(true)
  })

  test('the service worker takes over, keeps an offline page and never caches store data', async ({ page, request }) => {
    const worker = await request.get('/maui/sw.js')
    expect(worker.headers()['cache-control']).toBe('no-cache')

    await page.goto('/maui/')
    await expect(page.locator('article.product-card').first()).toBeVisible()
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

    // Nothing from the store is ever in its caches.
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((r) => r.url)))).flat())
    expect(cached.filter((url) => url.includes('/api/'))).toEqual([])

    // The offline page is kept from the first visit. (Playwright's offline mode does not reach a service worker's own
    // requests in Chromium, so the fallback itself is checked through the cache it is served from.)
    const offline = await page.evaluate(async () => {
      const response = await caches.match(new URL('offline.html', (await navigator.serviceWorker.ready).scope).href)
      return response ? await response.text() : ''
    })
    expect(offline).toContain("You’re offline")
    await page.goto('/maui/offline.html')
    await expect(page.getByRole('heading', { name: "You’re offline" })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})
