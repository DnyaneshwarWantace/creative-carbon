import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { checkListSchema, checkSaveSchema } from '../../data/validators'
import { QcError } from '../../lib/service'
import { checkView, evaluateResult, findCheck } from '../../lib/checks'
import { canTestQc, currentUserName, productSummaries, qcErrorResponse, resolveQcContext, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_quality.view'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_quality.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = checkListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data
  try {
    if (query.id) return NextResponse.json(await checkView(ctx, await findCheck(ctx, query.id)))
  } catch (error) {
    return qcErrorResponse(error)
  }
  const where = ['c.tenant_id = ?', 'c.organization_id = ?', 'c.deleted_at is null']
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  if (query.status) {
    where.push('c.status = ?')
    params.push(query.status)
  }
  if (query.lab === 'chemical') where.push(`c.status = 'pending' and c.chemical_status = 'pending'`)
  if (query.lab === 'micro') where.push(`c.status = 'pending' and c.micro_status = 'pending'`)
  if (query.operation) {
    where.push('c.operation = ?')
    params.push(query.operation)
  }
  if (query.orderId) {
    where.push('c.order_id = ?')
    params.push(query.orderId)
  }
  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    where.push(`(c.code ilike ? or c.ar_no ilike ? or c.order_no ilike ? or c.batch_no ilike ? or p.title ilike ?)`)
    params.push(term, term, term, term, term)
  }
  const from = `from dermat_quality_checks c left join catalog_products p on p.id = c.product_id where ${where.join(' and ')}`
  const connection = ctx.em.getConnection()
  const [count] = await connection.execute<Array<{ total: string }>>(`select count(*) as total ${from}`, params)
  const rows = await connection.execute<
    Array<{ id: string; code: string; ar_no: string | null; round: number; operation: string; product_id: string; order_id: string | null; order_no: string | null; stage_key: string | null; batch_no: string | null; status: string; chemical_status: string; micro_status: string; created_at: Date; chemical_by: string | null; micro_by: string | null }>
  >(
    `select c.id, c.code, c.ar_no, c.round, c.operation, c.product_id, c.order_id, c.order_no, c.stage_key, c.batch_no, c.status, c.chemical_status, c.micro_status, c.created_at, c.chemical_by, c.micro_by
       ${from} order by c.status = 'pending' desc, c.created_at desc limit ? offset ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  )
  const products = await productSummaries(
    ctx,
    rows.map((row) => row.product_id),
  )
  const total = Number(count?.total ?? 0)
  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      arNo: row.ar_no,
      round: row.round,
      operation: row.operation,
      productId: row.product_id,
      productTitle: products.get(row.product_id)?.title ?? '',
      productCode: products.get(row.product_id)?.code ?? null,
      orderId: row.order_id,
      orderNo: row.order_no,
      stageKey: row.stage_key,
      batchNo: row.batch_no,
      status: row.status,
      chemicalStatus: row.chemical_status,
      microStatus: row.micro_status,
      chemicalBy: row.chemical_by,
      microBy: row.micro_by,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  })
}

async function PUT(req: Request) {
  const ctx = await resolveQcContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  if (!(await canTestQc(ctx))) return NextResponse.json({ error: 'Only QC chemists or microbiologists can change a QC check' }, { status: 403 })
  const parsed = checkSaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid QC data' }, { status: 400 })
  try {
    const check = await findCheck(ctx, parsed.data.id)
    if ((check.status === 'passed' || check.status === 'reworked' || check.status === 'rejected') && parsed.data.results.length) throw new QcError('This check is locked; only the sample and retention details can still be updated', 409)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_quality.check', resourceId: check.id, current: check.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'dermat_quality.check', resourceId: check.id, operation: 'update', payload: parsed.data }, async () => {
      const incoming = new Map(parsed.data.results.map((row) => [row.key, row]))
      check.results = (check.results ?? []).map((row) => {
        const partStatus = row.test === 'micro' ? check.microStatus : check.chemicalStatus
        const update = incoming.get(row.key)
        if (!update || partStatus !== 'pending') return row
        return evaluateResult({ ...row, observation: update.observation.trim(), remark: update.remark.trim(), instrument: update.instrument?.trim() || row.instrument || null })
      })
      if (parsed.data.worksheet) {
        const next = { ...(check.worksheet ?? {}) } as Record<string, string | number | null>
        for (const [key, value] of Object.entries(parsed.data.worksheet)) {
          if (value === undefined) continue
          next[key] = typeof value === 'string' ? value.trim() || null : value
        }
        check.worksheet = next
      }
      if (parsed.data.batchNo !== undefined) check.batchNo = parsed.data.batchNo?.trim() || null
      check.history = [...(check.history ?? []), { action: 'saved', by: await currentUserName(ctx), at: new Date().toISOString(), note: null }]
      check.updatedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json(await checkView(ctx, check))
    })
  } catch (error) {
    return qcErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat QC',
  summary: 'QC checks',
  methods: {
    GET: { summary: 'QC checks (pending first), or one by id', tags: ['Dermat QC'], query: checkListSchema, responses: [{ status: 200, description: 'Checks', schema: z.object({}).passthrough() }] },
    PUT: { summary: 'Save observations and remarks', tags: ['Dermat QC'], requestBody: { schema: checkSaveSchema }, responses: [{ status: 200, description: 'Saved check', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, PUT }
