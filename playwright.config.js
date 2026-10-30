// End-to-end setup: the storefront (production server, built to dist-test/ by `npm run build:test`) runs against the
// Sweed mock, which answers from the recorded fixtures in tests/fixtures/. Nothing here calls the live store.
//
// LIVE_SMOKE=1 is the one optional run against the real store: it skips the mock and runs tests/live/ against a server
// the caller has already started (LIVE_BASE_URL, default http://localhost:3000). Used by the manual CI job only.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const root = dirname(fileURLToPath(import.meta.url))
const storeId = JSON.parse(readFileSync(join(root, 'tests/fixtures/store.json'), 'utf8')).store.id
const MOCK_PORT = 4010
const APP_PORT = 4100
const APP_ORIGIN = `http://localhost:${APP_PORT}`
const distDir = join(root, 'dist-test')
const live = process.env.LIVE_SMOKE === '1'

if (!live && !existsSync(join(distDir, 'index.html'))) {
  throw new Error('dist-test/ is missing. Run `npm run build:test` first (or `npm test`, which builds before the end-to-end run).')
}

// Chromium: PW_CHROMIUM wins; otherwise the preinstalled browser when this machine has one; otherwise Playwright's own
// (CI installs it with `npx playwright install chromium`).
const preinstalled = '/opt/pw-browsers/chromium'
const chromium = process.env.PW_CHROMIUM || (existsSync(preinstalled) ? preinstalled : undefined)

// The fixture run must never depend on the internet (product photos live on another host), so every other host fails
// to resolve. This is done in the browser's resolver, not with page.route(): Playwright's request interception drops
// keepalive requests sent by a page that is unloading, which is exactly what the bag tests rely on. Direct connections
// only: through an HTTP proxy the proxy resolves names, and the rule would not apply.
const offline = live ? [] : ['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']

export default defineConfig({
  testDir: live ? 'tests/live' : 'tests/e2e',
  outputDir: 'test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    // The service worker is tested on its own (tests/e2e/pwa.spec.js); elsewhere it would only add caching to the runs.
    serviceWorkers: 'block',
    baseURL: live ? (process.env.LIVE_BASE_URL || 'http://localhost:3000') : APP_ORIGIN,
    locale: 'en-US',
    timezoneId: 'Pacific/Honolulu',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: offline, ...(chromium ? { executablePath: chromium } : {}) },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  // The local mock and server only exist for the recorded-fixture run.
  webServer: live ? undefined : [
    {
      command: 'node tests/mock-sweed/server.js',
      url: `http://127.0.0.1:${MOCK_PORT}/__health`,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        MOCK_PORT: String(MOCK_PORT),
        MOCK_API_KEY: 'test',
        MOCK_ALLOWED_ORIGIN: APP_ORIGIN,
      },
    },
    {
      command: 'node server/index.js',
      url: `${APP_ORIGIN}/maui/`,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        PORT: String(APP_PORT),
        DIST_DIR: distDir,
        BASE_PATH: '/maui',
        STORE_ID: storeId,
        API_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        ECOM_API_KEY: 'test',
        API_ORIGIN: APP_ORIGIN,
        PUBLIC_ORIGIN: APP_ORIGIN,
        VITE_SALE_TYPE: 'recreational',
        // Plain HTTP locally: the session cookie must not be Secure.
        COOKIE_SECURE: 'false',
        // Each test sends its own X-Forwarded-For, so the sign-in rate limits never bleed between tests.
        TRUST_PROXY: 'true',
      },
    },
  ],
})
