import { loadCustomers, type OrderContext } from '../../cc_orders/lib/server'
import { nextSeriesCode } from '../../cc_accounts/lib/numberSeries'
import { TcTemplate, TestCertificate } from '../data/entities'
import type { TcCreateInput, TcTemplateInput, TcUpdateInput } from '../data/validators'
import { IS2036_STANDARD, P2_ROWS, P3_LEGEND, P3_ROWS, evaluateRows, missingRows, notOkRows, type TcObserved } from './tcRules'
import { PlantError } from './server'

type Scope = Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>

function where(ctx: Scope) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
}

export async function ensureDefaultTemplates(ctx: Scope, byName: string | null): Promise<void> {
  const grades = new Set((await ctx.em.find(TcTemplate, where(ctx))).map((row) => row.grade))
  const defaults = [
    { name: 'P2 phenolic sheet', productLabel: 'PHENOLIC SHEET', grade: 'P2', rows: P2_ROWS, lastColumn: 'remark' as const, legend: [] },
    { name: 'P3 paper phenolic sheet', productLabel: 'PAPER PHENOLIC SHEET', grade: 'P3', rows: P3_ROWS, lastColumn: 'criteria' as const, legend: P3_LEGEND },
  ]
  const missing = defaults.filter((entry) => !grades.has(entry.grade))
  if (!missing.length) return
  for (const entry of missing) ctx.em.persist(ctx.em.create(TcTemplate, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, standard: IS2036_STANDARD, updatedByName: byName, ...entry }))
  await ctx.em.flush()
}

export function templateView(row: TcTemplate) {
  return { id: row.id, name: row.name, productLabel: row.productLabel, grade: row.grade, standard: row.standard, rows: row.rows, lastColumn: row.lastColumn, legend: row.legend ?? [], isActive: row.isActive, updatedAt: row.updatedAt.toISOString() }
}

export async function listTemplates(ctx: Scope, byName: string | null) {
  await ensureDefaultTemplates(ctx, byName)
  const rows = await ctx.em.find(TcTemplate, where(ctx), { orderBy: { grade: 'asc', name: 'asc' } })
  return rows.map(templateView)
}

export async function saveTemplate(ctx: Scope, input: TcTemplateInput, byName: string | null) {
  const keys = new Set<string>()
  for (const row of input.rows) {
    if (keys.has(row.key)) throw new PlantError(`The row key ${row.key} is used twice`, 400)
    keys.add(row.key)
  }
  const row = input.id ? await ctx.em.findOne(TcTemplate, { id: input.id, ...where(ctx) }) : null
  if (input.id && !row) throw new PlantError('Template not found', 404)
  const target = row ?? ctx.em.create(TcTemplate, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, name: input.name, productLabel: input.productLabel, grade: input.grade, rows: input.rows })
  target.name = input.name
  target.productLabel = input.productLabel
  target.grade = input.grade
  target.standard = input.standard
  target.rows = input.rows
  target.lastColumn = input.lastColumn
  target.legend = input.legend
  target.isActive = input.isActive
  target.updatedByName = byName
  ctx.em.persist(target)
  await ctx.em.flush()
  return templateView(target)
}

