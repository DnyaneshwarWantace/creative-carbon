import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../../cc_orders/lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.tally'] },
}

const FILES: Record<string, { name: string; type: string }> = {
  script: { name: 'tally-bridge.mjs', type: 'text/javascript; charset=utf-8' },
  windows: { name: 'start-tally-bridge.bat', type: 'application/octet-stream' },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const file = FILES[new URL(req.url).searchParams.get('file') ?? 'script']
  if (!file) return NextResponse.json({ error: 'Unknown file' }, { status: 400 })
  const candidates = [path.join(process.cwd(), 'scripts', 'tally-bridge', file.name), path.join(process.cwd(), 'apps', 'mercato', 'scripts', 'tally-bridge', file.name)]
  for (const candidate of candidates) {
    const content = await readFile(candidate).catch(() => null)
    if (content) return new Response(content, { headers: { 'content-type': file.type, 'content-disposition': `attachment; filename="${file.name}"` } })
  }
  return NextResponse.json({ error: 'Bridge file not found on the server' }, { status: 404 })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Download the Tally bridge program (tally-bridge.mjs) or its Windows starter (start-tally-bridge.bat)',
  methods: {
    GET: { summary: 'Download a bridge file', tags: ['Creative Carbon Accounts'], query: z.object({ file: z.enum(['script', 'windows']).optional() }), responses: [{ status: 200, description: 'File', schema: z.string() }] },
  },
}

export { GET }
