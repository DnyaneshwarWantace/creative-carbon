import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { commandContext, type StoreContext } from '../../cc_store/lib/server'
import { createProductWithStockSetup } from '../../cc_products/lib/createProduct'
import type { StockPlace } from '../../cc_products/lib/stock'
import { LoadingTolerance, Press, PressBatch, type PlantHistoryEntry, type PressDaylight, type PressOutput, type PressPick } from '../data/entities'
import type { PressBatchInput } from '../data/validators'
import { bstageBoard } from './bstage'
import { PlantError } from './server'
import { pressFigures } from './pressFigures'
import { consumeLots, kg3, lotOnHand, movementTime, pickLots, plantStock, produceLot, returnLots, type FreeLot } from './plantStock'

export { pressFigures, type SizeLine } from './pressFigures'

const SOURCE = 'cc_production.press'
export const PRESS_GRADES = ['F2F3', '10x10', '6x6', 'G 10x10', 'G 6x6']

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function entry(action: string, by: string | null, note: string | null = null): PlantHistoryEntry {
  return { action, by, at: new Date().toISOString(), note }
}

const normalise = (value: string) => value.toLowerCase().replace(/[×*]/g, 'x').replace(/[^a-z0-9x]+/g, '')

export function gradeMatches(grade: string, clothTitle: string | null): boolean {
  if (!clothTitle) return false
  if (normalise(grade) === normalise(clothTitle)) return true
  const paperGrades = grade.toUpperCase().match(/F\d/g)
  if (paperGrades && !/\d+\s*x\s*\d+/i.test(grade)) return paperGrades.some((token) => new RegExp(`\\b${token}\\b`, 'i').test(clothTitle))
  return false
}

export function pressBatchNo(isoDate: string, seq: number): string {
  const [year, month] = isoDate.split('-')
  return `F/${String(seq).padStart(2, '0')}/${month}/${year}`
}

async function nextSeq(ctx: StoreContext, month: string): Promise<number> {
  const [row] = await ctx.em.getConnection().execute<Array<{ seq: number | null }>>('select max(seq) as seq from cc_press_batches where organization_id = ? and tenant_id = ? and batch_month = ?', [ctx.organizationId, ctx.tenantId, month])
  return (row?.seq ?? 0) + 1
}

async function tolerances(ctx: StoreContext) {
  const rows = await ctx.em.find(LoadingTolerance, { ...scope(ctx), deletedAt: null, isActive: true })
  return rows.map((row) => ({ thicknessMm: Number(row.thicknessMm), minKg: Number(row.minKg), maxKg: Number(row.maxKg) }))
}

async function laminatePresses(ctx: StoreContext) {
  return ctx.em.find(Press, { ...scope(ctx), deletedAt: null, usage: { $in: ['laminate', 'both'] } }, { orderBy: { number: 'asc' } })
}

async function availableLots(ctx: StoreContext) {
  const board = await bstageBoard(ctx, {})
  return board.columns.flatMap((column) => column.lots).filter((lot) => lot.freeKg > 0)
}

export async function pressSetup(ctx: StoreContext, isoDate: string | null) {
  const lots = await availableLots(ctx)
  const grades = [...new Set([...PRESS_GRADES, ...lots.map((lot) => lot.clothTitle).filter((title): title is string => Boolean(title))])]
  return {
    nextBatchNo: isoDate ? pressBatchNo(isoDate, await nextSeq(ctx, isoDate.slice(0, 7))) : null,
    presses: (await laminatePresses(ctx)).map((press) => ({ id: press.id, number: press.number, pressType: press.pressType, daylights: press.daylights ?? null, isWorking: press.isWorking })),
    tolerances: await tolerances(ctx),
    grades,
    lots: lots.map((lot) => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, clothTitle: lot.clothTitle, gsm: lot.gsm, freeKg: lot.freeKg, ageDays: lot.ageDays, band: lot.band, madeOn: lot.madeOn, grades: grades.filter((grade) => gradeMatches(grade, lot.clothTitle)) })),
  }
}

export async function findPressBatch(ctx: StoreContext, id: string): Promise<PressBatch> {
  const batch = await ctx.em.findOne(PressBatch, { id, ...scope(ctx) })
  if (!batch) throw new PlantError('Press batch not found', 404)
  return batch
}

