import { test, expect } from './fixtures.js'
import { addToBag } from './helpers.js'
import { pickProduct, productPath } from './data.js'

// A keyboard shopper keeps their place: adding, tapping the stepper and removing never drop focus to the page.
test.describe('keyboard focus', () => {
  test('Add to bag hands focus to the stepper that takes its place, and a busy stepper keeps it', async ({ page }) => {
    const product = pickProduct()
    await page.goto(productPath(product))
    const add = page.locator('.pd-layout').getByRole('button', { name: `Add to bag: ${product.name}`, exact: true })
    await add.focus()
    await page.keyboard.press('Enter')
    const plus = page.locator('.pd-layout').getByRole('button', { name: `Add one ${product.name}`, exact: true })
    await expect(plus).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(plus).toBeFocused()
    await expect(page.locator('.pd-layout .stepper')).toContainText('2')
    // A stepper shown for a product already in the bag takes nothing.
    await page.goto(`/maui/shop?q=${encodeURIComponent(product.name)}`)
    await expect(page.locator('article.product-card').first().getByRole('button', { name: `Add one ${product.name}` })).toBeVisible()
    await expect(page.locator('article.product-card').first().getByRole('button', { name: `Add one ${product.name}` })).not.toBeFocused()
  })

  test('the bag drawer keeps focus inside after a line is removed', async ({ page }) => {
    const product = pickProduct()
    await addToBag(page, product)
    await page.setViewportSize({ width: 1000, height: 800 })
    await page.goto('/maui/')
    await page.getByRole('button', { name: /Open bag/ }).click()
    const drawer = page.getByRole('dialog', { name: /bag/i })
    await drawer.getByRole('button', { name: `Remove ${product.name}`, exact: true }).click()
    await expect(drawer.getByRole('heading', { name: /^Bag/ })).toBeFocused()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement.closest('[role="dialog"]') !== null)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
  })
})
