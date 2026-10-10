import type { OrderContext } from '../../cc_orders/lib/server'
import { loadCustomers } from '../../cc_orders/lib/server'
import { recordActivity } from '../../cc_audit/lib/activity'
import { CcEnquiry, CcFollowUp, CcQuotation, type FollowUpKind } from '../data/entities'
import { CrmError, entry, todayIst } from './server'

export const FOLLOW_UP_KINDS: FollowUpKind[] = ['call', 'visit', 'sample', 'quote_chase', 'other']
export const KIND_LABEL: Record<FollowUpKind, string> = { call: 'Call', visit: 'Visit', sample: 'Sample', quote_chase: 'Quote chase', other: 'Other' }
export const UNDO_HOURS = 24

function scope(ctx: OrderContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function actor(ctx: OrderContext, byName: string | null) {
  return { actorUserId: ctx.userId ?? null, actorName: byName }
}

export async function findFollowUp(ctx: OrderContext, id: string) {
  const row = await ctx.em.findOne(CcFollowUp, { id, ...scope(ctx), deletedAt: null })
  if (!row) throw new CrmError('Follow-up not found', 404)
  return row
}

export async function syncEnquiryNext(ctx: OrderContext, enquiryId: string | null | undefined) {
  if (!enquiryId) return
  const enquiry = await ctx.em.findOne(CcEnquiry, { id: enquiryId, ...scope(ctx), deletedAt: null })
  if (!enquiry) return
  const [next] = await ctx.em.find(CcFollowUp, { enquiryId, ...scope(ctx), deletedAt: null, status: 'planned' }, { orderBy: { dueOn: 'asc', createdAt: 'asc' }, limit: 1 })
  enquiry.nextActionOn = next?.dueOn ?? null
  enquiry.nextActionNote = next ? [KIND_LABEL[next.kind], next.note].filter(Boolean).join(': ') : null
}

export async function closePlanned(ctx: OrderContext, enquiryId: string, note: string, byName: string | null) {
  const open = await ctx.em.find(CcFollowUp, { enquiryId, ...scope(ctx), deletedAt: null, status: 'planned' })
  for (const row of open) {
    row.status = 'skipped'
    row.doneAt = new Date()
    row.doneByName = byName
    row.doneByUserId = ctx.userId ?? null
    row.history = [...(row.history ?? []), entry('skipped', byName, note)]
  }
  return open.length
}

export async function planFollowUp(
  ctx: OrderContext,
  input: { enquiryId?: string | null; quotationId?: string | null; customerId?: string | null; kind?: FollowUpKind | null; dueOn: string; note?: string | null; ownerName?: string | null; fromId?: string | null },
  byName: string | null,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) throw new CrmError('Pick the follow-up date')
  let customerId = input.customerId ?? null
  let ownerName = input.ownerName ?? null
  if (input.enquiryId) {
    const enquiry = await ctx.em.findOne(CcEnquiry, { id: input.enquiryId, ...scope(ctx), deletedAt: null })
    if (!enquiry) throw new CrmError('Enquiry not found', 404)
    if (enquiry.stage === 'won' || enquiry.stage === 'lost') throw new CrmError(`This enquiry is ${enquiry.stage}. Reopen it to plan follow-ups.`, 409)
    customerId = customerId ?? enquiry.customerId ?? null
    ownerName = ownerName ?? enquiry.ownerName ?? byName
  }
  if (input.quotationId) {
    const quote = await ctx.em.findOne(CcQuotation, { id: input.quotationId, ...scope(ctx), deletedAt: null })
    if (!quote) throw new CrmError('Quotation not found', 404)
    customerId = customerId ?? quote.customerId
  }
  const kind = input.kind ?? 'call'
  const row = ctx.em.create(CcFollowUp, {
    ...scope(ctx),
    enquiryId: input.enquiryId ?? null,
    quotationId: input.quotationId ?? null,
    customerId,
    kind,
    dueOn: input.dueOn,
    note: input.note?.trim() || null,
    ownerName: ownerName ?? byName,
    createdByName: byName,
    createdByUserId: ctx.userId ?? null,
    history: [entry('planned', byName, [input.dueOn, input.note].filter(Boolean).join(' · '))],
  })
  ctx.em.persist(row)
  await ctx.em.flush()
  recordActivity(ctx.em, ctx, { recordType: 'follow_up', recordId: row.id, action: 'planned', kind: 'stage', summary: `${KIND_LABEL[kind]} planned for ${input.dueOn}${row.ownerName ? ` (${row.ownerName})` : ''}`, links: input.fromId ? [{ type: 'follow_up', id: input.fromId, label: 'Previous follow-up' }] : [], ...actor(ctx, byName) })
  if (input.enquiryId) {
    recordActivity(ctx.em, ctx, { recordType: 'enquiry', recordId: input.enquiryId, action: 'follow_up_planned', kind: 'stage', summary: `${KIND_LABEL[kind]} planned for ${input.dueOn}${row.note ? `: ${row.note}` : ''}`, links: [{ type: 'follow_up', id: row.id, label: `${KIND_LABEL[kind]} ${input.dueOn}` }], ...actor(ctx, byName) })
    await syncEnquiryNext(ctx, input.enquiryId)
  }
  await ctx.em.flush()
  return row
}

