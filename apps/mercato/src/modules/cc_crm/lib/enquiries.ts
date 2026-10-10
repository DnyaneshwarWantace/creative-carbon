import type { OrderContext } from '../../cc_orders/lib/server'
import { loadCustomers } from '../../cc_orders/lib/server'
import { nextSeriesCode } from '../../cc_accounts/lib/numberSeries'
import { CcEnquiry, CcFollowUp, CcQuotation, type EnquiryStage, type FollowUpKind } from '../data/entities'
import type { EnquiryAction, EnquiryInput } from '../data/validators'
import { CrmError, entry, todayIst } from './server'
import { closePlanned, followUpAction, planFollowUp, syncEnquiryNext } from './followUps'
import { diffFields, recordActivity } from '../../cc_audit/lib/activity'

const REOPEN_DAYS = 90

function needReason(value: string | null | undefined): string {
  const reason = value?.trim() ?? ''
  if (reason.length < 3) throw new CrmError('Write why (at least 3 letters); it is kept in the history')
  return reason
}

const ENQUIRY_FIELDS = {
  source: { label: 'Source' },
  customerId: { label: 'Customer' },
  companyName: { label: 'Company' },
  contactName: { label: 'Contact' },
  phone: { label: 'Phone' },
  email: { label: 'Email' },
  place: { label: 'Place' },
  subject: { label: 'Subject' },
  details: { label: 'Details' },
  ownerName: { label: 'Owner' },
}

function enquiryFields(row: CcEnquiry): Record<string, unknown> {
  return { source: row.source, customerId: row.customerId ?? null, companyName: row.companyName ?? null, contactName: row.contactName ?? null, phone: row.phone ?? null, email: row.email ?? null, place: row.place ?? null, subject: row.subject, details: row.details ?? null, ownerName: row.ownerName ?? null }
}

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
    followUps: (await ctx.em.find(CcFollowUp, { enquiryId: row.id, ...scope(ctx), deletedAt: null }, { orderBy: { dueOn: 'desc', createdAt: 'desc' } })).map((item) => ({ id: item.id, kind: item.kind, dueOn: item.dueOn, status: item.status, note: item.note ?? null, outcome: item.outcome ?? null, ownerName: item.ownerName ?? null })),
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

async function setNextFollowUp(ctx: OrderContext, enquiryId: string, dueOn: string, note: string | null, kind: FollowUpKind | null, byName: string | null) {
  const [next] = await ctx.em.find(CcFollowUp, { enquiryId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: 'planned' }, { orderBy: { dueOn: 'asc', createdAt: 'asc' }, limit: 1 })
  if (!next) {
    await planFollowUp(ctx, { enquiryId, kind: kind ?? 'call', dueOn, note }, byName)
    return
  }
  if (next.dueOn !== dueOn) await followUpAction(ctx, next, { action: 'reschedule', dueOn, reason: note ? `Next follow-up changed on the enquiry: ${note}` : 'Next follow-up changed on the enquiry' }, byName)
  if (note) next.note = note
  if (kind) next.kind = kind
  await syncEnquiryNext(ctx, enquiryId)
}

export async function saveEnquiry(ctx: OrderContext, existing: CcEnquiry | null, input: EnquiryInput, byName: string | null) {
  const received = checkParty(input)
  if (existing) {
    const before = enquiryFields(existing)
    const plannedNext = existing.nextActionOn ?? null
    applyInput(existing, input, received)
    existing.nextActionOn = plannedNext
    const changes = diffFields(before, enquiryFields(existing), ENQUIRY_FIELDS)
    existing.history = [...(existing.history ?? []), entry('edited', byName)]
    if (changes.length) recordActivity(ctx.em, ctx, { recordType: 'enquiry', recordId: existing.id, action: 'edited', kind: 'change', changes, actorUserId: ctx.userId ?? null, actorName: byName })
    await ctx.em.flush()
    if (input.nextActionOn && input.nextActionOn !== plannedNext) {
      await setNextFollowUp(ctx, existing.id, input.nextActionOn, input.nextActionNote ?? null, null, byName)
      await ctx.em.flush()
    }
    return existing
  }
  const created = await ctx.em.transactional(async (em) => {
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
    row.nextActionOn = null
    row.nextActionNote = null
    em.persist(row)
    await em.flush()
    return row
  })
  if (input.nextActionOn) await planFollowUp(ctx, { enquiryId: created.id, dueOn: input.nextActionOn, note: input.nextActionNote ?? null }, byName)
  return created
}

