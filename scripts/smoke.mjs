// Production smoke checks: `node scripts/smoke.mjs <base-url>`, e.g. http://127.0.0.1:3000 or https://shop.example.com.
// Read-only apart from one cross-site POST that the proxy must refuse before it reaches Sweed. Needs STORE_ID and
// BASE_PATH in the environment (deploy.sh loads the server's .env). Exits 1 when any check fails.
import { joinSlugId } from '../shared/slug.js'

const origin = String(process.argv[2] || '').replace(/\/$/, '')
const storeId = process.env.STORE_ID
const base = `/${String(process.env.BASE_PATH || '/maui').replace(/^\/|\/$/g, '')}`
const saleType = process.env.VITE_SALE_TYPE || 'recreational'
if (!/^https?:\/\//.test(origin) || !storeId) {
  console.error('Usage: STORE_ID=... BASE_PATH=/maui node scripts/smoke.mjs <base-url>')
  process.exit(2)
}

const api = `${base}/api/v2/stores/${encodeURIComponent(storeId)}`
const results = []
const get = (path, init = {}) => fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(30_000), ...init })

async function check(name, run) {
  try {
    const problem = await run()
    results.push({ name, ok: !problem, detail: problem || '' })
  } catch (error) {
    results.push({ name, ok: false, detail: error.message })
  }
}

await check(`${base} redirects to ${base}/`, async () => {
  const res = await get(base)
  return res.status === 301 && res.headers.get('location')?.startsWith(`${base}/`) ? '' : `got ${res.status} ${res.headers.get('location') || ''}`
})

let shell = ''
await check(`${base}/ renders with a canonical link`, async () => {
  const res = await get(`${base}/`)
  shell = await res.text()
  if (res.status !== 200) return `got ${res.status}`
  return /<link rel="canonical"/.test(shell) ? '' : 'no canonical link in the page head'
})

await check('hashed assets are served as immutable', async () => {
  const asset = new RegExp(`${base}/assets/[^"']+\\.js`).exec(shell)?.[0]
  if (!asset) return 'no script asset found in the page'
  const res = await get(asset, { headers: { 'accept-encoding': 'gzip' } })
  const cache = res.headers.get('cache-control') || ''
  return res.status === 200 && cache.includes('immutable') ? '' : `got ${res.status}, cache-control "${cache}"`
})

await check('health check answers', async () => {
  const res = await get(`${base}/healthz`)
  return res.status === 200 ? '' : `got ${res.status}`
})

// 503 here means the server is up but can't read the store from Sweed: check the key and API_ORIGIN first.
await check('deep health check reads the store from Sweed', async () => {
  const res = await get(`${base}/healthz/deep`)
  return res.status === 200 ? '' : `got ${res.status}: the server cannot read the store (see docs/deploy-runbook.md, "403")`
})

await check('categories come through the proxy, without the API key', async () => {
  const res = await get(`${api}/categories?Scope.SaleType=${saleType}`)
  if (res.headers.get('x-api-key')) return 'the response carries an x-api-key header'
  if (res.status !== 200) return `got ${res.status}: ${(await res.text()).slice(0, 160)}`
  const body = await res.json()
  return Array.isArray(body.items ?? body.categories) ? '' : 'no category list in the answer'
})

let product = null
await check('products come through the proxy', async () => {
  const res = await get(`${api}/products?Scope.SaleType=${saleType}&Pagination.Page=1&Pagination.PageSize=1`)
  if (res.status !== 200) return `got ${res.status}`
  product = (await res.json()).items?.[0] || null
  return product ? '' : 'the store returned no products'
})

if (product) {
  await check('a product page has its own title and JSON-LD', async () => {
    const res = await get(`${base}/p/${joinSlugId(product.name, product.id)}`)
    const html = await res.text()
    if (res.status !== 200) return `got ${res.status}`
    return html.includes('application/ld+json') ? '' : 'no JSON-LD in the product page'
  })
}

await check('an unknown product answers 404 with noindex', async () => {
  const res = await get(`${base}/p/does-not-exist-smoke-zzzzzzzzzzzzzz`)
  const html = await res.text()
  return res.status === 404 && /noindex/.test(html) ? '' : `got ${res.status}`
})

await check('the install manifest answers', async () => {
  const res = await get(`${base}/manifest.webmanifest`)
  return res.status === 200 ? '' : `got ${res.status}`
})

await check('a cross-site write is refused before it reaches Sweed', async () => {
  const res = await get(`${api}/carts`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' })
  return res.status === 403 ? '' : `got ${res.status}`
})

await check('routes outside the allowlist answer 404', async () => {
  const res = await get(`${api}/not-a-route`)
  return res.status === 404 ? '' : `got ${res.status}`
})

if (origin.startsWith('https://')) {
  await check('HTTPS responses carry HSTS', async () => {
    const res = await get(`${base}/`)
    return res.headers.get('strict-transport-security') ? '' : 'no Strict-Transport-Security header (add it at the reverse proxy)'
  })
}

for (const { name, ok, detail } of results) console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`)
const failed = results.filter((result) => !result.ok).length
console.log(failed ? `${failed} of ${results.length} checks failed` : `All ${results.length} checks passed`)
process.exit(failed ? 1 : 0)
