import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { cuttingDetail, damageDetail, directInDetail, fgDetail, thicknessDetail } from '../../../lib/records'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] },
}

const querySchema = z.object({ kind: z.enum(['cutting', 'thickness', 'fg', 'direct_in', 'damage']), id: z.string().uuid() })

const LOADERS = { cutting: cuttingDetail, thickness: thicknessDetail, fg: fgDetail, direct_in: directInDetail, damage: damageDetail }

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the record kind and id' }, { status: 400 })
  try {
    return NextResponse.json(await LOADERS[parsed.data.kind](ctx, parsed.data.id))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'One cutting entry, thickness inspection, FG inspection report, bought-in entry or damage entry, with the lots it came from and went to',
  methods: { GET: { summary: 'Finishing record detail', tags: ['Creative Carbon Finishing'], query: querySchema, responses: [{ status: 200, description: 'Record', schema: z.object({ id: z.string() }).passthrough() }] } },
}

export { GET }
