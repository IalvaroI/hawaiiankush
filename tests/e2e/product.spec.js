import { test, expect } from './fixtures.js'
import { pickProduct, productDetails, productPath } from './data.js'
import { joinSlugId } from '../../shared/slug.js'
import { NOT_FOR_PICKING } from '../../src/features/picker/pickerModel.js'

test.describe('product page', () => {
  test('renders the name, a price and an add button', async ({ page }) => {
    const product = pickProduct()
    await page.goto(productPath(product))
    await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible()
    await expect(page.locator('.pd-layout').getByRole('button', { name: `Add to bag: ${product.name}` })).toBeEnabled()
  })

  test('picking another size changes the price and the variant in the URL', async ({ page }) => {
    const product = pickProduct({ minVariants: 2 })
    const [, second] = product.variants
    await page.goto(productPath(product))
    const size = page.locator('.pd-size').nth(1)
    await size.click()
    await expect(size).toHaveAttribute('aria-pressed', 'true')
    await expect(page).toHaveURL(new RegExp(`variant=${second.id}`))
    const shown = Number(second.prices.discounted ?? second.prices.base)
    await expect(page.locator('.pd-info')).toContainText(`$${shown}`)
  })

  test('an attribute chip opens the catalog filtered by it', async ({ page }) => {
    const product = pickProduct({ where: (detail) => (detail.attributes?.effects || []).length > 0 })
    await page.goto(productPath(product))
    const effect = page.locator('a[href*="f.effect="]').first()
    await expect(effect).toBeVisible()
    const label = (await effect.textContent())?.trim()
    await effect.click()
    await expect(page).toHaveURL(/f\.effect=/)
    await expect(page.getByRole('button', { name: `Remove filter ${label}` })).toBeVisible()
    await expect(page.locator('article.product-card').first()).toBeVisible()
  })

  test('a wrong name in the URL is corrected to the right one', async ({ page }) => {
    const product = pickProduct()
    await page.goto(`/maui/p/wrong-name-${product.id}`)
    await expect(page).toHaveURL(new RegExp(`/maui/p/${joinSlugId(product.name, product.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    await expect(page.getByRole('heading', { level: 1, name: product.name })).toBeVisible()
  })

  test('red is for a deal of the product\'s own: a store-wide deal lowers the price in the normal colour', async ({ page }) => {
    // The fixtures' "10% Off Everything" covers 59 of 60 products, so it counts as store-wide.
    const storeWideId = 'u5x1dsyq03b5ubcka6'
    const lowered = (variant) => variant.prices?.discounted != null && Number(variant.prices.discounted) < Number(variant.prices.base)
    const only = pickProduct({ minVariants: 2, where: (detail) => (detail.variants || []).every((variant) => lowered(variant) && String(variant.promotionIds) === storeWideId) })
    await page.goto(productPath(only))
    // Full promotion names come with the store-wide list; once it shows, the colours are final.
    await expect(page.locator('.pd-promos')).toContainText('10% Off Everything')
    await expect(page.locator('.pd-price del')).toBeVisible()
    await expect(page.locator('.pd-price strong')).not.toHaveClass(/is-sale/)
    await expect(page.locator('.pd-size strong.is-sale')).toHaveCount(0)

    // A size with a deal of its own as well (its product shares a name with another, so it is found by its sizes).
    const ownDeal = (variant) => lowered(variant) && (variant.promotionIds || []).some((id) => String(id) !== storeWideId)
    const own = Object.values(productDetails).map((detail) => detail.product).find((product) => product.variants.some(ownDeal))
    await page.goto(`${productPath(own)}?variant=${own.variants.find(ownDeal).id}`)
    await expect(page.locator('.pd-promos')).toContainText('10% Off Everything')
    await expect(page.locator('.pd-price strong')).toHaveClass(/is-sale/)
  })

  test('when the promotions can\'t be read, a store-wide price stays plain on the product page and the cards, and is asked again', async ({ page }) => {
    const storeWideId = 'u5x1dsyq03b5ubcka6'
    const lowered = (variant) => variant.prices?.discounted != null && Number(variant.prices.discounted) < Number(variant.prices.base)
    const only = pickProduct({ where: (detail) => (detail.variants || []).length > 0 && detail.variants.every((variant) => lowered(variant) && String(variant.promotionIds) === storeWideId) })
    let asked = 0
    await page.route(/\/api\/v2\/stores\/[^/]+\/promotions\?/, (route) => { asked += 1; return route.fulfill({ status: 500, json: { detail: 'Store API error.' } }) })
    // The page's clock is moved on by hand, so the shop's 5 s wait before asking again passes at once.
    await page.clock.install()
    await page.goto(productPath(only))
    await expect(page.locator('.pd-price del')).toBeVisible()
    // The client retries a failed read once; a third request is the shop asking again on its own, after the first
    // answer has been shown.
    await expect.poll(async () => { await page.clock.fastForward(5000); return asked }).toBeGreaterThanOrEqual(3)
    await expect(page.locator('.pd-price strong')).not.toHaveClass(/is-sale/)
    await expect(page.locator('.pd-size strong.is-sale')).toHaveCount(0)

    asked = 0
    const enriched = page.waitForResponse(/\/api\/enrich\?/)
    await page.goto(`/maui/shop?q=${encodeURIComponent(only.name)}`)
    const card = page.locator('article.product-card').filter({ has: page.locator(`a[href$="-${only.id}"]`) })
    await expect(card).toBeVisible()
    // The card's own deals are in, and the failed answer has been shown (asked again, as above).
    await enriched
    await expect.poll(async () => { await page.clock.fastForward(5000); return asked }).toBeGreaterThanOrEqual(3)
    await expect(card.locator('.size-price.is-sale')).toHaveCount(0)
    await expect(card.locator('.badge', { hasText: 'Sale' })).toHaveCount(0)
  })

  test('when one promotion\'s size check fails, only that promotion is kept plain: other products\' own deals stay red', async ({ page }) => {
    const storeWideId = 'u5x1dsyq03b5ubcka6'
    // The check that tells "10% Off Everything" is store-wide fails; the other promotion's check works.
    await page.route(new RegExp(`/products\\?.*filters\\.promotion=${storeWideId}`), (route) => route.fulfill({ status: 500, json: { detail: 'Store API error.' } }))
    const lowered = (variant) => variant.prices?.discounted != null && Number(variant.prices.discounted) < Number(variant.prices.base)
    const ownDeal = (variant) => lowered(variant) && (variant.promotionIds || []).some((id) => String(id) !== storeWideId)
    const own = Object.values(productDetails).map((detail) => detail.product).find((product) => product.variants.some(ownDeal))
    await page.goto(`${productPath(own)}?variant=${own.variants.find(ownDeal).id}`)
    // Full promotion names arrive with the promotions list, so the answer is in.
    await expect(page.locator('.pd-promos')).toContainText('10% Off Everything')
    await expect(page.locator('.pd-price strong')).toHaveClass(/is-sale/)
    const only = pickProduct({ where: (detail) => (detail.variants || []).length > 0 && detail.variants.every((variant) => lowered(variant) && String(variant.promotionIds) === storeWideId) })
    await page.goto(productPath(only))
    await expect(page.locator('.pd-promos')).toContainText('10% Off Everything')
    await expect(page.locator('.pd-price strong')).not.toHaveClass(/is-sale/)
  })

  test('a size without lab figures says so, and never shows another size\'s', async ({ page }) => {
    const hasFigures = (variant) => ['thc', 'cbd', 'terpenes'].some((key) => (variant.compounds?.[key] || []).some((entry) => entry?.values?.length))
    const product = pickProduct({ minVariants: 2, where: (detail) => (detail.variants || []).length > 1 && detail.variants.every(hasFigures) && !NOT_FOR_PICKING.test(detail.attributes?.category?.name || '') })
    const [untested, tested] = productDetails[product.id].product.variants
    // The store has no lab result for one size (a new batch, say).
    await page.route(/\/api\/v2\/stores\/[^/]+\/products\/[^/?]+\?/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      for (const variant of body.product?.variants || []) if (String(variant.id) === String(untested.id)) delete variant.compounds
      await route.fulfill({ response, json: body })
    })
    await page.goto(`${productPath(product)}?variant=${untested.id}`)
    await expect(page.locator('.pd-lab-none')).toHaveText('Lab figures not listed for this size')
    await expect(page.locator('.pd-profile')).toHaveCount(0)
    await page.goto(`${productPath(product)}?variant=${tested.id}`)
    await expect(page.locator('.pd-profile')).toBeVisible()
    await expect(page.locator('.pd-lab-none')).toHaveCount(0)
  })

  test('an unknown product shows the not-found page', async ({ page }) => {
    await page.goto('/maui/p/no-such-product-zq9xw7lk2mn4pb8c')
    await expect(page.getByRole('heading', { name: /not found|can.t find/i }).first()).toBeVisible()
  })
})