export type FollowUpActionInput = { action: 'done' | 'skip' | 'reschedule' | 'undo'; outcome?: string | null; reason?: string | null; dueOn?: string | null; next?: { dueOn: string; kind?: FollowUpKind | null; note?: string | null } | null }

export async function followUpAction(ctx: OrderContext, row: CcFollowUp, input: FollowUpActionInput, byName: string | null) {
  const reason = input.reason?.trim() ?? ''
  const log = (action: string, kind: 'stage' | 'correction' | 'change', summary: string, extra: Record<string, unknown> = {}) =>
    recordActivity(ctx.em, ctx, { recordType: 'follow_up', recordId: row.id, action, kind, summary, reason: reason || null, ...actor(ctx, byName), ...extra })
  let nextRow: CcFollowUp | null = null
  if (input.action === 'done') {
    if (row.status !== 'planned') throw new CrmError('This follow-up is already closed', 409)
    const outcome = input.outcome?.trim() ?? ''
    if (outcome.length < 3) throw new CrmError('Write what came out of it (at least 3 letters)')
    row.status = 'done'
    row.outcome = outcome
    row.doneAt = new Date()
    row.doneByName = byName
    row.doneByUserId = ctx.userId ?? null
    row.history = [...(row.history ?? []), entry('done', byName, outcome)]
    log('done', 'stage', `Done: ${outcome}`)
    if (row.enquiryId) recordActivity(ctx.em, ctx, { recordType: 'enquiry', recordId: row.enquiryId, action: 'follow_up_done', kind: 'stage', summary: `${KIND_LABEL[row.kind]} of ${row.dueOn} done: ${outcome}`, links: [{ type: 'follow_up', id: row.id, label: `${KIND_LABEL[row.kind]} ${row.dueOn}` }], ...actor(ctx, byName) })
    if (input.next?.dueOn) nextRow = await planFollowUp(ctx, { enquiryId: row.enquiryId, quotationId: row.quotationId, customerId: row.customerId, kind: input.next.kind ?? row.kind, dueOn: input.next.dueOn, note: input.next.note, ownerName: row.ownerName, fromId: row.id }, byName)
  } else if (input.action === 'skip') {
    if (row.status !== 'planned') throw new CrmError('This follow-up is already closed', 409)
    if (reason.length < 3) throw new CrmError('Write why it is skipped (at least 3 letters)')
    row.status = 'skipped'
    row.doneAt = new Date()
    row.doneByName = byName
    row.doneByUserId = ctx.userId ?? null
    row.history = [...(row.history ?? []), entry('skipped', byName, reason)]
    log('skipped', 'stage', 'Skipped')
  } else if (input.action === 'reschedule') {
    if (row.status !== 'planned') throw new CrmError('Only a planned follow-up can be moved', 409)
    if (!input.dueOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) throw new CrmError('Pick the new date')
    if (reason.length < 3) throw new CrmError('Write why it moves (at least 3 letters)')
    if (input.dueOn === row.dueOn) throw new CrmError('That is the same date')
    const from = row.dueOn
    row.dueOn = input.dueOn
    row.history = [...(row.history ?? []), entry('rescheduled', byName, `${from} → ${input.dueOn} · ${reason}`)]
    log('rescheduled', 'change', `Moved from ${from} to ${input.dueOn}`, { changes: [{ field: 'dueOn', label: 'Due date', from, to: input.dueOn }] })
  } else {
    if (row.status === 'planned') throw new CrmError('This follow-up is still planned', 409)
    if (reason.length < 3) throw new CrmError('Write why it is undone (at least 3 letters)')
    if (row.doneByUserId && ctx.userId && row.doneByUserId !== ctx.userId) throw new CrmError(`Only ${row.doneByName ?? 'the person who closed it'} can undo this`, 403)
    if (row.doneAt && Date.now() - row.doneAt.getTime() > UNDO_HOURS * 3600_000) throw new CrmError(`Closed more than ${UNDO_HOURS} hours ago. Plan a new follow-up instead.`, 409)
    if (row.enquiryId && row.doneAt) {
      const newer = await ctx.em.count(CcFollowUp, { enquiryId: row.enquiryId, ...scope(ctx), deletedAt: null, id: { $ne: row.id }, createdAt: { $gt: row.doneAt } })
      if (newer) throw new CrmError('A newer follow-up was planned after this one. Undo or move that one instead.', 409)
    }
    const was = row.status
    row.status = 'planned'
    row.outcome = null
    row.doneAt = null
    row.doneByName = null
    row.doneByUserId = null
    row.history = [...(row.history ?? []), entry('reopened', byName, reason)]
    log('undone', 'correction', `${was === 'done' ? 'Done' : 'Skipped'} by mistake; back to planned`)
  }
  await ctx.em.flush()
  await syncEnquiryNext(ctx, row.enquiryId)
  await ctx.em.flush()
  return { row, next: nextRow }
}

