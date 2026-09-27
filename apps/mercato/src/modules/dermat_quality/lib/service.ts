import type { EntityManager } from '@mikro-orm/postgresql'
import { QcCheck, QcRule, type QcOperation, type QcPartStatus, type QcResult } from '../data/entities'
import { DEFAULT_RULES, STAGE_TO_OPERATION } from './defaults'
import { nextSeriesCode } from '../../dermat_accounts/lib/numberSeries'

export type QcScope = { em: EntityManager; tenantId: string; organizationId: string }

export class QcError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export async function nextCode(scope: QcScope, _table: 'dermat_quality_rules' | 'dermat_quality_checks', kind: 'QR' | 'QC', _pad: number): Promise<string> {
  return nextSeriesCode(scope, kind)
}

const AR_KIND: Record<QcOperation, string> = { purchase_receipt: 'IN', bulk: 'BK', filling: 'FL', packing: 'FG' }

export async function nextArNo(scope: QcScope, operation: QcOperation, productId: string): Promise<string> {
  let kind = AR_KIND[operation]
  if (operation === 'purchase_receipt') {
    const [row] = await scope.em.getConnection().execute<Array<{ kind: string | null }>>(
      'select custom_fieldset_code as kind from catalog_products where id = ?',
      [productId],
      'all',
      scope.em.getTransactionContext(),
    )
    kind = row?.kind === 'packing_material' ? 'PM' : 'RM'
  }
  const now = new Date()
  const prefix = `DI/${kind}/${String(now.getFullYear()).slice(-2)}/${String(now.getMonth() + 1).padStart(2, '0')}/`
  const [row] = await scope.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(nullif(substring(ar_no from length(?) + 1), '')::int) as max from dermat_quality_checks where tenant_id = ? and organization_id = ? and ar_no like ?`,
    [prefix, scope.tenantId, scope.organizationId, `${prefix}%`],
    'all',
    scope.em.getTransactionContext(),
  )
  return `${prefix}${String(Number(row?.max ?? 0) + 1).padStart(3, '0')}`
}

export const CLOSED_CHECK_STATUSES = ['reworked', 'rejected'] as const

export async function ensureDefaultRules(scope: QcScope): Promise<void> {
  const existing = await scope.em.find(QcRule, { tenantId: scope.tenantId, organizationId: scope.organizationId, productId: null, deletedAt: null })
  const have = new Set(existing.map((rule) => rule.operation))
  let created = false
  for (const def of DEFAULT_RULES) {
    if (have.has(def.operation)) continue
    scope.em.persist(
      scope.em.create(QcRule, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        code: await nextCode(scope, 'dermat_quality_rules', 'QR', 3),
        title: def.title,
        operation: def.operation,
        productId: null,
        requiresChemical: def.requiresChemical,
        requiresMicro: def.requiresMicro,
        isActive: def.isActive,
        parameters: def.parameters,
      }),
    )
    await scope.em.flush()
    created = true
  }
  if (created) await scope.em.flush()
}

export async function resolveRule(scope: QcScope, operation: QcOperation, productId: string): Promise<QcRule | null> {
  const specific = await scope.em.findOne(QcRule, { tenantId: scope.tenantId, organizationId: scope.organizationId, operation, productId, deletedAt: null })
  if (specific) return specific
  return scope.em.findOne(QcRule, { tenantId: scope.tenantId, organizationId: scope.organizationId, operation, productId: null, deletedAt: null })
}

export function computeStatus(check: Pick<QcCheck, 'requiresChemical' | 'requiresMicro' | 'chemicalStatus' | 'microStatus'>): QcCheck['status'] {
  const parts: QcPartStatus[] = []
  if (check.requiresChemical) parts.push(check.chemicalStatus)
  if (check.requiresMicro) parts.push(check.microStatus)
  if (parts.includes('fail')) return 'failed'
  if (parts.length && parts.every((part) => part === 'pass')) return 'passed'
  if (!parts.length) return 'passed'
  return 'pending'
}

export async function ensureChecksForStage(
  scope: QcScope,
  input: { orderId: string; orderNo: string; stageKey: string; productIds: string[]; byName: string | null },
): Promise<number> {
  const operation = STAGE_TO_OPERATION[input.stageKey]
  if (!operation) return 0
  await ensureDefaultRules(scope)
  let created = 0
  for (const productId of Array.from(new Set(input.productIds))) {
    const earlier = await scope.em.find(QcCheck, { orderId: input.orderId, stageKey: input.stageKey, productId, deletedAt: null })
    if (earlier.some((check) => !(CLOSED_CHECK_STATUSES as readonly string[]).includes(check.status))) continue
    const round = earlier.reduce((max, check) => Math.max(max, check.round ?? 1), 0) + 1
    const rule = await resolveRule(scope, operation, productId)
    if (!rule || !rule.isActive) continue
    const results: QcResult[] = (rule.parameters ?? [])
      .filter((param) => (param.test === 'micro' ? rule.requiresMicro : rule.requiresChemical))
      .map((param) => ({ ...param, observation: '', remark: '' }))
    scope.em.persist(
      scope.em.create(QcCheck, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        code: await nextCode(scope, 'dermat_quality_checks', 'QC', 4),
        arNo: await nextArNo(scope, operation, productId),
        round,
        operation,
        productId,
        orderId: input.orderId,
        orderNo: input.orderNo,
        stageKey: input.stageKey,
        ruleId: rule.id,
        requiresChemical: rule.requiresChemical,
        requiresMicro: rule.requiresMicro,
        chemicalStatus: rule.requiresChemical ? 'pending' : 'na',
        microStatus: rule.requiresMicro ? 'pending' : 'na',
        status: rule.requiresChemical || rule.requiresMicro ? 'pending' : 'passed',
        results,
        history: [{ action: 'created', by: input.byName, at: new Date().toISOString(), note: `${round > 1 ? `Round ${round} after rework · ` : ''}From ${rule.code} ${rule.title}` }],
      }),
    )
    await scope.em.flush()
    created += 1
  }
  return created
}

export type StageQcSummary = { id: string; code: string; arNo: string | null; round: number; productId: string; status: string; chemicalStatus: string; microStatus: string; batchNo: string | null }

export async function checksForOrder(scope: QcScope, orderId: string): Promise<Record<string, StageQcSummary[]>> {
  const checks = await scope.em.find(QcCheck, { orderId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null }, { orderBy: { createdAt: 'asc' } })
  const result: Record<string, StageQcSummary[]> = {}
  for (const check of checks) {
    const key = check.stageKey ?? ''
    ;(result[key] ??= []).push({
      id: check.id,
      code: check.code,
      arNo: check.arNo ?? null,
      round: check.round ?? 1,
      productId: check.productId,
      status: check.status,
      chemicalStatus: check.chemicalStatus,
      microStatus: check.microStatus,
      batchNo: check.batchNo ?? null,
    })
  }
  return result
}

export async function blockingChecks(scope: QcScope, orderId: string, stageKey: string): Promise<QcCheck[]> {
  if (!STAGE_TO_OPERATION[stageKey]) return []
  const checks = await scope.em.find(QcCheck, { orderId, stageKey, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null })
  return checks.filter((check) => check.status !== 'passed' && !(CLOSED_CHECK_STATUSES as readonly string[]).includes(check.status))
}

export async function closeFailedChecks(
  scope: QcScope,
  input: { orderId: string; stageKey: string; status: 'reworked' | 'rejected'; note: string; byName: string | null },
): Promise<string[]> {
  const checks = await scope.em.find(QcCheck, { orderId: input.orderId, stageKey: input.stageKey, deletedAt: null, status: 'failed' })
  for (const check of checks) {
    check.status = input.status
    check.history = [...(check.history ?? []), { action: input.status === 'reworked' ? 'sent_to_rework' : 'batch_rejected', by: input.byName, at: new Date().toISOString(), note: input.note }]
    check.updatedAt = new Date()
  }
  return checks.map((check) => check.code)
}

export async function createInwardCheck(
  scope: QcScope,
  input: { grnId: string; grnCode: string; productId: string; lotNumber: string; byName: string | null },
): Promise<QcCheck | null> {
  await ensureDefaultRules(scope)
  const rule = await resolveRule(scope, 'purchase_receipt', input.productId)
  if (!rule || !rule.isActive) return null
  const results: QcResult[] = (rule.parameters ?? [])
    .filter((param) => (param.test === 'micro' ? rule.requiresMicro : rule.requiresChemical))
    .map((param) => ({ ...param, observation: '', remark: '' }))
  const check = scope.em.create(QcCheck, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    code: await nextCode(scope, 'dermat_quality_checks', 'QC', 4),
    arNo: await nextArNo(scope, 'purchase_receipt', input.productId),
    operation: 'purchase_receipt',
    productId: input.productId,
    orderId: input.grnId,
    orderNo: input.grnCode,
    stageKey: 'grn',
    batchNo: input.lotNumber,
    ruleId: rule.id,
    requiresChemical: rule.requiresChemical,
    requiresMicro: rule.requiresMicro,
    chemicalStatus: rule.requiresChemical ? 'pending' : 'na',
    microStatus: rule.requiresMicro ? 'pending' : 'na',
    status: rule.requiresChemical || rule.requiresMicro ? 'pending' : 'passed',
    results,
    history: [{ action: 'created', by: input.byName, at: new Date().toISOString(), note: `Inward material from ${input.grnCode} · ${rule.code} ${rule.title}` }],
  })
  scope.em.persist(check)
  await scope.em.flush()
  return check
}

export async function retireStageChecks(scope: QcScope, orderId: string, stageKey: string, note: string): Promise<number> {
  const checks = await scope.em.find(QcCheck, { orderId, stageKey, deletedAt: null, status: { $ne: 'passed' } })
  for (const check of checks) {
    check.history = [...(check.history ?? []), { action: 'not_needed', by: null, at: new Date().toISOString(), note }]
    check.deletedAt = new Date()
  }
  return checks.length
}
