import { test, expect } from './fixtures.js'
import { pickProduct, productPath } from './data.js'
import { joinSlugId } from '../../shared/slug.js'

// These check the HTML the server sends before any script runs: titles, canonical links and structured data.
test.describe('server-rendered head tags', () => {
  test('a product page carries its own title, canonical link and JSON-LD', async ({ request }) => {
    const product = pickProduct()
    const response = await request.get(productPath(product))
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`<title>${product.name}`)
    expect(html).toContain(`<link rel="canonical" href="http://localhost:4100/maui/p/${joinSlugId(product.name, product.id)}"`)
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(match).not.toBeNull()
    const data = JSON.parse(match[1])
    expect(data['@type']).toBe('Product')
    expect(data.name).toBe(product.name)
  })

  test('an unknown product answers 404 with noindex', async ({ request }) => {
    const response = await request.get('/maui/p/no-such-product-zq9xw7lk2mn4pb8c')
    expect(response.status()).toBe(404)
    expect(await response.text()).toContain('<meta name="robots" content="noindex">')
  })
})
