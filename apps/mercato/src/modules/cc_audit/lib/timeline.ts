import type { EntityManager } from '@mikro-orm/postgresql'
import { ActivityEntry, type ActivityChange, type ActivityKind, type ActivityLink } from '../data/entities'

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

export type RecordTypeDef = { label: string; table: string | null; viewFeature: string; legacy: 'history' | 'order_events' | 'stage_events' | null; path?: string; maker?: string[] }

export const RECORD_TYPES: Record<string, RecordTypeDef> = {
  order: { label: 'Order', table: 'cc_orders', viewFeature: 'cc_orders.view', legacy: 'order_events', path: '/backend/orders/', maker: ['created_by_name'] },
  dispatch: { label: 'Despatch', table: null, viewFeature: 'cc_orders.view', legacy: 'stage_events', path: '/backend/dispatch/' },
  enquiry: { label: 'Enquiry', table: 'cc_enquiries', viewFeature: 'cc_crm.view', legacy: 'history', path: '/backend/crm/enquiries/', maker: ['owner_name', 'by_name'] },
  follow_up: { label: 'Follow-up', table: 'cc_follow_ups', viewFeature: 'cc_crm.view', legacy: 'history', path: '/backend/crm/follow-ups/', maker: ['created_by_name'] },
  quotation: { label: 'Quotation', table: 'cc_quotations', viewFeature: 'cc_crm.view', legacy: 'history', path: '/backend/crm/quotations/', maker: ['by_name'] },
  customer: { label: 'Customer', table: null, viewFeature: 'customers.companies.view', legacy: null, path: '/backend/customers/companies/' },
  vendor: { label: 'Vendor', table: 'cc_vendors', viewFeature: 'cc_vendors.view', legacy: null, path: '/backend/cc_vendors/' },
  resin_batch: { label: 'Resin batch', table: 'cc_resin_batches', viewFeature: 'cc_production.resin.view', legacy: 'history', path: '/backend/resin/batches/', maker: ['posted_by_name', 'updated_by_name'] },
  chemical_issue: { label: 'Chemical issue', table: 'cc_chemical_issues', viewFeature: 'cc_production.resin.view', legacy: 'history', path: '/backend/resin/issues/', maker: ['by_name'] },
  coating_sheet: { label: 'Coating day sheet', table: 'cc_coating_sheets', viewFeature: 'cc_production.coating.view', legacy: 'history', path: '/backend/coating/', maker: ['posted_by_name', 'updated_by_name'] },
  press_batch: { label: 'Press batch', table: 'cc_press_batches', viewFeature: 'cc_production.press.view', legacy: 'history', path: '/backend/press/batches/', maker: ['posted_by_name', 'updated_by_name'] },
  moulding_entry: { label: 'Moulding entry', table: 'cc_moulding_entries', viewFeature: 'cc_production.moulding.view', legacy: 'history', path: '/backend/moulding/entries/', maker: ['posted_by_name', 'updated_by_name'] },
  cutting: { label: 'Cutting entry', table: 'cc_cutting_entries', viewFeature: 'cc_production.quality.view', legacy: 'history', path: '/backend/cutting/', maker: ['by_name'] },
  thickness: { label: 'Thickness inspection', table: 'cc_thickness_inspections', viewFeature: 'cc_production.quality.view', legacy: 'history', path: '/backend/quality/thickness/', maker: ['by_name'] },
  fg_inspection: { label: 'FG inspection', table: 'cc_fg_inspections', viewFeature: 'cc_production.quality.view', legacy: 'history', path: '/backend/quality/fg-inspection/', maker: ['by_name'] },
  lab_test: { label: 'Lab test report', table: 'cc_lab_tests', viewFeature: 'cc_production.quality.view', legacy: 'history', path: '/backend/quality/lab/', maker: ['by_name'] },
  fg_direct_in: { label: 'Bought-in goods', table: 'cc_fg_direct_ins', viewFeature: 'cc_production.quality.view', legacy: 'history', path: '/backend/fg/direct-in/', maker: ['by_name'] },
  damage: { label: 'Damage entry', table: 'cc_damage_entries', viewFeature: 'cc_production.quality.view', legacy: 'history', path: '/backend/fg/damage/', maker: ['by_name'] },
  indent: { label: 'Purchase indent', table: 'cc_purchase_indents', viewFeature: 'cc_purchase.view', legacy: 'history', path: '/backend/purchase/indents/', maker: ['requested_by_name'] },
  po: { label: 'Purchase order', table: 'cc_pos', viewFeature: 'cc_purchase.view', legacy: 'history', path: '/backend/purchase/orders/', maker: ['created_by_name'] },
  grn: { label: 'GRN', table: 'cc_grns', viewFeature: 'cc_purchase.view', legacy: 'history', path: '/backend/purchase/grns/', maker: ['received_by_name'] },
  job_work: { label: 'Job-work challan', table: 'cc_job_work_challans', viewFeature: 'cc_purchase.view', legacy: 'history', path: '/backend/purchase/job-work/', maker: ['created_by_name'] },
  proforma: { label: 'Proforma', table: 'cc_proforma_invoices', viewFeature: 'cc_accounts.view', legacy: 'history', path: '/backend/accounts/proformas/', maker: ['created_by_name'] },
  invoice: { label: 'Tax invoice', table: 'cc_tax_invoices', viewFeature: 'cc_accounts.view', legacy: 'history', path: '/backend/accounts/invoices/', maker: ['created_by_name'] },
  payment: { label: 'Payment', table: 'cc_order_payments', viewFeature: 'cc_accounts.view', legacy: 'history', path: '/backend/accounts/payments/', maker: ['by_name'] },
  debit_note: { label: 'Debit note', table: 'cc_debit_notes', viewFeature: 'cc_accounts.view', legacy: 'history', path: '/backend/accounts/notes/', maker: ['created_by_name'] },
  tally_push: { label: 'Tally push', table: 'cc_tally_pushes', viewFeature: 'cc_accounts.view', legacy: null, path: '/backend/accounts/tally/' },
  vendor_bill: { label: 'Vendor bill', table: 'cc_vendor_bills', viewFeature: 'cc_accounts.view', legacy: 'history', path: '/backend/accounts/vendor-bills/', maker: ['created_by_name'] },
}

