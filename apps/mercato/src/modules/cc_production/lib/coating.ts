import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { commandContext, type StoreContext } from '../../cc_store/lib/server'
import { createProductWithStockSetup } from '../../cc_products/lib/createProduct'
import { CoatingSheet, Dryer, ResinBatch, type CoatingRow, type CoatingSlot, type PlantHistoryEntry } from '../data/entities'
import { COATING_SLOTS, type CoatingSheetInput } from '../data/validators'
import { cancelIssue, createIssue, findIssue } from './chemicals'
import { PlantError } from './server'
import { lotCode } from '../../cc_accounts/lib/numberSeries'
import { activeOptions } from '../../cc_lists/lib/service'
import { consumeLots, freeLots, kg3, lotOnHand, movementTime, pickLots, plantStock, produceLot, returnLots, type FreeLot, type PickedLot } from './plantStock'
import { CHEMICAL_PLACES, chemicalProducts } from './resin'
import { sheetFigures } from './coatingFigures'

export { sheetFigures, type SheetFigures } from './coatingFigures'

const SOURCE = 'cc_production.coating'
export const RAW_PLACES = ['wh_a', 'wh_b', 'floor'] as const
export const DEFAULT_SHELF_LIFE = 7
export const DEFAULT_MAX_USE = 10
export const DEFAULT_RC = { min: 40, max: 48 }
export const DEFAULT_VC = { min: 2, max: 4 }

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function entry(action: string, by: string | null, note: string | null = null): PlantHistoryEntry {
  return { action, by, at: new Date().toISOString(), note }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function dryerTag(code: string): string {
  const digits = code.match(/\d+/)?.[0]
  return digits ? `D${digits}` : code.slice(0, 1).toUpperCase()
}

export async function bstageLotNumber(ctx: StoreContext, sheetDate: string, dryerCode: string, sn: number): Promise<string> {
  return lotCode(ctx, 'LOT_BS', sheetDate, { DRYER: dryerTag(dryerCode), SN: String(sn) })
}

export function defaultSlots(): CoatingSlot[] {
  return COATING_SLOTS.map((time) => ({ time, dbpKg: null, oleicKg: null, outputKg: null }))
}

type ClothRow = { id: string; title: string; gsm: number | null }

export async function clothProducts(ctx: StoreContext): Promise<ClothRow[]> {
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; title: string; gsm: string | null }>>(
    `select p.id, p.title, v.value_text as gsm from catalog_products p
       left join custom_field_values v on v.record_id = p.id::text and v.entity_id = 'catalog:catalog_product' and v.field_key = 'gsm' and v.deleted_at is null
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.custom_fieldset_code = 'reinforcement'
      order by p.title asc`,
    [ctx.tenantId, ctx.organizationId],
  )
  return rows.map((row) => ({ id: row.id, title: row.title, gsm: row.gsm && Number.isFinite(Number(row.gsm)) ? Number(row.gsm) : null }))
}

type ResinLotOption = FreeLot & { productId: string; title: string; grade: string | null; batchId: string | null }

export async function tankResinLots(ctx: StoreContext): Promise<ResinLotOption[]> {
  const products = await ctx.em.getConnection().execute<Array<{ id: string; title: string; grade: string | null }>>(
    `select p.id, p.title, v.value_text as grade from catalog_products p
       left join custom_field_values v on v.record_id = p.id::text and v.entity_id = 'catalog:catalog_product' and v.field_key = 'resin_grade' and v.deleted_at is null
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.custom_fieldset_code = 'resin'`,
    [ctx.tenantId, ctx.organizationId],
  )
  if (!products.length) return []
  const stock = await plantStock(ctx, products.map((product) => product.id))
  const lots = await freeLots(ctx, stock, products.map((product) => product.id), ['tank'])
  const batches = await ctx.em.find(ResinBatch, { ...scope(ctx), deletedAt: null, status: 'posted' }, { fields: ['id', 'batchNo', 'resinLotId'] })
  const batchByLot = new Map(batches.filter((batch) => batch.resinLotId).map((batch) => [batch.resinLotId as string, batch.id]))
  return products
    .flatMap((product) => (lots.get(product.id) ?? []).map((lot) => ({ ...lot, productId: product.id, title: product.title, grade: product.grade, batchId: batchByLot.get(lot.lotId) ?? null })))
    .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))
}

