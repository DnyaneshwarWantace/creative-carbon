import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { Dryer, LoadingTolerance, Mould, Press, PriceRate, Reactor } from '../data/entities'
import { masterInputSchema } from '../data/validators'
import { loadCustomers, type OrderContext } from '../../cc_orders/lib/server'
import type { MasterColumn, MasterDef, MasterType } from './masterDefs'
import { PlantError } from './server'

type Scope = Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>

type PlantEntity = Reactor | Dryer | Press | Mould | LoadingTolerance | PriceRate

const ENTITY: Record<MasterType, new () => PlantEntity> = {
  reactors: Reactor,
  dryers: Dryer,
  presses: Press,
  moulds: Mould,
  tolerances: LoadingTolerance,
  prices: PriceRate,
}

export type MasterRow = Record<string, string | number | boolean | null> & { id: string; updatedAt: string; updatedByName: string | null }

function scopeOf(scope: Scope) {
  return { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null }
}

function record(entity: PlantEntity): Record<string, unknown> {
  return entity as unknown as Record<string, unknown>
}

function readValue(column: MasterColumn, value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) return column.kind === 'bool' ? false : null
  if (column.kind === 'number') return Number(value)
  if (column.kind === 'int') return Number(value)
  if (column.kind === 'bool') return Boolean(value)
  return String(value)
}

function storeValue(column: MasterColumn, value: unknown): unknown {
  if (value === undefined || value === null) return column.kind === 'bool' ? true : null
  if (column.kind === 'number') return Number(value).toFixed(column.decimals ?? 3)
  return value
}

function uniqueKeyOf(def: MasterDef, values: Record<string, unknown>): string {
  return def.uniqueKeys
    .map((key) => {
      const column = def.columns.find((entry) => entry.key === key)
      const value = values[key]
      if (value === null || value === undefined || value === '') return ''
      if (column?.kind === 'number') return String(Number(value))
      return String(value).trim().toLowerCase()
    })
    .join('|')
}

function describeKey(def: MasterDef, values: Record<string, unknown>): string {
  return def.uniqueKeys
    .map((key) => values[key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' · ')
}

async function customerNames(scope: Scope, rows: PlantEntity[]): Promise<Map<string, string>> {
  const ids = rows.map((row) => record(row).customerId).filter((id): id is string => typeof id === 'string')
  const customers = await loadCustomers(scope, ids)
  return new Map(Array.from(customers.values()).map((customer) => [customer.id, customer.name]))
}

export function toRow(def: MasterDef, entity: PlantEntity, names: Map<string, string>): MasterRow {
  const source = record(entity)
  const row: MasterRow = { id: entity.id, updatedAt: entity.updatedAt.toISOString(), updatedByName: entity.updatedByName ?? null }
  for (const column of def.columns) {
    row[column.key] = readValue(column, source[column.key])
    if (column.kind === 'customer') row.customerName = typeof source[column.key] === 'string' ? (names.get(source[column.key] as string) ?? null) : null
  }
  return row
}

function sortRows(def: MasterDef, rows: MasterRow[]): MasterRow[] {
  return [...rows].sort((left, right) => {
    for (const order of def.orderBy) {
      const a = left[order.key]
      const b = right[order.key]
      if (a === b) continue
      if (a === null || a === undefined) return 1
      if (b === null || b === undefined) return -1
      const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en', { numeric: true })
      if (compared !== 0) return order.dir === 'asc' ? compared : -compared
    }
    return 0
  })
}

export async function listMasters(scope: Scope, def: MasterDef, filter: { search?: string; includeInactive?: boolean } = {}): Promise<MasterRow[]> {
  const entities = (await scope.em.find(ENTITY[def.type], { ...scopeOf(scope), ...(filter.includeInactive === false ? { isActive: true } : {}) } as never)) as PlantEntity[]
  const names = await customerNames(scope, entities)
  let rows = entities.map((entity) => toRow(def, entity, names))
  const term = filter.search?.trim().toLowerCase()
  if (term) rows = rows.filter((row) => Object.values(row).some((value) => typeof value === 'string' && value.toLowerCase().includes(term)) || def.columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(term)))
  return sortRows(def, rows)
}

