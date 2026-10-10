import type { EntityManager } from '@mikro-orm/postgresql'
import { ActivityEntry, type ActivityChange, type ActivityKind, type ActivityLink } from '../data/entities'

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

export type RecordTypeDef = { label: string; table: string | null; viewFeature: string; legacy: 'history' | 'order_events' | null }

export const RECORD_TYPES: Record<string, RecordTypeDef> = {
  order: { label: 'Order', table: 'cc_orders', viewFeature: 'cc_orders.view', legacy: 'order_events' },
  enquiry: { label: 'Enquiry', table: 'cc_enquiries', viewFeature: 'cc_crm.view', legacy: 'history' },
  quotation: { label: 'Quotation', table: 'cc_quotations', viewFeature: 'cc_crm.view', legacy: 'history' },
  customer: { label: 'Customer', table: null, viewFeature: 'customers.companies.view', legacy: null },
  vendor: { label: 'Vendor', table: 'cc_vendors', viewFeature: 'cc_vendors.view', legacy: null },
  resin_batch: { label: 'Resin batch', table: 'cc_resin_batches', viewFeature: 'cc_production.resin.view', legacy: 'history' },
  chemical_issue: { label: 'Chemical issue', table: 'cc_chemical_issues', viewFeature: 'cc_production.resin.view', legacy: 'history' },
  coating_sheet: { label: 'Coating day sheet', table: 'cc_coating_sheets', viewFeature: 'cc_production.coating.view', legacy: 'history' },
  press_batch: { label: 'Press batch', table: 'cc_press_batches', viewFeature: 'cc_production.press.view', legacy: 'history' },
  moulding_entry: { label: 'Moulding entry', table: 'cc_moulding_entries', viewFeature: 'cc_production.moulding.view', legacy: 'history' },
  cutting: { label: 'Cutting entry', table: 'cc_cutting_entries', viewFeature: 'cc_production.quality.view', legacy: 'history' },
  thickness: { label: 'Thickness inspection', table: 'cc_thickness_inspections', viewFeature: 'cc_production.quality.view', legacy: 'history' },
  fg_inspection: { label: 'FG inspection', table: 'cc_fg_inspections', viewFeature: 'cc_production.quality.view', legacy: 'history' },
  lab_test: { label: 'Lab test report', table: 'cc_lab_tests', viewFeature: 'cc_production.quality.view', legacy: 'history' },
  fg_direct_in: { label: 'Bought-in goods', table: 'cc_fg_direct_ins', viewFeature: 'cc_production.quality.view', legacy: 'history' },
  damage: { label: 'Damage entry', table: 'cc_damage_entries', viewFeature: 'cc_production.quality.view', legacy: 'history' },
  indent: { label: 'Purchase indent', table: 'cc_purchase_indents', viewFeature: 'cc_purchase.view', legacy: 'history' },
  po: { label: 'Purchase order', table: 'cc_pos', viewFeature: 'cc_purchase.view', legacy: 'history' },
  grn: { label: 'GRN', table: 'cc_grns', viewFeature: 'cc_purchase.view', legacy: 'history' },
  job_work: { label: 'Job-work challan', table: 'cc_job_work_challans', viewFeature: 'cc_purchase.view', legacy: 'history' },
  proforma: { label: 'Proforma', table: 'cc_proforma_invoices', viewFeature: 'cc_accounts.view', legacy: 'history' },
  invoice: { label: 'Tax invoice', table: 'cc_tax_invoices', viewFeature: 'cc_accounts.view', legacy: 'history' },
  payment: { label: 'Payment', table: 'cc_order_payments', viewFeature: 'cc_accounts.view', legacy: 'history' },
  vendor_bill: { label: 'Vendor bill', table: 'cc_vendor_bills', viewFeature: 'cc_accounts.view', legacy: 'history' },
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

const CORRECTION = /reopen|cancel|void|revers|credit|correct|undo|scrap|return/i
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
  if (def.legacy === 'order_events') {
    const rows = await connection.execute<Array<{ id: string; action: string; stage_key: string | null; note: string | null; by_name: string | null; created_at: Date; changes: Array<{ key: string; label: string; from: unknown; to: unknown }> | null }>>(
      'select id, action, stage_key, note, by_name, created_at, changes from cc_order_events where order_id = ? and tenant_id = ? and organization_id = ? order by created_at desc limit 500',
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
  const all = [...fresh, ...old.filter((item) => !seen.has(`${item.action}|${item.at.slice(0, 19)}`))].sort((a, b) => b.at.localeCompare(a.at))
  const masked = options.showMoney ? all : all.map((item) => ({ ...item, changes: item.changes.map((change) => (change.money ? { ...change, from: change.from === null ? null : '•••', to: change.to === null ? null : '•••' } : change)) }))
  const filtered = options.kind ? masked.filter((item) => item.kind === options.kind) : masked
  const counts = masked.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {})
  const start = (options.page - 1) * options.pageSize
  return { type, label: def?.label ?? type, total: filtered.length, page: options.page, pageSize: options.pageSize, totalPages: Math.max(1, Math.ceil(filtered.length / options.pageSize)), counts, items: filtered.slice(start, start + options.pageSize) }
}