export async function coatingSetup(ctx: StoreContext) {
  const dryers = await ctx.em.find(Dryer, { ...scope(ctx), deletedAt: null, isActive: true }, { orderBy: { code: 'asc' } })
  const cloths = await clothProducts(ctx)
  const stock = await plantStock(ctx, cloths.map((cloth) => cloth.id))
  const lots = await freeLots(ctx, stock, cloths.map((cloth) => cloth.id), [...RAW_PLACES])
  return {
    dryers: dryers.map((dryer) => ({ id: dryer.id, code: dryer.code, kind: dryer.kind })),
    cloths: cloths.map((cloth) => ({ ...cloth, free: kg3((lots.get(cloth.id) ?? []).reduce((sum, lot) => sum + lot.free, 0)) })),
    resinLots: (await tankResinLots(ctx)).map((lot) => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, productId: lot.productId, title: lot.title, grade: lot.grade, free: lot.free, batchId: lot.batchId })),
    slots: [...COATING_SLOTS],
    scrapReasons: await activeOptions(ctx, 'bstage_scrap_reasons'),
    bands: { rc: DEFAULT_RC, vc: DEFAULT_VC },
  }
}

export async function findSheet(ctx: StoreContext, id: string): Promise<CoatingSheet> {
  const sheet = await ctx.em.findOne(CoatingSheet, { id, ...scope(ctx), deletedAt: null })
  if (!sheet) throw new PlantError('Dryer sheet not found', 404)
  return sheet
}

function rcWarnings(rows: CoatingRow[]): string[] {
  const warnings: string[] = []
  for (const row of rows) {
    if (row.rcPct !== null && (row.rcPct < DEFAULT_RC.min || row.rcPct > DEFAULT_RC.max)) warnings.push(`Row ${row.sn}: RC ${row.rcPct}% is outside ${DEFAULT_RC.min}–${DEFAULT_RC.max}%`)
    if (row.vcPct !== null && (row.vcPct < DEFAULT_VC.min || row.vcPct > DEFAULT_VC.max)) warnings.push(`Row ${row.sn}: VC ${row.vcPct}% is outside ${DEFAULT_VC.min}–${DEFAULT_VC.max}%`)
    if (row.balanceRawKg !== null && row.balanceRawKg > row.rawKg) warnings.push(`Row ${row.sn}: balance raw cloth is more than raw cloth`)
  }
  return warnings
}

async function applyInput(ctx: StoreContext, sheet: CoatingSheet, input: CoatingSheetInput) {
  const dryer = await ctx.em.findOne(Dryer, { id: input.dryerId, ...scope(ctx), deletedAt: null })
  if (!dryer) throw new PlantError('Pick the dryer')
  const cloths = new Map((await clothProducts(ctx)).map((cloth) => [cloth.id, cloth]))
  const sns = new Set<number>()
  sheet.rows = input.rows
    .filter((row) => row.rawKg > 0 || row.coatedNos > 0)
    .map((row) => {
      const cloth = cloths.get(row.clothProductId)
      if (!cloth) throw new PlantError(`Row ${row.sn}: pick a cloth or paper from the reinforcement list`)
      if (sns.has(row.sn)) throw new PlantError(`S.N. ${row.sn} is used twice`)
      sns.add(row.sn)
      return {
        sn: row.sn,
        clothProductId: cloth.id,
        clothTitle: cloth.title,
        gsm: row.gsm ?? cloth.gsm,
        kushan: row.kushan,
        treatedWeight: row.treatedWeight,
        rawKg: kg3(row.rawKg),
        balanceRawKg: row.balanceRawKg === null ? 0 : kg3(row.balanceRawKg),
        coatedNos: row.coatedNos,
        resinLotId: row.resinLotId,
        rcPct: row.rcPct,
        vcPct: row.vcPct,
        rawLots: [],
        resinLots: [],
        resinProductId: null,
        resinBatchNo: null,
        bstageProductId: null,
        bstageLotId: null,
        bstageLotNumber: null,
        bstageKg: null,
        resinKg: null,
      }
    })
    .sort((left, right) => left.sn - right.sn)
  sheet.slots = input.slots.length ? input.slots.map((slot) => ({ time: slot.time.replace('.', ':').padStart(5, '0'), dbpKg: slot.dbpKg, oleicKg: slot.oleicKg, outputKg: slot.outputKg })) : defaultSlots()
  sheet.dryerId = dryer.id
  sheet.dryerCode = dryer.code
  sheet.sheetDate = input.sheetDate
  sheet.notes = input.notes ?? null
  sheet.warnings = rcWarnings(sheet.rows)
}

