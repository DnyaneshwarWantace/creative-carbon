import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../dermat_orders/lib/server'
import { piCreateSchema, piListSchema, piUpdateSchema } from '../../data/validators'
import { createPi, findPi, piView, refreshPiLines } from '../../lib/documents'
import { AccountsError } from '../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_accounts.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_accounts.record'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_accounts.record'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = piListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data
  try {
    if (query.id) return NextResponse.json(piView(await findPi(ctx, query.id)))
  } catch (error) {
    return accountsErrorResponse(error)
  }
  const where: string[] = ['tenant_id = ?', 'organization_id = ?', 'deleted_at is null']
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  if (query.orderId) {
    where.push('order_id = ?')
    params.push(query.orderId)
  }
  if (query.status) {
    where.push('status = ?')
    params.push(query.status)
  }
  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    where.push('(code ilike ? or order_no ilike ? or customer_name ilike ?)')
    params.push(term, term, term)
  }
  const connection = ctx.em.getConnection()
  const [count] = await connection.execute<Array<{ total: string }>>(`select count(*) as total from dermat_proforma_invoices where ${where.join(' and ')}`, params)
  const rows = await connection.execute<Array<{ id: string }>>(
    `select id from dermat_proforma_invoices where ${where.join(' and ')} order by created_at desc limit ? offset ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  )
  const items = []
  for (const row of rows) items.push(piView(await findPi(ctx, row.id)))
  const total = Number(count?.total ?? 0)
  return NextResponse.json({ items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = piCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the proforma details', details: parsed.error.flatten() }, { status: 400 })
  try {
    return await runGuarded(ctx, req, parsed.data.orderId, parsed.data, async () => {
      const byName = await currentUserName(ctx)
      const pi = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const created = await createPi(txCtx, parsed.data, byName)
        await em.flush()
        return created
      })
      return NextResponse.json(piView(pi), { status: 201 })
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = piUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the proforma details', details: parsed.error.flatten() }, { status: 400 })
  try {
    const pi = await findPi(ctx, parsed.data.id)
    if (pi.status === 'cancelled') throw new AccountsError('This proforma invoice is cancelled', 409)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_accounts.proforma', resourceId: pi.id, current: pi.updatedAt, request: req })
    return await runGuarded(ctx, req, pi.id, parsed.data, async () => {
      const byName = await currentUserName(ctx)
      const input = parsed.data
      if (input.piDate) pi.piDate = input.piDate
      if (input.validUntil !== undefined) pi.validUntil = input.validUntil
      if (input.advancePercent !== undefined) pi.advancePercent = input.advancePercent == null ? null : String(input.advancePercent)
      if (input.terms !== undefined) pi.terms = input.terms?.trim() || null
      if (input.bankDetails !== undefined) pi.bankDetails = input.bankDetails?.trim() || null
      if (input.notes !== undefined) pi.notes = input.notes?.trim() || null
      if (input.refreshLines) await refreshPiLines(ctx, pi, byName)
      pi.history = [...(pi.history ?? []), { action: 'edited', by: byName, at: new Date().toISOString(), note: null }]
      pi.updatedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json(piView(pi))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Accounts',
  summary: 'Proforma invoices',
  methods: {
    GET: { summary: 'Proforma invoices (newest first), or one by id', tags: ['Dermat Accounts'], query: piListSchema, responses: [{ status: 200, description: 'Proformas', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Make a proforma invoice from an order (number DI/PI/<FY>/<n>)', tags: ['Dermat Accounts'], requestBody: { schema: piCreateSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string() }).passthrough() }] },
    PUT: { summary: 'Edit dates, advance %, terms, bank details, notes; refresh lines from the order', tags: ['Dermat Accounts'], requestBody: { schema: piUpdateSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST, PUT }
