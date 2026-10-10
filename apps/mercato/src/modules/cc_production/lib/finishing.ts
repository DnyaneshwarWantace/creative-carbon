import { randomUUID } from 'node:crypto'
import type { StoreContext } from '../../cc_store/lib/server'
import { performerId, runCommand } from '../../cc_store/lib/server'
import { linkReversals } from '../../cc_store/lib/counterEntries'
import { PLACE_LABEL, type StockPlace } from '../../cc_products/lib/stock'
import { activeOptions } from '../../cc_lists/lib/service'
import { CuttingEntry, DamageEntry, FgDirectIn, FgInspection, ThicknessInspection, type CutSheet, type FgRow, type PlantHistoryEntry } from '../data/entities'
import { PlantError } from './server'
import { lotCode } from '../../cc_accounts/lib/numberSeries'
import { consumeLots, kg3, lotOnHand, movementTime, plantStock, produceLot } from './plantStock'

const SOURCE = 'cc_production.finishing'
export const TRIM_BAND = { laminate: { min: 6, max: 10 }, moulded: { min: 3, max: 7 } }
const FINISHED_KINDS = ['laminate', 'moulded', 'bought_in']

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function entry(action: string, by: string | null, note: string | null = null): PlantHistoryEntry {
  return { action, by, at: new Date().toISOString(), note }
}

const numberFrom = (value: unknown): number | null => {
  const parsed = Number(value)
  return value !== null && value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : null
}

export type LotInfo = {
  lotId: string
  lotNumber: string
  productId: string
  title: string
  kind: string
  unit: string
  place: StockPlace
  placeLabel: string
  locationId: string
  status: string
  onHand: number
  free: number
  nos: number | null
  nosLeft: number | null
  madeKg: number | null
  thicknessMm: number | null
  grade: string | null
  batchNo: string | null
  cutSize: string | null
  articleWeightKg: number | null
  madeOn: string | null
  metadata: Record<string, unknown>
}

type LotRow = { lot_id: string; lot_number: string; product_id: string; title: string; kind: string; unit: string | null; location_id: string; status: string | null; on_hand: string; free: string; metadata: Record<string, unknown> | null; manufactured_at: Date | null; created_at: Date }

async function lotRows(ctx: StoreContext, filter: { lotId?: string; kinds?: string[]; places?: StockPlace[] }): Promise<LotInfo[]> {
  const stock = await plantStock(ctx, [])
  const places = filter.places ?? (['wh_a', 'wh_b', 'floor', 'fg', 'tank'] as StockPlace[])
  const rows = await ctx.em.getConnection().execute<LotRow[]>(
    `select lot.id as lot_id, lot.lot_number, p.id as product_id, p.title, p.custom_fieldset_code as kind, p.default_unit as unit, b.location_id,
            coalesce(lot.status, 'available') as status, b.quantity_on_hand as on_hand, (b.quantity_on_hand - b.quantity_reserved - b.quantity_allocated) as free, lot.metadata, lot.manufactured_at, lot.created_at
       from wms_inventory_lots lot
       join catalog_product_variants v on v.id = lot.catalog_variant_id
       join catalog_products p on p.id = v.product_id
       join wms_inventory_balances b on b.lot_id = lot.id and b.deleted_at is null and b.quantity_on_hand > 0
      where lot.tenant_id = ? and lot.organization_id = ? and lot.deleted_at is null and b.location_id = any(?::uuid[])
        ${filter.lotId ? 'and lot.id = ?' : ''} ${filter.kinds ? 'and p.custom_fieldset_code = any(?::text[])' : ''}
      order by lot.manufactured_at asc nulls last, lot.lot_number asc`,
    [ctx.tenantId, ctx.organizationId, `{${places.map((place) => stock.locationOf(place)).join(',')}}`, ...(filter.lotId ? [filter.lotId] : []), ...(filter.kinds ? [`{${filter.kinds.join(',')}}`] : [])],
  )
  return rows.map((row) => {
    const meta = row.metadata ?? {}
    const place = stock.placeOf(row.location_id) ?? 'floor'
    const onHand = kg3(Number(row.on_hand))
    const nos = numberFrom(meta.nos)
    const madeKg = numberFrom(meta.madeKg)
    const unitIsNos = row.unit === 'nos'
    return {
      lotId: row.lot_id,
      lotNumber: row.lot_number,
      productId: row.product_id,
      title: row.title,
      kind: row.kind,
      unit: row.unit ?? 'kg',
      place,
      placeLabel: PLACE_LABEL[place],
      locationId: row.location_id,
      status: row.status ?? 'available',
      onHand,
      free: kg3(Number(row.free)),
      nos,
      nosLeft: unitIsNos ? Math.round(onHand) : nos !== null && madeKg ? Math.round((nos * onHand) / madeKg) : nos,
      madeKg,
      thicknessMm: numberFrom(meta.thicknessMm),
      grade: typeof meta.grade === 'string' ? meta.grade : null,
      batchNo: typeof meta.batchNo === 'string' ? meta.batchNo : null,
      cutSize: typeof meta.cutSize === 'string' ? meta.cutSize : null,
      articleWeightKg: numberFrom(meta.articleWeightKg),
      madeOn: new Date(row.manufactured_at ?? row.created_at).toISOString().slice(0, 10),
      metadata: meta,
    }
  })
}

