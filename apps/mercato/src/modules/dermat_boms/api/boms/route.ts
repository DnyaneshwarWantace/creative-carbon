import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { BomHeader } from '../../data/entities'
import { bomCreateSchema, bomListQuerySchema, bomUpdateSchema } from '../../data/validators'
import { BOM_KINDS } from '../../lib/bomKinds'
import { BomError, findBom, replaceItems, resolveProductKind, serializeBom, validateItems } from '../../lib/service'
import { currentUserName, nextBomCode, resolveBomContext } from '../../lib/server'
import { bomErrorResponse, enforceBomLock, runGuarded } from '../../lib/guard'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_boms.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_boms.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_boms.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['dermat_boms.manage'] },
}

type ListRow = {
  id: string
  code: string
  product_id: string
  product_kind: string
  version: number
  status: string
  order_id: string | null
  order_no: string | null
  batch_size: string
  batch_unit: string
  created_by_name: string | null
  approved_by_name: string | null
  updated_at: Date
  title: string
  item_code: string | null
  line_count: string
  total_percent: string | null
}

async function GET(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const query = bomListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!query.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const { id, kind, productId, status, search, page, pageSize } = query.data
  try {
    if (id) return NextResponse.json(await serializeBom(ctx, await findBom(ctx, id)))
  } catch (error) {
    return bomErrorResponse(error)
  }

  const where: string[] = ['h.tenant_id = ?', 'h.organization_id = ?', 'h.deleted_at is null']
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  if (kind) {
    where.push('h.product_kind = any(?::text[])')
    params.push(`{${BOM_KINDS[kind].productKinds.join(',')}}`)
  }
  if (productId) {
    where.push('h.product_id = ?')
    params.push(productId)
  }
  if (status) {
    where.push('h.status = ?')
    params.push(status)
  } else if (!productId) {
    where.push(`h.status <> 'superseded'`)
  }
  if (search) {
    const term = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    where.push('(p.title ilike ? or h.code ilike ? or code.value_text ilike ?)')
    params.push(term, term, term)
  }
  const from = `from dermat_bom_headers h
      join catalog_products p on p.id = h.product_id
      left join lateral (
        select v.value_text from custom_field_values v
         where v.entity_id = 'catalog:catalog_product' and v.record_id = p.id::text and v.field_key = 'item_code'
           and v.deleted_at is null and coalesce(v.value_text, '') <> ''
         order by v.created_at desc limit 1
      ) code on true
     where ${where.join(' and ')}`
  const connection = (ctx.em as EntityManager).getConnection()
  const [countRow] = await connection.execute<Array<{ total: string }>>(`select count(*) as total ${from}`, params)
  const rows = await connection.execute<ListRow[]>(
    `select h.id, h.code, h.product_id, h.product_kind, h.version, h.status, h.batch_size, h.batch_unit, h.order_id, h.order_no,
            h.created_by_name, h.approved_by_name, h.updated_at, p.title, code.value_text as item_code,
            (select count(*) from dermat_bom_items i where i.bom_id = h.id) as line_count,
            (select sum(i.percent) from dermat_bom_items i where i.bom_id = h.id) as total_percent
       ${from}
      order by p.title asc, h.version desc
      limit ? offset ?`,
    [...params, pageSize, (page - 1) * pageSize],
  )
  const total = Number(countRow?.total ?? 0)
  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      productId: row.product_id,
      productKind: row.product_kind,
      productName: row.title,
      productCode: row.item_code,
      version: row.version,
      status: row.status,
      orderId: row.order_id ?? null,
      orderNo: row.order_no ?? null,
      batchSize: Number(row.batch_size),
      batchUnit: row.batch_unit,
      lineCount: Number(row.line_count),
      totalPercent: row.total_percent == null ? null : Number(row.total_percent),
      createdByName: row.created_by_name,
      approvedByName: row.approved_by_name,
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

async function POST(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bomCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid BOM', details: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data
  try {
    const { product, kind } = await resolveProductKind(ctx, input.productId)
    const existingDraft = await ctx.em.findOne(BomHeader, {
      productId: input.productId,
      orderId: null,
      status: 'draft',
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      deletedAt: null,
    })
    if (existingDraft) throw new BomError('This product already has a draft BOM', 409, { id: existingDraft.id })
    const items = await validateItems(ctx, kind, input.productId, input.items)
    const latest = await ctx.em.findOne(
      BomHeader,
      { productId: input.productId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null },
      { orderBy: { version: 'desc' } },
    )
    return await runGuarded(ctx, req, { resourceId: input.productId, operation: 'create', payload: input }, async () => {
      const createdByName = await currentUserName(ctx)
      const bom = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const header = em.create(BomHeader, {
          organizationId: ctx.organizationId,
          tenantId: ctx.tenantId,
          code: await nextBomCode(txCtx),
          productId: input.productId,
          productKind: product.kind ?? '',
          version: (latest?.version ?? 0) + 1,
          status: 'draft',
          batchSize: String(input.batchSize),
          batchUnit: BOM_KINDS[kind].defaultBatchUnit ?? product.unit ?? 'kg',
          notes: input.notes?.trim() || null,
          createdByName,
        })
        em.persist(header)
        await em.flush()
        await replaceItems(txCtx, header, kind, items)
        await em.flush()
        return header
      })
      return NextResponse.json({ id: bom.id, code: bom.code }, { status: 201 })
    })
  } catch (error) {
    return bomErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bomUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid BOM', details: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data
  try {
    const bom = await findBom(ctx, input.id)
    if (bom.status !== 'draft') throw new BomError('Only a draft BOM can be changed. Use "New version" to edit an approved BOM.', 409)
    enforceBomLock(bom, req)
    const { kind } = await resolveProductKind(ctx, bom.productId)
    const items = await validateItems(ctx, kind, bom.productId, input.items)
    return await runGuarded(ctx, req, { resourceId: bom.id, operation: 'update', payload: input }, async () => {
      await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const header = await findBom(txCtx, bom.id)
        header.batchSize = String(input.batchSize)
        header.notes = input.notes?.trim() || null
        header.updatedAt = new Date()
        await replaceItems(txCtx, header, kind, items)
        await em.flush()
      })
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return bomErrorResponse(error)
  }
}

