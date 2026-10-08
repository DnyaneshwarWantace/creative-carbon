import type { OrderContext } from '../../cc_orders/lib/server'
import { loadCustomers } from '../../cc_orders/lib/server'
import { nextSeriesCode } from '../../cc_accounts/lib/numberSeries'
import { CcEnquiry, CcQuotation, type EnquiryStage } from '../data/entities'
import type { EnquiryAction, EnquiryInput } from '../data/validators'
import { CrmError, entry, todayIst } from './server'

const OPEN_STAGES: EnquiryStage[] = ['new', 'quoted', 'negotiating']

function scope(ctx: OrderContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export function isOverdue(row: Pick<CcEnquiry, 'stage' | 'nextActionOn'>, today = todayIst()): boolean {
  return OPEN_STAGES.includes(row.stage) && Boolean(row.nextActionOn) && String(row.nextActionOn) < today
}

export function enquiryView(row: CcEnquiry, customerName: string | null) {
  return {
    id: row.id,
    enquiryNo: row.enquiryNo,
    source: row.source,
    receivedAt: row.receivedAt.toISOString(),
    customerId: row.customerId ?? null,
    customerName,
    companyName: row.companyName ?? null,
    partyName: customerName ?? row.companyName ?? row.contactName ?? null,
    contactName: row.contactName ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    place: row.place ?? null,
    subject: row.subject,
    details: row.details ?? null,
    ownerName: row.ownerName ?? null,
    stage: row.stage,
    nextActionOn: row.nextActionOn ?? null,
    nextActionNote: row.nextActionNote ?? null,
    lostReason: row.lostReason ?? null,
    orderId: row.orderId ?? null,
    overdue: isOverdue(row),
    byName: row.byName ?? null,
    history: row.history ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function customerNames(ctx: OrderContext, rows: CcEnquiry[]) {
  const customers = await loadCustomers(ctx, rows.map((row) => row.customerId).filter((id): id is string => Boolean(id)))
  return (row: CcEnquiry) => (row.customerId ? (customers.get(row.customerId)?.name ?? null) : null)
}

export async function findEnquiry(ctx: OrderContext, id: string) {
  const row = await ctx.em.findOne(CcEnquiry, { id, ...scope(ctx), deletedAt: null })
  if (!row) throw new CrmError('Enquiry not found', 404)
  return row
}

export async function enquiryDetail(ctx: OrderContext, row: CcEnquiry) {
  const name = await customerNames(ctx, [row])
  const quotations = await ctx.em.find(CcQuotation, { enquiryId: row.id, ...scope(ctx), deletedAt: null }, { orderBy: { createdAt: 'desc' } })
  return {
    ...enquiryView(row, name(row)),
    quotations: quotations.map((quote) => ({ id: quote.id, quoteNo: quote.quoteNo, quoteDate: quote.quoteDate, status: quote.status, totalAmount: Number(quote.totalAmount), currency: quote.currency, orderId: quote.orderId ?? null, orderNo: quote.orderNo ?? null })),
  }
}

function checkParty(input: EnquiryInput) {
  if (!input.customerId && !input.companyName && !input.contactName) throw new CrmError('Enter the company or the person who asked (or pick an existing customer)')
  const received = new Date(input.receivedAt)
  if (Number.isNaN(received.getTime())) throw new CrmError('Enter when the enquiry came in')
  return received
}

function applyInput(row: CcEnquiry, input: EnquiryInput, received: Date) {
  row.source = input.source
  row.receivedAt = received
  row.customerId = input.customerId ?? null
  row.companyName = input.customerId ? null : input.companyName
  row.contactName = input.contactName
  row.phone = input.phone
  row.email = input.email
  row.place = input.place
  row.subject = input.subject
  row.details = input.details
  row.ownerName = input.ownerName
  row.nextActionOn = input.nextActionOn ?? null
  row.nextActionNote = input.nextActionNote
}

export async function saveEnquiry(ctx: OrderContext, existing: CcEnquiry | null, input: EnquiryInput, byName: string | null) {
  const received = checkParty(input)
  if (existing) {
    applyInput(existing, input, received)
    existing.history = [...(existing.history ?? []), entry('edited', byName)]
    await ctx.em.flush()
    return existing
  }
  return ctx.em.transactional(async (em) => {
    const row = em.create(CcEnquiry, {
      ...scope(ctx),
      enquiryNo: await nextSeriesCode({ ...ctx, em }, 'ENQ', received),
      source: input.source,
      receivedAt: received,
      subject: input.subject,
      byName,
      ownerName: input.ownerName ?? byName,
      history: [entry('created', byName, input.source)],
    })
    applyInput(row, { ...input, ownerName: input.ownerName ?? byName }, received)
    em.persist(row)
    await em.flush()
    return row
  })
}

export async function enquiryAction(ctx: OrderContext, row: CcEnquiry, action: EnquiryAction, byName: string | null) {
  if (action.action === 'stage') {
    if (!action.stage) throw new CrmError('Pick the stage')
    if (action.stage === 'lost' && !action.lostReason) throw new CrmError('Pick why the enquiry was lost')
    const from = row.stage
    row.stage = action.stage
    row.lostReason = action.stage === 'lost' ? action.lostReason : null
    if (action.stage === 'won' || action.stage === 'lost') row.nextActionOn = null
    row.history = [...(row.history ?? []), entry('stage', byName, [`${from} → ${action.stage}`, action.lostReason, action.note].filter(Boolean).join(' · '))]
  } else if (action.action === 'follow_up') {
    if (!action.nextActionOn) throw new CrmError('Pick the next follow-up date')
    row.nextActionOn = action.nextActionOn
    row.nextActionNote = action.nextActionNote
    row.history = [...(row.history ?? []), entry('follow_up', byName, [action.nextActionOn, action.nextActionNote, action.note].filter(Boolean).join(' · '))]
  } else {
    if (!action.note) throw new CrmError('Write the note')
    row.history = [...(row.history ?? []), entry('note', byName, action.note)]
  }
  await ctx.em.flush()
  return row
}

export async function markEnquiry(ctx: OrderContext, enquiryId: string | null | undefined, stage: EnquiryStage, byName: string | null, note: string, orderId: string | null = null) {
  if (!enquiryId) return
  const row = await ctx.em.findOne(CcEnquiry, { id: enquiryId, ...scope(ctx), deletedAt: null })
  if (!row) return
  const order = ['new', 'quoted', 'negotiating', 'won', 'lost']
  if (stage !== 'won' && order.indexOf(row.stage) >= order.indexOf(stage)) return
  row.stage = stage
  if (orderId) row.orderId = orderId
  if (stage === 'won') row.nextActionOn = null
  row.history = [...(row.history ?? []), entry('stage', byName, note)]
  await ctx.em.flush()
}

export async function listEnquiries(ctx: OrderContext, query: { stage: string; search?: string }) {
  const today = todayIst()
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.stage === 'open') where.stage = { $in: OPEN_STAGES }
  else if (query.stage === 'overdue') Object.assign(where, { stage: { $in: OPEN_STAGES }, nextActionOn: { $lt: today, $ne: null } })
  else if (query.stage !== 'all') where.stage = query.stage
  if (query.search) {
    const like = `%${query.search}%`
    where.$or = [{ enquiryNo: { $ilike: like } }, { subject: { $ilike: like } }, { companyName: { $ilike: like } }, { contactName: { $ilike: like } }, { phone: { $ilike: like } }, { email: { $ilike: like } }]
  }
  const rows = await ctx.em.find(CcEnquiry, where, { orderBy: { receivedAt: 'desc' }, limit: 500 })
  const name = await customerNames(ctx, rows)
  const counts = await ctx.em.getConnection().execute<Array<{ stage: string; total: string; overdue: string }>>(
    `select stage, count(*) as total, count(*) filter (where next_action_on is not null and next_action_on < ? and stage in ('new','quoted','negotiating')) as overdue
       from cc_enquiries where tenant_id = ? and organization_id = ? and deleted_at is null group by stage`,
    [today, ctx.tenantId, ctx.organizationId],
  )
  return {
    items: rows.map((row) => enquiryView(row, name(row))),
    counts: Object.fromEntries(counts.map((row) => [row.stage, Number(row.total)])),
    overdue: counts.reduce((sum, row) => sum + Number(row.overdue), 0),
  }
}

export async function overdueEnquiries(ctx: OrderContext, limit = 20) {
  const today = todayIst()
  const rows = await ctx.em.find(CcEnquiry, { ...scope(ctx), deletedAt: null, stage: { $in: OPEN_STAGES }, nextActionOn: { $lt: today, $ne: null } }, { orderBy: { nextActionOn: 'asc' }, limit })
  const name = await customerNames(ctx, rows)
  return rows.map((row) => ({ id: row.id, enquiryNo: row.enquiryNo, partyName: name(row) ?? row.companyName ?? row.contactName ?? null, subject: row.subject, stage: row.stage, ownerName: row.ownerName ?? null, nextActionOn: row.nextActionOn ?? null, nextActionNote: row.nextActionNote ?? null }))
}
