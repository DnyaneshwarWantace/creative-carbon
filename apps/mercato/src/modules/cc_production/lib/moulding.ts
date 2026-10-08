import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { commandContext, type StoreContext } from '../../cc_store/lib/server'
import { createProductWithStockSetup } from '../../cc_products/lib/createProduct'
import type { StockPlace } from '../../cc_products/lib/stock'
import { activeOptions } from '../../cc_lists/lib/service'
import { loadCustomers } from '../../cc_orders/lib/server'
import { Mould, MouldingEntry, MouldingSignoff, Press, type PlantHistoryEntry, type PressPick } from '../data/entities'
import type { MouldingEntryInput } from '../data/validators'
import { bstageBoard } from './bstage'
import { clothProducts } from './coating'
import { gradeMatches } from './press'
import { PlantError } from './server'
import { lotCode } from '../../cc_accounts/lib/numberSeries'
import { consumeLots, freeLots, kg3, lotOnHand, movementTime, pickLots, plantStock, produceLot, returnLots } from './plantStock'

const SOURCE = 'cc_production.moulding'
const RAW_PLACES: StockPlace[] = ['wh_a', 'wh_b', 'floor']

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function entry(action: string, by: string | null, note: string | null = null): PlantHistoryEntry {
  return { action, by, at: new Date().toISOString(), note }
}

const num = (value: string | null | undefined) => (value === null || value === undefined || value === '' ? null : Number(value))

export async function mouldedLotNumber(ctx: StoreContext, date: string, shift: number, pressNumber: number, dieNo: string): Promise<string> {
  return lotCode(ctx, 'LOT_MO', date, { SHIFT: String(shift), MACHINE: String(pressNumber).padStart(2, '0'), DIE: dieNo })
}

async function chindiProducts(ctx: StoreContext) {
  return ctx.em.getConnection().execute<Array<{ id: string; title: string }>>(
    `select id, title from catalog_products where tenant_id = ? and organization_id = ? and deleted_at is null and custom_fieldset_code = 'chindi' order by created_at asc`,
    [ctx.tenantId, ctx.organizationId],
  )
}

async function mouldingPresses(ctx: StoreContext) {
  return ctx.em.find(Press, { ...scope(ctx), deletedAt: null, usage: { $in: ['moulding', 'both'] } }, { orderBy: { number: 'asc' } })
}

type MouldedProduct = { id: string; title: string; articleWeightKg: number | null }

export async function mouldedProductsByDie(ctx: StoreContext, dieNos: string[]): Promise<Map<string, MouldedProduct>> {
  const result = new Map<string, MouldedProduct>()
  if (!dieNos.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; title: string; die_no: string; weight: string | null }>>(
    `select p.id, p.title, die.value_text as die_no, coalesce(w.value_float::numeric, w.value_int::numeric, nullif(w.value_text, '')::numeric)::text as weight
       from catalog_products p
       join custom_field_values die on die.record_id = p.id::text and die.entity_id = 'catalog:catalog_product' and die.field_key = 'die_no' and die.deleted_at is null
       left join custom_field_values w on w.record_id = p.id::text and w.entity_id = 'catalog:catalog_product' and w.field_key = 'article_weight_kg' and w.deleted_at is null
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.custom_fieldset_code = 'moulded' and upper(die.value_text) = any(?::text[])
      order by p.created_at asc`,
    [ctx.tenantId, ctx.organizationId, `{${dieNos.map((die) => `"${die.toUpperCase().replace(/"/g, '')}"`).join(',')}}`],
  )
  for (const row of rows) if (!result.has(row.die_no.toUpperCase())) result.set(row.die_no.toUpperCase(), { id: row.id, title: row.title, articleWeightKg: row.weight ? Number(row.weight) : null })
  return result
}

async function mouldsByDie(ctx: StoreContext, dieNos: string[]): Promise<Map<string, Mould>> {
  const result = new Map<string, Mould>()
  if (!dieNos.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ id: string }>>(
    'select id from cc_moulds where organization_id = ? and tenant_id = ? and deleted_at is null and upper(die_no) = any(?::text[])',
    [ctx.organizationId, ctx.tenantId, `{${dieNos.map((die) => `"${die.toUpperCase().replace(/"/g, '')}"`).join(',')}}`],
  )
  const moulds = rows.length ? await ctx.em.find(Mould, { id: { $in: rows.map((row) => row.id) } }) : []
  for (const mould of moulds) result.set(mould.dieNo.toUpperCase(), mould)
  return result
}

