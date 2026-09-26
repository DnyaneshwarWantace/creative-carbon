import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { loadProducts } from '../../../dermat_orders/lib/server'
import { resolveStoreContext } from '../../../dermat_store/lib/server'
import { GoodsReceipt, GoodsReceiptLine } from '../../data/entities'
import { grnInputSchema, grnListSchema } from '../../data/validators'
import { createGrn, findGrn, grnView, num } from '../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_purchase.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_purchase.receive'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = grnListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data
  try {
    if (query.id) return NextResponse.json(await grnView(ctx, await findGrn(ctx, query.id)))
    const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
    if (query.view === 'under_test') where.status = { $in: ['under_test', 'partly_approved'] }
    if (query.view === 'approved') where.status = 'approved'
    if (query.view === 'rejected') where.status = 'rejected'
    if (query.poId) where.poId = query.poId
    if (query.search) {
      const term = `%${query.search.replace(/[%_]/g, '')}%`
      where.$or = [{ code: { $ilike: term } }, { poCode: { $ilike: term } }, { vendorName: { $ilike: term } }, { invoiceNo: { $ilike: term } }]
    }
    const [grns, total] = await ctx.em.findAndCount(GoodsReceipt, where, { orderBy: { createdAt: 'desc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize })
    const lines = grns.length ? await ctx.em.find(GoodsReceiptLine, { grnId: { $in: grns.map((grn) => grn.id) } }) : []
    const products = await loadProducts(ctx, lines.map((line) => line.productId))
    return NextResponse.json({
      items: grns.map((grn) => {
        const own = lines.filter((line) => line.grnId === grn.id)
        return {
          id: grn.id,
          code: grn.code,
          poId: grn.poId,
          poCode: grn.poCode,
          vendorName: grn.vendorName,
          grnDate: grn.grnDate,
          invoiceNo: grn.invoiceNo ?? null,
          status: grn.status,
          lineCount: own.length,
          passed: own.filter((line) => line.qcStatus === 'passed').length,
          failed: own.filter((line) => line.qcStatus === 'failed' || line.qcStatus === 'returned').length,
          items: own.slice(0, 3).map((line) => `${products.get(line.productId)?.title ?? '—'} ${num(line.quantity)} ${line.unit}`),
        }
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = grnInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the quantity and the vendor batch no. for each line' }, { status: 400 })
  try {
    return await runGuarded(ctx, req, { resourceKind: 'dermat_purchase.grn', resourceId: parsed.data.poId, operation: 'create', payload: parsed.data }, async () => {
      const grn = await createGrn(ctx, parsed.data)
      return NextResponse.json({ id: grn.id, code: grn.code, status: grn.status }, { status: 201 })
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Purchase',
  summary: 'Goods receiving notes',
  methods: {
    GET: { summary: 'List GRNs (under test, approved, rejected) or one GRN with lines and QC', tags: ['Dermat Purchase'], query: grnListSchema, responses: [{ status: 200, description: 'GRNs', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()).optional() }).passthrough() }] },
    POST: {
      summary: 'Receive goods against an approved PO: stock goes into the RM / PM store as "under test" and an inward QC check is created per batch',
      tags: ['Dermat Purchase'],
      requestBody: { schema: grnInputSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string(), code: z.string() }) }],
      errors: [{ status: 409, description: 'PO not approved or already fully received' }],
    },
  },
}

export { GET, POST }
