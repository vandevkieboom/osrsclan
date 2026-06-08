import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const RP_BASE = 'https://api.runeprofile.com/v1'
const WOM_BASE = 'https://api.wiseoldman.net/v2'
const WOM_GROUP_ID = 22206

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

function womProxyPlugin(apiKey: string): Plugin {
  const METRIC_RE = /^[a-z_]{1,40}$/
  const PERIOD_RE = /^(week|month)$/
  const womHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'vandevkieboom',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
  }

  return {
    name: 'wom-proxy',
    configureServer(server) {
      server.middlewares.use(
        '/api/wom-proxy',
        async (req: IncomingMessage, res: ServerResponse) => {
          const rawUrl = req.url ?? ''
          const qIdx = rawUrl.indexOf('?')
          const params = new URLSearchParams(qIdx >= 0 ? rawUrl.slice(qIdx + 1) : '')
          const type = params.get('type')

          const send = async (upstreamRes: Response) => {
            res.statusCode = upstreamRes.status
            res.setHeader('Content-Type', 'application/json')
            res.end(await upstreamRes.text())
          }

          if (type === 'hiscores') {
            const metric = params.get('metric') ?? ''
            if (!METRIC_RE.test(metric)) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid metric' }))
              return
            }
            await send(await fetch(`${WOM_BASE}/groups/${WOM_GROUP_ID}/hiscores?metric=${metric}&limit=500`, { headers: womHeaders }))
          } else if (type === 'gained') {
            const metric = params.get('metric') ?? ''
            const period = params.get('period') ?? ''
            const limit = Number(params.get('limit') ?? '500')
            if (!METRIC_RE.test(metric) || !PERIOD_RE.test(period) || !Number.isInteger(limit) || limit < 1 || limit > 500) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid params' }))
              return
            }
            await send(await fetch(`${WOM_BASE}/groups/${WOM_GROUP_ID}/gained?metric=${metric}&period=${period}&limit=${limit}`, { headers: womHeaders }))
          } else if (type === 'event') {
            const compsRes = await fetch(`${WOM_BASE}/groups/${WOM_GROUP_ID}/competitions?limit=20`, { headers: womHeaders })
            if (!compsRes.ok) { await send(compsRes); return }
            const comps = (await compsRes.json()) as Array<{ id: number; status: string }>
            const target = comps.find(c => c.status === 'ongoing') ?? comps.find(c => c.status === 'upcoming') ?? comps[0]
            if (!target) { res.statusCode = 404; res.end(JSON.stringify({ error: 'No competition found.' })); return }
            await send(await fetch(`${WOM_BASE}/competitions/${target.id}`, { headers: womHeaders }))
          } else {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid type' }))
          }
        },
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      runeprofileProxyPlugin(env.RUNEPROFILE_API_KEY ?? ''),
      womProxyPlugin(env.WOM_API_KEY ?? ''),
    ],
  }
})
