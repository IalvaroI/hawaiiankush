import { test, expect } from './fixtures.js'
import { categories, categoryPath, populatedCategory, pickProduct, productDetails, products } from './data.js'
import { bySize } from '../../src/lib/sizes.js'

// The menu's own grid; the home page's carousels above it hold cards too.
const cards = (page) => page.locator('.product-grid:not(.product-carousel) article.product-card')
const resultCount = (page) => page.locator('.result-count')

test.describe('catalog', () => {
  test('home lists product cards and the total from the store', async ({ page }) => {
    await page.goto('/maui/')
    await expect(cards(page).first()).toBeVisible()
    await expect(cards(page)).toHaveCount(24)
    await expect(resultCount(page)).toContainText(`${products.items.length} products`)
  })

  test('a category pill opens that category page', async ({ page }) => {
    const category = populatedCategory()
    await page.goto('/maui/')
    await page.getByRole('navigation', { name: 'Product categories' }).getByRole('link', { name: category.name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/maui/c/.*-${category.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: /shop/ })).toBeAttached()
    await expect(cards(page).first()).toBeVisible()
    const expected = products.items.filter((item) => item.attributeIds?.categoryId === category.id).length
    await expect(resultCount(page)).toContainText(`${expected} product`)
    // A category is a page, not a filter: there is nothing to clear.
    await expect(page.getByRole('button', { name: /^Clear (search and )?filters$/ })).toHaveCount(0)
  })

  test('a category with nothing in stock says so and offers the menu, not a filter to clear', async ({ page }) => {
    const empty = categories.find((category) => !category.parentId && !products.items.some((item) => item.attributeIds?.categoryId === category.id))
    test.skip(!empty, 'every recorded category has products')
    await page.goto(categoryPath(empty))
    await expect(page.getByRole('heading', { name: `No products in ${empty.name} right now` })).toBeVisible()
    await expect(page.locator('.state-panel').getByRole('link', { name: 'Browse the menu' })).toHaveAttribute('href', '/maui/shop')
    await expect(page.getByRole('button', { name: /^Clear/ })).toHaveCount(0)
  })

  test('search narrows the list to matching names and shows the match count', async ({ page }) => {
    const term = pickProduct().name.split(' ')[0]
    const expected = products.items.filter((item) => item.name.toLowerCase().includes(term.toLowerCase())).length
    await page.goto('/maui/')
    await page.getByRole('searchbox', { name: 'Search products' }).fill(term)
    await expect(page).toHaveURL(new RegExp(`q=${term}`))
    await expect(resultCount(page)).toContainText(`${expected} product`)
    await expect(resultCount(page)).toContainText(`Results for “${term}”`)
    const titles = await page.locator('article.product-card .card-title').allTextContents()
    expect(titles.length).toBeGreaterThan(0)
    for (const title of titles) expect(title.toLowerCase()).toContain(term.toLowerCase())
  })

  test('a quick filter narrows the list, and removing its chip brings everything back', async ({ page }) => {
    await page.goto('/maui/')
    const total = products.items.length
    await page.getByLabel('Strain prevalence').selectOption({ label: 'Hybrid' })
    await expect(page).toHaveURL(/f\.strainPrevalence=/)
    await expect(page.getByRole('button', { name: 'Remove filter Hybrid' })).toBeVisible()
    await expect(resultCount(page)).not.toContainText(`${total} products`)
    await page.getByRole('button', { name: 'Remove filter Hybrid' }).click()
    await expect(page).not.toHaveURL(/f\.strainPrevalence=/)
    await expect(resultCount(page)).toContainText(`${total} products`)
  })

  test('a store without THC % and CBD % on its products offers no THC % sort or THC and CBD filters', async ({ page }) => {
    // Like the live store: every cannabis product indexed at 0%, so a 1–100% range finds nothing.
    await page.route(/\/api\/v2\/stores\/[^/]+\/products\?.*filters\.(thc|cbd)Range=/, (route) => route.fulfill({ json: { items: [], totalItems: 0, filters: [], sortingOptions: [], relations: {} } }))
    // A THC range in the link is ignored the way the sort is: no chip, and the menu is not emptied by it.
    await page.goto('/maui/shop?sort=thcPercentAsc&f.thcRange=10,20')
    await expect(cards(page).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Remove filter THC/ })).toHaveCount(0)
    const sort = page.getByLabel('Sort by')
    await expect(sort.locator('option', { hasText: 'Price' }).first()).toBeAttached()
    await expect(sort.locator('option', { hasText: /THC: (high|low)/ })).toHaveCount(0)
    await expect(sort).toHaveValue('popularityDesc')
    await expect(page.getByRole('button', { name: 'THC %' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Filters' }).click()
    const panel = page.getByRole('dialog', { name: 'Filters' })
    await expect(panel.locator('summary', { hasText: 'Strain type' })).toBeVisible()
    await expect(panel.locator('summary').filter({ hasText: /^(THC|CBD)$/ })).toHaveCount(0)
  })

  test('sort by price low to high puts the cheapest product first', async ({ page }) => {
    const price = (item) => Number(item.variants[0].prices.discounted ?? item.variants[0].prices.base)
    const cheapest = [...products.items].sort((a, b) => price(a) - price(b))[0]
    await page.goto('/maui/')
    await page.getByLabel('Sort by').selectOption('priceAsc')
    await expect(page).toHaveURL(/sort=priceAsc/)
    await expect(page.locator('article.product-card .card-title').first()).toHaveText(cheapest.name)
  })
})

test.describe('category images', () => {
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

  test('each category pill shows the image set for it in the store', async ({ page }) => {
    const withImage = categories.find((category) => category.images?.[0]?.source)
    await page.route((url) => url.hostname !== 'localhost' && /\.(png|jpe?g|webp)$/i.test(url.pathname), (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }))
    await page.goto('/maui/')
    const pill = page.locator('.cat-pill').filter({ hasText: withImage.name })
    await expect(pill.locator('img.cat-pill-image')).toHaveAttribute('src', withImage.images[0].source)
    await expect(pill.locator('img.cat-pill-image')).toBeVisible()
  })

  test('a category image that fails to load falls back to the icon', async ({ page }) => {
    const withImage = categories.find((category) => category.images?.[0]?.source)
    await page.goto('/maui/')
    const pill = page.locator('.cat-pill').filter({ hasText: withImage.name })
    await expect(pill.locator('svg')).toBeVisible()
    await expect(pill.locator('img')).toHaveCount(0)
  })
})

