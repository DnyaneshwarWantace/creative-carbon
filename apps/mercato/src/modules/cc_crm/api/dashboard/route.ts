import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { crmDashboard } from '../../lib/dashboard'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_crm.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json(await crmDashboard(ctx))
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'CRM home: pipeline, follow-ups due and overdue, quotations about to expire',
  methods: {
    GET: { summary: 'CRM home figures', tags: ['Creative Carbon CRM'], responses: [{ status: 200, description: 'Dashboard', schema: z.object({}).passthrough() }] },
  },
}

export { GET }
