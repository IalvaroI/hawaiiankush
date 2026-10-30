import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)))
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

async function reservePort() {
  const server = createServer()
  const port = await listen(server)
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function getJson(url) {
  const response = await fetch(url)
  return { status: response.status, body: await response.json() }
}

test('health endpoints stay local, and the deep check reports and briefly caches Sweed state', async (t) => {
  let upstreamStatus = 200
  let upstreamCalls = 0
  const upstream = createServer((req, res) => {
    upstreamCalls += 1
    res.writeHead(upstreamStatus, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ store: { id: 'test-store' } }))
  })
  const upstreamPort = await listen(upstream)
  const appPort = await reservePort()
  const distDir = await mkdtemp(join(tmpdir(), 'shop-health-test-'))
  await writeFile(join(distDir, 'index.html'), '<html><head><title>Test</title></head><body></body></html>')
  // A sibling whose name starts with the dist directory's: a bare prefix check would serve from it.
  const siblingDir = `${distDir}-evil`
  await mkdir(siblingDir)
  await writeFile(join(siblingDir, 'secret.txt'), 'nope')

  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: projectDir,
    stdio: 'ignore',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PORT: String(appPort),
      HOST: '127.0.0.1',
      BASE_PATH: '/maui',
      DIST_DIR: distDir,
      STORE_ID: 'test-store',
      API_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      API_ORIGIN: 'http://shop.test',
      ECOM_API_KEY: 'test-only',
      HEALTH_CACHE_TTL_MS: '30',
    },
  })
  // Listen from the start: a server that dies on startup must still let the cleanup finish.
  const exited = once(child, 'exit')

  t.after(async () => {
    child.kill('SIGTERM')
    await exited
    await new Promise((resolve) => upstream.close(resolve))
    await rm(distDir, { recursive: true, force: true })
    await rm(siblingDir, { recursive: true, force: true })
  })

  const base = `http://127.0.0.1:${appPort}/maui`
  let ready = false
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`${base}/healthz`)
      if (response.ok) { ready = true; break }
    } catch {
      await delay(20)
    }
  }
  assert.equal(ready, true, 'the app server should start on its configured loopback address')

  assert.deepEqual(await getJson(`${base}/healthz`), { status: 200, body: { ok: true } })
  assert.equal(upstreamCalls, 0, 'the basic check must not call Sweed')

  const sibling = `..%2f${siblingDir.split('/').pop()}/secret.txt`
  assert.equal((await fetch(`${base}/${sibling}`)).status, 404, 'a sibling of the dist directory is never served')

  assert.deepEqual(await getJson(`${base}/healthz/deep`), { status: 200, body: { ok: true, sweed: 'ok' } })
  assert.equal(upstreamCalls, 1)

  upstreamStatus = 503
  assert.equal((await getJson(`${base}/healthz/deep`)).status, 200, 'the previous success is cached briefly')
  assert.equal(upstreamCalls, 1)

  await delay(35)
  assert.deepEqual(await getJson(`${base}/healthz/deep`), { status: 503, body: { ok: false, sweed: 'unavailable' } })
  assert.equal(upstreamCalls, 2)
})