export async function mouldingSetup(ctx: StoreContext) {
  const [presses, operators, chindi, cloths] = await Promise.all([mouldingPresses(ctx), activeOptions(ctx, 'operators'), chindiProducts(ctx), clothProducts(ctx)])
  return {
    presses: presses.map((press) => ({ id: press.id, number: press.number, isWorking: press.isWorking })),
    operators,
    chindi,
    cloths: cloths.map((cloth) => ({ id: cloth.id, title: cloth.title })),
  }
}

export async function dieLookup(ctx: StoreContext, dieNos: string[]) {
  const unique = [...new Set(dieNos.map((die) => die.trim()).filter(Boolean))]
  const [moulds, products] = await Promise.all([mouldsByDie(ctx, unique), mouldedProductsByDie(ctx, unique)])
  const customers = await loadCustomers(ctx, [...moulds.values()].map((mould) => mould.customerId).filter((id): id is string => Boolean(id)))
  const openLines = unique.length
    ? await ctx.em.getConnection().execute<Array<{ die_no: string; order_no: string; quantity: string; customer_id: string }>>(
        `select upper(l.specs->'material'->>'die_no') as die_no, o.order_no, l.quantity, o.customer_id
           from cc_order_lines l join cc_orders o on o.id = l.order_id
          where o.tenant_id = ? and o.organization_id = ? and o.deleted_at is null and o.status in ('booked', 'confirmed')
            and upper(l.specs->'material'->>'die_no') = any(?::text[])
          order by o.order_date asc`,
        [ctx.tenantId, ctx.organizationId, `{${unique.map((die) => `"${die.toUpperCase().replace(/"/g, '')}"`).join(',')}}`],
      )
    : []
  return unique.map((dieNo) => {
    const mould = moulds.get(dieNo.toUpperCase())
    const product = products.get(dieNo.toUpperCase())
    return {
      dieNo: mould?.dieNo ?? dieNo,
      found: Boolean(mould),
      mouldId: mould?.id ?? null,
      description: mould?.description ?? null,
      thicknessMm: mould?.thicknessMm ? Number(mould.thicknessMm) : null,
      heatUpMinutes: mould?.heatUpMinutes ?? null,
      customerName: mould?.customerId ? customers.get(mould.customerId)?.name ?? null : null,
      articleWeightKg: product?.articleWeightKg ?? null,
      productTitle: product?.title ?? null,
      openOrders: openLines.filter((line) => line.die_no === dieNo.toUpperCase()).map((line) => ({ orderNo: line.order_no, qty: Number(line.quantity) })),
    }
  })
}

async function shiftEntries(ctx: StoreContext, date: string, shift: number) {
  return ctx.em.find(MouldingEntry, { ...scope(ctx), entryDate: date, shift, deletedAt: null }, { orderBy: { pressNumber: 'asc' } })
}

export function shiftVersion(entries: MouldingEntry[]): Date {
  return entries.reduce((latest, item) => (item.updatedAt > latest ? item.updatedAt : latest), new Date(0))
}

