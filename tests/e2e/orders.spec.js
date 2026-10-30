import { test, expect } from './fixtures.js'
import { signInWithCode } from './helpers.js'

test.describe('orders', () => {
  test('a signed-in shopper sees the order list and an order timeline', async ({ page }) => {
    await signInWithCode(page, 'known@example.com')
    await expect(page).toHaveURL(/\/maui\/account$/)
    await page.goto('/maui/orders')
    await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible()
    await expect(page.getByText('#2102')).toBeVisible()
    await expect(page.getByText('#2101')).toBeVisible()
    await page.getByRole('link', { name: /#2101/ }).first().click()
    await expect(page).toHaveURL(/\/maui\/orders\/[^/]+$/)
    await expect(page.getByRole('heading', { name: 'Order #2101' })).toBeVisible()
    const progress = page.getByRole('region', { name: 'Progress' })
    await expect(progress).toBeVisible()
    await expect(progress.getByRole('listitem')).toHaveCount(4)
  })
})