export async function findLot(ctx: StoreContext, lotId: string): Promise<LotInfo> {
  const [lot] = await lotRows(ctx, { lotId })
  if (!lot) throw new PlantError('That lot has no stock left', 404)
  return lot
}

export async function finishingSetup(ctx: StoreContext) {
  const [lots, cutSizes, rejectionReasons, testTypes, standards, damageReasons] = await Promise.all([
    lotRows(ctx, { kinds: FINISHED_KINDS, places: ['floor'] }),
    activeOptions(ctx, 'cut_sizes'),
    activeOptions(ctx, 'fg_rejection_reasons'),
    activeOptions(ctx, 'lab_test_types'),
    activeOptions(ctx, 'lab_standards'),
    activeOptions(ctx, 'damage_reasons'),
  ])
  return {
    floorLots: lots.map(({ metadata, locationId, ...rest }) => {
      void metadata
      void locationId
      return rest
    }),
    cutSizes,
    rejectionReasons,
    testTypes,
    standards,
    damageReasons,
    trimBand: TRIM_BAND,
  }
}

function perPieceKg(lot: LotInfo): number {
  if (lot.unit === 'nos') return 1
  if (lot.nosLeft && lot.nosLeft > 0) return lot.onHand / lot.nosLeft
  throw new PlantError(`${lot.lotNumber} has no sheet count; cut it first so the sheets are counted`, 409)
}