export async function findMaster(scope: Scope, def: MasterDef, id: string): Promise<PlantEntity> {
  const entity = (await scope.em.findOne(ENTITY[def.type], { id, ...scopeOf(scope) } as never)) as PlantEntity | null
  if (!entity) throw new PlantError(`${def.singular} not found`, 404)
  return entity
}

export function parseValues(def: MasterDef, values: Record<string, unknown>): Record<string, unknown> {
  const parsed = masterInputSchema(def).safeParse(values)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const column = def.columns.find((entry) => entry.key === issue?.path[0])
    throw new PlantError(column ? `${column.label}: ${column.required && (values[column.key] === undefined || values[column.key] === null || values[column.key] === '') ? 'fill this in' : 'check the value'}` : 'Check the values', 400, { field: column?.key ?? null })
  }
  return parsed.data as Record<string, unknown>
}

async function assertUnique(scope: Scope, def: MasterDef, values: Record<string, unknown>, ignoreId?: string) {
  const key = uniqueKeyOf(def, values)
  const existing = (await scope.em.find(ENTITY[def.type], scopeOf(scope) as never)) as PlantEntity[]
  const clash = existing.find((entity) => entity.id !== ignoreId && uniqueKeyOf(def, record(entity)) === key)
  if (clash) throw new PlantError(`${def.singular} ${describeKey(def, values)} already exists`, 409, { duplicateId: clash.id })
}

function apply(def: MasterDef, entity: PlantEntity, values: Record<string, unknown>, byName: string | null) {
  const target = record(entity)
  for (const column of def.columns) {
    if (!(column.key in values) && column.kind === 'bool') continue
    target[column.key] = storeValue(column, values[column.key])
  }
  entity.updatedByName = byName
}

async function assertCustomer(scope: Scope, values: Record<string, unknown>) {
  const id = values.customerId
  if (typeof id !== 'string') return
  const found = await loadCustomers(scope, [id])
  if (!found.has(id)) throw new PlantError('That customer was not found', 400, { field: 'customerId' })
}

export async function createMaster(scope: Scope, def: MasterDef, raw: Record<string, unknown>, byName: string | null): Promise<PlantEntity> {
  const values = parseValues(def, raw)
  await assertUnique(scope, def, values)
  await assertCustomer(scope, values)
  const entity = scope.em.create(ENTITY[def.type], { tenantId: scope.tenantId, organizationId: scope.organizationId } as never) as PlantEntity
  apply(def, entity, values, byName)
  scope.em.persist(entity)
  await scope.em.flush()
  return entity
}

export async function updateMaster(scope: Scope, def: MasterDef, entity: PlantEntity, raw: Record<string, unknown>, byName: string | null): Promise<PlantEntity> {
  const values = parseValues(def, { ...Object.fromEntries(def.columns.map((column) => [column.key, record(entity)[column.key]])), ...raw })
  await assertUnique(scope, def, values, entity.id)
  await assertCustomer(scope, values)
  apply(def, entity, values, byName)
  entity.updatedAt = new Date()
  await scope.em.flush()
  return entity
}

export async function deleteMaster(scope: Scope, entity: PlantEntity, byName: string | null) {
  entity.deletedAt = new Date()
  entity.updatedByName = byName
  await scope.em.flush()
}

export async function masterRow(scope: Scope, def: MasterDef, entity: PlantEntity): Promise<MasterRow> {
  return toRow(def, entity, await customerNames(scope, [entity]))
}

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function columnForHeader(def: MasterDef, header: string): MasterColumn | null {
  const wanted = normaliseHeader(header)
  return (
    def.columns.find((column) => normaliseHeader(column.label) === wanted || normaliseHeader(column.key) === wanted || (column.importHeaders ?? []).some((alias) => normaliseHeader(alias) === wanted)) ?? null
  )
}

