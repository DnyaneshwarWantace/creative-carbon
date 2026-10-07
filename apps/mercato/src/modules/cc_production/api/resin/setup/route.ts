import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { resinSetupSchema } from '../../../data/validators'
import { resinSetup } from '../../../lib/resin'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.resin.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = resinSetupSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  try {
    return NextResponse.json(await resinSetup(ctx, parsed.data.date ?? null))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Resin',
  summary: 'What the resin batch form needs: vessels, grades, chemicals with free stock lots, next batch number',
  methods: {
    GET: { summary: 'Resin form setup (?date= gives the next Batch No.)', tags: ['Creative Carbon Resin'], query: resinSetupSchema, responses: [{ status: 200, description: 'Setup', schema: z.object({}).passthrough() }] },
  },
}

export { GET }