export async function createCutting(ctx: StoreContext, input: { entryDate: string; lotId: string; cutSize: string; sheets: CutSheet[]; sourceKgUsed: number | null; notes: string | null }, byName: string | null) {
  const lot = await findLot(ctx, input.lotId)
  if (lot.place !== 'floor') throw new PlantError('Only lots on the shop floor can be cut')
  if (lot.kind !== 'laminate') throw new PlantError('Cutting is for pressed sheets. Moulded pieces go straight to FG inspection.')
  if (lot.status !== 'available') throw new PlantError(`${lot.lotNumber} is on hold`, 409)
  if (!input.sheets.length) throw new PlantError('Enter the weight of each sheet after trimming')
  const sheetsIn = input.sheets.length
  if (lot.nosLeft !== null && sheetsIn > lot.nosLeft) throw new PlantError(`Only ${lot.nosLeft} sheets are left in ${lot.lotNumber}`, 409)
  const used = kg3(input.sourceKgUsed ?? (lot.nosLeft && sheetsIn === lot.nosLeft ? lot.free : (lot.free * sheetsIn) / (lot.nosLeft || sheetsIn)))
  if (used > lot.free + 0.0005) throw new PlantError(`Only ${lot.free} kg is free in ${lot.lotNumber}`, 409)
  const trimmed = kg3(input.sheets.reduce((sum, sheet) => sum + sheet.weightKg, 0))
  if (trimmed > used + 0.0005) throw new PlantError(`The sheets weigh ${trimmed} kg after trimming, more than the ${used} kg taken from the lot`)
  const trimKg = kg3(used - trimmed)
  const trimPct = used ? Math.round((trimKg / used) * 1000) / 10 : 0
  const warnings = trimPct < TRIM_BAND.laminate.min || trimPct > TRIM_BAND.laminate.max ? [`Trim loss ${trimPct}% is outside ${TRIM_BAND.laminate.min}–${TRIM_BAND.laminate.max}%`] : []
  const cut = ctx.em.create(CuttingEntry, {
    ...scope(ctx),
    entryDate: input.entryDate,
    sourceProductId: lot.productId,
    sourceLotId: lot.lotId,
    sourceLotNumber: lot.lotNumber,
    sheetsIn,
    sourceKgUsed: String(used),
    cutSize: input.cutSize,
    sheets: input.sheets.map((sheet, index) => ({ no: sheet.no || index + 1, weightKg: kg3(sheet.weightKg) })),
    trimmedKg: String(trimmed),
    trimKg: String(trimKg),
    trimPct: String(trimPct),
    warnings,
    notes: input.notes,
    byName,
    history: [entry('cut', byName, `${sheetsIn} sheets, trim ${trimKg} kg (${trimPct}%)`)],
  })
  ctx.em.persist(cut)
  await ctx.em.flush()
  const stock = await plantStock(ctx, [lot.productId])
  const performedAt = movementTime(input.entryDate)
  const metadata = { source: SOURCE, cuttingId: cut.id }
  const count = await ctx.em.count(CuttingEntry, { ...scope(ctx), sourceLotId: lot.lotId })
  const lotNumber = await lotCode(ctx, 'LOT_CUT', input.entryDate, { PARENT: lot.lotNumber, N: String(count) })
  try {
    await consumeLots(ctx, stock, lot.productId, [{ lotId: lot.lotId, lotNumber: lot.lotNumber, place: 'floor', kg: used }], { reason: `Cut to ${input.cutSize}: ${sheetsIn} sheets, trim loss ${trimKg} kg`, reasonCode: 'cut_consume', performedAt, metadata })
    cut.outputLotId = await produceLot(ctx, stock, {
      productId: lot.productId,
      place: 'floor',
      lotNumber,
      existingLotId: null,
      kg: trimmed,
      manufacturedAt: lot.madeOn ?? input.entryDate,
      reason: `Trimmed and cut to ${input.cutSize}`,
      reasonCode: 'cut_produce',
      performedAt,
      metadata,
      lotMetadata: { ...lot.metadata, source: SOURCE, nos: sheetsIn, madeKg: trimmed, cutSize: input.cutSize, sheetWeights: cut.sheets, parentLot: lot.lotNumber },
    })
    cut.outputLotNumber = lotNumber
    await ctx.em.flush()
  } catch (error) {
    ctx.em.remove(cut)
    await ctx.em.flush()
    throw error
  }
  return cut
}

export async function reverseCutting(ctx: StoreContext, cut: CuttingEntry, byName: string | null) {
  if (cut.status !== 'posted' || !cut.outputLotId) throw new PlantError('This cutting entry is already reversed', 409)
  const stock = await plantStock(ctx, [cut.sourceProductId])
  const left = await lotOnHand(ctx, stock, cut.sourceProductId, cut.outputLotId, 'floor')
  if (left + 0.0005 < Number(cut.trimmedKg)) throw new PlantError(`${cut.outputLotNumber} is already inspected or moved`, 409)
  const performedAt = movementTime(cut.entryDate)
  const metadata = { source: SOURCE, cuttingId: cut.id }
  await consumeLots(ctx, stock, cut.sourceProductId, [{ lotId: cut.outputLotId, lotNumber: cut.outputLotNumber ?? null, place: 'floor', kg: Number(cut.trimmedKg) }], { reason: 'Cutting reversed', reasonCode: 'cut_reverse', performedAt, metadata })
  await runCommand(ctx, 'wms.inventory.adjust', {
    warehouseId: stock.warehouseId,
    locationId: stock.locationOf('floor'),
    catalogVariantId: stock.variants.get(cut.sourceProductId),
    lotId: cut.sourceLotId,
    delta: Number(cut.sourceKgUsed),
    reason: 'Cutting reversed',
    reasonCode: 'cut_reverse',
    referenceType: 'manual',
    referenceId: randomUUID(),
    performedBy: performerId(ctx),
    performedAt,
    metadata,
  })
  cut.status = 'reversed'
  cut.history = [...(cut.history ?? []), entry('reversed', byName)]
  await ctx.em.flush()
}

