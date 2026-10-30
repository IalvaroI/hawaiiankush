// Small steps shared by the specs: bag count, adding a product, signing in with the test codes.
import { expect } from './fixtures.js'
import { productPath } from './data.js'

export const bagLabel = (count) => `Open bag, ${count} ${count === 1 ? 'item' : 'items'}`

export async function expectBag(page, count) {
  await expect(page.locator('.bag-button')).toHaveAttribute('aria-label', bagLabel(count))
}

// Adds one unit of a product from its own page and waits until the store has the line.
export async function addToBag(page, product) {
  await page.goto(productPath(product))
  await page.getByRole('button', { name: `Add to bag: ${product.name}`, exact: true }).click()
  // The bag count moves at once, but the store has not answered yet. The toast comes after the write has settled,
  // so the next step starts from the store's bag, not one still on its way.
  await expect(page.getByText('Added to your bag')).toBeVisible()
  await expectBag(page, 1)
}

// Signs in with the email code. The test code 123456 is what the mock accepts.
export async function signInWithCode(page, email, code = '123456', path = '/maui/sign-in') {
  await page.goto(path)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Verification code').fill(code)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}
