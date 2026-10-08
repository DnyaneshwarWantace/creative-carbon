import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { loadProducts } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { GoodsReceipt, GoodsReceiptLine } from '../../data/entities'
import { directGrnInputSchema, grnInputSchema, grnListSchema } from '../../data/validators'
import { createDirectGrn, createGrn, findGrn, grnView, num } from '../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_purchase.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.receive'] },
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
      where.$or = [{ code: { $ilike: term } }, { poCode: { $ilike: term } }, { vendorName: { $ilike: term } }, { invoiceNo: { $ilike: term } }, { vehicleNo: { $ilike: term } }]
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
          vehicleNo: grn.vehicleNo ?? null,
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
  const body = await req.json().catch(() => null)
  const direct = Boolean(body && typeof body === 'object' && !('poId' in body) && 'vendorId' in body)
  try {
    if (direct) {
      const parsed = directGrnInputSchema.safeParse(body)
      if (!parsed.success) {
        const reason = parsed.error.issues.find((issue) => issue.path[0] === 'reason')
        return NextResponse.json({ error: reason ? 'Write why the goods came without a PO' : 'Pick the vendor, then enter quantity, rate and vendor batch no. for each line' }, { status: 400 })
      }
      return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.grn', resourceId: parsed.data.vendorId, operation: 'create', payload: parsed.data }, async () => {
        const grn = await createDirectGrn(ctx, parsed.data)
        return NextResponse.json({ id: grn.id, code: grn.code, status: grn.status }, { status: 201 })
      })
    }
    const parsed = grnInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Enter the quantity and the vendor batch no. for each line' }, { status: 400 })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.grn', resourceId: parsed.data.poId, operation: 'create', payload: parsed.data }, async () => {
      const grn = await createGrn(ctx, parsed.data)
      return NextResponse.json({ id: grn.id, code: grn.code, status: grn.status }, { status: 201 })
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Goods receiving notes',
  methods: {
    GET: { summary: 'List GRNs (under test, approved, rejected) or one GRN with lines and QC', tags: ['Creative Carbon Purchase'], query: grnListSchema, responses: [{ status: 200, description: 'GRNs', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()).optional() }).passthrough() }] },
    POST: {
      summary: 'Receive goods against an approved PO (poId + lines) or without a PO (vendorId + reason + lines with rate): stock goes into the RM / PM store as "under test" and an inward QC check is created per batch',
      tags: ['Creative Carbon Purchase'],
      requestBody: { schema: z.union([grnInputSchema, directGrnInputSchema]) },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string(), code: z.string() }) }],
      errors: [{ status: 409, description: 'PO not approved or already fully received' }],
    },
  },
}

export { GET, POST }
