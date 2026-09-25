import { QcCheck } from '../data/entities'
import { QcError, computeStatus } from './service'
import { currentUserName, productSummaries, type QcContext } from './server'

export async function findCheck(ctx: QcContext, id: string): Promise<QcCheck> {
  const check = await ctx.em.findOne(QcCheck, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!check) throw new QcError('QC check not found', 404)
  return check
}

export async function checkView(ctx: QcContext, check: QcCheck) {
  const products = await productSummaries(ctx, [check.productId])
  const product = products.get(check.productId)
  return {
    id: check.id,
    code: check.code,
    operation: check.operation,
    productId: check.productId,
    productTitle: product?.title ?? '',
    productCode: product?.code ?? null,
    orderId: check.orderId ?? null,
    orderNo: check.orderNo ?? null,
    stageKey: check.stageKey ?? null,
    batchNo: check.batchNo ?? null,
    ruleId: check.ruleId ?? null,
    requiresChemical: check.requiresChemical,
    requiresMicro: check.requiresMicro,
    chemicalStatus: check.chemicalStatus,
    microStatus: check.microStatus,
    status: check.status,
    results: check.results ?? [],
    chemicalBy: check.chemicalBy ?? null,
    chemicalAt: check.chemicalAt ? check.chemicalAt.toISOString() : null,
    microBy: check.microBy ?? null,
    microAt: check.microAt ? check.microAt.toISOString() : null,
    history: check.history ?? [],
    createdAt: check.createdAt.toISOString(),
    updatedAt: check.updatedAt.toISOString(),
  }
}

export async function decidePart(ctx: QcContext, check: QcCheck, part: 'chemical' | 'micro', result: 'pass' | 'fail', note: string | null) {
  const required = part === 'chemical' ? check.requiresChemical : check.requiresMicro
  if (!required) throw new QcError(`This check does not need a ${part} test`)
  const current = part === 'chemical' ? check.chemicalStatus : check.microStatus
  if (current !== 'pending') throw new QcError(`The ${part} test is already ${current === 'pass' ? 'passed' : 'failed'}. Start a re-test to change it.`, 409)
  if (result === 'fail' && !note) throw new QcError('Write why it failed')
  if (result === 'pass') {
    const missing = (check.results ?? []).filter((row) => row.test === part && !row.observation.trim()).map((row) => row.name)
    if (missing.length) throw new QcError(`Enter the observation for: ${missing.join(', ')}`)
  }
  const byName = await currentUserName(ctx)
  if (part === 'chemical') {
    check.chemicalStatus = result
    check.chemicalBy = byName
    check.chemicalAt = new Date()
  } else {
    check.microStatus = result
    check.microBy = byName
    check.microAt = new Date()
  }
  check.status = computeStatus(check)
  check.history = [...(check.history ?? []), { action: `${part}_${result}`, by: byName, at: new Date().toISOString(), note }]
  check.updatedAt = new Date()
}
