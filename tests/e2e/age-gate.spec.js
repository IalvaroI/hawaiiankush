import { test, expect } from './fixtures.js'

test.describe('21+ age gate', () => {
  test.use({ ageVerified: false })

  test('the first visit asks, and Yes lets the shopper in for good', async ({ page }) => {
    await page.goto('/maui/')
    const gate = page.getByRole('dialog', { name: 'Are you 21 or older?' })
    await expect(gate).toBeVisible()
    await gate.getByRole('button', { name: /Yes, I.m 21 or older/ }).click()
    await expect(gate).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: /shop/ })).toBeAttached()
  })

  test('“No, I’m under 21” stops the shopper with a message', async ({ page }) => {
    await page.goto('/maui/')
    await page.getByRole('dialog').getByRole('button', { name: 'No, I’m under 21', exact: true }).click()
    await expect(page.getByText('Sorry, you must be of legal age to enter.')).toBeVisible()
  })
})