export async function createSheet(ctx: StoreContext, input: CoatingSheetInput, byName: string | null) {
  const clash = await ctx.em.findOne(CoatingSheet, { ...scope(ctx), dryerId: input.dryerId, sheetDate: input.sheetDate, deletedAt: null })
  if (clash) throw new PlantError('There is already a sheet for this dryer on this day. Open it instead.', 409, { id: clash.id })
  const sheet = ctx.em.create(CoatingSheet, { ...scope(ctx), sheetDate: input.sheetDate, dryerId: input.dryerId, dryerCode: '', rows: [], slots: [], updatedByName: byName, history: [entry('created', byName)] })
  await applyInput(ctx, sheet, input)
  ctx.em.persist(sheet)
  await ctx.em.flush()
  return sheet
}

export async function updateSheet(ctx: StoreContext, sheet: CoatingSheet, input: CoatingSheetInput, byName: string | null) {
  if (sheet.status !== 'draft') throw new PlantError('This sheet is posted. Reopen it first to change it.', 409)
  if (input.dryerId !== sheet.dryerId || input.sheetDate !== sheet.sheetDate) {
    const clash = await ctx.em.findOne(CoatingSheet, { ...scope(ctx), dryerId: input.dryerId, sheetDate: input.sheetDate, deletedAt: null, id: { $ne: sheet.id } })
    if (clash) throw new PlantError('There is already a sheet for this dryer on this day', 409)
  }
  await applyInput(ctx, sheet, input)
  sheet.updatedByName = byName
  sheet.history = [...(sheet.history ?? []), entry('edited', byName)]
  await ctx.em.flush()
  return sheet
}

type BstageProduct = { id: string; shelfLife: number; maxUse: number }

async function bstageProductFor(ctx: StoreContext, clothTitle: string, grade: string): Promise<BstageProduct> {
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; field_key: string | null; value_text: string | null; value_num: string | null }>>(
    `select p.id, v.field_key, v.value_text, coalesce(v.value_float::numeric, v.value_int::numeric)::text as value_num
       from catalog_products p
       join custom_field_values base on base.record_id = p.id::text and base.entity_id = 'catalog:catalog_product' and base.field_key = 'base_material' and base.deleted_at is null and lower(base.value_text) = lower(?)
       join custom_field_values grade on grade.record_id = p.id::text and grade.entity_id = 'catalog:catalog_product' and grade.field_key = 'resin_grade' and grade.deleted_at is null and upper(grade.value_text) = upper(?)
       left join custom_field_values v on v.record_id = p.id::text and v.entity_id = 'catalog:catalog_product' and v.field_key in ('shelf_life_days', 'max_use_days') and v.deleted_at is null
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.custom_fieldset_code = 'bstage'
      order by p.created_at asc`,
    [clothTitle, grade, ctx.tenantId, ctx.organizationId],
  )
  if (rows.length) {
    const id = rows[0].id
    const value = (key: string, fallback: number) => {
      const row = rows.find((candidate) => candidate.id === id && candidate.field_key === key)
      const parsed = Number(row?.value_num ?? row?.value_text)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
    }
    return { id, shelfLife: value('shelf_life_days', DEFAULT_SHELF_LIFE), maxUse: value('max_use_days', DEFAULT_MAX_USE) }
  }
  const commandBus = ctx.container.resolve('commandBus') as CommandBus
  const created = await createProductWithStockSetup(commandBus, commandContext(ctx), (ctx.container.resolve('em') as EntityManager).getConnection(), {
    title: `B-stage ${clothTitle} ${grade}`,
    kind: 'bstage',
    unit: 'kg',
    categoryId: null,
    taxRateId: null,
    custom: { cf_base_material: clothTitle, cf_resin_grade: grade, cf_shelf_life_days: String(DEFAULT_SHELF_LIFE), cf_max_use_days: String(DEFAULT_MAX_USE) },
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
  })
  return { id: created.productId, shelfLife: DEFAULT_SHELF_LIFE, maxUse: DEFAULT_MAX_USE }
}

async function chemicalId(ctx: StoreContext, title: string): Promise<string | null> {
  return (await chemicalProducts(ctx)).find((chemical) => chemical.title.toLowerCase() === title.toLowerCase())?.id ?? null
}