async function applyInput(ctx: StoreContext, batch: PressBatch, input: PressBatchInput) {
  const press = await ctx.em.findOne(Press, { id: input.pressId, ...scope(ctx), deletedAt: null })
  if (!press) throw new PlantError('Pick the press')
  if (press.usage === 'moulding') throw new PlantError(`Press ${press.number} is a moulding press`)
  const limits = await tolerances(ctx)
  const warnings: string[] = []
  const numbers = new Set<number>()
  const daylights: PressDaylight[] = input.daylights
    .map((daylight) => {
      if (numbers.has(daylight.no)) throw new PlantError(`Daylight ${daylight.no} is entered twice`)
      numbers.add(daylight.no)
      if (press.daylights && daylight.no > press.daylights) throw new PlantError(`Press ${press.number} has only ${press.daylights} daylights`)
      return {
        no: daylight.no,
        sheets: daylight.sheets.map((sheet) => {
          const tolerance = limits.find((limit) => Math.abs(limit.thicknessMm - sheet.thicknessMm) < 0.001) ?? null
          const weights = [sheet.weightKg, ...(sheet.weightMinKg !== null ? [sheet.weightMinKg] : [])]
          const toleranceOk = tolerance ? weights.every((weight) => weight >= tolerance.minKg - 0.0005 && weight <= tolerance.maxKg + 0.0005) : null
          if (tolerance && !toleranceOk) warnings.push(`Daylight ${daylight.no}: ${sheet.thicknessMm} mm loaded at ${weights.map((weight) => kg3(weight)).join(' / ')} kg, specified ${tolerance.minKg}–${tolerance.maxKg} kg`)
          return { thicknessMm: sheet.thicknessMm, count: sheet.count, weightKg: kg3(sheet.weightKg), weightMinKg: sheet.weightMinKg === null ? null : kg3(sheet.weightMinKg), grade: sheet.grade.trim(), tolerance: tolerance ? { minKg: tolerance.minKg, maxKg: tolerance.maxKg } : null, toleranceOk }
        }),
      }
    })
    .sort((left, right) => left.no - right.no)
  batch.pressId = press.id
  batch.pressNumber = press.number
  batch.cycleNo = input.cycleNo ?? null
  batch.daylights = daylights
  batch.lotChoices = input.lotChoices
  batch.heating = input.heating ?? null
  batch.checkedBy = input.checkedBy ?? null
  batch.remark = input.remark ?? null
  batch.warnings = warnings
}

export async function createPressBatch(ctx: StoreContext, input: PressBatchInput, byName: string | null, bookNo: string | null = null) {
  const month = input.batchDate.slice(0, 7)
  let seq = await nextSeq(ctx, month)
  if (bookNo) {
    const match = bookNo.match(/^F\/(\d{1,3})\/(\d{1,2})\/(\d{4})$/i)
    if (!match) throw new PlantError(`Batch No. ${bookNo} is not in the F/NN/MM/YYYY form`)
    if (`${match[3]}-${match[2].padStart(2, '0')}` !== month) throw new PlantError(`${bookNo} is not in the month of ${input.batchDate}`)
    const wanted = Number(match[1])
    const taken = await ctx.em.findOne(PressBatch, { ...scope(ctx), batchMonth: month, seq: wanted })
    if (taken) throw new PlantError(`${taken.batchNo} already exists`, 409)
    seq = wanted
  }
  const batch = ctx.em.create(PressBatch, { ...scope(ctx), batchNo: pressBatchNo(input.batchDate, seq), batchMonth: month, seq, batchDate: input.batchDate, pressId: input.pressId, pressNumber: 0, daylights: [], updatedByName: byName, history: [entry('created', byName)] })
  await applyInput(ctx, batch, input)
  ctx.em.persist(batch)
  await ctx.em.flush()
  return batch
}

export async function updatePressBatch(ctx: StoreContext, batch: PressBatch, input: PressBatchInput, byName: string | null) {
  if (batch.status !== 'draft') throw new PlantError(batch.status === 'posted' ? 'This batch is posted. Reopen it first to change it.' : 'This batch is cancelled', 409)
  if (input.batchDate.slice(0, 7) !== batch.batchMonth) throw new PlantError(`${batch.batchNo} belongs to ${batch.batchMonth}; the date must stay in that month so the numbers have no gaps`, 409)
  batch.batchDate = input.batchDate
  await applyInput(ctx, batch, input)
  batch.updatedByName = byName
  batch.history = [...(batch.history ?? []), entry('edited', byName)]
  await ctx.em.flush()
  return batch
}

