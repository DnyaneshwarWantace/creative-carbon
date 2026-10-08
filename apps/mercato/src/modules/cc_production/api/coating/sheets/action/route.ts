import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../../cc_store/lib/server'
import { coatingActionSchema } from '../../../../data/validators'
import { deleteSheet, findSheet, postSheet, reopenSheet, sheetView } from '../../../../lib/coating'
import { plantErrorResponse, runPlantGuarded } from '../../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.coating.enter'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = coatingActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Say which sheet and what to do' }, { status: 400 })
  try {
    const sheet = await findSheet(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.coating_sheet', resourceId: sheet.id, current: sheet.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.coating_sheet', resourceId: sheet.id, operation: parsed.data.action === 'delete' ? 'delete' : 'custom', payload: parsed.data }, async () => {
      if (parsed.data.action === 'post') return sheetView(ctx, await postSheet(ctx, sheet, byName))
      if (parsed.data.action === 'reopen') return sheetView(ctx, await reopenSheet(ctx, sheet, byName))
      await deleteSheet(ctx, sheet, byName)
      return { ok: true }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Coating',
  summary: 'Post, reopen or delete a dryer sheet',
  methods: {
    POST: {
      summary: 'Post (raw cloth and resin out, one B-stage lot per row onto the shop floor, DBP / oleic acid issued), reopen (reverses it while no lot is used) or delete a sheet that is not posted',
      tags: ['Creative Carbon Coating'],
      requestBody: { schema: coatingActionSchema },
      responses: [{ status: 200, description: 'Sheet', schema: z.object({}).passthrough() }],
      errors: [{ status: 409, description: 'Not enough stock, already posted, lot already used, or changed by someone else' }],
    },
  },
}

export { POST }
