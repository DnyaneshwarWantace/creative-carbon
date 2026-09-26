import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { BomHeader } from '../../../data/entities'
import { bomActionSchema } from '../../../data/validators'
import { BomError, assertReadyToApprove, findBom, serializeBom } from '../../../lib/service'
import { currentUserName, resolveBomContext } from '../../../lib/server'
import { bomErrorResponse, enforceBomLock, runGuarded } from '../../../lib/guard'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_boms.approve'] },
}

const bodySchema = bomActionSchema.pick({ id: true })

async function POST(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const bom = await findBom(ctx, parsed.data.id)
    if (bom.status !== 'draft') throw new BomError('Only a draft BOM can be approved', 409)
    enforceBomLock(bom, req)
    const view = await serializeBom(ctx, bom)
    assertReadyToApprove(view.kind, view.items)
    return await runGuarded(ctx, req, { resourceId: bom.id, operation: 'update', payload: parsed.data }, async () => {
      const approvedByName = await currentUserName(ctx)
      await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const previous = await em.find(BomHeader, {
          productId: bom.productId,
          orderId: bom.orderId ?? null,
          status: 'approved',
          tenantId: ctx.tenantId,
          organizationId: ctx.organizationId,
          deletedAt: null,
        })
        for (const entry of previous) entry.status = 'superseded'
        const header = await findBom(txCtx, bom.id)
        header.status = 'approved'
        header.approvedByName = approvedByName
        header.approvedAt = new Date()
        await em.flush()
      })
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return bomErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat BOM',
  summary: 'Approve a draft BOM',
  methods: {
    POST: {
      summary: 'Approve a draft BOM; the previously approved BOM of the product becomes superseded',
      tags: ['Dermat BOM'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 200, description: 'Approved', schema: z.object({ ok: z.boolean() }) }],
      errors: [
        { status: 400, description: 'RM % does not total 100, or no lines' },
        { status: 409, description: 'Not a draft' },
      ],
    },
  },
}

export { POST }
