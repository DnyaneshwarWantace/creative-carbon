import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../dermat_orders/lib/server'
import { purchaseErrorResponse } from '../../../lib/server'
import { vendorSummary } from '../../../lib/vendorSummary'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_purchase.view'] },
}

const querySchema = z.object({ id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Pass a vendor id' }, { status: 400 })
  try {
    return NextResponse.json(await vendorSummary(ctx, parsed.data.id))
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Purchase',
  summary: 'Vendor file',
  methods: {
    GET: {
      summary: 'Vendor profile with purchase orders, goods receipts, materials supplied and delivery / QC performance',
      tags: ['Dermat Purchase'],
      query: querySchema,
      responses: [{ status: 200, description: 'Vendor file', schema: z.object({ vendor: z.object({ id: z.string() }).passthrough() }).passthrough() }],
    },
  },
}

export { GET }