type LaminateRow = { id: string; title: string; field_key: string | null; value_text: string | null }

async function laminateProductFor(ctx: StoreContext, grade: string): Promise<{ id: string; title: string }> {
  const rows = await ctx.em.getConnection().execute<LaminateRow[]>(
    `select p.id, p.title, v.field_key, v.value_text from catalog_products p
       left join custom_field_values v on v.record_id = p.id::text and v.entity_id = 'catalog:catalog_product' and v.deleted_at is null and v.field_key in ('laminate_grade', 'weave', 'product_form')
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.custom_fieldset_code = 'laminate'
      order by p.created_at asc`,
    [ctx.tenantId, ctx.organizationId],
  )
  const products = new Map<string, { id: string; title: string; fields: Record<string, string> }>()
  for (const row of rows) {
    const product = products.get(row.id) ?? { id: row.id, title: row.title, fields: {} }
    if (row.field_key && row.value_text) product.fields[row.field_key] = row.value_text
    products.set(row.id, product)
  }
  const sheets = [...products.values()].filter((product) => !product.fields.product_form || /sheet/i.test(product.fields.product_form))
  const isWeave = /\d+\s*x\s*\d+/i.test(grade)
  const found = isWeave
    ? sheets.find((product) => normalise(product.fields.weave ?? '') === normalise(grade) && /fabric/i.test(product.fields.laminate_grade ?? '')) ?? sheets.find((product) => normalise(product.title) === normalise(`${grade} Sheet`))
    : sheets.find((product) => normalise(product.fields.laminate_grade ?? '') === normalise(grade))
  if (found) return { id: found.id, title: found.title }
  const title = isWeave ? `Fabric ${grade} Sheet` : `${grade} Sheet`
  const created = await createProductWithStockSetup(ctx.container.resolve('commandBus') as CommandBus, commandContext(ctx), (ctx.container.resolve('em') as EntityManager).getConnection(), {
    title,
    kind: 'laminate',
    unit: 'kg',
    categoryId: null,
    taxRateId: null,
    custom: { cf_product_form: 'Sheet', ...(isWeave ? { cf_laminate_grade: 'Fabric', cf_weave: grade } : { cf_laminate_grade: grade }) },
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
  })
  return { id: created.productId, title }
}

