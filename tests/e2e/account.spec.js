import { test, expect } from './fixtures.js'
import { signInWithCode } from './helpers.js'

test.describe('sign in', () => {
  test('a returning shopper signs in with the email code and sees the profile', async ({ page }) => {
    await signInWithCode(page, 'known@example.com')
    await expect(page).toHaveURL(/\/maui\/account$/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Kai Akana' })).toBeVisible()
    await expect(page.getByText('known@example.com').first()).toBeVisible()
  })

  test('sign-in returns to the page that sent the shopper there, but never off the site', async ({ page }) => {
    await signInWithCode(page, 'known@example.com', '123456', '/maui/sign-in?next=%2Forders')
    await expect(page).toHaveURL(/\/maui\/orders$/)
    await page.context().clearCookies()
    // Browsers drop a tab inside a URL, so "/<tab>/evil.example" would read as "//evil.example".
    await signInWithCode(page, 'known@example.com', '123456', '/maui/sign-in?next=%2F%09%2Fevil.example')
    await expect(page).toHaveURL(/\/maui\/account$/)
  })

  test('a wrong code is refused and the shopper stays on the code step', async ({ page }) => {
    await signInWithCode(page, 'known@example.com', '654321')
    await expect(page.getByText(/That code didn.t work/)).toBeVisible()
    await expect(page).toHaveURL(/\/maui\/sign-in/)
  })

  test('a four-digit code reaches the API instead of being rejected by the form', async ({ page }) => {
    await page.goto('/maui/sign-in')
    await page.getByLabel('Email').fill('known@example.com')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Verification code').fill('1234')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByText(/That code didn.t work/)).toBeVisible()
  })

  test('a new shopper completes sign-up after the code and lands on the account', async ({ page }) => {
    // A fresh address each run: the mock remembers accounts, so a repeated sign-up would sign in instead.
    await signInWithCode(page, `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`)
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await page.locator('#signup-first').fill('Nia')
    await page.locator('#signup-last').fill('Keala')
    await page.locator('#signup-birth').fill('1995-03-03')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/maui\/account$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Nia Keala' })).toBeVisible()
  })
})
