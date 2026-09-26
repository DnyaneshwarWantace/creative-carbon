import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../../../../dermat_orders/data/entities'
import { BomHeader, BomItem } from '../../../data/entities'
import { BomError } from '../../../lib/service'
import { currentUserName, nextBomCode, resolveBomContext } from '../../../lib/server'
import { bomErrorResponse, runGuarded } from '../../../lib/guard'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_boms.manage'] },
}

const bodySchema = z.object({ orderId: z.string().uuid(), productId: z.string().uuid() })

async function POST(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'orderId and productId are required' }, { status: 400 })
  const { orderId, productId } = parsed.data
  try {
    const order = await ctx.em.findOne(DermatOrder, { id: orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
    if (!order) throw new BomError('Order not found', 404)
    if (order.status === 'cancelled' || order.status === 'completed') throw new BomError(`${order.orderNo} is ${order.status}`, 409)
    const manufacturing = await ctx.em.findOne(DermatOrderStage, { orderId, stageKey: 'manufacturing' })
    if (manufacturing?.status === 'done') throw new BomError('Manufacturing is done for this order; its BOM can no longer change', 409)
    const lines = await ctx.em.find(DermatOrderLine, { orderId })
    const onOrder = lines.some((line) => line.productId === productId)
    const lineBoms = await ctx.em.find(BomHeader, { productId: { $in: lines.map((line) => line.productId) }, deletedAt: null, status: { $ne: 'superseded' } })
    const inside = lineBoms.length ? await ctx.em.count(BomItem, { bomId: { $in: lineBoms.map((bom) => bom.id) }, componentProductId: productId }) : 0
    if (!onOrder && !inside) throw new BomError('That product is not on this order', 400)
    const existing = await ctx.em.findOne(BomHeader, { productId, orderId, deletedAt: null, status: { $ne: 'superseded' } })
    if (existing) throw new BomError(`This order already has its own BOM for this product (${existing.code})`, 409, { id: existing.id })
    const source =
      (await ctx.em.findOne(BomHeader, { productId, orderId: null, status: 'approved', tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }, { orderBy: { version: 'desc' } })) ??
      (await ctx.em.findOne(BomHeader, { productId, orderId: null, status: 'draft', tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }))
    if (!source) throw new BomError('This product has no BOM to copy yet. Make its standard BOM first.', 409)
    const latest = await ctx.em.findOne(BomHeader, { productId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }, { orderBy: { version: 'desc' } })
    return await runGuarded(ctx, req, { resourceId: productId, operation: 'create', payload: parsed.data }, async () => {
      const createdByName = await currentUserName(ctx)
      const created = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const header = em.create(BomHeader, {
          organizationId: ctx.organizationId,
          tenantId: ctx.tenantId,
          code: await nextBomCode(txCtx),
          productId,
          productKind: source.productKind,
          orderId,
          orderNo: order.orderNo,
          version: (latest?.version ?? source.version) + 1,
          status: 'draft',
          batchSize: source.batchSize,
          batchUnit: source.batchUnit,
          notes: `For order ${order.orderNo}, copied from v${source.version}${source.notes ? `. ${source.notes}` : ''}`,
          createdByName,
        })
        em.persist(header)
        await em.flush()
        const items = await em.find(BomItem, { bomId: source.id }, { orderBy: { position: 'asc' } })
        for (const item of items) {
          em.persist(
            em.create(BomItem, {
              organizationId: ctx.organizationId,
              tenantId: ctx.tenantId,
              bomId: header.id,
              position: item.position,
              componentProductId: item.componentProductId,
              componentKind: item.componentKind,
              percent: item.percent ?? null,
              qtyPerUnit: item.qtyPerUnit ?? null,
              fillQty: item.fillQty ?? null,
              fillUnit: item.fillUnit ?? null,
              unit: item.unit,
              remark: item.remark ?? null,
            }),
          )
        }
        await em.flush()
        return header
      })
      return NextResponse.json({ id: created.id, code: created.code }, { status: 201 })
    })
  } catch (error) {
    return bomErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat BOM',
  summary: 'Change a BOM for one order only',
  methods: {
    POST: {
      summary: 'Copy the standard BOM of a product (the finished good or a bulk inside it) into a draft that applies only to this order; the standard BOM is untouched',
      tags: ['Dermat BOM'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 201, description: 'Order BOM draft created', schema: z.object({ id: z.string(), code: z.string() }) }],
      errors: [{ status: 409, description: 'Already has one, manufacturing done, or no standard BOM' }],
    },
  },
}

export { POST }
