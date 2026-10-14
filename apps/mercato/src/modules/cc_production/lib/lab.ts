import type { StoreContext } from '../../cc_store/lib/server'
import { loadCustomers } from '../../cc_orders/lib/server'
import { CcOrder } from '../../cc_orders/data/entities'
import { markOrderTests } from '../../cc_orders/lib/fulfilment'
import { certificateGaps, certificateSchema, withRemarks, type Certificate } from './testCertificate'
import { LabTest } from '../data/entities'
import { PlantError } from './server'
import { logEdit, snapshot } from '../../cc_audit/lib/activity'

export type LabInput = { testDate: string; lotRefs: string | null; productId: string | null; itemTitle: string | null; customerId: string | null; customerName: string | null; testType: string; standard: string | null; result: 'pass' | 'fail' | 'pending'; notes: string | null; orderId: string | null; reportNo: string | null; testedBy: string | null; testPoint: 'incoming' | 'outgoing' }

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export type LabReportFile = { id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string; superseded: boolean; revision: number | null }

export const LAB_ENTITY_ID = 'cc_production:lab_test'
export const LAB_SUPERSEDED_ENTITY_ID = 'cc_production:lab_test_superseded'

export async function labReports(ctx: StoreContext, ids: string[]): Promise<Map<string, LabReportFile[]>> {
  const result = new Map<string, LabReportFile[]>()
  if (!ids.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; entity_id: string; record_id: string; file_name: string; file_size: number; mime_type: string; created_at: Date; storage_metadata: { ccLabRevision?: number } | null }>>(
    `select id, entity_id, record_id, file_name, file_size, mime_type, created_at, storage_metadata from attachments where entity_id = any(?::text[]) and tenant_id = ? and record_id = any(?::text[]) order by created_at asc`,
    [`{${LAB_ENTITY_ID},${LAB_SUPERSEDED_ENTITY_ID}}`, ctx.tenantId, `{${ids.join(',')}}`],
  )
  for (const row of rows) {
    const list = result.get(row.record_id) ?? []
    const superseded = row.entity_id === LAB_SUPERSEDED_ENTITY_ID
    list.push({ id: row.id, fileName: row.file_name, fileSize: Number(row.file_size), mimeType: row.mime_type, createdAt: new Date(row.created_at).toISOString(), superseded, revision: typeof row.storage_metadata?.ccLabRevision === 'number' ? row.storage_metadata.ccLabRevision : null })
    result.set(row.record_id, list)
  }
  return result
}

export async function labDetail(ctx: StoreContext, row: LabTest) {
  const files = (await labReports(ctx, [row.id])).get(row.id) ?? []
  return { ...labView(row), reports: files.filter((file) => !file.superseded), supersededReports: files.filter((file) => file.superseded) }
}