export async function saveShift(ctx: StoreContext, date: string, shift: number, inputs: MouldingEntryInput[], byName: string | null) {
  const presses = new Map((await mouldingPresses(ctx)).map((press) => [press.id, press]))
  const existing = await shiftEntries(ctx, date, shift)
  const byPress = new Map(existing.map((item) => [item.pressId, item]))
  const seenPress = new Set<string>()
  const moulds = await mouldsByDie(ctx, inputs.map((input) => input.dieNo))
  const dieUse = new Map<string, number>()
  for (const item of existing.filter((candidate) => candidate.status === 'posted')) dieUse.set(item.mouldId, item.pressNumber)
  const chindi = (await chindiProducts(ctx))[0] ?? null
  for (const input of inputs) {
    const press = presses.get(input.pressId)
    if (!press) throw new PlantError('Pick a moulding machine (press 1–20)')
    if (seenPress.has(press.id)) throw new PlantError(`Machine ${press.number} is entered twice`)
    seenPress.add(press.id)
    const current = byPress.get(press.id)
    if (current?.status === 'posted') continue
    const mould = moulds.get(input.dieNo.trim().toUpperCase())
    if (!mould) throw new PlantError(`Machine ${press.number}: die ${input.dieNo} is not in the mould list`)
    const busy = dieUse.get(mould.id)
    if (busy !== undefined && busy !== press.number) throw new PlantError(`Die ${mould.dieNo} is already on machine ${busy} in shift ${shift}. One die cannot be on two machines in the same shift.`, 409, { dieNo: mould.dieNo, machine: busy })
    dieUse.set(mould.id, press.number)
    if (input.clothKg && !input.clothProductId) throw new PlantError(`Machine ${press.number}: say which cloth the ${input.clothKg} kg is`)
    const customers = mould.customerId ? await loadCustomers(ctx, [mould.customerId]) : new Map()
    const values = {
      pressNumber: press.number,
      mouldId: mould.id,
      dieNo: mould.dieNo,
      customerName: mould.customerId ? customers.get(mould.customerId)?.name ?? null : null,
      dieHeatTime: input.dieHeatTime,
      orderQty: input.orderQty,
      orderRef: input.orderRef,
      priorMade: input.priorMade,
      articleWeightKg: String(kg3(input.articleWeightKg)),
      chindiProductId: input.chindiKg ? chindi?.id ?? null : null,
      chindiKg: input.chindiKg === null ? null : String(kg3(input.chindiKg)),
      clothProductId: input.clothProductId,
      clothKg: input.clothKg === null ? null : String(kg3(input.clothKg)),
      clothNote: input.clothNote,
      bstageGrade: input.bstageGrade,
      bstageKg: input.bstageKg === null ? null : String(kg3(input.bstageKg)),
      productionNos: input.productionNos,
      startTime: input.startTime,
      operatorName: input.operatorName,
      topTemp: input.topTemp,
      bottomTemp: input.bottomTemp,
      curingTime: input.curingTime,
      updatedByName: byName,
    }
    if (current) {
      Object.assign(current, values)
      current.history = [...(current.history ?? []), entry('edited', byName)]
    } else {
      ctx.em.persist(ctx.em.create(MouldingEntry, { ...scope(ctx), entryDate: date, shift, pressId: press.id, ...values, history: [entry('created', byName)] }))
    }
  }
  for (const item of existing) if (item.status === 'draft' && !seenPress.has(item.pressId)) item.deletedAt = new Date()
  await ctx.em.flush()
}

async function ensureMouldedProduct(ctx: StoreContext, item: MouldingEntry): Promise<string> {
  const found = (await mouldedProductsByDie(ctx, [item.dieNo])).get(item.dieNo.toUpperCase())
  if (found) return found.id
  const mould = await ctx.em.findOne(Mould, { id: item.mouldId })
  const created = await createProductWithStockSetup(ctx.container.resolve('commandBus') as CommandBus, commandContext(ctx), (ctx.container.resolve('em') as EntityManager).getConnection(), {
    title: `Moulded ${item.dieNo}${mould?.description ? ` ${mould.description}` : ''}`,
    kind: 'moulded',
    unit: 'nos',
    categoryId: null,
    taxRateId: null,
    custom: { cf_die_no: item.dieNo, cf_article_weight_kg: String(num(item.articleWeightKg) ?? ''), ...(item.customerName ? { cf_customer_name: item.customerName } : {}) },
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
  })
  return created.productId
}

