import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { statementQuerySchema } from '../../data/validators'
import { customerStatement } from '../../lib/statement'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = statementQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
  return NextResponse.json(await customerStatement(ctx, parsed.data.customerId))
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Customer account statement',
  methods: {
    GET: {
      summary: 'Invoices, credit notes and payments with running balance; open invoices with payments applied; ageing',
      tags: ['Creative Carbon Accounts'],
      query: statementQuerySchema,
      responses: [{ status: 200, description: 'Statement', schema: z.object({}).passthrough() }],
    },
  },
}

export { GET }
