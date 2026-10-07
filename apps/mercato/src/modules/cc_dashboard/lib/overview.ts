import type { EntityManager } from '@mikro-orm/postgresql'
import { loadCustomers } from '../../cc_orders/lib/server'
import { stageList, stageDef } from '../../cc_orders/lib/stages'

export const STUCK_DAYS = 3
const DAY_MS = 86400000

export type Scope = { em: EntityManager; tenantId: string; organizationId: string }

type OpenStageRow = {
  order_id: string
  order_no: string
  customer_id: string
  delivery_date: string | null
  stage_key: string
  status: string
  responsible_user_id: string | null
  responsible_name: string | null
  hold_party: string | null
  hold_reason: string | null
  opened_at: Date | null
}

function days(openedAt: Date | null): number {
  if (!openedAt) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / DAY_MS))
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export async function openStages(ctx: Scope, filter?: { userId?: string }): Promise<OpenStageRow[]> {
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  let extra = ''
  if (filter?.userId) {
    extra = 'and s.responsible_user_id = ?'
    params.push(filter.userId)
  }
  return ctx.em.getConnection().execute<OpenStageRow[]>(
    `select s.order_id, o.order_no, o.customer_id, o.delivery_date, s.stage_key, s.status, s.responsible_user_id, s.responsible_name,
            s.hold_party, s.hold_reason, s.opened_at
       from cc_order_stages s join cc_orders o on o.id = s.order_id
      where o.tenant_id = ? and o.organization_id = ? and o.deleted_at is null and o.status in ('booked', 'confirmed')
        and s.status in ('open', 'on_hold') ${extra}
      order by s.opened_at asc nulls last`,
    params,
  )
}

export type WorkItem = {
  orderId: string
  orderNo: string
  customerName: string
  stageKey: string
  stageLabel: string
  department: string
  status: string
  days: number
  stuck: boolean
  holdParty: string | null
  holdReason: string | null
  deliveryDate: string | null
  overdue: boolean
  responsibleName: string | null
  href: string
}

async function toWorkItems(ctx: Scope, rows: OpenStageRow[]): Promise<WorkItem[]> {
  const customers = await loadCustomers(ctx, rows.map((row) => row.customer_id))
  const today = todayIso()
  return rows.map((row) => {
    const def = stageDef(row.stage_key)
    const age = days(row.opened_at)
    return {
      orderId: row.order_id,
      orderNo: row.order_no,
      customerName: customers.get(row.customer_id)?.name ?? '—',
      stageKey: row.stage_key,
      stageLabel: def?.label ?? row.stage_key,
      department: def?.department ?? '',
      status: row.status,
      days: age,
      stuck: row.status === 'on_hold' || age >= STUCK_DAYS,
      holdParty: row.hold_party,
      holdReason: row.hold_reason,
      deliveryDate: row.delivery_date,
      overdue: Boolean(row.delivery_date && row.delivery_date < today),
      responsibleName: row.responsible_name,
      href: `/backend/orders/${row.order_id}/stages/${row.stage_key}`,
    }
  })
}

export async function myWork(ctx: Scope, userId: string | null, everyone: boolean) {
  if (!everyone && !userId) return []
  const rows = await openStages(ctx, everyone ? undefined : { userId: userId ?? undefined })
  const items = await toWorkItems(ctx, rows)
  items.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.status === 'on_hold') - Number(a.status === 'on_hold') || b.days - a.days)
  return items
}

async function count(ctx: Scope, sql: string, params: unknown[] = []): Promise<number> {
  const [row] = await ctx.em.getConnection().execute<Array<{ count: string }>>(sql, [ctx.tenantId, ctx.organizationId, ...params])
  return Number(row?.count ?? 0)
}

