import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { findBom } from '../../lib/service'
import { explodeBom } from '../../lib/explode'
import { resolveBomContext } from '../../lib/server'
import { bomErrorResponse } from '../../lib/guard'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_boms.view'] },
}

const querySchema = z.object({
  bomId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(10_000_000).optional(),
  orderId: z.string().uuid().optional(),
})

async function GET(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'bomId is required' }, { status: 400 })
  try {
    const bom = await findBom(ctx, parsed.data.bomId)
    const quantity = parsed.data.quantity ?? Number(bom.batchSize)
    const result = await explodeBom(ctx, bom, quantity, parsed.data.orderId ?? bom.orderId ?? null)
    return NextResponse.json({ quantity, unit: bom.batchUnit, ...result })
  } catch (error) {
    return bomErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat BOM',
  summary: 'Explode a BOM into its tree and total material needs',
  methods: {
    GET: {
      summary: 'Multi-level explosion (FG → Bulk → RM) for a quantity, with stock and shortage',
      tags: ['Dermat BOM'],
      query: querySchema,
      responses: [{ status: 200, description: 'Tree and requirements', schema: z.object({ quantity: z.number(), unit: z.string() }).passthrough() }],
    },
  },
}

export { GET }
