import type { StoreContext } from '../../cc_store/lib/server'
import { CcOrder } from '../../cc_orders/data/entities'
import { logEvent } from '../../cc_orders/lib/engine'
import { loadCustomers } from '../../cc_orders/lib/server'
import { recordActivity } from '../../cc_audit/lib/activity'
import { CcEnquiry, CcFollowUp, CcQuotation } from '../data/entities'
import { listTeam } from './team'
import { CrmError, entry, todayIst } from './server'

const OPEN_STAGES = ['new', 'quoted', 'negotiating'] as const
const DAY_MS = 86_400_000

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export async function findPerson(ctx: StoreContext, id: string) {
  const member = (await listTeam(ctx)).find((entryRow) => entryRow.id === id)
  if (!member) throw new CrmError('Person not found', 404)
  return { ...member, displayName: member.name ?? member.email }
}

export async function personView(ctx: StoreContext, id: string) {
  const member = await findPerson(ctx, id)
  const name = member.displayName
  const [enquiries, quotations, followUps, createdRow] = await Promise.all([
    ctx.em.find(CcEnquiry, { ...scope(ctx), deletedAt: null, $or: [{ ownerName: name }, { byName: name }] }, { orderBy: { receivedAt: 'desc' }, limit: 300 }),
    ctx.em.find(CcQuotation, { ...scope(ctx), deletedAt: null, byName: name }, { orderBy: { createdAt: 'desc' }, limit: 300 }),
    ctx.em.find(CcFollowUp, { ...scope(ctx), deletedAt: null, $or: [{ ownerName: name }, { doneByName: name }] }, { orderBy: { dueOn: 'desc' }, limit: 300 }),
    ctx.em.getConnection().execute<Array<{ created_at: Date }>>('select created_at from users where id = ? limit 1', [id]),
  ])
  const customers = await loadCustomers(ctx, [...enquiries.map((row) => row.customerId), ...quotations.map((row) => row.customerId)].filter((value): value is string => Boolean(value)))
  const party = (customerId: string | null | undefined, fallback?: string | null): string | null => {
    const known = customerId ? customers.get(customerId)?.name : undefined
    return known ?? fallback ?? null
  }
  const today = todayIst()
  const owned = enquiries.filter((row) => row.ownerName === name)
  const open = owned.filter((row) => (OPEN_STAGES as readonly string[]).includes(row.stage))
  const won = owned.filter((row) => row.stage === 'won')
  const planned = followUps.filter((row) => row.ownerName === name && row.status === 'planned')
  const missed = planned.filter((row) => row.dueOn < today)
  const monthAgo = Date.now() - 30 * DAY_MS
  const feed = [
    ...enquiries.filter((row) => row.byName === name).map((row) => ({ at: row.createdAt.toISOString(), kind: 'enquiry', text: `Logged enquiry ${row.enquiryNo}: ${row.subject}`, href: `/backend/crm/enquiries/${row.id}` })),
    ...quotations.filter((row) => row.sentAt).map((row) => ({ at: (row.sentAt as Date).toISOString(), kind: 'quote', text: `Sent quotation ${row.quoteNo}${party(row.customerId) ? ` to ${party(row.customerId)}` : ''}`, href: `/backend/crm/quotations/${row.id}` })),
    ...followUps.filter((row) => row.doneByName === name && row.doneAt && row.status === 'done').map((row) => ({ at: (row.doneAt as Date).toISOString(), kind: 'follow_up', text: `Follow-up done: ${row.outcome ?? ''}`, href: `/backend/crm/follow-ups/${row.id}` })),
    ...missed.map((row) => ({ at: `${row.dueOn}T23:59:00.000Z`, kind: 'missed', text: `Follow-up missed (due ${row.dueOn})${row.note ? `: ${row.note}` : ''}`, href: `/backend/crm/follow-ups/${row.id}` })),
    ...won.map((row) => ({ at: row.updatedAt.toISOString(), kind: 'won', text: `Won enquiry ${row.enquiryNo}`, href: row.orderId ? `/backend/orders/${row.orderId}` : `/backend/crm/enquiries/${row.id}` })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 60)
  return {
    id: member.id,
    name,
    email: member.email,
    crmRole: member.crmRole,
    roles: member.roles,
    crmOnly: member.crmOnly,
    erpAccess: member.erpAccess,
    activeSince: createdRow[0]?.created_at ? new Date(createdRow[0].created_at).toISOString() : null,
    lastLoginAt: member.lastLoginAt,
    stats: {
      openEnquiries: open.length,
      quotesSent30: quotations.filter((row) => row.sentAt && row.sentAt.getTime() >= monthAgo).length,
      followUpsDue: planned.length,
      followUpsMissed: missed.length,
      won: won.length,
      wonValue: Math.round(quotations.filter((row) => row.status === 'converted').reduce((sum, row) => sum + Number(row.totalAmount), 0) * 100) / 100,
    },
    enquiries: owned.slice(0, 50).map((row) => ({ id: row.id, enquiryNo: row.enquiryNo, subject: row.subject, stage: row.stage, partyName: party(row.customerId, row.companyName ?? row.contactName), nextActionOn: row.nextActionOn ?? null })),
    quotations: quotations.slice(0, 50).map((row) => ({ id: row.id, quoteNo: row.quoteNo, status: row.status, partyName: party(row.customerId), totalAmount: Number(row.totalAmount), currency: row.currency, orderId: row.orderId ?? null, orderNo: row.orderNo ?? null })),
    followUps: planned.sort((a, b) => a.dueOn.localeCompare(b.dueOn)).slice(0, 50).map((row) => ({ id: row.id, kind: row.kind, dueOn: row.dueOn, note: row.note ?? null, overdue: row.dueOn < today })),
    orders: won.filter((row) => row.orderId).map((row) => ({ orderId: row.orderId as string, enquiryNo: row.enquiryNo, subject: row.subject })),
    feed,
  }
}

export async function handOver(ctx: StoreContext, id: string, toName: string, reason: string, byName: string | null) {
  const member = await findPerson(ctx, id)
  const from = member.displayName
  const team = await listTeam(ctx)
  const target = team.find((entryRow) => (entryRow.name ?? entryRow.email) === toName)
  if (!target) throw new CrmError('Pick a person from the team')
  if (target.id === id) throw new CrmError('Pick another person')
  const actor = { actorUserId: ctx.userId ?? null, actorName: byName }
  const enquiries = await ctx.em.find(CcEnquiry, { ...scope(ctx), deletedAt: null, ownerName: from, stage: { $in: [...OPEN_STAGES] } })
  for (const row of enquiries) {
    row.ownerName = toName
    row.history = [...(row.history ?? []), entry('owner', byName, `${from} → ${toName} (hand-over) · ${reason}`)]
    recordActivity(ctx.em, ctx, { recordType: 'enquiry', recordId: row.id, action: 'reassigned', kind: 'change', summary: `Handed over from ${from} to ${toName} with all their open work`, reason, changes: [{ field: 'ownerName', label: 'Owner', from, to: toName }], ...actor })
  }
  const followUps = await ctx.em.find(CcFollowUp, { ...scope(ctx), deletedAt: null, ownerName: from, status: 'planned' })
  for (const row of followUps) {
    row.ownerName = toName
    row.history = [...(row.history ?? []), entry('owner', byName, `${from} → ${toName} (hand-over)`)]
  }
  const orders = await ctx.em.find(CcOrder, { ...scope(ctx), deletedAt: null, salesManager: from, status: { $in: ['booked', 'confirmed'] } })
  for (const order of orders) {
    order.salesManager = toName
    order.updatedAt = new Date()
    logEvent(ctx, order, 'edited', null, `Sales manager handed over: ${reason}`, byName, [{ key: 'salesManager', label: 'Sales manager', from, to: toName }])
  }
  const summary = `${enquiries.length} open enquiries, ${followUps.length} follow-ups and ${orders.length} open orders handed from ${from} to ${toName}`
  recordActivity(ctx.em, ctx, { recordType: 'sales_person', recordId: id, action: 'handed_over', kind: 'correction', summary, reason, links: [{ type: 'sales_person', id: target.id, label: toName }], ...actor })
  recordActivity(ctx.em, ctx, { recordType: 'sales_person', recordId: target.id, action: 'took_over', kind: 'change', summary, reason, links: [{ type: 'sales_person', id, label: from }], ...actor })
  await ctx.em.flush()
  return { enquiries: enquiries.length, followUps: followUps.length, orders: orders.length }
}