export async function postSheet(ctx: StoreContext, sheet: CoatingSheet, byName: string | null) {
  if (sheet.status !== 'draft') throw new PlantError('This sheet is already posted', 409)
  if (!sheet.rows.length) throw new PlantError('Enter at least one cloth row')
  for (const row of sheet.rows) {
    if (!(row.rawKg > 0)) throw new PlantError(`Row ${row.sn}: enter the raw cloth weight`)
    if (!(row.coatedNos > 0)) throw new PlantError(`Row ${row.sn}: enter the coated cloth nos`)
  }
  const figures = sheetFigures(sheet.rows, sheet.slots)
  const clothIds = [...new Set(sheet.rows.map((row) => row.clothProductId))]
  const clothStock = await plantStock(ctx, clothIds)
  const clothLots = await freeLots(ctx, clothStock, clothIds, [...RAW_PLACES])
  const resinLots = await tankResinLots(ctx)
  if (!resinLots.length) throw new PlantError('There is no resin in the resin tank. Post a resin batch first.', 409)
  const resinStock = await plantStock(ctx, [...new Set(resinLots.map((lot) => lot.productId))])
  const batchNoByLot = new Map((await ctx.em.find(ResinBatch, { ...scope(ctx), deletedAt: null, resinLotId: { $in: resinLots.map((lot) => lot.lotId) } })).map((batch) => [batch.resinLotId as string, batch.batchNo]))

  const plan = sheet.rows.map((row) => {
    const figure = figures.rows.find((candidate) => candidate.sn === row.sn)!
    const lots = clothLots.get(row.clothProductId) ?? []
    const rawPicks = figure.consumedKg > 0 ? pickLots(lots, figure.consumedKg, row.clothTitle, null) : []
    for (const pick of rawPicks) {
      const lot = lots.find((candidate) => candidate.lotId === pick.lotId)
      if (lot) lot.free = kg3(lot.free - pick.kg)
    }
    const chosen = row.resinLotId ? resinLots.find((lot) => lot.lotId === row.resinLotId) : resinLots.find((lot) => lot.free > 0)
    if (row.resinLotId && !chosen) throw new PlantError(`Row ${row.sn}: the resin lot you picked has no resin left in the tank`, 409)
    if (!chosen) throw new PlantError('There is not enough resin in the resin tank', 409)
    const sameResin = resinLots.filter((lot) => lot.productId === chosen.productId)
    const resinPicks = figure.resinKg > 0 ? pickLots(sameResin, figure.resinKg, chosen.title, chosen.lotId) : []
    for (const pick of resinPicks) {
      const lot = resinLots.find((candidate) => candidate.lotId === pick.lotId)
      if (lot) lot.free = kg3(lot.free - pick.kg)
    }
    return { row, figure, rawPicks, resinPicks, resin: chosen }
  })

  const dbpId = figures.dbpTotal > 0 ? await chemicalId(ctx, 'DBP') : null
  const oleicId = figures.oleicTotal > 0 ? await chemicalId(ctx, 'Oleic Acid') : null
  if (figures.dbpTotal > 0 && !dbpId) throw new PlantError('DBP is not in the chemical list', 409)
  if (figures.oleicTotal > 0 && !oleicId) throw new PlantError('Oleic Acid is not in the chemical list', 409)
  if (dbpId || oleicId) {
    const chemStock = await plantStock(ctx, [dbpId, oleicId].filter((id): id is string => Boolean(id)))
    const chemLots = await freeLots(ctx, chemStock, [dbpId, oleicId].filter((id): id is string => Boolean(id)), [...CHEMICAL_PLACES])
    if (dbpId) pickLots(chemLots.get(dbpId) ?? [], figures.dbpTotal, 'DBP', null)
    if (oleicId) pickLots(chemLots.get(oleicId) ?? [], figures.oleicTotal, 'Oleic Acid', null)
  }

  const performedAt = movementTime(sheet.sheetDate)
  const metadata = { source: SOURCE, sheetId: sheet.id, dryerCode: sheet.dryerCode, sheetDate: sheet.sheetDate }
  const undo: Array<() => Promise<void>> = []
  const issueIds: string[] = []
  try {
    for (const step of plan) {
      const { row, figure, rawPicks, resinPicks, resin } = step
      if (rawPicks.length) {
        await consumeLots(ctx, clothStock, row.clothProductId, rawPicks, { reason: `Coated on ${sheet.dryerCode}, row ${row.sn}`, reasonCode: 'coat_consume', performedAt, metadata })
        undo.push(() => returnLots(ctx, clothStock, row.clothProductId, rawPicks, { reason: `Undo coating ${sheet.dryerCode}`, reasonCode: 'coat_undo', performedAt, metadata }))
      }
      if (resinPicks.length) {
        await consumeLots(ctx, resinStock, resin.productId, resinPicks, { reason: `Resin used on ${sheet.dryerCode}, row ${row.sn}`, reasonCode: 'coat_consume', performedAt, metadata })
        undo.push(() => returnLots(ctx, resinStock, resin.productId, resinPicks, { reason: `Undo coating ${sheet.dryerCode}`, reasonCode: 'coat_undo', performedAt, metadata }))
      }
      const product = await bstageProductFor(ctx, row.clothTitle, resin.grade ?? 'PF')
      const bstageStock = await plantStock(ctx, [product.id])
      const lotNumber = await bstageLotNumber(ctx, sheet.sheetDate, sheet.dryerCode, row.sn)
      const resinBatchNo = batchNoByLot.get(resin.lotId) ?? resin.lotNumber
      const lotId = await produceLot(ctx, bstageStock, {
        productId: product.id,
        place: 'floor',
        lotNumber,
        existingLotId: row.bstageProductId === product.id ? row.bstageLotId : null,
        kg: figure.bstageKg,
        manufacturedAt: sheet.sheetDate,
        expiresAt: addDays(sheet.sheetDate, product.shelfLife),
        reason: `B-stage from ${sheet.dryerCode}, row ${row.sn}`,
        reasonCode: 'coat_produce',
        performedAt,
        metadata,
        lotMetadata: { clothTitle: row.clothTitle, gsm: row.gsm, nos: row.coatedNos, madeKg: figure.bstageKg, resinBatchNo, resinLotId: resin.lotId, sn: row.sn, maxUseDays: product.maxUse, shelfLifeDays: product.shelfLife },
      })
      undo.push(async () => {
        await consumeLots(ctx, bstageStock, product.id, [{ lotId, lotNumber, place: 'floor', kg: figure.bstageKg }], { reason: `Undo coating ${sheet.dryerCode}`, reasonCode: 'coat_undo', performedAt, metadata })
      })
      row.rawLots = rawPicks
      row.resinLots = resinPicks
      row.resinProductId = resin.productId
      row.resinBatchNo = resinBatchNo
      row.bstageProductId = product.id
      row.bstageLotId = lotId
      row.bstageLotNumber = lotNumber
      row.bstageKg = figure.bstageKg
      row.resinKg = figure.resinKg
    }
    for (const [productId, kg] of [
      [dbpId, figures.dbpTotal],
      [oleicId, figures.oleicTotal],
    ] as Array<[string | null, number]>) {
      if (!productId || !(kg > 0)) continue
      const issue = await createIssue(ctx, { issueDate: sheet.sheetDate, productId, kg, usedFor: 'coating', dryerCode: sheet.dryerCode, note: `Dryer sheet ${sheet.sheetDate}` }, byName)
      issueIds.push(issue.id)
      undo.push(async () => {
        await cancelIssue(ctx, await findIssue(ctx, issue.id), 'Undo coating posting', byName)
      })
    }
  } catch (error) {
    for (const step of undo.reverse()) await step()
    throw error
  }
  sheet.rows = [...sheet.rows]
  sheet.issueIds = issueIds
  sheet.status = 'posted'
  sheet.postedAt = new Date()
  sheet.postedByName = byName
  sheet.updatedByName = byName
  sheet.history = [...(sheet.history ?? []), entry('posted', byName, `${figures.bstageTotal} kg B-stage in ${sheet.rows.length} lots`)]
  await ctx.em.flush()
  return sheet
}

