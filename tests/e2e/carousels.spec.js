import { test, expect } from './fixtures.js'
import { carousels, categories } from './data.js'

// The mock fills a carousel with the products of the category of the same name, so pick one that has products.
const carousel = carousels.find((item) => categories.some((category) => category.name.toLowerCase() === item.name.toLowerCase()))

test.describe('home carousels', () => {
  test('the store’s carousels show as scrolling rows, and See all opens the menu filtered to one', async ({ page }) => {
    test.skip(!carousel, 'No carousel with products in the fixtures')
    await page.goto('/maui/')
    const section = page.locator('section.carousel', { has: page.getByRole('heading', { level: 2, name: carousel.name, exact: true }) })
    await expect(section.locator('article.product-card').first()).toBeVisible()

    // The row scrolls sideways; the back arrow is off at the start and comes on after moving forward.
    const track = section.locator('.product-carousel')
    const back = section.getByRole('button', { name: `Scroll ${carousel.name} back` })
    await expect(back).toBeDisabled()
    const forward = section.getByRole('button', { name: `Scroll ${carousel.name} forward` })
    if (await forward.isEnabled()) {
      await forward.click()
      await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
      await expect(back).toBeEnabled()
    }

    await section.getByRole('link', { name: /See all/ }).click()
    await expect(page).toHaveURL(new RegExp(`/maui/shop\\?f\\.carousel=${carousel.id}`))
    await expect(page.locator('.result-count')).toContainText(carousel.name)
    await expect(page.getByRole('button', { name: `Remove filter ${carousel.name}` })).toBeVisible()
  })

  test('a carousel link opened on its own never says "All products" over the carousel\'s list', async ({ page }) => {
    test.skip(!carousel, 'No carousel with products in the fixtures')
    await page.route(/\/api\/v2\/stores\/[^/]+\/carousels\/[^/?]+\?/, (route) => route.fulfill({ status: 500, json: { detail: 'Store API error.' } }))
    await page.goto(`/maui/shop?f.carousel=${carousel.id}`)
    await expect(page.locator('article.product-card').first()).toBeVisible()
    await expect(page.locator('.result-count')).toContainText('Selection')
    await expect(page.locator('.result-count')).not.toContainText('All products')
    await expect(page.getByRole('button', { name: 'Remove filter Selection' })).toBeVisible()
  })
})
