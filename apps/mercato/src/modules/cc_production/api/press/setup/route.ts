import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { pressSetupSchema } from '../../../data/validators'
import { pressSetup } from '../../../lib/press'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.press.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = pressSetupSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  try {
    return NextResponse.json(await pressSetup(ctx, parsed.data.date ?? null))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Press',
  summary: 'What the press batch form needs: laminate presses, loading tolerance, grades, usable B-stage lots, the next Batch No.',
  methods: { GET: { summary: 'Press batch setup (?date= gives the next F/NN/MM/YYYY)', tags: ['Creative Carbon Press'], query: pressSetupSchema, responses: [{ status: 200, description: 'Setup', schema: z.object({}).passthrough() }] } },
}

export { GET }