export async function reopenSheet(ctx: StoreContext, sheet: CoatingSheet, byName: string | null) {
  if (sheet.status !== 'posted') throw new PlantError('This sheet is not posted', 409)
  const performedAt = movementTime(sheet.sheetDate)
  const metadata = { source: SOURCE, sheetId: sheet.id, dryerCode: sheet.dryerCode, sheetDate: sheet.sheetDate }
  for (const row of sheet.rows) {
    if (!row.bstageProductId || !row.bstageLotId) continue
    const stock = await plantStock(ctx, [row.bstageProductId])
    const left = await lotOnHand(ctx, stock, row.bstageProductId, row.bstageLotId, 'floor')
    if (left + 0.0005 < (row.bstageKg ?? 0)) throw new PlantError(`B-stage lot ${row.bstageLotNumber} is already partly used or scrapped. The sheet cannot be reopened.`, 409)
  }
  for (const row of sheet.rows) {
    if (row.bstageProductId && row.bstageLotId && row.bstageKg) {
      const stock = await plantStock(ctx, [row.bstageProductId])
      await consumeLots(ctx, stock, row.bstageProductId, [{ lotId: row.bstageLotId, lotNumber: row.bstageLotNumber, place: 'floor', kg: row.bstageKg }], { reason: `Reopened dryer sheet ${sheet.dryerCode}`, reasonCode: 'coat_reopen', performedAt, metadata })
    }
    if (row.rawLots.length) await returnLots(ctx, await plantStock(ctx, [row.clothProductId]), row.clothProductId, row.rawLots, { reason: `Reopened dryer sheet ${sheet.dryerCode}`, reasonCode: 'coat_reopen', performedAt, metadata })
    if (row.resinLots.length && row.resinProductId) await returnLots(ctx, await plantStock(ctx, [row.resinProductId]), row.resinProductId, row.resinLots, { reason: `Reopened dryer sheet ${sheet.dryerCode}`, reasonCode: 'coat_reopen', performedAt, metadata })
  }
  for (const id of sheet.issueIds ?? []) {
    const issue = await findIssue(ctx, id)
    if (issue.status === 'posted') await cancelIssue(ctx, issue, 'Dryer sheet reopened', byName)
  }
  sheet.rows = sheet.rows.map((row) => ({ ...row, rawLots: [], resinLots: [], bstageKg: null, resinKg: null }))
  sheet.issueIds = []
  sheet.status = 'draft'
  sheet.postedAt = null
  sheet.postedByName = null
  sheet.updatedByName = byName
  sheet.history = [...(sheet.history ?? []), entry('reopened', byName, 'Stock movements reversed')]
  await ctx.em.flush()
  return sheet
}

