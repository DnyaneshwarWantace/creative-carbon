import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { ensureCustomerNumber, refreshCustomerIndex } from '../../lib/customerNumber'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customers.companies.manage'] },
}

const bodySchema = z.object({ customerId: z.string().uuid() })

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const assigned = await ctx.em.transactional((em) => ensureCustomerNumber(em, scope, parsed.data.customerId))
  if (!assigned) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  await refreshCustomerIndex(ctx.container.resolve('eventBus'), scope, assigned.profileId)
  return NextResponse.json({ customerNo: assigned.number })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Customers',
  summary: 'Customer number',
  methods: {
    POST: { summary: 'Give the customer the next CTR number if it has none; returns the number', tags: ['Dermat Customers'], requestBody: { schema: bodySchema }, responses: [{ status: 200, description: 'Number', schema: z.object({ customerNo: z.string() }) }] },
  },
}

export { POST }