export function recordHref(type: string, id: string): string | null {
  const path = RECORD_TYPES[type]?.path
  return path ? `${path}${id}` : null
}

export type TimelineItem = {
  id: string
  at: string
  action: string
  kind: ActivityKind
  summary: string | null
  reason: string | null
  changes: ActivityChange[]
  links: ActivityLink[]
  source: string
  by: string | null
  legacy: boolean
}

const CORRECTION = /reopen|cancel|void|revers|credit|correct|undo|scrap|return|fail|reject|revert/i
const STAGE = /stage|started|done|skip|hold|resume|advance|allocat|pack|despatch|dispatch|issued|posted|approved|submitted|sent|convert/i
const DOCUMENT = /upload|attach|document|print|email|whatsapp/i

function kindOf(action: string): ActivityKind {
  if (CORRECTION.test(action)) return 'correction'
  if (DOCUMENT.test(action)) return 'document'
  if (STAGE.test(action)) return 'stage'
  if (/comment|note/i.test(action)) return 'comment'
  return 'change'
}

function words(action: string): string {
  const text = action.replace(/_/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

async function legacyItems(ctx: Scope, def: RecordTypeDef, recordId: string): Promise<TimelineItem[]> {
  const connection = ctx.em.getConnection()
  if (def.legacy === 'order_events' || def.legacy === 'stage_events') {
    const rows = await connection.execute<Array<{ id: string; action: string; stage_key: string | null; note: string | null; by_name: string | null; created_at: Date; changes: Array<{ key: string; label: string; from: unknown; to: unknown }> | null }>>(
      def.legacy === 'order_events'
        ? 'select id, action, stage_key, note, by_name, created_at, changes from cc_order_events where order_id = ? and tenant_id = ? and organization_id = ? order by created_at desc limit 500'
        : `select e.id, e.action, e.stage_key, e.note, e.by_name, e.created_at, e.changes from cc_order_events e
             join cc_order_stages s on s.order_id = e.order_id and s.stage_key = e.stage_key
            where s.id::text = ? and e.tenant_id = ? and e.organization_id = ? order by e.created_at desc limit 500`,
      [recordId, ctx.tenantId, ctx.organizationId],
    )
    return rows.map((row) => ({
      id: `event:${row.id}`,
      at: new Date(row.created_at).toISOString(),
      action: row.action,
      kind: kindOf(row.action),
      summary: row.note ?? words(row.action),
      reason: null,
      changes: (row.changes ?? []).map((change) => ({ field: change.key, label: change.label, from: (change.from ?? null) as string | number | null, to: (change.to ?? null) as string | number | null, money: /rate|amount|price|value|total/i.test(change.key) || undefined })),
      links: [],
      source: 'screen',
      by: row.by_name,
      legacy: true,
    }))
  }
  if (def.legacy === 'history' && def.table && /^cc_[a-z_]+$/.test(def.table)) {
    const [row] = await connection.execute<Array<{ history: Array<{ action?: string; by?: string | null; at?: string; note?: string | null }> | null }>>(
      `select history from ${def.table} where id::text = ? and tenant_id = ? and organization_id = ? limit 1`,
      [recordId, ctx.tenantId, ctx.organizationId],
    )
    return (row?.history ?? [])
      .filter((entry) => entry && entry.at)
      .map((entry, index) => ({
        id: `history:${index}`,
        at: new Date(entry.at as string).toISOString(),
        action: entry.action ?? 'changed',
        kind: kindOf(entry.action ?? ''),
        summary: words(entry.action ?? 'changed'),
        reason: entry.note ?? null,
        changes: [],
        links: [],
        source: 'screen',
        by: entry.by ?? null,
        legacy: true,
      }))
  }
  return []
}

export async function recordTimeline(ctx: Scope, type: string, recordId: string, options: { kind?: ActivityKind; page: number; pageSize: number; showMoney: boolean }) {
  const def = RECORD_TYPES[type]
  const entries = await ctx.em.find(ActivityEntry, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, recordType: type, recordId }, { orderBy: { createdAt: 'desc' }, limit: 1000 })
  const fresh: TimelineItem[] = entries.map((entry) => ({
    id: entry.id,
    at: entry.createdAt.toISOString(),
    action: entry.action,
    kind: entry.kind,
    summary: entry.summary ?? null,
    reason: entry.reason ?? null,
    changes: entry.changes ?? [],
    links: entry.links ?? [],
    source: entry.source,
    by: entry.actorName ?? null,
    legacy: false,
  }))
  const old = def ? await legacyItems(ctx, def, recordId) : []
  const seen = new Set(fresh.map((item) => `${item.action}|${item.at.slice(0, 19)}`))
  const corrections = fresh.filter((item) => item.kind === 'correction').map((item) => Date.parse(item.at))
  const duplicate = (item: TimelineItem) => seen.has(`${item.action}|${item.at.slice(0, 19)}`) || (item.kind === 'correction' && corrections.some((at) => Math.abs(at - Date.parse(item.at)) < 15000))
  const all = [...fresh, ...old.filter((item) => !duplicate(item))].sort((a, b) => b.at.localeCompare(a.at))
  const masked = options.showMoney ? all : all.map((item) => ({ ...item, changes: item.changes.map((change) => (change.money ? { ...change, from: change.from === null ? null : '•••', to: change.to === null ? null : '•••' } : change)) }))
  const filtered = options.kind ? masked.filter((item) => item.kind === options.kind) : masked
  const counts = masked.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {})
  const start = (options.page - 1) * options.pageSize
  return { type, label: def?.label ?? type, total: filtered.length, page: options.page, pageSize: options.pageSize, totalPages: Math.max(1, Math.ceil(filtered.length / options.pageSize)), counts, items: filtered.slice(start, start + options.pageSize) }
}