async function postEntry(ctx: StoreContext, item: MouldingEntry, byName: string | null) {
  const performedAt = movementTime(item.entryDate)
  const metadata = { source: SOURCE, entryId: item.id, entryDate: item.entryDate, shift: item.shift, machine: item.pressNumber, dieNo: item.dieNo }
  const undo: Array<() => Promise<void>> = []
  const picks: PressPick[] = []
  const reason = `Moulding ${item.entryDate} shift ${item.shift}, machine ${item.pressNumber}, die ${item.dieNo}`
  try {
    for (const [productId, kg, label] of [
      [item.chindiProductId, num(item.chindiKg), 'chindi'],
      [item.clothProductId, num(item.clothKg), 'cloth'],
    ] as Array<[string | null | undefined, number | null, string]>) {
      if (!kg || !productId) continue
      const stock = await plantStock(ctx, [productId])
      const lots = (await freeLots(ctx, stock, [productId], RAW_PLACES)).get(productId) ?? []
      const chosen = pickLots(lots, kg, `${label} for machine ${item.pressNumber}`, null)
      await consumeLots(ctx, stock, productId, chosen, { reason, reasonCode: 'mould_consume', performedAt, metadata })
      undo.push(() => returnLots(ctx, stock, productId, chosen, { reason: `Undo ${reason}`, reasonCode: 'mould_undo', performedAt, metadata }))
      for (const pick of chosen) picks.push({ grade: label, productId, lotId: pick.lotId, lotNumber: pick.lotNumber, place: pick.place, kg: pick.kg, ageDays: 0 })
    }
    const bstageKg = num(item.bstageKg)
    if (bstageKg && item.bstageGrade) {
      const board = await bstageBoard(ctx, {})
      const usable = board.columns.flatMap((column) => column.lots).filter((lot) => lot.freeKg > 0 && lot.band !== 'blocked' && lot.band !== 'expired' && gradeMatches(item.bstageGrade!, lot.clothTitle))
      const chosen = pickLots(usable.map((lot) => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, place: (lot.place ?? 'floor') as StockPlace, free: lot.freeKg, receivedAt: lot.madeOn })), bstageKg, `B-stage ${item.bstageGrade}`, null)
      for (const pick of chosen) {
        const lot = usable.find((candidate) => candidate.lotId === pick.lotId)!
        const stock = await plantStock(ctx, [lot.productId])
        await consumeLots(ctx, stock, lot.productId, [pick], { reason, reasonCode: 'mould_consume', performedAt, metadata })
        undo.push(() => returnLots(ctx, stock, lot.productId, [pick], { reason: `Undo ${reason}`, reasonCode: 'mould_undo', performedAt, metadata }))
        picks.push({ grade: item.bstageGrade, productId: lot.productId, lotId: pick.lotId, lotNumber: pick.lotNumber, place: pick.place, kg: pick.kg, ageDays: lot.ageDays })
      }
    }
    if (item.productionNos > 0) {
      const productId = await ensureMouldedProduct(ctx, item)
      const stock = await plantStock(ctx, [productId])
      const lotNumber = await mouldedLotNumber(ctx, item.entryDate, item.shift, item.pressNumber, item.dieNo)
      const kg = kg3(item.productionNos * (num(item.articleWeightKg) ?? 0))
      const lotId = await produceLot(ctx, stock, {
        productId,
        place: 'floor',
        lotNumber,
        existingLotId: item.outputProductId === productId ? item.outputLotId ?? null : null,
        kg: item.productionNos,
        manufacturedAt: item.entryDate,
        reason,
        reasonCode: 'mould_produce',
        performedAt,
        metadata,
        lotMetadata: { nos: item.productionNos, madeKg: kg, articleWeightKg: num(item.articleWeightKg), dieNo: item.dieNo, machine: item.pressNumber, shift: item.shift, operator: item.operatorName ?? null, customerName: item.customerName ?? null },
      })
      undo.push(async () => {
        await consumeLots(ctx, stock, productId, [{ lotId, lotNumber, place: 'floor', kg: item.productionNos }], { reason: `Undo ${reason}`, reasonCode: 'mould_undo', performedAt, metadata })
      })
      item.outputProductId = productId
      item.outputLotId = lotId
      item.outputLotNumber = lotNumber
    }
  } catch (error) {
    for (const step of undo.reverse()) await step()
    throw error
  }
  item.picks = picks
  item.status = 'posted'
  item.postedAt = new Date()
  item.postedByName = byName
  item.history = [...(item.history ?? []), entry('posted', byName, item.productionNos ? `${item.productionNos} nos into ${item.outputLotNumber}` : 'No production')]
}

export async function postShift(ctx: StoreContext, date: string, shift: number, pressId: string | null, byName: string | null) {
  const items = (await shiftEntries(ctx, date, shift)).filter((item) => item.status === 'draft' && (!pressId || item.pressId === pressId))
  if (!items.length) throw new PlantError('Nothing to post in this shift')
  const errors: string[] = []
  let posted = 0
  for (const item of items) {
    try {
      await postEntry(ctx, item, byName)
      await ctx.em.flush()
      posted += 1
    } catch (error) {
      if (!(error instanceof PlantError)) throw error
      errors.push(`Machine ${item.pressNumber}: ${error.message}`)
    }
  }
  if (!posted && errors.length) throw new PlantError(errors.join(' · '), 409)
  return { posted, errors }
}

