import { stageDef } from '../../cc_orders/lib/stages'
import type { Scope } from './overview'

const DAY_MS = 86400000

type Row = { order_id: string; order_no: string; stage_key: string; responsible_name: string | null; completed_by_name: string | null; opened_at: Date; completed_at: Date }

function round(value: number): number {
  return Math.round(value * 10) / 10
}

export async function turnaround(ctx: Scope, days: number) {
  const since = new Date(Date.now() - days * DAY_MS)
  const rows = await ctx.em.getConnection().execute<Row[]>(
    `select s.order_id, o.order_no, s.stage_key, s.responsible_name, s.completed_by_name, s.opened_at, s.completed_at
       from cc_order_stages s join cc_orders o on o.id = s.order_id
      where o.tenant_id = ? and o.organization_id = ? and o.deleted_at is null
        and s.status = 'done' and s.opened_at is not null and s.completed_at is not null and s.completed_at >= ? and s.stage_key <> 'order'`,
    [ctx.tenantId, ctx.organizationId, since],
  )
  const withDays = rows.map((row) => ({ ...row, days: Math.max(0, (new Date(row.completed_at).getTime() - new Date(row.opened_at).getTime()) / DAY_MS), person: row.responsible_name ?? row.completed_by_name ?? 'Not assigned' }))

  const stageMap = new Map<string, number[]>()
  for (const row of withDays) stageMap.set(row.stage_key, [...(stageMap.get(row.stage_key) ?? []), row.days])
  const stages = Array.from(stageMap.entries())
    .map(([key, values]) => ({
      key,
      label: stageDef(key)?.label ?? key,
      department: stageDef(key)?.department ?? '',
      completed: values.length,
      averageDays: round(values.reduce((sum, value) => sum + value, 0) / values.length),
      slowestDays: round(Math.max(...values)),
    }))
    .sort((a, b) => b.averageDays - a.averageDays)

  const openRows = await ctx.em.getConnection().execute<Array<{ responsible_name: string | null; opened_at: Date | null }>>(
    `select s.responsible_name, s.opened_at from cc_order_stages s join cc_orders o on o.id = s.order_id
      where o.tenant_id = ? and o.organization_id = ? and o.deleted_at is null and o.status in ('booked', 'confirmed') and s.status in ('open', 'on_hold')`,
    [ctx.tenantId, ctx.organizationId],
  )
  const personMap = new Map<string, { done: number[]; open: number; oldestOpen: number }>()
  for (const row of withDays) {
    const entry = personMap.get(row.person) ?? { done: [], open: 0, oldestOpen: 0 }
    entry.done.push(row.days)
    personMap.set(row.person, entry)
  }
  for (const row of openRows) {
    const name = row.responsible_name ?? 'Not assigned'
    const entry = personMap.get(name) ?? { done: [], open: 0, oldestOpen: 0 }
    entry.open += 1
    if (row.opened_at) entry.oldestOpen = Math.max(entry.oldestOpen, (Date.now() - new Date(row.opened_at).getTime()) / DAY_MS)
    personMap.set(name, entry)
  }
  const people = Array.from(personMap.entries())
    .map(([name, entry]) => ({
      name,
      completed: entry.done.length,
      averageDays: entry.done.length ? round(entry.done.reduce((sum, value) => sum + value, 0) / entry.done.length) : null,
      openNow: entry.open,
      oldestOpenDays: round(entry.oldestOpen),
    }))
    .sort((a, b) => (b.averageDays ?? 0) - (a.averageDays ?? 0))

  const slowest = withDays
    .sort((a, b) => b.days - a.days)
    .slice(0, 10)
    .map((row) => ({ orderId: row.order_id, orderNo: row.order_no, stageKey: row.stage_key, stageLabel: stageDef(row.stage_key)?.label ?? row.stage_key, person: row.person, days: round(row.days), completedAt: new Date(row.completed_at).toISOString() }))

  return { days, completedSteps: withDays.length, averageDays: withDays.length ? round(withDays.reduce((sum, row) => sum + row.days, 0) / withDays.length) : null, stages, people, slowest }
}
