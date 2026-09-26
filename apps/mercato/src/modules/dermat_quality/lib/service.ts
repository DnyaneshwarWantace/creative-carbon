import type { EntityManager } from '@mikro-orm/postgresql'
import { QcCheck, QcRule, type QcOperation, type QcPartStatus, type QcResult } from '../data/entities'
import { DEFAULT_RULES, STAGE_TO_OPERATION } from './defaults'

export type QcScope = { em: EntityManager; tenantId: string; organizationId: string }

export class QcError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

function financialYear(date: Date): string {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`
}

export async function nextCode(scope: QcScope, table: 'dermat_quality_rules' | 'dermat_quality_checks', kind: 'QR' | 'QC', pad: number): Promise<string> {
  const prefix = `DER/${kind}/${financialYear(new Date())}/`
  const [row] = await scope.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(nullif(substring(code from length(?) + 1), '')::int) as max from ${table} where tenant_id = ? and organization_id = ? and code like ?`,
    [prefix, scope.tenantId, scope.organizationId, `${prefix}%`],
    'all',
    scope.em.getTransactionContext(),
  )
  return `${prefix}${String(Number(row?.max ?? 0) + 1).padStart(pad, '0')}`
}

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
    const exists = await scope.em.findOne(QcCheck, { orderId: input.orderId, stageKey: input.stageKey, productId, deletedAt: null })
    if (exists) continue
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
        history: [{ action: 'created', by: input.byName, at: new Date().toISOString(), note: `From ${rule.code} ${rule.title}` }],
      }),
    )
    await scope.em.flush()
    created += 1
  }
  return created
}

export type StageQcSummary = { id: string; code: string; productId: string; status: string; chemicalStatus: string; microStatus: string; batchNo: string | null }

export async function checksForOrder(scope: QcScope, orderId: string): Promise<Record<string, StageQcSummary[]>> {
  const checks = await scope.em.find(QcCheck, { orderId, tenantId: scope.tenantId, organizationId: scope.organizationId, deletedAt: null }, { orderBy: { createdAt: 'asc' } })
  const result: Record<string, StageQcSummary[]> = {}
  for (const check of checks) {
    const key = check.stageKey ?? ''
    ;(result[key] ??= []).push({
      id: check.id,
      code: check.code,
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
  return checks.filter((check) => check.status !== 'passed')
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
