import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { adjustSchema } from '../../../data/validators'
import { resolveStoreContext, runGuarded, storeErrorResponse } from '../../../lib/server'
import { adjustStock } from '../../../lib/stockBook'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_store.adjust'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = adjustSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the quantity, batch and reason' }, { status: 400 })
  try {
    const result = await runGuarded(ctx, req, { resourceKind: 'dermat_store.stock', resourceId: parsed.data.productId, operation: 'custom', payload: parsed.data as Record<string, unknown> }, async () => {
      await adjustStock(ctx, parsed.data)
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
  summary: 'Add or remove stock by hand with a reason (opening stock, count difference, damage, issue without an order)',
  methods: {
    POST: { summary: 'Add or remove stock by hand with a reason (opening stock, count difference, damage, issue without an order)', tags: ['Dermat Store'], requestBody: { schema: adjustSchema }, responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean() }) }] },
  },
}

export { POST }