export async function reopenEntry(ctx: StoreContext, date: string, shift: number, pressId: string, byName: string | null) {
  const item = (await shiftEntries(ctx, date, shift)).find((candidate) => candidate.pressId === pressId)
  if (!item || item.status !== 'posted') throw new PlantError('That machine has no posted entry in this shift', 404)
  const performedAt = movementTime(item.entryDate)
  const metadata = { source: SOURCE, entryId: item.id, entryDate: item.entryDate, shift: item.shift, machine: item.pressNumber, dieNo: item.dieNo }
  if (item.outputProductId && item.outputLotId) {
    const stock = await plantStock(ctx, [item.outputProductId])
    const left = await lotOnHand(ctx, stock, item.outputProductId, item.outputLotId, 'floor')
    if (left + 0.0005 < item.productionNos) throw new PlantError(`${item.outputLotNumber} is already trimmed, inspected or moved. It cannot be reopened.`, 409)
    await consumeLots(ctx, stock, item.outputProductId, [{ lotId: item.outputLotId, lotNumber: item.outputLotNumber ?? null, place: 'floor', kg: item.productionNos }], { reason: `Reopened moulding entry`, reasonCode: 'mould_reopen', performedAt, metadata })
  }
  for (const pick of item.picks ?? []) {
    const stock = await plantStock(ctx, [pick.productId])
    await returnLots(ctx, stock, pick.productId, [pick], { reason: 'Reopened moulding entry', reasonCode: 'mould_reopen', performedAt, metadata })
  }
  item.picks = []
  item.status = 'draft'
  item.postedAt = null
  item.postedByName = null
  item.updatedByName = byName
  item.history = [...(item.history ?? []), entry('reopened', byName, 'Stock movements reversed')]
  await ctx.em.flush()
}

export async function signShift(ctx: StoreContext, date: string, shift: number, role: 'sign_shift' | 'sign_store' | 'sign_authorised', byName: string | null) {
  let signoff = await ctx.em.findOne(MouldingSignoff, { ...scope(ctx), entryDate: date, shift })
  if (!signoff) {
    signoff = ctx.em.create(MouldingSignoff, { ...scope(ctx), entryDate: date, shift })
    ctx.em.persist(signoff)
  }
  const name = byName ?? 'Signed'
  if (role === 'sign_shift') Object.assign(signoff, { shiftIncharge: name, shiftInchargeAt: new Date() })
  if (role === 'sign_store') Object.assign(signoff, { storeIncharge: name, storeInchargeAt: new Date() })
  if (role === 'sign_authorised') Object.assign(signoff, { authorised: name, authorisedAt: new Date() })
  await ctx.em.flush()
}

