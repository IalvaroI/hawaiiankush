import { test, expect } from './fixtures.js'

// Strict layout rules for product cards, checked in the rendered page:
// 1. In each row of cards, every part (lab block, effects, sizes, button) starts at the same height, and titles end on
//    the same line.
// 2. Lab boxes in a row have the same height.
// 3. Inside the lab box, one line per figure: every value starts on the same edge, down the card and across the row,
//    clear of its label; Total THC sits at the same height across a row; nothing overflows or takes more than two label
//    lines; and the terpene line sits at the same height.
// 4. A card's parts share one left edge.
// 5. Every category pill, filter control and the sort control is on screen (none hidden off the side).
// 6. Size buttons fill each line they sit on: a button that wraps spans the line instead of leaving a gap.
// 8. No size label is cut off, and up to three short sizes sit on one line.
// 7. No hidden gaps: a row a card leaves empty adds no space (the grid has no row gap inside cards), so the title sits
//    one image margin below the image (the row's longest title does; shorter ones end level with it).
const pct = (label, value) => ({ label, values: [value], uom: 'percent' })
const LABS = [
  { thc: [pct('THC', 1.4), pct('THCA', 29.9)], cbd: [], terpenes: [pct('Total Terpenes', 2.99), pct('B-Caryophyllene', 0.68), pct('Limonene', 0.61), pct('B-Myrcene', 0.55)] },
  { thc: [pct('Total THC', 9.2)], cbd: [pct('CBD', 12.4)], terpenes: [pct('Myrcene', 0.4), pct('Pinene', 0.2)] },
  { thc: [pct('THC', 0.8), pct('THCA', 24), pct('THCA', 27)], cbd: [], terpenes: [pct('Terpinolene', 1.1), pct('Ocimene', 0.3)] },
]

async function varyLabs(page) {
  await page.route(/\/api\/v2\/stores\/[^/]+\/products\?/, async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    body.items = body.items.map((item, index) => (index % 4 === 3 ? item : { ...item, variants: item.variants.map((variant) => ({ ...variant, compounds: LABS[index % LABS.length] })) }))
    await route.fulfill({ response, json: body })
  })
}

async function measure(page) {
  return page.evaluate(() => {
    const box = (element) => element && element.getBoundingClientRect()
    return [...document.querySelectorAll('.product-grid:not(.product-carousel) article.product-card')].map((card) => {
      const part = (selector) => box(card.querySelector(selector))
      const c = box(card)
      return {
        name: card.querySelector('.card-title')?.textContent,
        top: Math.round(c.top), left: c.left,
        cutLabels: [...card.querySelectorAll('.size-label')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
        wrappedShortSizes: (() => { const buttons = [...card.querySelectorAll('.size-options:not(.has-long-labels) .size-option')]; return buttons.length > 0 && buttons.length <= 3 && new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top))).size > 1 })(),
        media: part('.card-media'), title: part('.card-title'), lab: part('.card-lab'), effects: part('.effect-chips'),
        sizes: part('.size-options, .size-single'), cart: part('.card-cart'),
        thc: part('.card-lab-stat.is-thc'), terpenes: part('.card-lab-stat.is-terpenes'), terps: part('.card-terps'),
        thcValue: part('.card-lab-stat.is-thc dd'),
        stats: [...card.querySelectorAll('.card-lab-stat')].map((stat) => {
          const dt = stat.querySelector('dt')
          const dd = stat.querySelector('dd')
          // The label's text box (a Range), not the label element, which may be taller than its text.
          const range = document.createRange()
          range.selectNodeContents(dt)
          const text = range.getBoundingClientRect()
          return {
            kind: stat.className, cell: box(stat), label: text, value: box(dd),
            labelLines: Math.round(text.height / parseFloat(getComputedStyle(dt).lineHeight)),
            overflow: dt.scrollWidth > dt.clientWidth + 0.5 || dd.scrollWidth > dd.clientWidth + 0.5,
          }
        }),
        sizeLines: [...card.querySelectorAll('.size-options')].flatMap((group) => {
          const g = box(group)
          const lines = new Map()
          for (const button of group.querySelectorAll('.size-option')) {
            const b = box(button)
            const key = [...lines.keys()].find((top) => Math.abs(top - b.top) <= 1) ?? b.top
            lines.set(key, [...(lines.get(key) || []), b])
          }
          return [...lines.values()].map((line) => ({ left: Math.min(...line.map((b) => b.left)) - g.left, right: g.right - Math.max(...line.map((b) => b.right)) }))
        }),
      }
    })
  })
}