async function DELETE(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get('id'))
  if (!id.success) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const bom = await findBom(ctx, id.data)
    if (bom.status !== 'draft') throw new BomError('Only a draft BOM can be deleted', 409)
    enforceBomLock(bom, req)
    return await runGuarded(ctx, req, { resourceId: bom.id, operation: 'delete', payload: { id: bom.id } }, async () => {
      bom.deletedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return bomErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat BOM',
  summary: 'Bulk formulas and finished-good pack BOMs',
  methods: {
    GET: {
      summary: 'List BOMs, or read one BOM with its lines (id)',
      tags: ['Dermat BOM'],
      query: bomListQuerySchema,
      responses: [{ status: 200, description: 'BOM list or one BOM', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()).optional() }).passthrough() }],
    },
    POST: {
      summary: 'Create a draft BOM',
      tags: ['Dermat BOM'],
      requestBody: { schema: bomCreateSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string(), code: z.string() }) }],
      errors: [
        { status: 400, description: 'Invalid lines' },
        { status: 409, description: 'A draft already exists' },
      ],
    },
    PUT: {
      summary: 'Replace a draft BOM and its lines',
      tags: ['Dermat BOM'],
      requestBody: { schema: bomUpdateSchema },
      responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean() }) }],
      errors: [{ status: 409, description: 'Not a draft, or changed by someone else' }],
    },
    DELETE: {
      summary: 'Delete a draft BOM',
      tags: ['Dermat BOM'],
      responses: [{ status: 200, description: 'Deleted', schema: z.object({ ok: z.boolean() }) }],
    },
  },
}

export { GET, POST, PUT, DELETE }
