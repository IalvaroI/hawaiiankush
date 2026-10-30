import { test, expect } from './fixtures.js'
import { categories, populatedCategory, productDetails, products } from './data.js'

const answer = (page, name) => page.locator('.pk-options').getByRole('button', { name, exact: false })

// A category and an effect that at least one in-stock product of that category has, so the quiz ends with real matches.
function matchingAnswers() {
  const effectOptions = products.filters.find((filter) => filter.key === 'effect').options
  for (const item of products.items) {
    if (!item.variants.some((variant) => Number(variant.stock?.quantity ?? 1) > 0)) continue
    const category = categories.find((entry) => entry.id === item.attributeIds?.categoryId)
    const effects = (productDetails[item.id]?.product?.attributes?.effects || []).map((effect) => effect.name)
    const effect = effectOptions.find((option) => effects.includes(option.name))
    if (category && effect && !/accessor|apparel|gift|pet/i.test(category.name)) return { category, effect }
  }
  throw new Error('No category and effect pair in the fixtures')
}

test.describe('product finder', () => {
  test('the quiz runs on catalog questions when the store’s AI-Picker fails, and ends with ranked matches', async ({ page }) => {
    const { category, effect } = matchingAnswers()
    await page.goto('/maui/')
    await page.getByRole('link', { name: 'Not sure? Find your match' }).click()
    await expect(page).toHaveURL(/\/maui\/picker$/)

    // Question 1: categories with their names; accessories and the like are not offered.
    await expect(page.getByRole('heading', { level: 1, name: 'What are you shopping for?' })).toBeVisible()
    await expect(page.locator('.pk-options')).not.toContainText('Accessories')
    await answer(page, category.name).click()

    // Question 2 follows at once; effects allow two answers and a Next button.
    await expect(page.getByRole('heading', { level: 1, name: 'How do you want to feel?' })).toBeVisible()
    await answer(page, effect.name).click()
    await expect(answer(page, effect.name)).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Any flavours you love?' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'How strong?' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()

    await expect(page).toHaveURL(new RegExp(`step=results`))
    await expect(page.getByRole('heading', { level: 1, name: 'Picked for you' })).toBeVisible()
    await expect(page.locator('.pk-summary')).toContainText(category.name)
    await expect(page.locator('.pk-summary')).toContainText(effect.name)
    await expect(page.locator('article.product-card').first()).toBeVisible()
    await expect(page.locator('.card-match strong').first()).toHaveText(/\d+% match/)
  })

  test('Back steps through the questions, and a summary chip goes back to edit that answer', async ({ page }) => {
    const category = populatedCategory()
    await page.goto('/maui/picker')
    await answer(page, category.name).click()
    await expect(page.getByRole('heading', { level: 1, name: 'How do you want to feel?' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'What are you shopping for?' })).toBeVisible()
    await expect(answer(page, category.name)).toHaveAttribute('aria-pressed', 'true')

    await page.goto(`/maui/picker?category=${category.id}&step=results`)
    await expect(page.getByRole('heading', { level: 1, name: 'Picked for you' })).toBeVisible()
    await page.locator('.pk-summary').getByRole('button', { name: new RegExp(category.name) }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'What are you shopping for?' })).toBeVisible()
  })

  test('the store’s own AI-Picker questions and ranking are used when it answers', async ({ page }) => {
    const ranked = products.items.slice(0, 3)
    await page.route(/\/api\/v2\/stores\/[^/]+\/upsells\/ai-picker\?/, (route) => route.fulfill({ json: { aiPicker: { questions: [
      { type: 'category', filter: { key: 'category', name: 'Category', type: 'multiple', options: [{ name: 'Night in', value: 'ans-1', icon: { image: { source: 'https://img.example/night.png' } } }] } },
      { type: 'effect', filter: { key: 'effect', name: 'Effect', type: 'multiple', options: [{ name: 'Sleepy', value: 'ans-2', icon: { image: { source: 'https://img.example/sleep.png' } } }] } },
    ] } } }))
    let asked = ''
    await page.route(/\/api\/v2\/stores\/[^/]+\/upsells\/ai-picker\/products\?/, (route) => {
      asked = new URL(route.request().url()).search
      return route.fulfill({ json: { relations: products.relations, items: ranked.map((product, index) => ({ product, match: { percent: 91 - index, appliedFilters: [{ key: 'category', values: ['ans-1'] }, { key: 'effect', values: ['ans-2'] }] } })) } })
    })
    await page.goto('/maui/picker')
    await answer(page, 'Night in').click()
    await answer(page, 'Sleepy').click()
    await page.getByRole('button', { name: 'See my matches' }).click()
    await expect(page.locator('.card-match').first()).toContainText('91% match')
    await expect(page.locator('.card-match').first()).toContainText('Sleepy')
    expect(asked).toContain('filters.category=ans-1')
    expect(asked).toContain('filters.effect=ans-2')
  })
})
