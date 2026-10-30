import { test, expect } from './fixtures.js'
import { pickProduct, productPath } from './data.js'

// A lab result with the parts of total THC and six terpenes, as a flower would carry it. The recorded store has no
// terpene data yet, so these tests put it on a real product's answer.
const LAB = {
  thc: [{ label: 'THC', values: [0.8], uom: 'percent' }, { label: 'THCA', values: [26], uom: 'percent' }],
  cbd: [{ label: 'CBG', values: [0.9], uom: 'percent' }],
  terpenes: [
    { label: 'Limonene', values: [0.6], uom: 'percent' },
    { label: 'Myrcene', values: [1.2], uom: 'percent' },
    { label: 'Caryophyllene', values: [0.45], uom: 'percent' },
    { label: 'Linalool', values: [0.2], uom: 'percent' },
    { label: 'Pinene', values: [0.15], uom: 'percent' },
    { label: 'Humulene', values: [0.1], uom: 'percent' },
  ],
}

const withLab = (product) => ({ ...product, variants: product.variants.map((variant) => ({ ...variant, compounds: LAB })) })

// Rewrites the store's answers so `productId` carries the lab result, in lists and on its own page.
async function giveLab(page, productId) {
  await page.route(/\/api\/v2\/stores\/[^/]+\/products(\/[^/?]+)?(\?|$)/, async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    if (body.product?.id === productId) body.product = withLab(body.product)
    if (Array.isArray(body.items)) body.items = body.items.map((item) => (item.id === productId ? withLab(item) : item))
    await route.fulfill({ response, json: body })
  })
}

test.describe('potency and terpenes', () => {
  test('a product page leads with total THC, total terpenes and the terpene bars', async ({ page }) => {
    const product = pickProduct()
    await giveLab(page, product.id)
    await page.goto(productPath(product))
    const panel = page.locator('.pd-profile')
    await expect(panel.locator('.pd-stat.is-thc')).toContainText('Total THC')
    await expect(panel.locator('.pd-stat.is-thc dd')).toHaveText('23.6%')
    await expect(panel.locator('.pd-stat.is-terpenes dd')).toHaveText('2.7%')
    await expect(panel.locator('.pd-stat.is-cbd')).toHaveCount(0)
    await expect(panel.locator('.pd-lab')).toContainText('THCA')
    await expect(panel.locator('.pd-lab')).toContainText('CBG')
    await expect(panel.locator('.pd-terpene-bars li').nth(1)).toContainText('0.6%')
    await expect(panel.locator('.pd-terpene-bars li')).toHaveCount(5)
    await expect(panel.locator('.pd-terpene-bars li').first()).toContainText('Myrcene')
    await panel.getByRole('button', { name: 'Show all 6 terpenes' }).click()
    await expect(panel.locator('.pd-terpene-bars li')).toHaveCount(6)
    await expect(panel).toContainText('Total THC = THC + 0.877 × THCA')
    // Above the price: the panel comes before the pricing block.
    const order = await page.locator('.pd-info').evaluate((info) => {
      const profile = info.querySelector('.pd-profile')
      const pricing = info.querySelector('.pd-pricing')
      return Boolean(profile.compareDocumentPosition(pricing) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(order).toBe(true)
  })

  test('menu cards show total THC, total terpenes and the top terpenes', async ({ page }) => {
    const product = pickProduct()
    await giveLab(page, product.id)
    await page.goto(`/maui/shop?q=${encodeURIComponent(product.name)}`)
    const card = page.locator('article.product-card').filter({ hasText: product.name }).first()
    await expect(card.locator('.card-lab-stat.is-thc')).toHaveText(/Total THC\s*23\.6%/)
    await expect(card.locator('.card-lab-stat.is-terpenes')).toHaveText(/Total terpenes\s*2\.7%/)
    await expect(card.locator('.card-terp-names')).toHaveText('Myrcene · Limonene · Caryophyllene')
    await expect(card.locator('.card-terp-seg')).toHaveCount(3)
  })

  // Flower carries its lab figures only on the product detail, which the server's enrichment lookup reads; the
  // catalog list has none. The card must take them from there.
  test('a card takes lab figures from the enrichment lookup when the list has none', async ({ page }) => {
    const product = pickProduct({ where: (detail) => !(detail.variants || []).some((variant) => variant.compounds?.thc?.length) })
    const lab = { thc: LAB.thc, cbd: [], terpenes: [{ label: 'Total Terpenes', values: [2.99], uom: 'percent' }, { label: 'B-Caryophyllene', values: [0.678], uom: 'percent' }, { label: 'Limonene', values: [0.607], uom: 'percent' }, { label: 'B-Myrcene', values: [0.551], uom: 'percent' }, { label: 'A-Pinene', values: [0.06], uom: 'percent' }] }
    await page.route(/\/api\/enrich\?/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.items[product.id] = { ...(body.items[product.id] || { effects: [], tags: [] }), compounds: Object.fromEntries(product.variants.map((variant) => [variant.id, lab])) }
      await route.fulfill({ response, json: body })
    })
    await page.goto(`/maui/shop?q=${encodeURIComponent(product.name)}`)
    const card = page.locator('article.product-card').filter({ hasText: product.name }).first()
    await expect(card.locator('.card-lab-stat.is-thc dd')).toHaveText('23.6%')
    await expect(card.locator('.card-lab-stat.is-terpenes dd')).toHaveText('2.99%')
    await expect(card.locator('.card-terp-names')).toHaveText('Caryophyllene · Limonene · Myrcene')
  })

  test('an edible shows its THC in milligrams on the card and the page', async ({ page }) => {
    const product = pickProduct({ where: (detail) => detail.variants?.[0]?.compounds?.thc?.[0]?.uom === 'milligram' })
    const expected = `${product.variants[0].compounds.thc[0].values[0]}\u00a0mg`
    await page.goto(productPath(product))
    await expect(page.locator('.pd-profile .pd-stat.is-thc dd')).toHaveText(expected)
    await expect(page.locator('.pd-profile .pd-stat.is-terpenes')).toHaveCount(0)
    await page.goto(`/maui/shop?q=${encodeURIComponent(product.name)}`)
    const card = page.locator('article.product-card').filter({ hasText: product.name }).first()
    await expect(card.locator('.card-lab-stat.is-thc')).toHaveText(new RegExp(`THC\\s*${expected}`))
  })
})
