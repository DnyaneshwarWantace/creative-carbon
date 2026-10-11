import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { hasFeatures } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { CRM_TYPES, PLANT_TYPES, correctionsSince } from '../../lib/report'
import { RECORD_TYPES } from '../../lib/timeline'

export const metadata = { GET: { requireAuth: true } }

const querySchema = z.object({ scope: z.enum(['plant', 'crm']), days: z.coerce.number().int().min(1).max(31).default(7) })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Say plant or crm' }, { status: 400 })
  const auditor = await hasFeatures(ctx, ['cc_audit.view'])
  const types: string[] = []
  for (const type of parsed.data.scope === 'plant' ? PLANT_TYPES : CRM_TYPES) {
    const feature = RECORD_TYPES[type]?.viewFeature
    if (feature && (auditor || (await hasFeatures(ctx, [feature])))) types.push(type)
  }
  if (!types.length) return NextResponse.json({ count: 0, people: [], items: [] })
  return NextResponse.json(await correctionsSince(ctx, { types, days: parsed.data.days }))
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Activity',
  summary: 'Corrections made this week on plant or CRM records (count, who, links)',
  methods: { GET: { summary: 'Corrections this week', tags: ['Creative Carbon Activity'], query: querySchema, responses: [{ status: 200, description: 'Corrections', schema: z.object({ count: z.number(), items: z.array(z.object({}).passthrough()) }).passthrough() }] } },
}

export { GET }
