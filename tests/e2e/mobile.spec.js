import { test, expect } from './fixtures.js'
import { addToBag } from './helpers.js'
import { pickProduct, productPath } from './data.js'

// A 390 px phone: no horizontal scrolling on the pages that matter most.
test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

  test('home has no horizontal scroll', async ({ page }) => {
    await page.goto('/maui/')
    await expect(page.locator('article.product-card').first()).toBeVisible()
    expect(await noOverflow(page)).toBe(true)
  })

  test('the pinned add bar names the size it adds', async ({ page }) => {
    await page.goto(productPath(pickProduct({ minVariants: 2 })))
    const bar = page.locator('.pd-buy')
    const picked = () => page.locator('.pd-size[aria-pressed="true"] .pd-size-label').textContent()
    await expect(bar.locator('.pd-buy-size')).toHaveText(await picked())
    await page.locator('.pd-size:not([aria-pressed="true"]):not([disabled])').first().click()
    await expect(bar.locator('.pd-buy-size')).toHaveText(await picked())
    // One size: the bar shows the price alone (the size is written out above).
    await page.goto(productPath(pickProduct({ where: (detail) => (detail.variants || []).length === 1 })))
    await expect(bar).toBeVisible()
    await expect(bar.locator('.pd-buy-size')).toHaveCount(0)
  })

  test('the bag page pins Checkout and the total until the summary\'s own Checkout is in view', async ({ page }) => {
    await addToBag(page, pickProduct())
    // A short screen, so even one line pushes the summary below the fold.
    await page.setViewportSize({ width: 390, height: 480 })
    await page.goto('/maui/bag')
    const bar = page.locator('.bag-checkout-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toHaveAttribute('href', '/maui/checkout')
    await expect(bar).toContainText(/Checkout\s*\$\d/)
    await expect(page.locator('.mobile-bag-bar')).toHaveCount(0)
    await page.locator('.bag-summary .cart-checkout').scrollIntoViewIfNeeded()
    await expect(bar).toHaveCount(0)
    // Scrolled on until the summary's Checkout is under the sticky top bar: covered, so the pinned bar is back.
    await page.evaluate(() => {
      const button = document.querySelector('.bag-summary .cart-checkout')
      window.scrollBy(0, button.getBoundingClientRect().bottom - document.querySelector('.topbar').offsetHeight + 4)
    })
    await expect(bar).toBeVisible()
    // The top bar grows after the page has loaded (a row appears): a Checkout under its new lower edge is covered too.
    await page.evaluate(() => document.querySelector('.bag-summary .cart-checkout').scrollIntoView({ block: 'center' }))
    await expect(bar).toHaveCount(0)
    await page.evaluate(() => {
      const topbar = document.querySelector('.topbar')
      const grown = topbar.offsetHeight + 60
      topbar.style.minHeight = `${grown}px`
      const button = document.querySelector('.bag-summary .cart-checkout')
      window.scrollBy(0, button.getBoundingClientRect().bottom - grown + 30)
    })
    await expect(bar).toBeVisible()
  })

  test('a product page has no horizontal scroll', async ({ page }) => {
    await page.goto(productPath(pickProduct()))
    await expect(page.locator('.pd-layout')).toBeVisible()
    expect(await noOverflow(page)).toBe(true)
  })

  test('checkout has no horizontal scroll', async ({ page }) => {
    await addToBag(page, pickProduct())
    await page.goto('/maui/checkout')
    await expect(page.locator('#co-firstName')).toBeVisible()
    expect(await noOverflow(page)).toBe(true)
  })

  test('the quiz keeps its own bottom row: the View bag bar steps aside', async ({ page }) => {
    await addToBag(page, pickProduct())
    await page.goto('/maui/')
    await expect(page.locator('.mobile-bag-bar')).toBeVisible()
    await page.goto('/maui/picker')
    await expect(page.locator('.pk-actions')).toBeVisible()
    await expect(page.locator('.mobile-bag-bar')).toBeHidden()
  })

  test('phone controls are full touch targets: top-bar buttons, bag quantity and Remove', async ({ page }) => {
    await addToBag(page, pickProduct())
    await page.goto('/maui/bag')
    const size = (locator) => locator.evaluate((node) => { const box = node.getBoundingClientRect(); return { width: box.width, height: box.height } })
    for (const locator of [page.getByRole('button', { name: 'Open menu' }), page.locator('.top-account'), page.locator('.bag-page .stepper').first(), page.locator('.bag-page .line-remove').first()]) {
      const box = await size(locator)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })
})
