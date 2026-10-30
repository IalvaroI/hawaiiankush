import { test, expect } from './fixtures.js'
import { addToBag, expectBag } from './helpers.js'
import { pickProduct, productPath } from './data.js'

test.describe('bag', () => {
  test('three quick taps on the stepper send one cart write', async ({ page }) => {
    const product = pickProduct()
    await addToBag(page, product)
    const writes = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && /\/carts\/[^/]+\/items$/.test(new URL(request.url()).pathname)) writes.push(request.url())
    })
    // The cart rail repeats the same stepper, so the product page is scoped to <main>.
    // Three taps in one turn of the page, so they fall inside the write window however busy the machine is.
    await page.locator('#main').getByRole('button', { name: `Add one ${product.name}`, exact: true }).evaluate((button) => {
      button.click()
      button.click()
      button.click()
    })
    await expectBag(page, 4)
    await page.waitForTimeout(800)
    expect(writes).toHaveLength(1)
  })

  // Known issue (found while writing this suite): the bag count moves at once, but the first write goes out after a short
  // window. Leaving the page inside that window aborts the request, and the bag comes back empty. Expected to pass once fixed.
  test('a bag add survives leaving the page right after it', async ({ page }) => {
    const product = pickProduct()
    await page.goto(productPath(product))
    await page.getByRole('button', { name: `Add to bag: ${product.name}`, exact: true }).click()
    await page.goto('/maui/bag')
    await expect(page.getByRole('heading', { level: 1, name: /Your bag \(1\)/ })).toBeVisible()
  })

  test('a write the store answers with 404 keeps the bag while the store still has it, and forgets it once it is gone', async ({ page }) => {
    const product = pickProduct()
    await addToBag(page, product)
    const addOne = page.locator('#main').getByRole('button', { name: `Add one ${product.name}`, exact: true })
    // The line's product is gone (taken off the menu), not the bag.
    await page.route(/\/carts\/[^/]+\/items$/, (route) => route.fulfill({ status: 404, json: { detail: 'Product not found.' } }))
    await addOne.click()
    await expect(page.locator('.toast-error')).toBeVisible()
    await expectBag(page, 1)
    // Now the bag itself is gone too.
    await page.route(/\/carts\/[^/?]+$/, (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 404, json: { detail: 'Cart not found.' } }) : route.fallback()))
    await addOne.click()
    await expectBag(page, 0)
  })

  // A product taken off the menu: the store answers "not found" to removing it, yet its bag still lists it.
  // `answer(items, goneKey)` gives the status for a write, or 0 to let the store take it.
  const removesGone = (items, goneKey) => items.some((item) => item.purchaseKey === goneKey && item.quantityDelta < 0)
  const refuseGone = (items, goneKey) => (removesGone(items, goneKey) ? 404 : 0)
  async function bagOfTwo(page, answer = refuseGone) {
    const gone = pickProduct()
    const kept = pickProduct({ exclude: [gone.id] })
    // The first line added (it creates the bag, or joins an account's existing one).
    let goneKey = ''
    page.on('request', (request) => {
      const { pathname } = new URL(request.url())
      if (goneKey || !['POST', 'PATCH'].includes(request.method()) || !/\/carts(\/[^/]+\/items)?$/.test(pathname)) return
      const item = request.postDataJSON()?.items?.[0]
      if (item && Number(item.quantity ?? item.quantityDelta) > 0) goneKey = item.purchaseKey
    })
    await addToBag(page, gone)
    await page.goto(productPath(kept))
    await page.getByRole('button', { name: `Add to bag: ${kept.name}`, exact: true }).click()
    await expectBag(page, 2)
    await expect(page.getByText('Added to your bag')).toBeVisible()
    await page.route(/\/carts\/[^/]+\/items$/, (route) => {
      const status = answer(route.request().postDataJSON()?.items || [], goneKey)
      return status ? route.fulfill({ status, json: { detail: 'Refused.' } }) : route.fallback()
    })
    return { gone, kept }
  }

  test('a line the store can\'t remove (its product is gone) stays as the store has it, and the shopper is told', async ({ page }) => {
    const { gone } = await bagOfTwo(page)
    await page.goto('/maui/bag')
    await page.getByRole('button', { name: `Remove ${gone.name}`, exact: true }).click()
    await expect(page.locator('.toast-error')).toContainText(`${gone.name} is no longer available, and the store couldn’t change it in your bag.`)
    await expectBag(page, 2)
    await page.reload()
    await expectBag(page, 2)
  })

  test('Empty bag takes out what it can, and says which line the store kept', async ({ page }) => {
    const { gone } = await bagOfTwo(page)
    await page.goto('/maui/bag')
    await page.getByRole('button', { name: 'Empty bag', exact: true }).click()
    await expect(page.locator('.toast-error')).toContainText(`${gone.name} is no longer available`)
    await expectBag(page, 1)
    await expect(page.getByText('Bag cleared')).toHaveCount(0)
    await expect(page.locator('.bag-line-name')).toHaveText([gone.name])
    // With only that line left, Empty bag names it too, and still claims nothing it didn't do.
    await page.getByRole('button', { name: 'Dismiss message' }).click()
    await expect(page.locator('.toast')).toHaveCount(0)
    await page.getByRole('button', { name: 'Empty bag', exact: true }).click()
    await expect(page.locator('.toast-error')).toContainText(`${gone.name} is no longer available`)
    await expectBag(page, 1)
    await expect(page.getByText('Bag cleared')).toHaveCount(0)
  })

  test('Empty bag names how many lines the store kept, when it is more than one', async ({ page }) => {
    await bagOfTwo(page, (items) => (items.some((item) => item.quantityDelta < 0) ? 404 : 0))
    await page.goto('/maui/bag')
    await page.getByRole('button', { name: 'Empty bag', exact: true }).click()
    await expect(page.locator('.toast-error')).toContainText('2 items are no longer available, and the store couldn’t change them in your bag.')
    await expectBag(page, 2)
    await expect(page.getByText('Bag cleared')).toHaveCount(0)
  })

  test('Empty bag says so when a line could not be removed for another reason', async ({ page }) => {
    // The two-line write is refused, then the gone line's own write fails with a server error.
    await bagOfTwo(page, (items, goneKey) => {
      if (items.length > 1) return 404
      return removesGone(items, goneKey) ? 500 : 0
    })
    await page.goto('/maui/bag')
    await page.getByRole('button', { name: 'Empty bag', exact: true }).click()
    await expect(page.locator('.toast-error')).toHaveText(/Your bag could not be updated\. Try again\./)
    await expectBag(page, 1)
    await expect(page.getByText('Bag cleared')).toHaveCount(0)
  })

  test('removing the last unit can be undone', async ({ page }) => {
    const product = pickProduct()
    await addToBag(page, product)
    await page.locator('#main').getByRole('button', { name: `Remove ${product.name} from bag`, exact: true }).click()
    await expectBag(page, 0)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expectBag(page, 1)
  })

  test('the rail keeps its total and Checkout at the top while the bag scrolls', async ({ page }) => {
    // A short window, so the rail (line, pickup card, notes) has to scroll.
    await page.setViewportSize({ width: 1440, height: 480 })
    await addToBag(page, pickProduct())
    const rail = page.locator('.cart-rail')
    const checkout = rail.getByRole('button', { name: /Checkout/ })
    const head = rail.getByRole('heading', { name: /Your bag/ })
    // Before scrolling, the total and Checkout come right after the heading, ahead of the lines.
    const [headBox, checkoutBox, lineBox] = await Promise.all([head.boundingBox(), checkout.boundingBox(), rail.locator('.rail-line').first().boundingBox()])
    expect(checkoutBox.y).toBeGreaterThan(headBox.y)
    expect(checkoutBox.y).toBeLessThan(lineBox.y)
    await rail.evaluate((element) => { element.scrollTop = element.scrollHeight })
    expect(await rail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(checkout).toBeInViewport()
    await expect(head).toBeInViewport()
  })

  test('the bag page lists the line and links to checkout', async ({ page }) => {
    const product = pickProduct()
    await addToBag(page, product)
    await page.goto('/maui/bag')
    await expect(page.getByRole('heading', { level: 1, name: /Your bag \(1\)/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Checkout/ })).toHaveAttribute('href', '/maui/checkout')
    await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible()
  })
})