export async function deleteSheet(ctx: StoreContext, sheet: CoatingSheet, byName: string | null) {
  if (sheet.status !== 'draft') throw new PlantError('Only a sheet that is not posted can be deleted. Reopen it first.', 409)
  sheet.deletedAt = new Date()
  sheet.updatedByName = byName
  await ctx.em.flush()
}

export async function sheetView(ctx: StoreContext, sheet: CoatingSheet) {
  const figures = sheetFigures(sheet.rows, sheet.slots)
  const left = new Map<string, number>()
  if (sheet.status === 'posted') {
    for (const row of sheet.rows) {
      if (!row.bstageProductId || !row.bstageLotId) continue
      const stock = await plantStock(ctx, [row.bstageProductId])
      left.set(row.bstageLotId, await lotOnHand(ctx, stock, row.bstageProductId, row.bstageLotId, 'floor'))
    }
  }
  return {
    id: sheet.id,
    sheetDate: sheet.sheetDate,
    dryerId: sheet.dryerId,
    dryerCode: sheet.dryerCode,
    status: sheet.status,
    rows: sheet.rows.map((row) => {
      const figure = figures.rows.find((candidate) => candidate.sn === row.sn)
      return { ...row, plannedBstageKg: figure?.bstageKg ?? null, plannedResinKg: figure?.resinKg ?? null, consumedKg: figure?.consumedKg ?? null, bstageLeftKg: row.bstageLotId ? left.get(row.bstageLotId) ?? null : null }
    }),
    slots: sheet.slots,
    figures,
    warnings: sheet.warnings ?? [],
    notes: sheet.notes ?? null,
    issueIds: sheet.issueIds ?? [],
    postedAt: sheet.postedAt?.toISOString() ?? null,
    postedByName: sheet.postedByName ?? null,
    history: sheet.history ?? [],
    updatedAt: sheet.updatedAt.toISOString(),
  }
}

export async function listSheets(ctx: StoreContext, query: { date?: string; month?: string }) {
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.date) where.sheetDate = query.date
  else if (query.month) where.sheetDate = { $like: `${query.month}-%` }
  const sheets = await ctx.em.find(CoatingSheet, where, { orderBy: { sheetDate: 'desc', dryerCode: 'asc' }, limit: 200 })
  return sheets.map((sheet) => {
    const figures = sheetFigures(sheet.rows, sheet.slots)
    return { id: sheet.id, sheetDate: sheet.sheetDate, dryerId: sheet.dryerId, dryerCode: sheet.dryerCode, status: sheet.status, rows: sheet.rows.length, rawTotal: figures.rawTotal, nosTotal: figures.nosTotal, outputTotal: figures.outputTotal, warnings: (sheet.warnings ?? []).length, updatedAt: sheet.updatedAt.toISOString() }
  })
}

export type { PickedLot }
