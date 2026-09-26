import { QcCheck, type QcResult } from '../data/entities'
import { QcError, computeStatus } from './service'
import { currentUserName, productSummaries, type QcContext } from './server'

export async function findCheck(ctx: QcContext, id: string): Promise<QcCheck> {
  const check = await ctx.em.findOne(QcCheck, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!check) throw new QcError('QC check not found', 404)
  return check
}

export function evaluateResult(row: QcResult): QcResult {
  const hasLimits = (row.min !== null && row.min !== undefined) || (row.max !== null && row.max !== undefined)
  const value = Number.parseFloat(String(row.observation ?? '').replace(',', '.'))
  if (!hasLimits || !String(row.observation ?? '').trim() || !Number.isFinite(value)) return { ...row, inSpec: null }
  const low = row.min !== null && row.min !== undefined ? value >= row.min : true
  const high = row.max !== null && row.max !== undefined ? value <= row.max : true
  return { ...row, inSpec: low && high }
}

export function limitText(row: Pick<QcResult, 'min' | 'max' | 'unit'>): string {
  const unit = row.unit ? ` ${row.unit}` : ''
  if (row.min !== null && row.min !== undefined && row.max !== null && row.max !== undefined) return `${row.min}–${row.max}${unit}`
  if (row.min !== null && row.min !== undefined) return `≥ ${row.min}${unit}`
  if (row.max !== null && row.max !== undefined) return `≤ ${row.max}${unit}`
  return ''
}

export async function checkView(ctx: QcContext, check: QcCheck) {
  const products = await productSummaries(ctx, [check.productId])
  const product = products.get(check.productId)
  return {
    id: check.id,
    code: check.code,
    arNo: check.arNo ?? null,
    round: check.round ?? 1,
    worksheet: check.worksheet ?? {},
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
    results: (check.results ?? []).map(evaluateResult),
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
  if (check.status === 'reworked' || check.status === 'rejected') throw new QcError('This check is closed; the batch went to a new round', 409)
  if (result === 'pass') {
    if (!check.worksheet?.sampledBy || !check.worksheet?.sampledAt) throw new QcError('Record who drew the sample and when before passing')
    const missing = (check.results ?? []).filter((row) => row.test === part && !row.observation.trim()).map((row) => row.name)
    if (missing.length) throw new QcError(`Enter the observation for: ${missing.join(', ')}`)
    const out = (check.results ?? []).map(evaluateResult).filter((row) => row.test === part && row.inSpec === false)
    if (out.length) throw new QcError(`Out of spec: ${out.map((row) => `${row.name} ${row.observation} (spec ${limitText(row)})`).join(', ')}. Fail it, or correct the reading.`)
    if (part === 'micro' && !check.worksheet?.platedAt) throw new QcError('Record the micro plating date before passing micro')
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