export async function certificateView(ctx: Scope, row: TestCertificate, names?: Map<string, string>) {
  const customers = names ?? new Map(Array.from((await loadCustomers(ctx, row.customerId ? [row.customerId] : [])).values()).map((customer) => [customer.id, customer.name]))
  const thickness = row.thicknessMm == null ? null : Number(row.thicknessMm)
  const observed = row.observed ?? {}
  const evaluated = evaluateRows(row.rows, observed, thickness)
  return {
    id: row.id,
    code: row.code,
    certDate: row.certDate,
    status: row.status,
    templateId: row.templateId ?? null,
    customerId: row.customerId ?? null,
    customerName: row.customerId ? (customers.get(row.customerId) ?? null) : (row.customerLabel ?? null),
    customerLabel: row.customerLabel ?? null,
    productLabel: row.productLabel,
    grade: row.grade,
    standard: row.standard,
    thicknessMm: thickness,
    traceability: row.traceability ?? null,
    orderId: row.orderId ?? null,
    rows: evaluated.map((entry) => ({ key: entry.row.key, property: entry.row.property, specified: entry.specified, unit: entry.row.unit, observed: entry.observed, remark: entry.remark, check: entry.row.check, optional: entry.row.optional ?? false, criteria: entry.row.criteria ?? '' })),
    lastColumn: row.lastColumn,
    legend: row.legend ?? [],
    notOkCount: evaluated.filter((entry) => entry.remark === 'Not OK').length,
    missingCount: evaluated.filter((entry) => entry.remark === '').length,
    testedBy: row.testedBy ?? null,
    verifiedBy: row.verifiedBy ?? null,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    issuedByName: row.issuedByName ?? null,
    notOkReason: row.notOkReason ?? null,
    notes: row.notes ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listCertificates(ctx: Scope, search?: string) {
  const rows = await ctx.em.find(TestCertificate, where(ctx), { orderBy: { code: 'desc' }, limit: 500 })
  const customers = await loadCustomers(ctx, rows.map((row) => row.customerId).filter((id): id is string => Boolean(id)))
  const names = new Map(Array.from(customers.values()).map((customer) => [customer.id, customer.name]))
  const views = await Promise.all(rows.map((row) => certificateView(ctx, row, names)))
  const term = search?.trim().toLowerCase()
  return term ? views.filter((view) => [view.code, view.customerName, view.productLabel, view.grade, view.traceability].some((value) => typeof value === 'string' && value.toLowerCase().includes(term))) : views
}

export async function findCertificate(ctx: Scope, id: string): Promise<TestCertificate> {
  const row = await ctx.em.findOne(TestCertificate, { id, ...where(ctx) })
  if (!row) throw new PlantError('Test certificate not found', 404)
  return row
}

export async function createCertificate(ctx: Scope, input: TcCreateInput, byName: string | null): Promise<TestCertificate> {
  const template = await ctx.em.findOne(TcTemplate, { id: input.templateId, ...where(ctx) })
  if (!template) throw new PlantError('Choose a certificate template', 400)
  if (input.customerId && !(await loadCustomers(ctx, [input.customerId])).has(input.customerId)) throw new PlantError('That customer was not found', 400)
  const row = ctx.em.create(TestCertificate, {
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
    code: await nextSeriesCode(ctx, 'TC', new Date(`${input.certDate}T12:00:00`)),
    certDate: input.certDate,
    templateId: template.id,
    customerId: input.customerId ?? null,
    customerLabel: input.customerId ? null : (input.customerLabel ?? null),
    productLabel: template.productLabel,
    grade: template.grade,
    standard: template.standard,
    thicknessMm: input.thicknessMm == null ? null : input.thicknessMm.toFixed(2),
    traceability: input.traceability ?? null,
    orderId: input.orderId ?? null,
    rows: template.rows,
    lastColumn: template.lastColumn,
    legend: template.legend ?? [],
    observed: Object.fromEntries(template.rows.filter((entry) => entry.defaultObserved).map((entry) => [entry.key, entry.defaultObserved as string])),
    updatedByName: byName,
  })
  ctx.em.persist(row)
  await ctx.em.flush()
  return row
}

export async function updateCertificate(ctx: Scope, row: TestCertificate, input: TcUpdateInput, byName: string | null): Promise<TestCertificate> {
  if (row.status === 'issued') throw new PlantError('An issued certificate cannot be changed', 409)
  if (input.certDate !== undefined) row.certDate = input.certDate
  if (input.customerId !== undefined) {
    if (input.customerId && !(await loadCustomers(ctx, [input.customerId])).has(input.customerId)) throw new PlantError('That customer was not found', 400)
    row.customerId = input.customerId
  }
  if (input.customerLabel !== undefined) row.customerLabel = row.customerId ? null : input.customerLabel
  if (input.thicknessMm !== undefined) row.thicknessMm = input.thicknessMm == null ? null : input.thicknessMm.toFixed(2)
  if (input.traceability !== undefined) row.traceability = input.traceability
  if (input.observed !== undefined) {
    const known = new Set(row.rows.map((entry) => entry.key))
    row.observed = Object.fromEntries(Object.entries(input.observed).filter(([key, value]) => known.has(key) && value !== ''))
  }
  if (input.testedBy !== undefined) row.testedBy = input.testedBy
  if (input.verifiedBy !== undefined) row.verifiedBy = input.verifiedBy
  if (input.notOkReason !== undefined) row.notOkReason = input.notOkReason
  if (input.notes !== undefined) row.notes = input.notes
  row.updatedByName = byName
  row.updatedAt = new Date()
  await ctx.em.flush()
  return row
}

export type IssueCheck = { ok: true } | { ok: false; error: string }

export function issueCheck(row: TestCertificate, canRelease: boolean): IssueCheck {
  if (row.status === 'issued') return { ok: false, error: 'This certificate is already issued' }
  const thickness = row.thicknessMm == null ? null : Number(row.thicknessMm)
  const observed: TcObserved = row.observed ?? {}
  if (row.rows.some((entry) => entry.check.kind === 'range' && entry.check.nominal === 'thickness') && thickness === null) return { ok: false, error: 'Enter the thickness first' }
  const missing = missingRows(row.rows, observed, thickness)
  if (missing.length) return { ok: false, error: `Enter the observed value for: ${missing.map((entry) => entry.property.split('\n')[0]).join(', ')}` }
  if (!(row.testedBy ?? '').trim() || !(row.verifiedBy ?? '').trim()) return { ok: false, error: 'Write who tested it and who verified it' }
  const failed = notOkRows(row.rows, observed, thickness)
  if (failed.length) {
    if ((row.notOkReason ?? '').trim().length < 3) return { ok: false, error: `${failed.map((entry) => entry.property.split('\n')[0]).join(', ')} is Not OK. Write the reason before issuing` }
    if (!canRelease) return { ok: false, error: 'A certificate with a Not OK value needs the Director’s approval to issue' }
  }
  return { ok: true }
}

export async function issueCertificate(ctx: Scope, row: TestCertificate, byName: string | null): Promise<TestCertificate> {
  row.status = 'issued'
  row.issuedAt = new Date()
  row.issuedByName = byName
  row.updatedByName = byName
  row.updatedAt = new Date()
  await ctx.em.flush()
  return row
}