function importValue(column: MasterColumn, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (!text || ['-', 'nil', 'na', 'n/a'].includes(text.toLowerCase())) return null
  if (column.kind === 'bool') return !['no', 'n', 'false', '0', 'inactive'].includes(text.toLowerCase())
  if (column.kind === 'select') {
    const match = (column.options ?? []).find((option) => option.value.toLowerCase() === text.toLowerCase() || option.label.toLowerCase() === text.toLowerCase())
    return match ? match.value : text
  }
  if (column.kind === 'number' || column.kind === 'int') return text.replace(/,/g, '').replace(/[^0-9.]/g, '')
  return text
}

async function customerIndex(scope: Scope): Promise<Map<string, string>> {
  const entities = await findWithDecryption(
    scope.em,
    CustomerEntity,
    { tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null },
    undefined,
    { tenantId: scope.tenantId, organizationId: scope.organizationId },
  )
  const index = new Map<string, string>()
  for (const entity of entities) {
    const name = typeof entity.displayName === 'string' ? entity.displayName.trim().toLowerCase() : ''
    if (name && !index.has(name)) index.set(name, entity.id)
  }
  return index
}

export type ImportReport = {
  dryRun: boolean
  total: number
  created: number
  updated: number
  failed: number
  unknownHeaders: string[]
  errors: Array<{ row: number; error: string; values: Record<string, unknown> }>
}

export async function importMasters(scope: Scope, def: MasterDef, rows: Array<Record<string, unknown>>, dryRun: boolean, byName: string | null): Promise<ImportReport> {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const mapping = new Map(headers.map((header) => [header, columnForHeader(def, header)]))
  const unknownHeaders = headers.filter((header) => !mapping.get(header))
  const mappedKeys = new Set(Array.from(mapping.values()).map((column) => column?.key))
  const missing = def.columns.filter((column) => column.required && column.kind !== 'select' && !mappedKeys.has(column.key)).map((column) => column.label)
  if (missing.length) throw new PlantError(`The file has no ${missing.join(', ')} column`, 400)
  const customers = def.columns.some((column) => column.kind === 'customer') ? await customerIndex(scope) : new Map<string, string>()
  const existing = (await scope.em.find(ENTITY[def.type], scopeOf(scope) as never)) as PlantEntity[]
  const byKey = new Map(existing.map((entity) => [uniqueKeyOf(def, record(entity)), entity]))
  const seen = new Set<string>()
  const report: ImportReport = { dryRun, total: rows.length, created: 0, updated: 0, failed: 0, unknownHeaders, errors: [] }
  for (const [index, row] of rows.entries()) {
    const values: Record<string, unknown> = {}
    for (const [header, raw] of Object.entries(row)) {
      const column = mapping.get(header)
      if (!column) continue
      if (column.kind === 'customer') {
        const name = raw === null || raw === undefined ? '' : String(raw).trim()
        if (!name) values[column.key] = null
        else if (customers.has(name.toLowerCase())) values[column.key] = customers.get(name.toLowerCase())
        else {
          report.errors.push({ row: index + 2, error: `Customer "${name}" is not in the customer list`, values: row })
          values.__failed = true
        }
        continue
      }
      values[column.key] = importValue(column, raw)
    }
    if (values.__failed) {
      report.failed += 1
      continue
    }
    for (const column of def.columns) {
      if (column.kind === 'select' && column.required && (values[column.key] === null || values[column.key] === undefined)) values[column.key] = column.options?.[0]?.value
    }
    try {
      const parsed = parseValues(def, values)
      const key = uniqueKeyOf(def, parsed)
      if (seen.has(key)) throw new PlantError(`${describeKey(def, parsed)} appears twice in the file`)
      seen.add(key)
      const current = byKey.get(key)
      if (current) report.updated += 1
      else report.created += 1
      if (dryRun) continue
      if (current) {
        apply(def, current, parsed, byName)
        current.updatedAt = new Date()
      } else {
        const entity = scope.em.create(ENTITY[def.type], { tenantId: scope.tenantId, organizationId: scope.organizationId } as never) as PlantEntity
        apply(def, entity, parsed, byName)
        scope.em.persist(entity)
        byKey.set(key, entity)
      }
    } catch (error) {
      report.failed += 1
      report.errors.push({ row: index + 2, error: error instanceof PlantError ? error.message : 'Could not read this row', values: row })
    }
  }
  if (!dryRun) await scope.em.flush()
  return report
}