export function cuttingView(cut: CuttingEntry) {
  return {
    id: cut.id,
    entryDate: cut.entryDate,
    sourceLotId: cut.sourceLotId,
    sourceLotNumber: cut.sourceLotNumber ?? null,
    sheetsIn: cut.sheetsIn,
    sourceKgUsed: Number(cut.sourceKgUsed),
    cutSize: cut.cutSize,
    sheets: cut.sheets,
    trimmedKg: Number(cut.trimmedKg),
    trimKg: Number(cut.trimKg),
    trimPct: Number(cut.trimPct),
    outputLotId: cut.outputLotId ?? null,
    outputLotNumber: cut.outputLotNumber ?? null,
    status: cut.status,
    warnings: cut.warnings ?? [],
    notes: cut.notes ?? null,
    byName: cut.byName ?? null,
    updatedAt: cut.updatedAt.toISOString(),
  }
}

export async function listCuttings(ctx: StoreContext, month: string | null) {
  const rows = await ctx.em.find(CuttingEntry, { ...scope(ctx), deletedAt: null, ...(month ? { entryDate: { $like: `${month}-%` } } : {}) }, { orderBy: { entryDate: 'desc', createdAt: 'desc' }, limit: 300 })
  return rows.map(cuttingView)
}

async function setLotStatus(ctx: StoreContext, lotId: string, status: 'available' | 'hold', note: string) {
  await runCommand(ctx, 'wms.lots.update', { id: lotId, status, notes: note })
}

export async function createThickness(
  ctx: StoreContext,
  input: { inspectDate: string; lotId: string | null; lotRef: string | null; grade: string | null; daylight: string | null; targetMm: number | null; minusMm: number | null; plusMm: number | null; readings: number[]; result: 'pass' | 'hold' | null; inspector: string | null; notes: string | null },
  byName: string | null,
) {
  const lot = input.lotId ? await findLot(ctx, input.lotId) : null
  const target = input.targetMm ?? lot?.thicknessMm ?? null
  if (!target) throw new PlantError('Enter the target thickness')
  if (input.readings.length !== 12) throw new PlantError('Enter all 12 readings')
  let minus = input.minusMm
  let plus = input.plusMm
  if (minus === null && plus === null) {
    const last = await ctx.em.findOne(ThicknessInspection, { ...scope(ctx), targetMm: String(target), deletedAt: null, plusMm: { $ne: null } }, { orderBy: { createdAt: 'desc' } })
    minus = last?.minusMm ? Number(last.minusMm) : null
    plus = last?.plusMm ? Number(last.plusMm) : null
  }
  const outOfTolerance = minus === null && plus === null ? 0 : input.readings.filter((reading) => reading < target - (minus ?? 0) - 0.0001 || reading > target + (plus ?? 0) + 0.0001).length
  const result = input.result ?? (outOfTolerance ? 'hold' : 'pass')
  const inspection = ctx.em.create(ThicknessInspection, {
    ...scope(ctx),
    inspectDate: input.inspectDate,
    lotId: lot?.lotId ?? null,
    productId: lot?.productId ?? null,
    lotRef: input.lotRef?.trim() || lot?.batchNo || lot?.lotNumber || '—',
    grade: input.grade ?? lot?.grade ?? null,
    daylight: input.daylight,
    targetMm: String(target),
    minusMm: minus === null ? null : String(minus),
    plusMm: plus === null ? null : String(plus),
    readings: input.readings,
    outOfTolerance,
    result,
    inspector: input.inspector ?? byName,
    notes: input.notes,
    byName,
    history: [entry(result === 'pass' ? 'passed' : 'held', byName)],
  })
  ctx.em.persist(inspection)
  await ctx.em.flush()
  if (lot) await setLotStatus(ctx, lot.lotId, result === 'pass' ? 'available' : 'hold', `Thickness ${result === 'pass' ? 'passed' : 'on hold'} (${outOfTolerance} of 12 out)`)
  return inspection
}