export async function postPressBatch(ctx: StoreContext, batch: PressBatch, byName: string | null) {
  if (batch.status !== 'draft') throw new PlantError(batch.status === 'posted' ? 'This batch is already posted' : 'This batch is cancelled', 409)
  if (!batch.daylights.length) throw new PlantError('Enter at least one daylight')
  const figures = pressFigures(batch.daylights)
  const lots = await availableLots(ctx)
  const picks: PressPick[] = []
  for (const [grade, kgNeeded] of Object.entries(figures.kgByGrade)) {
    const matching = lots.filter((lot) => gradeMatches(grade, lot.clothTitle) && lot.band !== 'blocked')
    const choice = (batch.lotChoices ?? []).find((candidate) => candidate.grade === grade && candidate.lotId)
    const usual = matching.filter((lot) => lot.band !== 'expired')
    if (choice) {
      const chosen = matching.find((lot) => lot.lotId === choice.lotId)
      if (!chosen) throw new PlantError(`The B-stage lot picked for ${grade} is not usable (used up, or past ${lots.find((lot) => lot.lotId === choice.lotId)?.maxUse ?? 10} days)`, 409)
      const oldest = usual[0]
      if ((chosen.band === 'expired' || (oldest && oldest.lotId !== chosen.lotId)) && !choice.reason.trim()) throw new PlantError(`Write why ${chosen.lotNumber} is used for ${grade} instead of the oldest lot`, 400)
    }
    const pool = choice ? [...matching.filter((lot) => lot.lotId === choice.lotId), ...usual.filter((lot) => lot.lotId !== choice.lotId)] : usual
    const free: Array<FreeLot & { productId: string; ageDays: number }> = pool.map((lot) => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, place: (lot.place ?? 'floor') as StockPlace, free: lot.freeKg, receivedAt: lot.madeOn, productId: lot.productId, ageDays: lot.ageDays }))
    const chosenPicks = pickLots(free, kgNeeded, `B-stage for ${grade}`, choice?.lotId ?? null)
    for (const pick of chosenPicks) {
      const source = free.find((lot) => lot.lotId === pick.lotId)!
      const shared = lots.find((lot) => lot.lotId === pick.lotId)
      if (shared) shared.freeKg = kg3(shared.freeKg - pick.kg)
      picks.push({ grade, productId: source.productId, lotId: pick.lotId, lotNumber: pick.lotNumber, place: pick.place, kg: pick.kg, ageDays: source.ageDays })
    }
  }

  const performedAt = movementTime(batch.batchDate)
  const metadata = { source: SOURCE, batchId: batch.id, batchNo: batch.batchNo }
  const undo: Array<() => Promise<void>> = []
  const outputs: PressOutput[] = []
  try {
    for (const pick of picks) {
      const stock = await plantStock(ctx, [pick.productId])
      const movement = { reason: `Pressed in ${batch.batchNo} (${pick.grade})`, reasonCode: 'press_consume', performedAt, metadata }
      await consumeLots(ctx, stock, pick.productId, [pick], movement)
      undo.push(() => returnLots(ctx, stock, pick.productId, [pick], { ...movement, reason: `Undo ${batch.batchNo}`, reasonCode: 'press_undo' }))
    }
    for (const line of figures.sizeLines) {
      const product = await laminateProductFor(ctx, line.grade)
      const stock = await plantStock(ctx, [product.id])
      const lotNumber = `${batch.batchNo} ${line.thicknessMm}mm ${line.grade}`
      const previous = (batch.outputs ?? []).find((output) => output.lotNumber === lotNumber && output.productId === product.id)
      const lotId = await produceLot(ctx, stock, {
        productId: product.id,
        place: 'floor',
        lotNumber,
        existingLotId: previous?.lotId ?? null,
        kg: line.kg,
        manufacturedAt: batch.batchDate,
        reason: `Pressed in ${batch.batchNo} on press ${batch.pressNumber}`,
        reasonCode: 'press_produce',
        performedAt,
        metadata,
        lotMetadata: { thicknessMm: line.thicknessMm, grade: line.grade, nos: line.count, madeKg: line.kg, pressNumber: batch.pressNumber, batchDate: batch.batchDate },
      })
      undo.push(async () => {
        await consumeLots(ctx, stock, product.id, [{ lotId, lotNumber, place: 'floor', kg: line.kg }], { reason: `Undo ${batch.batchNo}`, reasonCode: 'press_undo', performedAt, metadata })
      })
      outputs.push({ grade: line.grade, thicknessMm: line.thicknessMm, productId: product.id, productTitle: product.title, lotId, lotNumber, kg: line.kg, nos: line.count })
    }
  } catch (error) {
    for (const step of undo.reverse()) await step()
    throw error
  }
  batch.picks = picks
  batch.outputs = outputs
  batch.status = 'posted'
  batch.postedAt = new Date()
  batch.postedByName = byName
  batch.updatedByName = byName
  batch.history = [...(batch.history ?? []), entry('posted', byName, `${figures.totalSheets} sheets, ${figures.totalKg} kg`)]
  await ctx.em.flush()
  return batch
}

export async function reopenPressBatch(ctx: StoreContext, batch: PressBatch, byName: string | null) {
  if (batch.status !== 'posted') throw new PlantError('This batch is not posted', 409)
  for (const output of batch.outputs ?? []) {
    const stock = await plantStock(ctx, [output.productId])
    const left = await lotOnHand(ctx, stock, output.productId, output.lotId, 'floor')
    if (left + 0.0005 < output.kg) throw new PlantError(`${output.lotNumber} is already cut, inspected or moved. The batch cannot be reopened.`, 409)
  }
  const performedAt = movementTime(batch.batchDate)
  const metadata = { source: SOURCE, batchId: batch.id, batchNo: batch.batchNo }
  for (const output of batch.outputs ?? []) {
    const stock = await plantStock(ctx, [output.productId])
    await consumeLots(ctx, stock, output.productId, [{ lotId: output.lotId, lotNumber: output.lotNumber, place: 'floor', kg: output.kg }], { reason: `Reopened ${batch.batchNo}`, reasonCode: 'press_reopen', performedAt, metadata })
  }
  for (const pick of batch.picks ?? []) {
    const stock = await plantStock(ctx, [pick.productId])
    await returnLots(ctx, stock, pick.productId, [pick], { reason: `Reopened ${batch.batchNo}`, reasonCode: 'press_reopen', performedAt, metadata })
  }
  batch.picks = []
  batch.status = 'draft'
  batch.postedAt = null
  batch.postedByName = null
  batch.updatedByName = byName
  batch.history = [...(batch.history ?? []), entry('reopened', byName, 'Stock movements reversed')]
  await ctx.em.flush()
  return batch
}

