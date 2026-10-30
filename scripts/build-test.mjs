// Builds the storefront for the end-to-end run: dist-test/, live mode, pointed at the recorded fixture store.
// The store id comes from tests/fixtures/store.json, so the bundle and the mock always agree.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const storeId = JSON.parse(readFileSync(join(root, 'tests/fixtures/store.json'), 'utf8')).store.id
const env = {
  ...process.env,
  VITE_SHOP_MODE: 'live',
  STORE_ID: storeId,
  BASE_PATH: '/maui',
  VITE_SALE_TYPE: 'recreational',
}
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const result = spawnSync(process.execPath, [vite, 'build', '--outDir', 'dist-test', '--emptyOutDir'], { cwd: root, env, stdio: 'inherit' })
process.exit(result.status ?? 1)
