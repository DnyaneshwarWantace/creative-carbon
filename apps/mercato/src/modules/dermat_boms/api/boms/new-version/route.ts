import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { BomHeader, BomItem } from '../../../data/entities'
import { bomActionSchema } from '../../../data/validators'
import { BomError, findBom } from '../../../lib/service'
import { currentUserName, nextBomCode, resolveBomContext } from '../../../lib/server'
import { bomErrorResponse, runGuarded } from '../../../lib/guard'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_boms.manage'] },
}

const bodySchema = bomActionSchema.pick({ id: true })

async function POST(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const source = await findBom(ctx, parsed.data.id)
    const draft = await ctx.em.findOne(BomHeader, {
      productId: source.productId,
      status: 'draft',
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    })
    if (draft) throw new BomError('This product already has a draft BOM', 409, { id: draft.id })
    const latest = await ctx.em.findOne(
      BomHeader,
      { productId: source.productId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null },
      { orderBy: { version: 'desc' } },
    )
    return await runGuarded(ctx, req, { resourceId: source.id, operation: 'custom', payload: parsed.data }, async () => {
      const createdByName = await currentUserName(ctx)
      const created = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const header = em.create(BomHeader, {
          organizationId: ctx.organizationId,
          tenantId: ctx.tenantId,
          code: await nextBomCode(txCtx),
          productId: source.productId,
          productKind: source.productKind,
          version: (latest?.version ?? source.version) + 1,
          status: 'draft',
          batchSize: source.batchSize,
          batchUnit: source.batchUnit,
          notes: source.notes ?? null,
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
  summary: 'Start a new version of a BOM',
  methods: {
    POST: {
      summary: 'Copy a BOM into a new draft version',
      tags: ['Dermat BOM'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 201, description: 'Draft created', schema: z.object({ id: z.string(), code: z.string() }) }],
      errors: [{ status: 409, description: 'A draft already exists' }],
    },
  },
}

export { POST }