export async function enquiryAction(ctx: OrderContext, row: CcEnquiry, action: EnquiryAction, byName: string | null) {
  if (action.action === 'stage') {
    if (!action.stage) throw new CrmError('Pick the stage')
    if (action.stage === 'lost' && !action.lostReason) throw new CrmError('Pick why the enquiry was lost')
    const from = row.stage
    row.stage = action.stage
    row.lostReason = action.stage === 'lost' ? action.lostReason : null
    if (action.stage === 'won' || action.stage === 'lost') {
      row.nextActionOn = null
      row.nextActionNote = null
      await closePlanned(ctx, row.id, `Enquiry ${action.stage}`, byName)
    }
    row.history = [...(row.history ?? []), entry('stage', byName, [`${from} → ${action.stage}`, action.lostReason, action.note].filter(Boolean).join(' · '))]
  } else if (action.action === 'follow_up') {
    if (!action.nextActionOn) throw new CrmError('Pick the next follow-up date')
    const note = action.nextActionNote ?? action.note ?? null
    await setNextFollowUp(ctx, row.id, action.nextActionOn, note, action.kind ?? null, byName)
    row.history = [...(row.history ?? []), entry('follow_up', byName, [action.nextActionOn, note].filter(Boolean).join(' · '))]
    await syncEnquiryNext(ctx, row.id)
    await ctx.em.flush()
    return row
  } else if (action.action === 'reopen') {
    const reason = needReason(action.reason)
    if (row.stage !== 'lost') throw new CrmError('Only a lost enquiry can be reopened', 409)
    const lostAt = [...(row.history ?? [])].reverse().find((item) => item.action === 'stage' && /→ lost/.test(item.note ?? ''))?.at ?? row.updatedAt.toISOString()
    if (Date.now() - Date.parse(lostAt) > REOPEN_DAYS * 86_400_000) throw new CrmError(`Lost more than ${REOPEN_DAYS} days ago. Log a new enquiry instead.`, 409)
    const lost = row.lostReason
    row.stage = 'negotiating'
    row.lostReason = null
    row.history = [...(row.history ?? []), entry('reopened', byName, [`lost (${lost ?? '—'}) → negotiating`, reason].join(' · '))]
    recordActivity(ctx.em, ctx, { recordType: 'enquiry', recordId: row.id, action: 'reopened', kind: 'correction', summary: `Reopened; it was lost (${lost ?? 'no reason'})`, reason, changes: [{ field: 'stage', label: 'Stage', from: 'lost', to: 'negotiating' }], actorUserId: ctx.userId ?? null, actorName: byName })
  } else if (action.action === 'reassign') {
    const reason = needReason(action.reason)
    const owner = action.ownerName?.trim()
    if (!owner) throw new CrmError('Pick the new owner')
    if (owner === row.ownerName) throw new CrmError(`${owner} already owns it`)
    const from = row.ownerName ?? null
    row.ownerName = owner
    row.history = [...(row.history ?? []), entry('owner', byName, `${from ?? '—'} → ${owner} · ${reason}`)]
    recordActivity(ctx.em, ctx, { recordType: 'enquiry', recordId: row.id, action: 'reassigned', kind: 'change', summary: `Handed from ${from ?? 'nobody'} to ${owner}`, reason, changes: [{ field: 'ownerName', label: 'Owner', from, to: owner }], actorUserId: ctx.userId ?? null, actorName: byName })
    const open = await ctx.em.find(CcFollowUp, { enquiryId: row.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: 'planned' })
    for (const followUp of open) {
      followUp.ownerName = owner
      followUp.history = [...(followUp.history ?? []), entry('owner', byName, `${from ?? '—'} → ${owner} (enquiry handed over)`)]
    }
  } else if (action.action === 'undo_won') {
    const reason = needReason(action.reason)
    if (row.stage !== 'won') throw new CrmError('This enquiry is not won', 409)
    if (row.orderId) {
      const [paid] = await ctx.em.getConnection().execute<Array<{ total: string }>>(
        `select coalesce(sum(amount), 0) as total from cc_order_payments where order_id = ? and tenant_id = ? and organization_id = ? and voided_at is null`,
        [row.orderId, ctx.tenantId, ctx.organizationId],
      )
      if (Number(paid?.total ?? 0) > 0) throw new CrmError('The order already has an advance. Undo is not possible now.', 409)
      const [held] = await ctx.em.getConnection().execute<Array<{ total: string }>>(
        `select count(*) as total from cc_order_allocations where order_id = ? and tenant_id = ? and organization_id = ? and status in ('reserved', 'shipped')`,
        [row.orderId, ctx.tenantId, ctx.organizationId],
      )
      if (Number(held?.total ?? 0) > 0) throw new CrmError('Stock is already allocated to the order. Undo is not possible now.', 409)
      const [advance] = await ctx.em.getConnection().execute<Array<{ status: string }>>(
        `select status from cc_order_stages where order_id = ? and stage_key = 'advance' limit 1`,
        [row.orderId],
      )
      if (advance && (advance.status === 'done' || advance.status === 'skipped')) throw new CrmError('The order has passed Advance / LC. Undo is not possible now.', 409)
    }
    const orderId = row.orderId ?? null
    row.stage = 'negotiating'
    row.orderId = null
    row.history = [...(row.history ?? []), entry('undo_won', byName, reason)]
    recordActivity(ctx.em, ctx, { recordType: 'enquiry', recordId: row.id, action: 'won_undone', kind: 'correction', summary: 'Won undone; back to negotiating and the order is unlinked', reason, changes: [{ field: 'stage', label: 'Stage', from: 'won', to: 'negotiating' }], links: orderId ? [{ type: 'order', id: orderId, label: null }] : [], actorUserId: ctx.userId ?? null, actorName: byName })
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
  if (stage === 'won') {
    row.nextActionOn = null
    row.nextActionNote = null
    await closePlanned(ctx, row.id, 'Enquiry won', byName)
  }
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
