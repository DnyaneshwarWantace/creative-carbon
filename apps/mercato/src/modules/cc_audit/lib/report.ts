import type { EntityManager } from '@mikro-orm/postgresql'
import { ActivityEntry, type ActivityChange } from '../data/entities'
import { RECORD_TYPES, recordHref } from './timeline'

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

export const PLANT_TYPES = ['resin_batch', 'chemical_issue', 'coating_sheet', 'press_batch', 'moulding_entry', 'cutting', 'thickness', 'fg_inspection', 'lab_test', 'fg_direct_in', 'damage', 'lot', 'adjustment', 'stocktake', 'upload', 'plan', 'sync_clash', 'die', 'machine', 'product']
export const CRM_TYPES = ['enquiry', 'quotation', 'follow_up', 'customer', 'sales_person', 'price_rate']

const NAME_SQL: Record<string, string> = {
  order: 'order_no',
  enquiry: "coalesce(enquiry_no, subject)",
  quotation: 'quote_no',
  resin_batch: 'batch_no',
  press_batch: 'batch_no',
  coating_sheet: "dryer_code || ' · ' || sheet_date",
  chemical_issue: "coalesce(dryer_code, '') || ' · ' || issue_date",
  moulding_entry: "die_no || ' · ' || entry_date",
  cutting: 'entry_date',
  thickness: 'lot_ref',
  fg_inspection: 'report_date',
  lab_test: "coalesce(report_no, 'Lab test')",
  fg_direct_in: "coalesce(lot_number, supplier)",
  damage: "coalesce(lot_number, entry_date)",
  adjustment: 'code',
  stocktake: 'code',
  upload: 'file_name',
  plan: 'plan_date',
  po: 'code',
  grn: 'code',
  invoice: 'code',
  proforma: 'code',
  debit_note: 'code',
}

export async function recordNames(scope: Scope, refs: Array<{ type: string; id: string }>): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const byType = new Map<string, string[]>()
  for (const ref of refs) byType.set(ref.type, [...(byType.get(ref.type) ?? []), ref.id])
  for (const [type, ids] of byType) {
    const table = RECORD_TYPES[type]?.table
    const column = NAME_SQL[type]
    const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    if (!table || !column || !valid.length) continue
    const rows = await scope.em.getConnection().execute<Array<{ id: string; name: string | null }>>(
      `select id::text as id, (${column})::text as name from ${table} where id = any(?::uuid[]) and tenant_id = ?`,
      [`{${valid.join(',')}}`, scope.tenantId],
    )
    for (const row of rows) if (row.name) result.set(`${type}:${row.id}`, row.name)
  }
  return result
}

export async function correctionsSince(scope: Scope, input: { types: string[]; days: number; limit?: number }) {
  const since = new Date(Date.now() - input.days * 86_400_000)
  const rows = await scope.em.find(ActivityEntry, { tenantId: scope.tenantId, organizationId: scope.organizationId, kind: 'correction', recordType: { $in: input.types }, createdAt: { $gte: since } }, { orderBy: { createdAt: 'desc' }, limit: input.limit ?? 50 })
  const names = await recordNames(scope, rows.map((row) => ({ type: row.recordType, id: row.recordId })))
  const people = new Map<string, number>()
  for (const row of rows) people.set(row.actorName ?? '—', (people.get(row.actorName ?? '—') ?? 0) + 1)
  return {
    count: rows.length,
    people: [...people.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count),
    items: rows.map((row) => ({
      id: row.id,
      recordType: row.recordType,
      recordLabel: RECORD_TYPES[row.recordType]?.label ?? row.recordType,
      recordName: names.get(`${row.recordType}:${row.recordId}`) ?? null,
      href: recordHref(row.recordType, row.recordId),
      action: row.action,
      summary: row.summary ?? null,
      reason: row.reason ?? null,
      by: row.actorName ?? null,
      at: row.createdAt.toISOString(),
    })),
  }
}

export type ExportFilter = { from?: string; to?: string; actor?: string; type?: string; kind?: string }

export async function activityRows(scope: Scope, filter: ExportFilter, types: string[] | null, limit = 20_000) {
  const where: Record<string, unknown> = { tenantId: scope.tenantId, organizationId: scope.organizationId }
  const created: Record<string, Date> = {}
  if (filter.from) created.$gte = new Date(`${filter.from}T00:00:00+05:30`)
  if (filter.to) created.$lt = new Date(new Date(`${filter.to}T00:00:00+05:30`).getTime() + 86_400_000)
  if (Object.keys(created).length) where.createdAt = created
  if (filter.actor) where.actorName = { $ilike: `%${filter.actor.replace(/[%_]/g, '')}%` }
  if (filter.type) where.recordType = filter.type
  else if (types) where.recordType = { $in: types }
  if (filter.kind) where.kind = filter.kind
  const rows = await scope.em.find(ActivityEntry, where, { orderBy: { createdAt: 'desc' }, limit })
  const names = await recordNames(scope, rows.map((row) => ({ type: row.recordType, id: row.recordId })))
  return rows.map((row) => ({
    at: row.createdAt.toISOString(),
    recordType: RECORD_TYPES[row.recordType]?.label ?? row.recordType,
    record: names.get(`${row.recordType}:${row.recordId}`) ?? row.recordId,
    action: row.action.replace(/_/g, ' '),
    kind: row.kind,
    summary: row.summary ?? '',
    reason: row.reason ?? '',
    changes: (row.changes ?? []).map((change: ActivityChange) => `${change.label}: ${change.money ? '•' : change.from ?? '—'} → ${change.money ? '•' : change.to ?? '—'}`).join('; '),
    by: row.actorName ?? '',
    source: row.source,
    link: recordHref(row.recordType, row.recordId) ?? '',
  }))
}

export async function activityWorkbook(rows: Awaited<ReturnType<typeof activityRows>>): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Activity log')
  sheet.columns = [
    { header: 'When (IST)', key: 'when', width: 20 },
    { header: 'Record type', key: 'recordType', width: 20 },
    { header: 'Record', key: 'record', width: 28 },
    { header: 'Action', key: 'action', width: 18 },
    { header: 'Kind', key: 'kind', width: 12 },
    { header: 'Summary', key: 'summary', width: 40 },
    { header: 'Reason', key: 'reason', width: 36 },
    { header: 'Old → new', key: 'changes', width: 60 },
    { header: 'Who', key: 'by', width: 24 },
    { header: 'Source', key: 'source', width: 10 },
    { header: 'Link', key: 'link', width: 40 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const row of rows) sheet.addRow({ ...row, when: new Date(row.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) })
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
