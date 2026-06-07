import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const RP_BASE = 'https://api.runeprofile.com/v1'

const ALLOWED_PATHS = [
  /^\/accounts\/[^/]+\/full$/,
  /^\/accounts\/[^/]+\/combat-achievements\/tasks$/,
]

function runeprofileProxyPlugin(apiKey: string): Plugin {
  return {
    name: 'runeprofile-proxy',
    configureServer(server) {
      server.middlewares.use(
        '/api/runeprofile-proxy',
        async (req: IncomingMessage, res: ServerResponse) => {
          const rawUrl = req.url ?? ''
          const match = rawUrl.match(/[?&]path=([^&]+)/)
          const path = match ? decodeURIComponent(match[1]) : ''

          if (!ALLOWED_PATHS.some((re) => re.test(path))) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Invalid path' }))
            return
          }

          const headers: Record<string, string> = { Accept: 'application/json' }
          if (apiKey) headers['x-api-key'] = apiKey

          const upstream = await fetch(`${RP_BASE}${path}`, { headers })

          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(await upstream.text())
        },
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), runeprofileProxyPlugin(env.RUNEPROFILE_API_KEY ?? '')],
  }
})
