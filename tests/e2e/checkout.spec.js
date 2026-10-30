import { test, expect } from './fixtures.js'
import { addToBag, expectBag, signInWithCode } from './helpers.js'
import { delivery, pickProduct, store } from './data.js'

const continueStep = (page) => page.getByRole('button', { name: 'Continue', exact: true })

async function fillContact(page) {
  await expect(page.locator('#co-lastName')).toBeVisible()
  await page.locator('#co-firstName').fill('Test')
  await page.locator('#co-lastName').fill('Shopper')
  await page.locator('#co-email').fill('shopper@example.com')
  await page.locator('#co-phone').fill('8085550199')
  await page.locator('#co-birthDate').fill('1990-01-01')
  await continueStep(page).click()
}

// Contact, in-store pickup and the preselected payment, so the review step (promo, Place order) is open.
async function reachReview(page, product) {
  await addToBag(page, product)
  await page.goto('/maui/checkout')
  await fillContact(page)
  await page.locator('input[name="co-fulfillment"][value="inStorePickup"]').check()
  await continueStep(page).click()
  await expect(page.locator('input[name="co-payment"][value="payOnSite"]')).toBeChecked()
  await continueStep(page).click()
  await expect(page.locator('#co-promo')).toBeVisible()
}

const placeButton = (page) => page.getByRole('button', { name: /^Place order/ })
const amount = async (locator) => Number((await locator.innerText()).replace(/[^\d.]/g, ''))

