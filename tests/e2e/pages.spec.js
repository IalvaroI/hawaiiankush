import { test, expect } from './fixtures.js'
import { brands, promotions, store } from './data.js'

test.describe('store pages', () => {
  test('deals lists the store promotions', async ({ page }) => {
    await page.goto('/maui/deals')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(promotions[0].name).first()).toBeVisible()
  })

  test('a brand alone on the last row of the brands grid sits in the middle, at its usual width', async ({ page }) => {
    // Eleven brands in two columns (the desktop with the bag rail), and ten in three (a narrower desktop, no rail).
    const grid = page.locator('.brand-grid')
    const boxes = () => grid.locator('li').evaluateAll((items) => items.map((item) => item.getBoundingClientRect()))
    for (const [width, count] of [[1280, 11], [1100, 10]]) {
      await page.setViewportSize({ width, height: 800 })
      await page.route(/\/api\/v2\/stores\/[^/]+\/brands\?/, async (route) => {
        const response = await route.fetch()
        const body = await response.json()
        body.items = body.items.slice(0, count)
        body.totalItems = body.items.length
        await route.fulfill({ response, json: body })
      })
      await page.goto('/maui/brands')
      await expect(grid.locator('li')).toHaveCount(count)
      const items = await boxes()
      const gridBox = await grid.boundingBox()
      const columns = new Set(items.slice(0, -1).map((box) => Math.round(box.left))).size
      expect(columns).toBe(width === 1280 ? 2 : 3)
      const last = items[items.length - 1]
      expect(Math.round(last.width)).toBe(Math.round(items[0].width))
      expect(Math.abs((last.left + last.width / 2) - (gridBox.x + gridBox.width / 2))).toBeLessThanOrEqual(1)
      await page.unroute(/\/api\/v2\/stores\/[^/]+\/brands\?/)
    }
    // A last row of two (eleven in three columns) keeps its cards where they are.
    await page.setViewportSize({ width: 1100, height: 800 })
    await page.route(/\/api\/v2\/stores\/[^/]+\/brands\?/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.items = body.items.slice(0, 11)
      body.totalItems = body.items.length
      await route.fulfill({ response, json: body })
    })
    await page.goto('/maui/brands')
    await expect(grid.locator('li')).toHaveCount(11)
    const items = await boxes()
    expect(Math.round(items[items.length - 1].left)).toBe(Math.round(items[1].left))
    // A narrow window (one column on phones' rules, though the grid is wide enough for two): every card full width.
    await page.setViewportSize({ width: 540, height: 800 })
    await page.goto('/maui/brands')
    await expect(grid.locator('li')).toHaveCount(11)
    const narrow = await boxes()
    expect(new Set(narrow.map((box) => Math.round(box.width))).size).toBe(1)
    expect(Math.round(narrow[narrow.length - 1].left)).toBe(Math.round(narrow[0].left))
  })

  test('brands lists the store brands with a letter directory', async ({ page }) => {
    await page.goto('/maui/brands')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(brands[0].name, { exact: true }).first()).toBeVisible()
  })

  test('learn shows the editable copy', async ({ page }) => {
    await page.goto('/maui/learn')
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible()
  })

  test('locations shows the store and its name', async ({ page }) => {
    await page.goto('/maui/locations')
    await expect(page.getByRole('heading', { level: 1, name: 'Locations' })).toBeVisible()
    await expect(page.getByText('Store not connected')).toHaveCount(0)
    await expect(page.getByText(store.name).first()).toBeVisible()
  })
})

test.describe('site photos', () => {
  test('home shows the hero photo, the trust row and the story band from content.json', async ({ page, request }) => {
    await page.goto('/maui/')
    const hero = page.locator('.hero.has-media')
    await expect(hero.locator('img')).toHaveAttribute('src', /images\/site\/hero-desktop-v2-1600\.jpg$/)
    await expect(page.locator('.hero-trust .trust-card')).toHaveCount(3)
    await expect(page.locator('.story-card')).toHaveCount(2)
    await expect(page.locator('.story-card').first().getByRole('link', { name: /Find us/ })).toHaveAttribute('href', '/maui/locations')
    await expect(page.locator('.rail-promo.has-media img')).toHaveAttribute('src', /new-arrivals-v2-720\.jpg$/)
    const photo = await request.get('/maui/images/site/hero-desktop-v2-1600.webp')
    expect(photo.status()).toBe(200)
    expect(photo.headers()['content-type']).toBe('image/webp')
    expect(photo.headers()['cache-control']).toBe('public, max-age=604800')
  })

  test('phones get the portrait hero crop', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/maui/')
    const current = await page.locator('.hero-media img').evaluate((img) => img.currentSrc)
    expect(current).toMatch(/hero-mobile-v2-900\.(webp|jpg)$/)
  })
})