export function labView(row: LabTest) {
  return {
    id: row.id,
    testDate: row.testDate,
    lotRefs: row.lotRefs ?? null,
    productId: row.productId ?? null,
    itemTitle: row.itemTitle ?? null,
    customerId: row.customerId ?? null,
    customerName: row.customerName ?? null,
    testType: row.testType,
    standard: row.standard ?? null,
    result: row.result,
    notes: row.notes ?? null,
    orderId: row.orderId ?? null,
    orderNo: row.orderNo ?? null,
    reportNo: row.reportNo ?? null,
    testedBy: row.testedBy ?? null,
    testPoint: row.testPoint ?? 'outgoing',
    history: row.history ?? [],
    revision: row.revision ?? 0,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    issuedByName: row.issuedByName ?? null,
    certificate: row.certificate ? withRemarks(certificateSchema.parse(row.certificate)) : null,
    revisions: (row.revisions ?? []).map((item) => ({ revision: item.revision, issuedAt: item.issuedAt, amendedAt: item.amendedAt, amendedByName: item.amendedByName, reason: item.reason, values: item.values })),
    createdAt: row.createdAt.toISOString(),
    byName: row.byName ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function findLabTest(ctx: StoreContext, id: string) {
  const row = await ctx.em.findOne(LabTest, { id, ...scope(ctx), deletedAt: null })
  if (!row) throw new PlantError('Lab test not found', 404)
  return row
}

export async function saveLabTest(ctx: StoreContext, existing: LabTest | null, input: LabInput, byName: string | null) {
  let order: CcOrder | null = null
  if (input.orderId) {
    order = await ctx.em.findOne(CcOrder, { id: input.orderId, ...scope(ctx), deletedAt: null })
    if (!order) throw new PlantError('Order not found', 404)
  }
  const customerId = order?.customerId ?? input.customerId
  const customerName = order ? ((await loadCustomers(ctx, [order.customerId])).get(order.customerId)?.name ?? input.customerName) : input.customerName?.trim() || null
  if (!input.lotRefs?.trim() && !input.itemTitle?.trim() && !order) throw new PlantError('Pick the lot or the item that was tested')
  const values = { ...input, customerId, customerName, orderId: order?.id ?? null, orderNo: order?.orderNo ?? null, reportNo: input.reportNo?.trim() || null, testedBy: input.testedBy?.trim() || byName, byName }
  let row: LabTest
  if (existing?.issuedAt) throw new PlantError(`This report is issued to the customer${existing.revision ? ` (Rev ${existing.revision})` : ''}. Amend it to make a new revision.`, 409)
  if (existing) {
    const before = existing.result
    const fields = Object.keys(values).filter((key) => key !== 'byName') as Array<keyof LabTest>
    const snapBefore = snapshot(existing, fields)
    Object.assign(existing, values)
    existing.history = [...(existing.history ?? []), { action: before !== input.result ? `result ${input.result}` : 'edited', by: byName, at: new Date().toISOString(), note: null }]
    logEdit(ctx.em, ctx, { recordType: 'lab_test', recordId: existing.id, before: snapBefore, after: snapshot(existing, fields), byName })
    await ctx.em.flush()
    row = existing
  } else {
    row = ctx.em.create(LabTest, { ...scope(ctx), ...values, history: [{ action: 'created', by: byName, at: new Date().toISOString(), note: order ? `For order ${order.orderNo}` : null }] })
    ctx.em.persist(row)
    await ctx.em.flush()
  }
  if (order && row.result === 'pass') await markOrderTests(ctx, order, row, byName)
  return row
}

export async function listLabTests(ctx: StoreContext, query: { month?: string; orderId?: string; result?: string; testPoint?: string; search?: string }) {
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.month) where.testDate = { $like: `${query.month}-%` }
  if (query.orderId) where.orderId = query.orderId
  if (query.result) where.result = query.result
  if (query.testPoint) where.testPoint = query.testPoint
  if (query.search) {
    const like = `%${query.search.replace(/[%_]/g, '')}%`
    where.$or = [{ customerName: { $ilike: like } }, { itemTitle: { $ilike: like } }, { lotRefs: { $ilike: like } }, { testType: { $ilike: like } }, { orderNo: { $ilike: like } }, { reportNo: { $ilike: like } }]
  }
  const rows = await ctx.em.find(LabTest, where, { orderBy: { testDate: 'desc', createdAt: 'desc' }, limit: 500 })
  const reports = await labReports(ctx, rows.map((row) => row.id))
  return rows.map((row) => ({ ...labView(row), reports: (reports.get(row.id) ?? []).filter((file) => !file.superseded) }))
}

export async function lastLabTest(ctx: StoreContext, customerName: string | null, itemTitle: string | null) {
  if (!customerName && !itemTitle) return null
  const row = await ctx.em.findOne(LabTest, { ...scope(ctx), deletedAt: null, ...(customerName ? { customerName: { $ilike: customerName } } : {}), ...(itemTitle ? { itemTitle: { $ilike: itemTitle } } : {}) }, { orderBy: { testDate: 'desc', createdAt: 'desc' } })
  return row ? labView(row) : null
}

const LAB_REVISION_FIELDS: Array<keyof LabTest> = ['testDate', 'lotRefs', 'itemTitle', 'customerName', 'testType', 'standard', 'result', 'notes', 'orderNo', 'reportNo', 'testedBy', 'testPoint']

async function currentReportIds(ctx: StoreContext, id: string): Promise<string[]> {
  const rows = await ctx.em.getConnection().execute<Array<{ id: string }>>(
    'select id from attachments where entity_id = ? and record_id = ? and tenant_id = ?',
    [LAB_ENTITY_ID, id, ctx.tenantId],
  )
  return rows.map((row) => row.id)
}

export async function issueLabTest(ctx: StoreContext, row: LabTest, byName: string | null, overrideReason?: string | null) {
  if (row.issuedAt) throw new PlantError('This report is already issued', 409)
  const certificate = row.certificate ? certificateSchema.parse(row.certificate) : null
  let note: string | null = row.revision ? `Rev ${row.revision}` : null
  if (certificate) {
    const gaps = certificateGaps(certificate)
    if (gaps.missing.length) throw new PlantError(`Enter the observed value for: ${gaps.missing.join(', ')}`)
    if (gaps.failing.length) {
      if ((overrideReason ?? '').trim().length < 3) throw new PlantError(`Not OK: ${gaps.failing.join(', ')}. Write why it is still issued (the Director approves it).`, 409)
      note = [note, `Issued with Not OK (${gaps.failing.join(', ')}): ${overrideReason!.trim()}`].filter(Boolean).join(' · ')
    }
  } else {
    if (row.result === 'pending') throw new PlantError('Enter the result (pass or fail) before issuing the report')
    if (!(await currentReportIds(ctx, row.id)).length) throw new PlantError('Attach the report file before issuing it', 409)
  }
  row.issuedAt = new Date()
  row.issuedByName = byName
  row.history = [...(row.history ?? []), { action: 'issued', by: byName, at: new Date().toISOString(), note }]
  await ctx.em.flush()
  return row
}

export async function saveCertificate(ctx: StoreContext, row: LabTest, input: Certificate, byName: string | null) {
  if (row.issuedAt) throw new PlantError(`This report is issued to the customer${row.revision ? ` (Rev ${row.revision})` : ''}. Amend it to make a new revision.`, 409)
  const { nextSeriesCode } = await import('../../cc_accounts/lib/numberSeries')
  const tcNo = input.tcNo.trim() || row.reportNo?.trim() || (await nextSeriesCode(ctx, 'TC', new Date(`${row.testDate}T12:00:00`)))
  const certificate = withRemarks({ ...input, tcNo })
  const before = row.certificate ? withRemarks(certificateSchema.parse(row.certificate)) : null
  row.certificate = certificate as unknown as Record<string, unknown>
  row.reportNo = tcNo
  if (certificate.testedBy) row.testedBy = certificate.testedBy
  const gaps = certificateGaps(certificate)
  const previous = row.result
  if (!gaps.missing.length) row.result = gaps.failing.length ? 'fail' : 'pass'
  if (before) logEdit(ctx.em, ctx, { recordType: 'lab_test', recordId: row.id, before: { tc: before }, after: { tc: certificate }, byName, labels: { tc: 'Test certificate' }, action: 'certificate' })
  row.history = [...(row.history ?? []), { action: before ? 'certificate edited' : 'certificate made', by: byName, at: new Date().toISOString(), note: tcNo }]
  await ctx.em.flush()
  if (row.orderId && row.result === 'pass' && previous !== 'pass') {
    const order = await ctx.em.findOne(CcOrder, { id: row.orderId, ...scope(ctx), deletedAt: null })
    if (order) await markOrderTests(ctx, order, row, byName)
  }
  return row
}

export async function amendLabTest(ctx: StoreContext, row: LabTest, byName: string | null, reason: string) {
  if (!row.issuedAt) throw new PlantError('Only an issued report is amended. Edit this one directly.', 409)
  const files = await currentReportIds(ctx, row.id)
  const previous = row.revision ?? 0
  const values = snapshot(row, LAB_REVISION_FIELDS)
  if (files.length) {
    await ctx.em.getConnection().execute(
      `update attachments set entity_id = ?, storage_metadata = coalesce(storage_metadata, '{}'::jsonb) || jsonb_build_object('ccLabRevision', ?::int) where id = any(?::uuid[]) and tenant_id = ?`,
      [LAB_SUPERSEDED_ENTITY_ID, previous, `{${files.join(',')}}`, ctx.tenantId],
    )
  }
  row.revisions = [...(row.revisions ?? []), { revision: previous, values, files, issuedAt: row.issuedAt.toISOString(), amendedAt: new Date().toISOString(), amendedByName: byName, reason }]
  row.revision = previous + 1
  row.issuedAt = null
  row.issuedByName = null
  row.history = [...(row.history ?? []), { action: 'amended', by: byName, at: new Date().toISOString(), note: `Rev ${row.revision}: ${reason}` }]
  await ctx.em.flush()
  return { row, files }
}
