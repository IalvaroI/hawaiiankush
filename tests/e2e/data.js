// Reads the recorded fixtures (tests/fixtures/) so specs pick real products, categories and brands without hardcoding ids.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { joinSlugId } from '../../shared/slug.js'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))

export const store = read('store.json').store
export const categories = read('categories.json').categories
export const products = read('products.json')
export const productDetails = read('product-details.json')
export const brands = read('brands.json').items
export const promotions = read('promotions.json').items
export const carousels = read('carousels.json').items
export const delivery = read('delivery.json')

// A product whose default variant can be bought, with a name no other product shares (so "Add X to bag" is unique).
// `where` filters on the product detail (attributes such as effects).
// `minStock` asks for at least that many units of the default size (a test that adds more than one).
export function pickProduct({ minVariants = 1, minStock = 1, exclude = [], where = () => true } = {}) {
  const counts = new Map()
  for (const item of products.items) counts.set(item.name, (counts.get(item.name) || 0) + 1)
  const found = products.items.find((item) => counts.get(item.name) === 1
    && item.variants.length >= minVariants
    && Number(item.variants[0].stock?.quantity) >= minStock
    && !exclude.includes(item.id)
    && where(productDetails[item.id]?.product || {}))
  if (!found) throw new Error('No suitable product in the fixtures')
  return found
}

export const productPath = (product) => `/maui/p/${joinSlugId(product.name, product.id)}`
export const categoryPath = (category) => `/maui/c/${joinSlugId(category.name, category.id)}`
export const brandPath = (brand) => `/maui/b/${joinSlugId(brand.name, brand.id)}`

// The category shown as a pill on the home page, with at least a few products in the fixtures.
export function populatedCategory() {
  const counted = categories.map((category) => ({
    category,
    count: products.items.filter((item) => item.attributeIds?.categoryId === category.id).length,
  }))
  const best = counted.sort((a, b) => b.count - a.count)[0]
  if (!best || best.count < 2) throw new Error('No populated category in the fixtures')
  return best.category
}