export async function runningTotals(ctx: StoreContext, items: MouldingEntry[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const mouldIds = [...new Set(items.map((item) => item.mouldId))]
  if (!mouldIds.length) return result
  const all = await ctx.em.find(MouldingEntry, { ...scope(ctx), mouldId: { $in: mouldIds }, deletedAt: null }, { orderBy: { entryDate: 'asc', shift: 'asc', pressNumber: 'asc' } })
  const totals = new Map<string, number>()
  for (const item of all) {
    const runKey = `${item.mouldId}|${item.orderRef ?? `qty:${item.orderQty ?? ''}`}`
    const before = item.priorMade !== null && item.priorMade !== undefined ? item.priorMade : totals.get(runKey) ?? 0
    const after = before + item.productionNos
    totals.set(runKey, after)
    result.set(item.id, after)
  }
  return result
}

function entryView(item: MouldingEntry, total: number | undefined) {
  return {
    id: item.id,
    pressId: item.pressId,
    pressNumber: item.pressNumber,
    mouldId: item.mouldId,
    dieNo: item.dieNo,
    customerName: item.customerName ?? null,
    dieHeatTime: item.dieHeatTime ?? null,
    orderQty: item.orderQty ?? null,
    orderRef: item.orderRef ?? null,
    priorMade: item.priorMade ?? null,
    articleWeightKg: Number(item.articleWeightKg),
    chindiKg: num(item.chindiKg),
    clothProductId: item.clothProductId ?? null,
    clothKg: num(item.clothKg),
    clothNote: item.clothNote ?? null,
    bstageGrade: item.bstageGrade ?? null,
    bstageKg: num(item.bstageKg),
    productionNos: item.productionNos,
    weightKg: kg3(item.productionNos * Number(item.articleWeightKg)),
    startTime: item.startTime ?? null,
    operatorName: item.operatorName ?? null,
    topTemp: item.topTemp ?? null,
    bottomTemp: item.bottomTemp ?? null,
    curingTime: item.curingTime ?? null,
    total: total ?? item.productionNos,
    status: item.status,
    picks: item.picks ?? [],
    outputLotId: item.outputLotId ?? null,
    outputLotNumber: item.outputLotNumber ?? null,
    postedByName: item.postedByName ?? null,
    history: item.history ?? [],
    updatedAt: item.updatedAt.toISOString(),
  }
}

export async function mouldingDay(ctx: StoreContext, date: string) {
  const items = await ctx.em.find(MouldingEntry, { ...scope(ctx), entryDate: date, deletedAt: null }, { orderBy: { shift: 'asc', pressNumber: 'asc' } })
  const totals = await runningTotals(ctx, items)
  const signoffs = await ctx.em.find(MouldingSignoff, { ...scope(ctx), entryDate: date })
  const shifts = [1, 2].map((shift) => {
    const own = items.filter((item) => item.shift === shift)
    return {
      shift,
      version: shiftVersion(own).toISOString(),
      entries: own.map((item) => entryView(item, totals.get(item.id))),
      grandTotal: own.reduce((sum, item) => sum + item.productionNos, 0),
      weightTotal: kg3(own.reduce((sum, item) => sum + item.productionNos * Number(item.articleWeightKg), 0)),
      signoff: (() => {
        const signoff = signoffs.find((candidate) => candidate.shift === shift)
        return {
          shiftIncharge: signoff?.shiftIncharge ?? null,
          storeIncharge: signoff?.storeIncharge ?? null,
          authorised: signoff?.authorised ?? null,
        }
      })(),
    }
  })
  return {
    date,
    shifts,
    grandTotal: shifts.reduce((sum, shift) => sum + shift.grandTotal, 0),
    weightTotal: kg3(shifts.reduce((sum, shift) => sum + shift.weightTotal, 0)),
  }
}

export async function mouldingEntryView(ctx: StoreContext, id: string) {
  const item = await ctx.em.findOne(MouldingEntry, { id, ...scope(ctx), deletedAt: null })
  if (!item) throw new PlantError('Moulding entry not found', 404)
  const totals = await runningTotals(ctx, [item])
  let leftNos: number | null = null
  if (item.status === 'posted' && item.outputProductId && item.outputLotId) leftNos = await lotOnHand(ctx, await plantStock(ctx, [item.outputProductId]), item.outputProductId, item.outputLotId, 'floor')
  const sameRun = await ctx.em.find(MouldingEntry, { ...scope(ctx), mouldId: item.mouldId, deletedAt: null, ...(item.orderRef ? { orderRef: item.orderRef } : { orderQty: item.orderQty ?? null }) }, { orderBy: { entryDate: 'asc', shift: 'asc' } })
  const runTotals = await runningTotals(ctx, sameRun)
  const ownIndex = sameRun.findIndex((other) => other.id === item.id)
  let start = 0
  sameRun.forEach((other, index) => {
    if (ownIndex >= index && other.priorMade !== null && other.priorMade !== undefined) start = index
  })
  let end = sameRun.length
  for (let index = ownIndex + 1; index < sameRun.length; index += 1) {
    if (sameRun[index].priorMade !== null && sameRun[index].priorMade !== undefined) {
      end = index
      break
    }
  }
  const segment = sameRun.slice(start, end)
  return {
    ...entryView(item, totals.get(item.id)),
    entryDate: item.entryDate,
    shift: item.shift,
    leftNos,
    run: segment.map((other) => ({ id: other.id, entryDate: other.entryDate, shift: other.shift, pressNumber: other.pressNumber, productionNos: other.productionNos, total: runTotals.get(other.id) ?? other.productionNos, status: other.status })),
  }
}

export async function dieAvailability(ctx: StoreContext, date: string) {
  const items = await ctx.em.find(MouldingEntry, { ...scope(ctx), entryDate: date, deletedAt: null }, { orderBy: { dieNo: 'asc' } })
  const dies = new Map<string, { mouldId: string; dieNo: string; customerName: string | null; shift1: number | null; shift2: number | null; orderQty: number | null }>()
  for (const item of items) {
    const row = dies.get(item.mouldId) ?? { mouldId: item.mouldId, dieNo: item.dieNo, customerName: item.customerName ?? null, shift1: null, shift2: null, orderQty: item.orderQty ?? null }
    if (item.shift === 1) row.shift1 = item.pressNumber
    else row.shift2 = item.pressNumber
    dies.set(item.mouldId, row)
  }
  const presses = await mouldingPresses(ctx)
  const busy = (shift: number) => new Set(items.filter((item) => item.shift === shift).map((item) => item.pressNumber))
  return {
    date,
    dies: [...dies.values()].sort((left, right) => left.dieNo.localeCompare(right.dieNo, undefined, { numeric: true })),
    idleMachines: { 1: presses.filter((press) => !busy(1).has(press.number)).map((press) => press.number), 2: presses.filter((press) => !busy(2).has(press.number)).map((press) => press.number) },
  }
}
