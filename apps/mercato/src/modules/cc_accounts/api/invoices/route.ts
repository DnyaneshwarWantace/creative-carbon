import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../cc_orders/lib/server'
import { invoiceCreateSchema, invoiceListSchema, invoiceUpdateSchema } from '../../data/validators'
import { createInvoice, findInvoice, invoiceView, updateExportDetails, updateInvoiceLines, type ExportPatch } from '../../lib/invoices'
import { AccountsError } from '../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../lib/server'

import { tallyPushOf } from '../../lib/tallyLog'
import { recordActivity } from '../../../cc_audit/lib/activity'
export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = invoiceListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data
  try {
    if (query.id) return NextResponse.json(invoiceView(await findInvoice(ctx, query.id)))
  } catch (error) {
    return accountsErrorResponse(error)
  }
  const where: string[] = ['tenant_id = ?', 'organization_id = ?', 'deleted_at is null']
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  for (const [column, value] of [['order_id', query.orderId], ['kind', query.kind], ['status', query.status]] as const) {
    if (!value) continue
    where.push(`${column} = ?`)
    params.push(value)
  }
  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    where.push('(code ilike ? or order_no ilike ? or customer_name ilike ? or against_code ilike ?)')
    params.push(term, term, term, term)
  }
  const connection = ctx.em.getConnection()
  const [count] = await connection.execute<Array<{ total: string }>>(`select count(*) as total from cc_tax_invoices where ${where.join(' and ')}`, params)
  const rows = await connection.execute<Array<{ id: string }>>(`select id from cc_tax_invoices where ${where.join(' and ')} order by created_at desc limit ? offset ?`, [...params, query.pageSize, (query.page - 1) * query.pageSize])
  const items = []
  for (const row of rows) items.push(invoiceView(await findInvoice(ctx, row.id)))
  const total = Number(count?.total ?? 0)
  return NextResponse.json({ items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = invoiceCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the invoice details', details: parsed.error.flatten() }, { status: 400 })
  try {
    return await runGuarded(ctx, req, parsed.data.orderId, parsed.data, async () => {
      const byName = await currentUserName(ctx)
      const invoice = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const created = await createInvoice(txCtx, parsed.data, byName)
        await em.flush()
        return created
      })
      return NextResponse.json(invoiceView(invoice), { status: 201 })
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = invoiceUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the invoice details', details: parsed.error.flatten() }, { status: 400 })
  try {
    const first = await findInvoice(ctx, parsed.data.id)
    if (first.status === 'cancelled') throw new AccountsError('This invoice is cancelled', 409)
    enforceCommandOptimisticLock({ resourceKind: 'cc_accounts.invoice', resourceId: first.id, current: first.updatedAt, request: req })
    return await runGuarded(ctx, req, first.id, parsed.data, async () => {
      const byName = await currentUserName(ctx)
      const invoice = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const doc = await findInvoice(txCtx, parsed.data.id)
        const input = parsed.data
        const issued = doc.status === 'issued'
        if (issued && (input.lines || input.invoiceDate)) throw new AccountsError('An issued invoice keeps its date and quantities. Use a credit note to reduce it.', 409)
        const tracked = (): Record<string, string | null> => ({
          dueDate: doc.dueDate ?? null,
          transporter: doc.transporter ?? null,
          vehicleNo: doc.vehicleNo ?? null,
          lrNo: doc.lrNo ?? null,
          ewayBillNo: doc.ewayBillNo ?? null,
          terms: doc.terms ?? null,
          bankDetails: doc.bankDetails ?? null,
          notes: doc.notes ?? null,
          ...Object.fromEntries(Object.entries(doc.exportDetails ?? {}).map(([key, value]) => [`export.${key}`, value === null || value === undefined ? null : String(value)])),
        })
        const before = tracked()
        if (input.invoiceDate) doc.invoiceDate = input.invoiceDate
        if (input.dueDate !== undefined) doc.dueDate = input.dueDate
        if (input.lines) await updateInvoiceLines(txCtx, doc, input.lines, byName)
        const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)
        if (input.transporter !== undefined) doc.transporter = clean(input.transporter)
        if (input.vehicleNo !== undefined) doc.vehicleNo = clean(input.vehicleNo)?.toUpperCase() ?? null
        if (input.lrNo !== undefined) doc.lrNo = clean(input.lrNo)
        if (input.ewayBillNo !== undefined) doc.ewayBillNo = clean(input.ewayBillNo)
        if (input.terms !== undefined) doc.terms = clean(input.terms)
        if (input.bankDetails !== undefined) doc.bankDetails = clean(input.bankDetails)
        if (input.notes !== undefined) doc.notes = clean(input.notes)
        if (input.exportDetails) {
          const patch: ExportPatch = {}
          for (const [key, value] of Object.entries(input.exportDetails)) {
            if (value === undefined) continue
            ;(patch as Record<string, unknown>)[key] = typeof value === 'string' ? (key === 'currency' ? value.trim().toUpperCase() : clean(value)) : value
          }
          await updateExportDetails(txCtx, doc, patch, byName)
        }
        const after = tracked()
        const changed = Object.keys({ ...before, ...after }).filter((key) => (before[key] ?? null) !== (after[key] ?? null) && (before[key] ?? null) !== null)
        if (issued && changed.length) {
          const why = input.reason?.trim() ?? ''
          if (why.length < 3) throw new AccountsError('Write why these details are corrected (at least 3 letters); it is kept in the history')
          const pushed = await tallyPushOf(txCtx, doc.id, [doc.kind === 'credit_note' ? 'Credit Note' : 'Sales'])
          if (pushed) throw new AccountsError(`This ${doc.kind === 'credit_note' ? 'credit note' : 'invoice'} is already in Tally (${pushed}). Correct it in Tally, or raise a credit note.`, 409)
          recordActivity(em as EntityManager, ctx, {
            recordType: 'invoice',
            recordId: doc.id,
            action: 'details_corrected',
            kind: 'correction',
            summary: `Details corrected after issue: ${changed.map((key) => INVOICE_FIELD_LABEL[key] ?? key).join(', ')}`,
            reason: why,
            changes: changed.map((key) => ({ field: key, label: INVOICE_FIELD_LABEL[key] ?? key, from: before[key] ?? null, to: after[key] ?? null })),
            actorUserId: ctx.userId ?? null,
            actorName: byName,
          })
        }
        doc.history = [...(doc.history ?? []), { action: 'edited', by: byName, at: new Date().toISOString(), note: issued && changed.length ? input.reason?.trim() ?? null : null }]
        doc.updatedAt = new Date()
        await em.flush()
        return doc
      })
      return NextResponse.json(invoiceView(invoice))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

const INVOICE_FIELD_LABEL: Record<string, string> = {
  dueDate: 'Due date',
  transporter: 'Transporter',
  vehicleNo: 'Vehicle no.',
  lrNo: 'LR / docket no.',
  ewayBillNo: 'E-way bill no.',
  terms: 'Terms',
  bankDetails: 'Bank details',
  notes: 'Note',
  'export.portOfDischarge': 'Port of discharge',
  'export.shippingBillNo': 'Shipping bill no.',
  'export.shippingBillDate': 'Shipping bill date',
  'export.containerNo': 'Container no.',
  'export.sealNo': 'Seal no.',
  'export.vessel': 'Vessel',
  'export.lcNumber': 'LC no.',
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Tax invoices and credit notes',
  methods: {
    GET: { summary: 'Invoices and credit notes (newest first), or one by id', tags: ['Creative Carbon Accounts'], query: invoiceListSchema, responses: [{ status: 200, description: 'Invoices', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Make a tax invoice from an order (DI/INV/<FY>/<n>); lines default to everything not yet billed', tags: ['Creative Carbon Accounts'], requestBody: { schema: invoiceCreateSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string() }).passthrough() }] },
    PUT: { summary: 'Edit a draft (date, quantities) or transport and text of any invoice', tags: ['Creative Carbon Accounts'], requestBody: { schema: invoiceUpdateSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST, PUT }