export async function overview(ctx: Scope) {
  const today = todayIso()
  const week = new Date(Date.parse(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10)
  const stageRows = await openStages(ctx)
  const items = await toWorkItems(ctx, stageRows)

  const pipeline = stageList().filter((def) => def.key !== 'order').map((def) => {
    const own = items.filter((item) => item.stageKey === def.key)
    return {
      key: def.key,
      label: def.label,
      department: def.department,
      open: own.filter((item) => item.status === 'open').length,
      onHold: own.filter((item) => item.status === 'on_hold').length,
      stuck: own.filter((item) => item.stuck).length,
      oldestDays: own.reduce((max, item) => Math.max(max, item.days), 0),
    }
  })

  const people = new Map<string, { name: string; open: number; stuck: number; oldestDays: number }>()
  for (const item of items) {
    const key = item.responsibleName ?? '—'
    const entry = people.get(key) ?? { name: item.responsibleName ?? 'Not assigned', open: 0, stuck: 0, oldestDays: 0 }
    entry.open += 1
    if (item.stuck) entry.stuck += 1
    entry.oldestDays = Math.max(entry.oldestDays, item.days)
    people.set(key, entry)
  }

  const [orderCounts] = await ctx.em.getConnection().execute<Array<{ open: string; due: string; overdue: string }>>(
    `select count(*)::text as open,
            count(*) filter (where delivery_date >= ? and delivery_date <= ?)::text as due,
            count(*) filter (where delivery_date < ?)::text as overdue
       from cc_orders where tenant_id = ? and organization_id = ? and deleted_at is null and status in ('booked', 'confirmed')`,
    [today, week, today, ctx.tenantId, ctx.organizationId],
  )
  const onHoldOrders = new Set(items.filter((item) => item.status === 'on_hold').map((item) => item.orderId)).size
  const stuckOrders = new Set(items.filter((item) => item.stuck).map((item) => item.orderId)).size

  const materials = await ctx.em.getConnection().execute<
    Array<{ id: string; title: string; kind: string; unit: string | null; code: string | null; reorder_point: string; usable: string; under_test: string; on_po: string }>
  >(
    `select cp.id, cp.title, cp.custom_fieldset_code as kind, cp.default_unit as unit,
            (select v.value_text from custom_field_values v where v.record_id = cp.id::text and v.field_key = 'item_code' and v.deleted_at is null and coalesce(v.value_text, '') <> '' order by v.created_at desc limit 1) as code,
            max(p.reorder_point)::text as reorder_point,
            coalesce((select sum(b.quantity_on_hand) from wms_inventory_balances b
                        join wms_warehouse_locations l on l.id = b.location_id and l.code in ('RM-STORE', 'PM-STORE')
                        left join wms_inventory_lots lot on lot.id = b.lot_id
                       where b.catalog_variant_id in (select id from catalog_product_variants where product_id = cp.id and deleted_at is null)
                         and b.deleted_at is null and coalesce(lot.status, 'available') = 'available'), 0)::text as usable,
            coalesce((select sum(b.quantity_on_hand) from wms_inventory_balances b
                        join wms_inventory_lots lot on lot.id = b.lot_id and lot.status = 'quarantine'
                       where b.catalog_variant_id in (select id from catalog_product_variants where product_id = cp.id and deleted_at is null)
                         and b.deleted_at is null), 0)::text as under_test,
            coalesce((select sum(l.quantity - l.received_qty) from cc_po_lines l join cc_pos po on po.id = l.po_id
                       where l.product_id = cp.id and po.deleted_at is null and po.status in ('pending_approval', 'approved', 'partly_received')), 0)::text as on_po
       from wms_product_inventory_profiles p join catalog_products cp on cp.id = p.catalog_product_id
      where cp.tenant_id = ? and cp.organization_id = ? and cp.deleted_at is null and p.deleted_at is null
        and cp.custom_fieldset_code in ('chemical', 'reinforcement', 'chindi', 'bought_in') and p.reorder_point > 0
      group by cp.id, cp.title, cp.custom_fieldset_code, cp.default_unit`,
    [ctx.tenantId, ctx.organizationId],
  )
  const low = materials
    .map((row) => ({
      id: row.id,
      title: row.title,
      code: row.code,
      kind: row.kind,
      unit: row.unit,
      minimum: Number(row.reorder_point),
      usable: Number(row.usable),
      underTest: Number(row.under_test),
      onPo: Number(row.on_po),
    }))
    .filter((row) => row.usable <= row.minimum)
    .sort((a, b) => a.usable / Math.max(a.minimum, 0.0001) - b.usable / Math.max(b.minimum, 0.0001))

  const queues = {
    poApproval: await count(ctx, `select count(*)::text as count from cc_pos where tenant_id = ? and organization_id = ? and deleted_at is null and status = 'pending_approval'`),
    grnUnderTest: await count(ctx, `select count(*)::text as count from cc_grns where tenant_id = ? and organization_id = ? and deleted_at is null and status in ('under_test', 'partly_approved')`),
  }

  const recent = await ctx.em.getConnection().execute<Array<{ id: string; order_no: string; customer_id: string; status: string; order_date: string; delivery_date: string | null }>>(
    `select id, order_no, customer_id, status, order_date, delivery_date from cc_orders
      where tenant_id = ? and organization_id = ? and deleted_at is null order by created_at desc limit 8`,
    [ctx.tenantId, ctx.organizationId],
  )
  const recentCustomers = await loadCustomers(ctx, recent.map((row) => row.customer_id))

  return {
    today,
    stuckDays: STUCK_DAYS,
    tiles: {
      openOrders: Number(orderCounts?.open ?? 0),
      stuckOrders,
      onHoldOrders,
      dueThisWeek: Number(orderCounts?.due ?? 0),
      overdue: Number(orderCounts?.overdue ?? 0),
    },
    pipeline,
    stuck: items.filter((item) => item.stuck).sort((a, b) => b.days - a.days).slice(0, 12),
    people: Array.from(people.values()).sort((a, b) => b.stuck - a.stuck || b.oldestDays - a.oldestDays),
    lowStock: low.slice(0, 12),
    lowStockTotal: low.length,
    queues,
    recent: recent.map((row) => ({
      id: row.id,
      orderNo: row.order_no,
      customerName: recentCustomers.get(row.customer_id)?.name ?? '—',
      status: row.status,
      orderDate: row.order_date,
      deliveryDate: row.delivery_date,
      current: items.filter((item) => item.orderId === row.id).map((item) => item.stageLabel),
    })),
  }
}