function rows(cards) {
  const byTop = new Map()
  for (const card of cards) {
    const key = [...byTop.keys()].find((top) => Math.abs(top - card.top) <= 1) ?? card.top
    byTop.set(key, [...(byTop.get(key) || []), card])
  }
  return [...byTop.values()].filter((row) => row.length > 1)
}

const same = (values, what) => {
  const list = values.filter((value) => value != null)
  if (list.length < 2) return
  expect(Math.max(...list) - Math.min(...list), what).toBeLessThanOrEqual(1)
}

for (const [size, viewport] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  test(`product cards line up across each row (${size})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await varyLabs(page)
    await page.goto('/maui/')
    await expect(page.locator('.card-lab').first()).toBeVisible()
    const grid = await rows(await measure(page))
    expect(grid.length).toBeGreaterThan(1)
    for (const row of grid) {
      const names = row.map((card) => card.name).join(', ')
      for (const part of ['lab', 'effects', 'sizes', 'cart']) same(row.map((card) => card[part]?.top), `${part} top in row: ${names}`)
      // Titles end on the same line, so every brand sits right under its name.
      same(row.map((card) => card.title?.bottom), `title bottom in row: ${names}`)
      same(row.map((card) => card.lab?.height), `lab height in row: ${names}`)
      same(row.map((card) => card.terps?.top), `terpene line in row: ${names}`)
      same(row.map((card) => card.thcValue?.bottom), `Total THC value baseline in row: ${names}`)
      same(row.flatMap((card) => card.stats.map((stat) => stat.value.left - card.left)), `value column in row: ${names}`)
      same(row.map((card) => (card.thc ? card.thc.left - card.left : null)), `Total THC column in row: ${names}`)
      same(row.map((card) => (card.terpenes ? card.terpenes.left - card.left : null)), `Terpenes column in row: ${names}`)
      for (const card of row) same(['title', 'lab', 'sizes', 'cart'].map((part) => card[part]?.left), `left edge of parts in ${card.name}`)
      for (const card of row) for (const line of card.sizeLines) same([line.left, line.right, 0], `size buttons fill their line in ${card.name}`)
      expect(Math.min(...row.map((card) => card.title.top - card.media.bottom)), `space under the image in row: ${names}`).toBeLessThanOrEqual(13)
      for (const card of row) expect(card.cutLabels, `size labels shown in full in ${card.name}`).toEqual([])
      for (const card of row) expect(card.wrappedShortSizes, `up to three short sizes on one line in ${card.name}`).toBe(false)
      for (const card of row) {
        for (const stat of card.stats) {
          const what = `${stat.kind} in ${card.name}`
          same([stat.cell.left, stat.label.left], `label on the lab box's left edge, ${what}`)
          expect(stat.value.left, `value clear of its label, ${what}`).toBeGreaterThanOrEqual(stat.label.right)
          expect(stat.overflow, `nothing overflows, ${what}`).toBe(false)
          expect(stat.labelLines, `label lines, ${what}`).toBeLessThanOrEqual(2)
        }
      }
    }
  })

  test(`every category and filter control is on screen (${size})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/maui/')
    await expect(page.locator('.cat-pill').first()).toBeVisible()
    // Desktop: every sidebar item sits on one line, inside the sidebar.
    if (size === 'desktop') {
      const nav = await page.locator('.sidebar .nav-link').evaluateAll((links) => links.map((link) => ({ wrapped: link.getBoundingClientRect().height > 48, overflow: link.scrollWidth > link.clientWidth + 1 })))
      for (const link of nav) expect(link).toEqual({ wrapped: false, overflow: false })
    }
    await expect(page.getByRole('button', { name: 'Filters' })).toBeVisible()
    await expect(page.getByLabel('Sort by')).toBeVisible()
    // Phones: the category pills are one row that scrolls sideways with a fading edge, so they are checked for being
    // reachable (every pill inside the row's scroll area) rather than on screen; the filter controls must be on screen.
    if (size === 'phone') {
      const row = await page.locator('.cat-pills').evaluate((el) => ({ scrollable: getComputedStyle(el).overflowX === 'auto', fits: [...el.children].every((pill) => pill.offsetLeft + pill.offsetWidth <= el.scrollWidth + 1) }))
      expect(row).toEqual({ scrollable: true, fits: true })
    }
    const offscreen = await page.$$eval(size === 'phone' ? '.filter-bar > *, .sort-control' : '.cat-pill, .filter-bar > *, .sort-control', (items) => items
      .map((item) => [item, item.getBoundingClientRect()])
      .filter(([, r]) => r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5))
      .map(([item]) => item.textContent))
    expect(offscreen).toEqual([])
  })
}
