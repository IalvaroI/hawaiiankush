import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { basePath, createApiHandler } from './server/proxy.js'

function apiProxy(env, base) {
  const handler = createApiHandler(env)
  return {
    name: 'shop-api-proxy',
    configureServer(server) { server.middlewares.use(`${base}api`, handler) },
    configurePreviewServer(server) { server.middlewares.use(`${base}api`, handler) },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const demoMode = env.VITE_SHOP_MODE !== 'live'
  const base = basePath(env)
  return {
    base,
    plugins: [react(), apiProxy(env, base)],
    define: { 'import.meta.env.VITE_SHOP_MODE': JSON.stringify(demoMode ? 'demo' : 'live'), 'import.meta.env.VITE_STORE_ID': JSON.stringify(env.STORE_ID || '') },
  }
})
