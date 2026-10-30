// The test entry point: every spec imports `test` and `expect` from here.
//
// Each test gets a fresh browser context (no cookies, no storage), a random X-Forwarded-For (so the proxy's sign-in
// rate limits never bleed between tests), and the 21+ gate already passed unless a spec turns `ageVerified` off.
// Other hosts don't resolve in the fixture run (see playwright.config.js), so it never depends on the internet.
// A test fails when the page throws an uncaught error. Failed-request console messages are ignored, since the
// negative-path tests make the store answer 400 on purpose.
import { randomInt } from 'node:crypto'
import { test as base, expect } from '@playwright/test'

export { expect }

export const test = base.extend({
  ageVerified: [true, { option: true }],

  shopper: [async ({ context, ageVerified }, use) => {
    await context.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}` })
    if (ageVerified) {
      await context.addInitScript(() => {
        try { window.localStorage.setItem('age-verified', new Date().toISOString().slice(0, 10)) } catch { /* storage blocked */ }
      })
    }
    await use(true)
  }, { auto: true }],

  pageErrors: [async ({ page }, use) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(`console: ${message.text()}`)
    })
    await use(errors)
    if (errors.length) throw new Error(`The page reported errors:\n${errors.join('\n')}`)
  }, { auto: true }],
})