test.describe('filter panel scrolling', () => {
  test('the filter list scrolls inside the panel, and the page keeps its place and scrolls again after closing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 })
    await page.goto('/maui/')
    await expect(cards(page).first()).toBeVisible()
    // The carousels have filled in, so the page no longer changes height.
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo(0, 900))
    // A plain DOM click: Playwright's own click would first scroll the button into view and move the page.
    await page.getByRole('button', { name: /^Filters/ }).evaluate((button) => button.click())
    const list = page.locator('.filter-sections')
    await expect(list).toBeVisible()
    await page.$$eval('.filter-section', (sections) => sections.forEach((section) => { section.open = true }))
    const panel = await list.evaluate((element) => { element.scrollTop = 300; return { scrolled: element.scrollTop, fits: element.getBoundingClientRect().bottom <= window.innerHeight } })
    expect(panel.scrolled).toBe(300)
    expect(panel.fits).toBe(true)
    // While open, the page is pinned where it was.
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed')
    await page.getByRole('button', { name: 'Close filters' }).click()
    await expect(list).toHaveCount(0)
    const after = await page.evaluate(() => ({ y: window.scrollY, position: document.body.style.position, overflow: document.body.style.overflow }))
    expect(after).toEqual({ y: 900, position: '', overflow: '' })
    await page.evaluate(() => window.scrollTo(0, 1400))
    expect(await page.evaluate(() => window.scrollY)).toBe(1400)
  })
})