test.describe('checkout', () => {
  test('a guest places a pickup order with a promo code that is refused first', async ({ page }) => {
    await addToBag(page, pickProduct())
    await page.goto('/maui/checkout')
    await fillContact(page)

    await expect(page.locator('input[name="co-fulfillment"]')).toHaveCount(4)
    await page.locator('input[name="co-fulfillment"][value="inStorePickup"]').check()
    await continueStep(page).click()

    await expect(page.locator('input[name="co-payment"][value="payOnSite"]')).toBeChecked()
    await continueStep(page).click()

    await expect(page.locator('#co-promo')).toBeVisible()
    await page.locator('#co-promo').fill('NOT-A-CODE')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.locator('#co-promo-error')).toContainText('not a valid promo code')

    await page.locator('#co-promo').fill('WELCOME10')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Remove promo code WELCOME10' })).toBeVisible()
    // Receipt amounts use the shop's money format (the store sends "$30.00" and "-$3.00").
    const receipt = page.locator('.co-receipt')
    await expect(receipt).toContainText('Discount')
    await expect(receipt).not.toContainText('-$')
    await expect(receipt.locator('.co-row').filter({ hasText: 'Discount' })).toContainText('−$')

    await page.getByRole('button', { name: /Place order/ }).click()
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible()
    await expectBag(page, 0)
  })

  test('a signed-in shopper skips the contact step, which the account already covers', async ({ page }) => {
    await signInWithCode(page, 'known@example.com')
    await expect(page).toHaveURL(/\/maui\/account$/)
    await addToBag(page, pickProduct())
    await page.goto('/maui/checkout')
    await expect(page.getByRole('heading', { name: 'Pickup or delivery' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Contact', exact: true })).toHaveCount(0)
    await expect(page.locator('#co-firstName')).toHaveCount(0)
  })

  test('an address outside the delivery area is turned down', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 21.3069, longitude: -157.8583 })
    await addToBag(page, pickProduct())
    await page.goto('/maui/checkout')
    await fillContact(page)
    await page.locator('input[name="co-fulfillment"][value="delivery"]').check()
    await page.locator('#co-address').fill('Honolulu Hale, Honolulu, HI')
    await page.getByRole('button', { name: 'Use my current location' }).click()
    await expect(page.getByText(/We don.t deliver to this address yet/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
  })

  test('the checkout\'s own messages reach the shopper as written', async ({ page }) => {
    await reachReview(page, pickProduct())
    await page.locator('#co-promo').fill('WELCOME10')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Remove promo code WELCOME10' })).toBeVisible()
    await page.locator('#co-promo').fill('welcome10')
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(page.locator('#co-promo-error')).toHaveText('That code is already applied.')
  })

  for (const [label, fail] of [['a server fault', (route) => route.fulfill({ status: 502, json: { detail: 'Could not reach the store API.' } })], ['no answer at all', (route) => route.abort('connectionreset')]]) {
    test(`a failed order submission (${label}) says to check email, never just to try again`, async ({ page }) => {
      await reachReview(page, pickProduct())
      let posts = 0
      await page.route('**/maui/api/**/orders', (route) => { if (route.request().method() !== 'POST') return route.fallback(); posts += 1; return fail(route) })
      await placeButton(page).click()
      await expect(page.getByRole('alert').filter({ hasText: 'We couldn’t confirm your order. Check your email before you try again.' })).toBeVisible()
      await expect(page.getByText('That didn’t save. Try again.')).toHaveCount(0)
      expect(posts).toBe(1)
    })
  }

  test('changing the bag during checkout updates the total, and the top-bar bag opens it on a wide screen', async ({ page }) => {
    const product = pickProduct({ minStock: 2 })
    await reachReview(page, product)
    const before = await amount(page.locator('.co-total strong'))
    // At 1280px the bag rail steps aside on checkout, so the bag button opens the drawer.
    await page.getByRole('button', { name: 'Open bag, 1 item' }).click()
    const drawer = page.getByRole('dialog', { name: /bag/i })
    await expect(drawer).toBeVisible()
    await drawer.getByRole('button', { name: `Add one ${product.name}` }).click()
    await expect(page.getByRole('button', { name: 'Open bag, 2 items' })).toBeVisible()
    await expect.poll(() => amount(page.locator('.co-total strong'))).toBeCloseTo(before * 2, 2)
    await expect.poll(() => amount(placeButton(page))).toBeCloseTo(before * 2, 2)
    // The drawer opened from checkout leads back to it, not to a Checkout button that reloads the same page.
    await expect(drawer.getByRole('button', { name: 'Checkout', exact: true })).toHaveCount(0)
    await drawer.getByRole('button', { name: 'Back to checkout' }).click()
    await expect(drawer).toBeHidden()
  })

  test('if the total changes just before the order is placed, it stops and shows the new total', async ({ page }) => {
    await reachReview(page, pickProduct())
    // The store's answer to the last save before ordering carries a different total.
    await page.route('**/maui/api/**/checkout', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      const response = await route.fetch()
      const body = await response.json()
      body.receipt.totals.total = Number(body.receipt.totals.total) + 5
      await route.fulfill({ response, json: body })
    })
    let ordered = false
    page.on('request', (request) => { if (request.method() === 'POST' && /\/orders$/.test(new URL(request.url()).pathname)) ordered = true })
    await placeButton(page).click()
    await expect(page.getByRole('alert').filter({ hasText: /^Your total changed from \$[\d.,]+ to \$[\d.,]+\. Check it, then place your order\.$/ })).toBeVisible()
    expect(ordered).toBe(false)
    await expect(page.getByRole('heading', { name: 'Order placed' })).toHaveCount(0)
  })

  test('a payment method the store stops offering reopens its step, and the order cannot go through without one', async ({ page }) => {
    const product = pickProduct({ minStock: 2 })
    await reachReview(page, product)
    await expect(placeButton(page)).toBeEnabled()
    // From now on the store offers two other payment methods, so the saved one is dropped and nothing is preselected.
    await page.route('**/maui/api/**/checkout', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.options.paymentMethods = { required: true, items: [{ type: 'cashlessAtm', name: 'Cashless ATM' }, { type: 'debitCard', name: 'Debit card' }] }
      await route.fulfill({ response, json: body })
    })
    // A change to the bag makes checkout read the store again.
    await page.getByRole('button', { name: 'Open bag, 1 item' }).click()
    await page.getByRole('dialog', { name: /bag/i }).getByRole('button', { name: `Add one ${product.name}` }).click()
    await expect(page.locator('input[name="co-payment"]')).toHaveCount(2)
    await expect(placeButton(page)).toHaveCount(0)
  })

  test('pickup: the rail names the chosen method, and the confirmation says where to pick up', async ({ page }) => {
    await reachReview(page, pickProduct())
    await page.goto('/maui/')
    const card = page.locator('.cart-rail .rail-pickup')
    await expect(card).toContainText('In-store pickup')
    await expect(card).toContainText('Ready in 30–60 mins')
    await expect(card.getByRole('button', { name: 'Change pickup' })).toBeVisible()
    await page.goto('/maui/checkout')
    await placeButton(page).click()
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible()
    await expect(page.locator('.co-where')).toHaveText(`Pick up at ${store.contacts.address}`)
  })

  test('delivery: the bag shows the chosen time, and the confirmation says where and when', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(delivery.synthetic.zone.center)
    await addToBag(page, pickProduct())
    await page.goto('/maui/checkout')
    await fillContact(page)
    await page.locator('input[name="co-fulfillment"][value="delivery"]').check()
    await page.locator('#co-address').fill('1 Farrington Hwy, Waialua, HI 96791')
    await page.getByRole('button', { name: 'Use my current location' }).click()
    await expect(page.getByText(/We deliver to this address/)).toBeVisible()
    const address = await page.locator('#co-address').inputValue()
    await continueStep(page).click()
    // Tomorrow 10 to 12 (today's ASAP window comes first).
    await page.locator('input[name="co-time"]').nth(1).check()
    await continueStep(page).click()
    await continueStep(page).click()
    await expect(placeButton(page)).toBeEnabled()

    await page.goto('/maui/bag')
    const card = page.locator('.bag-pickup')
    await expect(card).toContainText('Delivery')
    await expect(card).toContainText('Tomorrow · 10:00 AM – 12:00 PM')
    await expect(card.getByRole('button', { name: 'Change delivery' })).toBeVisible()
    // A window that is over (a tab left open overnight) is not shown.
    const saved = await page.evaluate(() => {
      const key = Object.keys(sessionStorage).find((name) => name.endsWith(':checkout'))
      const value = sessionStorage.getItem(key)
      const draft = JSON.parse(value)
      draft.timeWindow = { ...draft.timeWindow, date: '2020-01-01' }
      sessionStorage.setItem(key, JSON.stringify(draft))
      return { key, value }
    })
    await page.reload()
    await expect(card).toContainText('Delivery')
    await expect(card).not.toContainText('2020')
    await expect(card).not.toContainText('AM')
    await page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), saved)

    await page.goto('/maui/checkout')
    await placeButton(page).click()
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible()
    await expect(page.locator('.co-where')).toContainText(`Delivery to ${address}`)
    await expect(page.locator('.co-where')).toContainText('Tomorrow · 10:00 AM – 12:00 PM')
  })

  test('the confirmation starts at the top of the page, and a guest sees the order reference, not an order number', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 })
    await reachReview(page, pickProduct())
    await expect(placeButton(page)).toBeEnabled()
    // Placed from the bottom of a long checkout.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await placeButton(page).click()
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeFocused()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    const mark = await page.locator('.co-confirm-mark').boundingBox()
    const bar = await page.locator('.topbar').boundingBox()
    expect(mark.y).toBeGreaterThanOrEqual(bar.y + bar.height)
    await expect(page.locator('.co-reference')).toContainText('Order reference')
    await expect(page.getByText('Order number')).toHaveCount(0)
  })

  test('signed in, the confirmation shows the store\'s order number and links to the order', async ({ page }) => {
    await signInWithCode(page, 'known@example.com')
    await expect(page).toHaveURL(/\/maui\/account$/)
    // Start from an empty account bag (earlier tests may have left lines in it).
    await page.goto('/maui/bag')
    await expect(page.getByRole('heading', { level: 1, name: /^Your bag/ })).toBeVisible()
    const emptyBag = page.getByRole('button', { name: 'Empty bag', exact: true })
    if (await emptyBag.isVisible()) {
      await emptyBag.click()
      await expectBag(page, 0)
    }
    await addToBag(page, pickProduct())
    await page.goto('/maui/checkout')
    await page.locator('input[name="co-fulfillment"][value="inStorePickup"]').check()
    await continueStep(page).click()
    await expect(page.locator('input[name="co-payment"][value="payOnSite"]')).toBeChecked()
    await continueStep(page).click()
    await placeButton(page).click()
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible()
    const line = page.locator('.co-confirm p').filter({ hasText: 'Order number' })
    await expect(line).toContainText(/Order number #\d+/)
    const number = (await line.locator('strong').innerText()).replace('#', '')
    await expect(page.locator('.co-reference')).toHaveCount(0)
    await line.getByRole('link', { name: 'View order' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Order #${number}` })).toBeVisible()
  })

  test('a sign-in that ends mid-checkout says so, keeps the steps, and sign-in brings the shopper back', async ({ page, context }) => {
    await signInWithCode(page, 'lapse@example.com')
    await expect(page).toHaveURL(/\/maui\/account$/)
    await page.goto('/maui/bag')
    await expect(page.getByRole('heading', { level: 1, name: /^Your bag/ })).toBeVisible()
    const emptyBag = page.getByRole('button', { name: 'Empty bag', exact: true })
    if (await emptyBag.isVisible()) { await emptyBag.click(); await expectBag(page, 0) }
    await addToBag(page, pickProduct())
    await page.goto('/maui/checkout')
    await page.locator('input[name="co-fulfillment"][value="inStorePickup"]').check()
    await continueStep(page).click()
    await expect(page.locator('input[name="co-payment"][value="payOnSite"]')).toBeChecked()
    // The session ends (its cookie is gone) before the next step is saved.
    await context.clearCookies({ name: /session/i })
    await continueStep(page).click()
    const ended = page.locator('section[role="alert"]').filter({ hasText: 'Your sign-in has ended' })
    await expect(ended).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toHaveAttribute('href', '/maui/sign-in?next=%2Fcheckout')
    await expect(page.locator('.top-account')).toHaveAttribute('aria-label', 'Sign in')
    await ended.getByRole('link', { name: 'Sign in', exact: true }).click()
    await page.getByLabel('Email').fill('lapse@example.com')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Verification code').fill('123456')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL(/\/maui\/checkout$/)
    // The pickup step done before is still done; the payment step, whose save failed, is where the shopper left off.
    await expect(page.locator('section.co-step').filter({ has: page.locator('#co-fulfillment-heading') })).toContainText(/In-store pickup/)
    await expect(page.locator('input[name="co-payment"][value="payOnSite"]')).toBeChecked()
    await continueStep(page).click()
    await expect(placeButton(page)).toHaveCount(1)
    // Loyalty: all 120 points asked for, the store's cap of 100 applied and shown.
    await page.getByRole('button', { name: 'Use all 120 points' }).click()
    await expect(page.locator('.co-loyalty')).toContainText('100 points applied')
    await page.getByRole('button', { name: 'Stop using my points' }).click()
    await expect(page.locator('.co-loyalty')).not.toContainText('applied')
    await placeButton(page).click()
    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible()
  })

  test('from checkout, the header\'s sign-in comes back to checkout with the guest\'s steps kept', async ({ page }) => {
    await reachReview(page, pickProduct())
    await expect(page.locator('.top-account')).toHaveAttribute('href', '/maui/sign-in?next=%2Fcheckout')
    await page.locator('.top-account').click()
    await page.getByLabel('Email').fill('resume@example.com')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByLabel('Verification code')).toBeFocused()
    await page.getByLabel('Verification code').fill('123456')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page).toHaveURL(/\/maui\/checkout$/)
    await expect(placeButton(page)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Contact', exact: true })).toHaveCount(0)
  })
})