export async function cancelPressBatch(ctx: StoreContext, batch: PressBatch, reason: string, byName: string | null) {
  if (batch.status !== 'draft') throw new PlantError('Only a batch that is not posted can be cancelled. Reopen it first.', 409)
  if (!reason.trim()) throw new PlantError('Write why the batch is cancelled; its number stays in the book as cancelled')
  batch.status = 'cancelled'
  batch.cancelReason = reason.trim()
  batch.updatedByName = byName
  batch.history = [...(batch.history ?? []), entry('cancelled', byName, reason.trim())]
  await ctx.em.flush()
  return batch
}

export async function reviewPressBatch(ctx: StoreContext, batch: PressBatch, byName: string | null) {
  batch.reviewedBy = byName ?? 'Reviewed'
  batch.reviewedAt = new Date()
  batch.history = [...(batch.history ?? []), entry('reviewed', byName)]
  await ctx.em.flush()
  return batch
}

export async function pressBatchView(ctx: StoreContext, batch: PressBatch) {
  const figures = pressFigures(batch.daylights)
  const outputs = []
  for (const output of batch.outputs ?? []) {
    let leftKg: number | null = null
    if (batch.status === 'posted') leftKg = await lotOnHand(ctx, await plantStock(ctx, [output.productId]), output.productId, output.lotId, 'floor')
    outputs.push({ ...output, leftKg })
  }
  return {
    id: batch.id,
    batchNo: batch.batchNo,
    batchDate: batch.batchDate,
    pressId: batch.pressId,
    pressNumber: batch.pressNumber,
    cycleNo: batch.cycleNo ?? null,
    daylights: batch.daylights,
    lotChoices: batch.lotChoices ?? [],
    picks: batch.status === 'posted' ? batch.picks ?? [] : [],
    outputs: batch.status === 'posted' ? outputs : [],
    heating: batch.heating ?? null,
    warnings: batch.warnings ?? [],
    figures,
    checkedBy: batch.checkedBy ?? null,
    remark: batch.remark ?? null,
    reviewedBy: batch.reviewedBy ?? null,
    reviewedAt: batch.reviewedAt?.toISOString() ?? null,
    status: batch.status,
    cancelReason: batch.cancelReason ?? null,
    postedAt: batch.postedAt?.toISOString() ?? null,
    postedByName: batch.postedByName ?? null,
    history: batch.history ?? [],
    updatedAt: batch.updatedAt.toISOString(),
  }
}

export function pressBatchRow(batch: PressBatch) {
  const figures = pressFigures(batch.daylights)
  return {
    id: batch.id,
    batchNo: batch.batchNo,
    seq: batch.seq,
    batchDate: batch.batchDate,
    pressId: batch.pressId,
    pressNumber: batch.pressNumber,
    status: batch.status,
    grades: [...new Set(figures.sizeLines.map((line) => line.grade))],
    paperLines: figures.paperLines,
    sizeLines: figures.sizeLines,
    totalSheets: figures.totalSheets,
    totalKg: figures.totalKg,
    warnings: (batch.warnings ?? []).length,
    checkedBy: batch.checkedBy ?? null,
    remark: batch.remark ?? null,
    reviewedBy: batch.reviewedBy ?? null,
    updatedAt: batch.updatedAt.toISOString(),
  }
}

export async function listPressBatches(ctx: StoreContext, query: { date?: string; month?: string; pressId?: string; status: string }) {
  const where: Record<string, unknown> = { ...scope(ctx) }
  if (query.date) where.batchDate = query.date
  else if (query.month) where.batchMonth = query.month
  if (query.pressId) where.pressId = query.pressId
  if (query.status !== 'all') where.status = query.status
  const rows = await ctx.em.find(PressBatch, where, { orderBy: { batchMonth: 'desc', seq: 'desc' }, limit: 300 })
  return rows.map(pressBatchRow)
}
