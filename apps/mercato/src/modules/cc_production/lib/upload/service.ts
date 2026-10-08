import { createHash } from 'node:crypto'
import { UploadBatch } from '../../data/entities'
import type { OrderContext } from '../../../cc_orders/lib/server'
import type { StoreContext } from '../../../cc_store/lib/server'
import { listViews } from '../../../cc_lists/lib/service'
import type { ParsedUpload } from './parse'
import type { UploadRegister, UploadRowError } from './types'
import { uploadRegister } from './registers'

export type UploadReport = {
  register: string
  dryRun: boolean
  fileName: string
  total: number
  created: number
  updated: number
  skipped: number
  failed: number
  plan: string[]
  unknownHeaders: string[]
  errors: UploadRowError[]
  failedRows: Array<{ row: number; values: Record<string, string>; reason: string }>
  previousUpload: { at: string; byName: string | null } | null
  batchId: string | null
}

export function fileHash(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function requiredErrors(register: UploadRegister, parsed: ParsedUpload): UploadRowError[] {
  const errors: UploadRowError[] = []
  for (const row of parsed.rows) {
    const missing = register.columns.filter((column) => column.required && !row.values[column.key]).map((column) => column.label)
    if (missing.length) errors.push({ row: row.sheetRow, error: `Fill in: ${missing.join(', ')}` })
  }
  return errors
}

export async function runUpload(
  ctx: StoreContext,
  register: UploadRegister,
  parsed: ParsedUpload,
  options: { dryRun: boolean; byName: string | null; fileName: string; hash: string },
): Promise<UploadReport> {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const previous = await ctx.em.findOne(UploadBatch, { ...scope, registerKey: register.key, fileHash: options.hash }, { orderBy: { createdAt: 'desc' } })
  const blocking = requiredErrors(register, parsed)
  const blockedRows = new Set(blocking.map((entry) => entry.row))
  const runnable = parsed.rows.filter((row) => !blockedRows.has(row.sheetRow))
  const result = runnable.length ? await register.run(ctx, runnable, { dryRun: options.dryRun, byName: options.byName }) : { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], plan: [] }
  const errors = [...blocking, ...result.errors].sort((left, right) => left.row - right.row)
  const reasonByRow = new Map<number, string>()
  for (const entry of errors) reasonByRow.set(entry.row, reasonByRow.has(entry.row) ? `${reasonByRow.get(entry.row)}; ${entry.error}` : entry.error)
  const failedRows = parsed.rows.filter((row) => reasonByRow.has(row.sheetRow)).map((row) => ({ row: row.sheetRow, values: row.values, reason: reasonByRow.get(row.sheetRow) ?? '' }))
  let batchId: string | null = null
  if (!options.dryRun) {
    const dateColumn = register.columns.find((column) => column.kind === 'date')
    const batch = ctx.em.create(UploadBatch, {
      ...scope,
      registerKey: register.key,
      fileName: options.fileName,
      fileHash: options.hash,
      registerDate: dateColumn ? (parsed.rows.find((row) => row.values[dateColumn.key])?.values[dateColumn.key] ?? null) : null,
      totalRows: parsed.rows.length,
      createdRows: result.created,
      updatedRows: result.updated,
      failedRows: failedRows.length,
      errors: errors.slice(0, 500),
      byName: options.byName,
    })
    ctx.em.persist(batch)
    await ctx.em.flush()
    batchId = batch.id
  }
  return {
    register: register.key,
    dryRun: options.dryRun,
    fileName: options.fileName,
    total: parsed.rows.length,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    failed: failedRows.length,
    plan: result.plan,
    unknownHeaders: parsed.unknownHeaders,
    errors,
    failedRows,
    previousUpload: previous ? { at: previous.createdAt.toISOString(), byName: previous.byName ?? null } : null,
    batchId,
  }
}

export async function uploadHistory(ctx: OrderContext, registerKey?: string) {
  const rows = await ctx.em.find(
    UploadBatch,
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId, ...(registerKey ? { registerKey } : {}) },
    { orderBy: { createdAt: 'desc' }, limit: 100 },
  )
  return rows.map((row) => ({
    id: row.id,
    register: row.registerKey,
    fileName: row.fileName,
    registerDate: row.registerDate ?? null,
    total: row.totalRows,
    created: row.createdRows,
    updated: row.updatedRows,
    failed: row.failedRows,
    errors: row.errors ?? [],
    byName: row.byName ?? null,
    at: row.createdAt.toISOString(),
  }))
}

export async function uploadDetail(ctx: OrderContext, id: string) {
  const row = await ctx.em.findOne(UploadBatch, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!row) return null
  const register = uploadRegister(row.registerKey)
  return {
    id: row.id,
    register: row.registerKey,
    registerLabel: register?.label ?? row.registerKey,
    department: register?.department ?? null,
    paperRef: register?.paperRef ?? null,
    fileName: row.fileName,
    fileHash: row.fileHash,
    registerDate: row.registerDate ?? null,
    total: row.totalRows,
    created: row.createdRows,
    updated: row.updatedRows,
    failed: row.failedRows,
    errors: row.errors ?? [],
    byName: row.byName ?? null,
    at: row.createdAt.toISOString(),
  }
}

export async function listValues(ctx: OrderContext, register: UploadRegister): Promise<Record<string, string[]>> {
  const keys = Array.from(new Set(register.columns.map((column) => column.listKey).filter((key): key is string => Boolean(key))))
  const result: Record<string, string[]> = {}
  for (const key of keys) {
    const [list] = await listViews(ctx, key)
    result[key] = list ? list.options.filter((option) => option.active).map((option) => option.value) : []
  }
  return result
}