export async function followUpView(ctx: OrderContext, row: CcFollowUp) {
  const [enquiry, quote, customers, siblings] = await Promise.all([
    row.enquiryId ? ctx.em.findOne(CcEnquiry, { id: row.enquiryId, ...scope(ctx) }) : null,
    row.quotationId ? ctx.em.findOne(CcQuotation, { id: row.quotationId, ...scope(ctx) }) : null,
    row.customerId ? loadCustomers(ctx, [row.customerId]) : null,
    row.enquiryId ? ctx.em.find(CcFollowUp, { enquiryId: row.enquiryId, ...scope(ctx), deletedAt: null, id: { $ne: row.id } }, { orderBy: { createdAt: 'asc' } }) : [],
  ])
  const today = todayIst()
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: KIND_LABEL[row.kind],
    dueOn: row.dueOn,
    overdue: row.status === 'planned' && row.dueOn < today,
    note: row.note ?? null,
    ownerName: row.ownerName ?? null,
    status: row.status,
    outcome: row.outcome ?? null,
    doneAt: row.doneAt ? row.doneAt.toISOString() : null,
    doneByName: row.doneByName ?? null,
    canUndo: row.status !== 'planned' && Boolean(row.doneAt && Date.now() - row.doneAt.getTime() <= UNDO_HOURS * 3600_000) && (!row.doneByUserId || row.doneByUserId === ctx.userId),
    createdByName: row.createdByName ?? null,
    enquiry: enquiry ? { id: enquiry.id, enquiryNo: enquiry.enquiryNo, subject: enquiry.subject, stage: enquiry.stage } : null,
    quotation: quote ? { id: quote.id, quoteNo: quote.quoteNo, status: quote.status } : null,
    customer: row.customerId ? { id: row.customerId, name: customers?.get(row.customerId)?.name ?? null } : null,
    partyName: (row.customerId ? customers?.get(row.customerId)?.name : null) ?? enquiry?.companyName ?? enquiry?.contactName ?? null,
    others: siblings.map((entryRow) => ({ id: entryRow.id, kind: entryRow.kind, dueOn: entryRow.dueOn, status: entryRow.status, newer: entryRow.createdAt > row.createdAt })),
    history: row.history ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listFollowUps(ctx: OrderContext, query: { view: 'mine' | 'all'; status: 'open' | 'done' | 'all'; owner: string | null }) {
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.status === 'open') where.status = 'planned'
  else if (query.status === 'done') where.status = { $in: ['done', 'skipped'] }
  if (query.view === 'mine' && query.owner) where.ownerName = query.owner
  const rows = await ctx.em.find(CcFollowUp, where, { orderBy: { dueOn: query.status === 'done' ? 'desc' : 'asc' }, limit: 300 })
  const enquiries = await ctx.em.find(CcEnquiry, { id: { $in: rows.map((row) => row.enquiryId).filter((id): id is string => Boolean(id)) }, ...scope(ctx) })
  const customers = await loadCustomers(ctx, rows.map((row) => row.customerId).filter((id): id is string => Boolean(id)))
  const today = todayIst()
  return rows.map((row) => {
    const enquiry = enquiries.find((entryRow) => entryRow.id === row.enquiryId)
    return {
      id: row.id,
      kind: row.kind,
      kindLabel: KIND_LABEL[row.kind],
      dueOn: row.dueOn,
      overdue: row.status === 'planned' && row.dueOn < today,
      status: row.status,
      note: row.note ?? null,
      outcome: row.outcome ?? null,
      ownerName: row.ownerName ?? null,
      enquiryId: row.enquiryId ?? null,
      enquiryNo: enquiry?.enquiryNo ?? null,
      subject: enquiry?.subject ?? null,
      partyName: (row.customerId ? customers.get(row.customerId)?.name : null) ?? enquiry?.companyName ?? enquiry?.contactName ?? null,
    }
  })
}