export function thicknessView(row: ThicknessInspection) {
  return {
    id: row.id,
    inspectDate: row.inspectDate,
    lotId: row.lotId ?? null,
    lotRef: row.lotRef,
    grade: row.grade ?? null,
    daylight: row.daylight ?? null,
    targetMm: Number(row.targetMm),
    minusMm: row.minusMm === null || row.minusMm === undefined ? null : Number(row.minusMm),
    plusMm: row.plusMm === null || row.plusMm === undefined ? null : Number(row.plusMm),
    readings: row.readings,
    outOfTolerance: row.outOfTolerance,
    result: row.result,
    inspector: row.inspector ?? null,
    notes: row.notes ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listThickness(ctx: StoreContext, month: string | null) {
  const rows = await ctx.em.find(ThicknessInspection, { ...scope(ctx), deletedAt: null, ...(month ? { inspectDate: { $like: `${month}-%` } } : {}) }, { orderBy: { inspectDate: 'desc', createdAt: 'desc' }, limit: 300 })
  return rows.map(thicknessView)
}

export type FgRowInput = { sourceLotId: string; sheetSize: string | null; qtyNos: number; rejectNos: number; rejectReason: string | null; disposition: 'stock' | 'export' | 'allocation'; customerId: string | null; customerName: string | null }

async function rowsFromInput(ctx: StoreContext, rows: FgRowInput[], keep: FgRow[] = []): Promise<FgRow[]> {
  const result: FgRow[] = []
  for (const [index, row] of rows.entries()) {
    const previous = keep.find((candidate) => candidate.sourceLotId === row.sourceLotId && candidate.outputLotId)
    const lot = await findLot(ctx, row.sourceLotId).catch(() => null)
    if (!lot && !previous) throw new PlantError(`Row ${index + 1}: that lot has no stock left`)
    if (lot && !['laminate', 'moulded'].includes(lot.kind)) throw new PlantError(`Row ${index + 1}: ${lot.title} is not a pressed or moulded item`)
    if (row.disposition === 'allocation' && !row.customerName?.trim() && !row.customerId) throw new PlantError(`Row ${index + 1}: pick the customer the pieces are allocated to`)
    if (row.rejectNos > 0 && !row.rejectReason) throw new PlantError(`Row ${index + 1}: pick why ${row.rejectNos} pieces are rejected`)
    result.push({
      sr: index + 1,
      sourceLotId: row.sourceLotId,
      sourceProductId: lot?.productId ?? previous!.sourceProductId,
      sourceLotNumber: lot?.lotNumber ?? previous!.sourceLotNumber,
      batchNo: lot?.batchNo ?? previous?.batchNo ?? null,
      itemTitle: lot?.title ?? previous!.itemTitle,
      sheetSize: row.sheetSize ?? lot?.cutSize ?? null,
      thicknessMm: lot?.thicknessMm ?? previous?.thicknessMm ?? null,
      qtyNos: row.qtyNos,
      rejectNos: row.rejectNos,
      rejectReason: row.rejectReason,
      disposition: row.disposition,
      customerId: row.customerId,
      customerName: row.customerName?.trim() || null,
      passKg: null,
      rejectKg: null,
      outputLotId: null,
      outputLotNumber: null,
    })
  }
  return result
}

export async function saveFgReport(ctx: StoreContext, report: FgInspection | null, input: { reportDate: string; rows: FgRowInput[]; inspector: string | null; approvedBy: string | null }, byName: string | null) {
  if (report && report.status !== 'draft') throw new PlantError('This report is posted. Reopen it first.', 409)
  const rows = await rowsFromInput(ctx, input.rows)
  if (!report) {
    report = ctx.em.create(FgInspection, { ...scope(ctx), reportDate: input.reportDate, rows, inspector: input.inspector, approvedBy: input.approvedBy, byName, history: [entry('created', byName)] })
    ctx.em.persist(report)
  } else {
    Object.assign(report, { reportDate: input.reportDate, rows, inspector: input.inspector, approvedBy: input.approvedBy, byName })
    report.history = [...(report.history ?? []), entry('edited', byName)]
  }
  await ctx.em.flush()
  return report
}

export async function postFgReport(ctx: StoreContext, report: FgInspection, byName: string | null) {
  if (report.status !== 'draft') throw new PlantError('This report is already posted', 409)
  if (!report.rows.length) throw new PlantError('Add at least one row')
  const performedAt = movementTime(report.reportDate)
  const metadata = { source: SOURCE, fgReportId: report.id }
  const undo: Array<() => Promise<void>> = []
  const rows: FgRow[] = []
  try {
    for (const row of report.rows) {
      const lot = await findLot(ctx, row.sourceLotId)
      if (lot.place !== 'floor') throw new PlantError(`Row ${row.sr}: ${lot.lotNumber} is not on the shop floor`, 409)
      if (lot.status !== 'available') throw new PlantError(`Row ${row.sr}: ${lot.lotNumber} is on hold (thickness)`, 409)
      const pieces = row.qtyNos + row.rejectNos
      if (lot.nosLeft !== null && pieces > lot.nosLeft) throw new PlantError(`Row ${row.sr}: only ${lot.nosLeft} pieces are left in ${lot.lotNumber}`, 409)
      const perPiece = perPieceKg(lot)
      const all = lot.nosLeft !== null && pieces === lot.nosLeft
      const passQty = lot.unit === 'nos' ? row.qtyNos : all ? kg3(lot.free - perPiece * row.rejectNos) : kg3(perPiece * row.qtyNos)
      const rejectQty = lot.unit === 'nos' ? row.rejectNos : kg3(perPiece * row.rejectNos)
      const stock = await plantStock(ctx, [lot.productId])
      const out = [{ lotId: lot.lotId, lotNumber: lot.lotNumber, place: 'floor', kg: kg3(passQty + rejectQty) }]
      await consumeLots(ctx, stock, lot.productId, out, { reason: `FG inspection ${report.reportDate} row ${row.sr}${rejectQty ? `: ${row.rejectNos} rejected (${row.rejectReason})` : ''}`, reasonCode: 'fg_inspect', performedAt, metadata })
      undo.push(async () => {
        await runCommand(ctx, 'wms.inventory.adjust', { warehouseId: stock.warehouseId, locationId: lot.locationId, catalogVariantId: stock.variants.get(lot.productId), lotId: lot.lotId, delta: kg3(passQty + rejectQty), reason: 'Undo FG inspection', reasonCode: 'fg_undo', referenceType: 'manual', referenceId: randomUUID(), performedBy: performerId(ctx), performedAt, metadata })
      })
      let outputLotId: string | null = null
      let outputLotNumber: string | null = null
      if (row.qtyNos > 0) {
        outputLotNumber = await lotCode(ctx, 'LOT_FG', report.reportDate, { SR: String(row.sr).padStart(2, '0'), PARENT: lot.lotNumber })
        outputLotId = await produceLot(ctx, stock, {
          productId: lot.productId,
          place: 'fg',
          lotNumber: outputLotNumber,
          existingLotId: null,
          kg: passQty,
          manufacturedAt: lot.madeOn ?? report.reportDate,
          reason: `Passed FG inspection${row.disposition === 'allocation' ? ` · for ${row.customerName}` : row.disposition === 'export' ? ' · export' : ''}`,
          reasonCode: 'fg_in',
          performedAt,
          metadata,
          lotMetadata: { ...lot.metadata, source: SOURCE, nos: row.qtyNos, madeKg: lot.unit === 'nos' ? (lot.articleWeightKg ? kg3(lot.articleWeightKg * row.qtyNos) : null) : passQty, sheetSize: row.sheetSize, disposition: row.disposition, customerId: row.customerId, customerName: row.customerName, parentLot: lot.lotNumber, fgReportId: report.id },
        })
        const lotId = outputLotId
        const lotNo = outputLotNumber
        undo.push(async () => {
          await consumeLots(ctx, stock, lot.productId, [{ lotId, lotNumber: lotNo, place: 'fg', kg: passQty }], { reason: 'Undo FG inspection', reasonCode: 'fg_undo', performedAt, metadata })
        })
      }
      rows.push({ ...row, passKg: lot.unit === 'nos' ? null : passQty, rejectKg: lot.unit === 'nos' ? null : rejectQty, outputLotId, outputLotNumber })
    }
  } catch (error) {
    for (const step of undo.reverse()) await step()
    throw error
  }
  report.rows = rows
  report.status = 'posted'
  report.postedAt = new Date()
  report.history = [...(report.history ?? []), entry('posted', byName)]
  await ctx.em.flush()
  return report
}

export async function reopenFgReport(ctx: StoreContext, report: FgInspection, byName: string | null) {
  if (report.status !== 'posted') throw new PlantError('This report is not posted', 409)
  const performedAt = movementTime(report.reportDate)
  const metadata = { source: SOURCE, fgReportId: report.id }
  for (const row of report.rows) {
    if (!row.outputLotId) continue
    const stock = await plantStock(ctx, [row.sourceProductId])
    const left = await lotOnHand(ctx, stock, row.sourceProductId, row.outputLotId, 'fg')
    const expected = row.passKg ?? row.qtyNos
    if (left + 0.0005 < expected) throw new PlantError(`${row.outputLotNumber} is already allocated or despatched`, 409)
  }
  for (const row of report.rows) {
    const stock = await plantStock(ctx, [row.sourceProductId])
    const passQty = row.passKg ?? row.qtyNos
    const rejectQty = row.rejectKg ?? row.rejectNos
    if (row.outputLotId && passQty) await consumeLots(ctx, stock, row.sourceProductId, [{ lotId: row.outputLotId, lotNumber: row.outputLotNumber, place: 'fg', kg: passQty }], { reason: 'FG inspection reopened', reasonCode: 'fg_reopen', performedAt, metadata })
    await runCommand(ctx, 'wms.inventory.adjust', { warehouseId: stock.warehouseId, locationId: stock.locationOf('floor'), catalogVariantId: stock.variants.get(row.sourceProductId), lotId: row.sourceLotId, delta: kg3(passQty + rejectQty), reason: 'FG inspection reopened', reasonCode: 'fg_reopen', referenceType: 'manual', referenceId: randomUUID(), performedBy: performerId(ctx), performedAt, metadata })
  }
  await linkReversals(ctx, metadata)
  report.rows = report.rows.map((row) => ({ ...row, passKg: null, rejectKg: null, outputLotId: null, outputLotNumber: null }))
  report.status = 'draft'
  report.postedAt = null
  report.history = [...(report.history ?? []), entry('reopened', byName)]
  await ctx.em.flush()
  return report
}

export function fgReportView(report: FgInspection) {
  return {
    id: report.id,
    reportDate: report.reportDate,
    rows: report.rows,
    inspector: report.inspector ?? null,
    approvedBy: report.approvedBy ?? null,
    status: report.status,
    totals: {
      pieces: report.rows.reduce((sum, row) => sum + row.qtyNos, 0),
      rejected: report.rows.reduce((sum, row) => sum + row.rejectNos, 0),
      kg: kg3(report.rows.reduce((sum, row) => sum + (row.passKg ?? 0), 0)),
    },
    history: report.history ?? [],
    updatedAt: report.updatedAt.toISOString(),
  }
}

export async function findFgReport(ctx: StoreContext, id: string) {
  const report = await ctx.em.findOne(FgInspection, { id, ...scope(ctx), deletedAt: null })
  if (!report) throw new PlantError('FG inspection report not found', 404)
  return report
}

export async function listFgReports(ctx: StoreContext, month: string | null) {
  const rows = await ctx.em.find(FgInspection, { ...scope(ctx), deletedAt: null, ...(month ? { reportDate: { $like: `${month}-%` } } : {}) }, { orderBy: { reportDate: 'desc', createdAt: 'desc' }, limit: 200 })
  return rows.map(fgReportView)
}

export async function createDirectIn(ctx: StoreContext, input: { inDate: string; supplier: string; invoiceNo: string | null; productId: string; sheetSize: string | null; thicknessMm: number | null; nos: number | null; kg: number }, byName: string | null) {
  const [product] = await ctx.em.getConnection().execute<Array<{ id: string; title: string; kind: string; unit: string | null }>>(
    'select id, title, custom_fieldset_code as kind, default_unit as unit from catalog_products where id = ? and tenant_id = ? and organization_id = ? and deleted_at is null',
    [input.productId, ctx.tenantId, ctx.organizationId],
  )
  if (!product || !FINISHED_KINDS.includes(product.kind)) throw new PlantError('Pick a finished item (sheet, moulded or bought-in)')
  if (product.unit === 'nos' && !input.nos) throw new PlantError(`${product.title} is counted in pieces; enter the nos`)
  const record = ctx.em.create(FgDirectIn, { ...scope(ctx), inDate: input.inDate, supplier: input.supplier, invoiceNo: input.invoiceNo, productId: product.id, itemTitle: product.title, sheetSize: input.sheetSize, thicknessMm: input.thicknessMm === null ? null : String(input.thicknessMm), nos: input.nos, kg: String(kg3(input.kg)), byName, history: [entry('received', byName)] })
  ctx.em.persist(record)
  await ctx.em.flush()
  const stock = await plantStock(ctx, [product.id])
  const lotNumber = await lotCode(ctx, 'LOT_BI', input.inDate, { INVOICE: (input.invoiceNo ?? record.id.slice(0, 6)).replace(/\s+/g, ''), ID: record.id.slice(0, 4).toUpperCase() })
  try {
    record.lotId = await produceLot(ctx, stock, {
      productId: product.id,
      place: 'fg',
      lotNumber,
      existingLotId: null,
      kg: product.unit === 'nos' ? input.nos! : kg3(input.kg),
      manufacturedAt: input.inDate,
      reason: `Bought-in from ${input.supplier}${input.invoiceNo ? `, invoice ${input.invoiceNo}` : ''}`,
      reasonCode: 'fg_direct_in',
      performedAt: movementTime(input.inDate),
      metadata: { source: SOURCE, directInId: record.id },
      lotMetadata: { nos: input.nos, madeKg: kg3(input.kg), sheetSize: input.sheetSize, thicknessMm: input.thicknessMm, supplier: input.supplier, invoiceNo: input.invoiceNo, boughtIn: true },
    })
    record.lotNumber = lotNumber
    await ctx.em.flush()
  } catch (error) {
    ctx.em.remove(record)
    await ctx.em.flush()
    throw error
  }
  return record
}

export async function recordDamage(ctx: StoreContext, input: { entryDate: string; lotId: string; kg: number; reason: string }, byName: string | null) {
  const lot = await findLot(ctx, input.lotId)
  const qty = kg3(input.kg)
  if (qty > lot.free + 0.0005) throw new PlantError(`Only ${lot.free} ${lot.unit} is free in ${lot.lotNumber}`, 409)
  const record = ctx.em.create(DamageEntry, { ...scope(ctx), entryDate: input.entryDate, productId: lot.productId, itemTitle: lot.title, lotId: lot.lotId, lotNumber: lot.lotNumber, place: lot.place, kg: String(qty), reason: input.reason, byName, history: [entry('scrapped', byName, input.reason)] })
  ctx.em.persist(record)
  await ctx.em.flush()
  const stock = await plantStock(ctx, [lot.productId])
  await consumeLots(ctx, stock, lot.productId, [{ lotId: lot.lotId, lotNumber: lot.lotNumber, place: lot.place, kg: qty }], { reason: `Damaged · ${input.reason}`, reasonCode: 'damaged', performedAt: movementTime(input.entryDate), metadata: { source: SOURCE, damageId: record.id } })
  return record
}

export async function listDirectAndDamage(ctx: StoreContext, month: string | null) {
  const where = (field: string) => ({ ...scope(ctx), deletedAt: null, ...(month ? { [field]: { $like: `${month}-%` } } : {}) })
  const [directIns, damages] = await Promise.all([
    ctx.em.find(FgDirectIn, where('inDate'), { orderBy: { inDate: 'desc' }, limit: 200 }),
    ctx.em.find(DamageEntry, where('entryDate'), { orderBy: { entryDate: 'desc' }, limit: 200 }),
  ])
  return {
    directIns: directIns.map((row) => ({ id: row.id, inDate: row.inDate, supplier: row.supplier, invoiceNo: row.invoiceNo ?? null, itemTitle: row.itemTitle, sheetSize: row.sheetSize ?? null, thicknessMm: row.thicknessMm ? Number(row.thicknessMm) : null, nos: row.nos ?? null, kg: Number(row.kg), lotNumber: row.lotNumber ?? null })),
    damages: damages.map((row) => ({ id: row.id, entryDate: row.entryDate, itemTitle: row.itemTitle, lotNumber: row.lotNumber ?? null, place: row.place, kg: Number(row.kg), reason: row.reason, byName: row.byName ?? null })),
  }
}

export async function allLots(ctx: StoreContext, kinds: string[] | null) {
  return (await lotRows(ctx, { kinds: kinds ?? undefined })).map(({ metadata, locationId, ...rest }) => {
    void metadata
    void locationId
    return rest
  })
}

export async function lotsWithDetails(ctx: StoreContext, filter: { kinds?: string[]; places?: StockPlace[]; lotId?: string }) {
  return lotRows(ctx, filter)
}