test.describe('deals and subcategories', () => {
  // A size with a deal of its own (not the store-wide one).
  const storeWideId = 'u5x1dsyq03b5ubcka6'
  const ownDeals = (item, variant) => {
    const detail = productDetails[item.id]
    const ids = (detail?.product?.variants || []).find((entry) => String(entry.id) === String(variant.id))?.promotionIds || []
    return ids.filter((id) => id !== storeWideId).map((id) => detail.relations?.promotions?.find((promotion) => promotion.id === id)?.name).filter(Boolean)
  }
  const dealProduct = products.items.find((item) => item.variants.some((variant) => ownDeals(item, variant).length))

  test('a card names the deals its size qualifies for', async ({ page }) => {
    test.skip(!dealProduct, 'No product with deals in the fixtures')
    const sizes = bySize(dealProduct.variants)
    const position = sizes.findIndex((variant) => ownDeals(dealProduct, variant).length)
    await page.goto(`/maui/shop?q=${encodeURIComponent(dealProduct.name)}`)
    // Matched by its link: another product may share the name.
    const card = page.locator('article.product-card').filter({ has: page.locator(`a[href$="-${dealProduct.id}"]`) })
    if (sizes.length > 1) await card.locator('.size-option').nth(position).click()
    await expect(card.locator('.card-deal')).toContainText(ownDeals(dealProduct, sizes[position])[0].slice(0, 16))
  })

  test('a store-wide deal is said once above the menu, not on every card', async ({ page }) => {
    // The fixtures' "10% Off Everything" covers 59 of 60 products, so it counts as store-wide.
    const storeWideId = 'u5x1dsyq03b5ubcka6'
    const onlyStoreWide = products.items.find((item) => {
      const variants = productDetails[item.id]?.product?.variants || []
      const unique = products.items.filter((other) => other.name.includes(item.name)).length === 1
      return unique && variants.length && variants.every((variant) => String(variant.promotionIds) === storeWideId)
    })
    await page.goto(`/maui/shop?q=${encodeURIComponent(onlyStoreWide.name)}`)
    await expect(page.getByRole('link', { name: /10% Off Everything\s*Thu–Sun\s*See deals/ })).toBeVisible()
    const card = page.locator('article.product-card').filter({ hasText: onlyStoreWide.name }).first()
    await expect(card.locator('.card-lab, .card-lab-note').first()).toBeVisible()
    await expect(card.locator('.card-deal')).toHaveCount(0)
    await expect(card.locator('.size-price.is-sale')).toHaveCount(0)
    await expect(card.locator('.badge', { hasText: 'Sale' })).toHaveCount(0)
  })

  test('a retry that learns less keeps what the last load learned: the store-wide banner stays', async ({ page }) => {
    // "Early Bird"'s own check fails, so the facts are asked again; that retry's promotions request fails too.
    await page.route(/\/products\?.*filters\.promotion=rwh5mstcnfcxdgzqf3/, (route) => route.fulfill({ status: 500, json: { detail: 'Store API error.' } }))
    let asked = 0
    await page.route(/\/api\/v2\/stores\/[^/]+\/promotions\?/, (route) => {
      asked += 1
      return asked === 1 ? route.fallback() : route.fulfill({ status: 500, json: { detail: 'Store API error.' } })
    })
    // The page's clock is moved on by hand, so the shop's 5 s wait before asking again passes at once.
    await page.clock.install()
    await page.goto('/maui/shop')
    const banner = page.getByRole('link', { name: /10% Off Everything\s*Thu–Sun\s*See deals/ })
    await expect(banner).toBeVisible()
    // The retry (after 5 s) and the client's own repeat of it have both failed.
    await expect.poll(async () => { await page.clock.fastForward(5000); return asked }).toBeGreaterThanOrEqual(3)
    await page.waitForTimeout(500)
    await expect(banner).toBeVisible()
  })

  test('a card shows Total THC from the lookup when the list carries only Total Terpenes', async ({ page }) => {
    // Sweed's list started sending each size's Total Terpenes with empty THC and CBD; the full figures come from the
    // product detail through the lookup.
    const hasThc = (variant) => (variant.compounds?.thc || []).some((entry) => entry?.values?.length)
    const tested = products.items.find((item) => {
      const detail = productDetails[item.id]?.product?.variants || []
      const first = bySize(item.variants)[0]
      return products.items.filter((other) => other.name.includes(item.name)).length === 1 && hasThc(detail.find((entry) => String(entry.id) === String(first.id)) || {})
    })
    test.skip(!tested, 'No product with THC figures in the fixtures')
    await page.route(/\/api\/v2\/stores\/[^/]+\/products\?/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      for (const item of body.items || []) for (const variant of item.variants || []) {
        variant.compounds = { thc: [], cbd: [], terpenes: [{ values: [2.5], uom: 'percent', label: 'Total Terpenes' }] }
      }
      await route.fulfill({ response, json: body })
    })
    await page.goto(`/maui/shop?q=${encodeURIComponent(tested.name)}`)
    const card = page.locator('article.product-card').filter({ has: page.locator(`a[href$="-${tested.id}"]`) })
    await expect(card.locator('.card-lab-stat').filter({ hasText: /THC/ })).toBeVisible()
  })

  test('a size without lab figures never borrows another size\'s, and says the figures are for other sizes', async ({ page }) => {
    const hasFigures = (variant) => Object.values(variant.compounds || {}).some((list) => list?.length)
    // Several sizes on the card (the list's variants), each with figures in the product detail.
    const tested = products.items.find((item) => {
      const detail = productDetails[item.id]?.product?.variants || []
      const tested = (variant) => hasFigures(detail.find((entry) => String(entry.id) === String(variant.id)) || {})
      return products.items.filter((other) => other.name.includes(item.name)).length === 1 && item.variants.length > 1 && item.variants.every(tested)
    })
    test.skip(!tested, 'No product with figures on several sizes in the fixtures')
    // The store has figures for every size but the first (a 3.5g with no lab result, say).
    const firstSize = String(tested.variants[0].id)
    // Both sources: the lookup and the list's own variants.
    await page.route(/\/api\/enrich\?/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      if (body.items?.[tested.id]) delete body.items[tested.id].compounds[firstSize]
      await route.fulfill({ response, json: body })
    })
    await page.route(/\/api\/v2\/stores\/[^/]+\/products\?/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      for (const item of body.items || []) for (const variant of item.variants || []) if (String(variant.id) === firstSize) delete variant.compounds
      await route.fulfill({ response, json: body })
    })
    // Judged once the lookup has answered: the list alone can already give the right note, and a lookup still being
    // rewritten when the test ends is cut off.
    const enriched = page.waitForResponse(/\/api\/enrich\?/)
    await page.goto(`/maui/shop?q=${encodeURIComponent(tested.name)}`)
    await enriched
    const card = page.locator('article.product-card').filter({ hasText: tested.name }).first()
    await expect(card.locator('.card-lab-note')).toHaveText('Lab figures not listed for this size')
    await expect(card.locator('.card-lab-stat')).toHaveCount(0)
  })

  test('a category with subcategories shows them as chips, also on each subcategory', async ({ page }) => {
    const [parent, child] = categories.filter((category) => products.items.some((item) => item.attributeIds?.categoryId === category.id))
    // The store has no subcategories; give one category a child here.
    await page.route(/\/api\/v2\/stores\/[^/]+\/categories\?/, async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      body.items = body.items.filter((item) => item.id !== child.id).map((item) => (item.id === parent.id ? { ...item, children: [{ ...child, children: [] }] } : item))
      await route.fulfill({ response, json: body })
    })
    await page.goto('/maui/')
    await page.getByRole('navigation', { name: 'Product categories' }).getByRole('link', { name: parent.name, exact: true }).click()
    const chips = page.getByRole('navigation', { name: `${parent.name} subcategories` })
    await expect(chips.getByRole('link', { name: `All ${parent.name}` })).toHaveAttribute('aria-current', 'page')
    await chips.getByRole('link', { name: child.name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/maui/c/.*-${child.id}$`))
    await expect(chips.getByRole('link', { name: child.name, exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.result-count')).toContainText(child.name)
  })
})
