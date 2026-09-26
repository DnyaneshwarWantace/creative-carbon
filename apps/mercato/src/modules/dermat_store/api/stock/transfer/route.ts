import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { transferSchema } from '../../../data/validators'
import { resolveStoreContext, runGuarded, storeErrorResponse } from '../../../lib/server'
import { transferStock } from '../../../lib/stockBook'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_store.adjust'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = transferSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the quantity, batch and reason' }, { status: 400 })
  try {
    const result = await runGuarded(ctx, req, { resourceKind: 'dermat_store.stock', resourceId: parsed.data.productId, operation: 'custom', payload: parsed.data as Record<string, unknown> }, async () => {
      await transferStock(ctx, parsed.data)
      return { ok: true }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Store',
  summary: 'Move QC-approved stock between the RM store, PM store, production floor and FG store',
  methods: {
    POST: { summary: 'Move QC-approved stock between the RM store, PM store, production floor and FG store', tags: ['Dermat Store'], requestBody: { schema: transferSchema }, responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean() }) }] },
  },
}

export { POST }
