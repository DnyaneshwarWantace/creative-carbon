import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { calculateSchema } from '../../data/validators'
import { calculate } from '../../lib/service'
import { planningErrorResponse } from '../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_planning.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = calculateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  try {
    return NextResponse.json(await calculate(ctx, parsed.data.items))
  } catch (error) {
    return planningErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Planning',
  summary: 'Combined material total for several orders or BOMs',
  methods: {
    POST: {
      summary: 'Explode every picked order line or BOM and add the same materials together; stock, reservations, free and short per material',
      tags: ['Dermat Planning'],
      requestBody: { schema: calculateSchema },
      responses: [{ status: 200, description: 'Rows per material', schema: z.object({ rows: z.array(z.object({ productId: z.string() }).passthrough()), missingBoms: z.array(z.string()) }) }],
    },
  },
}

export { POST }
