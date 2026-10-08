import { CoatingSheet, Dryer } from '../../data/entities'
import { coatingSheetInputSchema, type CoatingSheetInput } from '../../data/validators'
import { clothProducts, createSheet, defaultSlots, postSheet, tankResinLots, updateSheet } from '../coating'
import { PlantError } from '../server'
import type { StoreContext } from '../../../cc_store/lib/server'
import type { UploadColumn, UploadRegister, UploadRow, UploadRowError } from './types'

const SHARED: UploadColumn[] = [
  { key: 'date', label: 'Date', kind: 'date', required: true, aliases: ['Dt', 'Dt.'] },
  { key: 'dryer', label: 'Dryer', kind: 'text', required: true, aliases: ['Dryer No', 'Dryer No.'], example: '2 or Dryer 2' },
]

const ROW_COLUMNS: UploadColumn[] = [
  ...SHARED,
  { key: 'sn', label: 'S.N.', kind: 'int', required: true, aliases: ['SN', 'S N', 'Sr No'] },
  { key: 'cloth', label: 'Cloth Name', kind: 'text', required: true, aliases: ['Cloth'], example: '10x10' },
  { key: 'gsm', label: 'GSM', kind: 'number' },
  { key: 'kushan', label: 'Kushan', kind: 'number' },
  { key: 'treated', label: 'Treated Cloth Weight', kind: 'number', aliases: ['Treated'] },
  { key: 'raw', label: 'Raw Cloth Weight', kind: 'number', required: true, aliases: ['Raw', 'Raw kg'] },
  { key: 'balance', label: 'Balance Raw Cloth', kind: 'number', aliases: ['Balance', 'Balance Raw Cloth Weight'] },
  { key: 'nos', label: 'Coated Cloth Nos', kind: 'int', required: true, aliases: ['Nos', 'Coated Nos'] },
  { key: 'resin', label: 'Resine Type / Batch', kind: 'text', aliases: ['Resin', 'Resin batch', 'Resine Type/ Batch'], example: 'P.F or a resin Batch No.' },
  { key: 'rc', label: 'RC', kind: 'number', aliases: ['RC %'] },
  { key: 'vc', label: 'VC', kind: 'number', aliases: ['VC %'] },
  { key: 'post', label: 'Post', kind: 'select', options: ['Yes', 'No'], example: 'Yes on any row posts the whole sheet' },
]

const SLOT_COLUMNS: UploadColumn[] = [
  ...SHARED,
  { key: 'time', label: 'Time', kind: 'time', required: true, example: '8.00, 10.00, 2.00 (afternoon)' },
  { key: 'dbp', label: 'DBP', kind: 'number' },
  { key: 'oleic', label: 'Olic Acid', kind: 'number', aliases: ['Oleic Acid'] },
  { key: 'output', label: 'Remarks', kind: 'number', aliases: ['Output', 'Output kg', 'Remarks (kg)'] },
]

const normalise = (value: string) => value.toLowerCase().replace(/[×*]/g, 'x').replace(/[^a-z0-9x]+/g, '')

async function lookups(ctx: StoreContext) {
  const dryers = await ctx.em.find(Dryer, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  const cloths = await clothProducts(ctx)
  return {
    dryerFor(value: string) {
      const wanted = value.trim().toLowerCase()
      const digits = wanted.match(/\d+/)?.[0]
      return dryers.find((dryer) => dryer.code.toLowerCase() === wanted || (digits && dryer.kind === 'dryer' && dryer.code.match(/\d+/)?.[0] === digits) || (wanted.startsWith('mix') && dryer.kind === 'mixer')) ?? null
    },
    clothFor(value: string) {
      const wanted = normalise(value)
      return cloths.find((cloth) => normalise(cloth.title) === wanted) ?? null
    },
  }
}

function slotTime(value: string): string {
  const [hoursText, minutes] = value.split(':')
  const hours = Number(hoursText)
  return `${String(hours >= 1 && hours <= 7 ? hours + 12 : hours).padStart(2, '0')}:${minutes}`
}

type Group = { date: string; dryerId: string; rows: UploadRow[] }

function groupRows(rows: UploadRow[], dryerFor: (value: string) => Dryer | null, errors: UploadRowError[]): Group[] {
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const dryer = dryerFor(row.values.dryer ?? '')
    if (!dryer) {
      errors.push({ row: row.sheetRow, error: `Dryer "${row.values.dryer}" is not in the plant list` })
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.values.date ?? '')) {
      errors.push({ row: row.sheetRow, error: 'Date is not a date' })
      continue
    }
    const key = `${row.values.date}|${dryer.id}`
    const group = groups.get(key) ?? { date: row.values.date, dryerId: dryer.id, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function existingInput(sheet: CoatingSheet | null, date: string, dryerId: string): CoatingSheetInput {
  return {
    sheetDate: date,
    dryerId,
    rows: (sheet?.rows ?? []).map((row) => ({ sn: row.sn, clothProductId: row.clothProductId, gsm: row.gsm, kushan: row.kushan, treatedWeight: row.treatedWeight, rawKg: row.rawKg, balanceRawKg: row.balanceRawKg, coatedNos: row.coatedNos, resinLotId: row.resinLotId, rcPct: row.rcPct, vcPct: row.vcPct })),
    slots: sheet?.slots.length ? sheet.slots : defaultSlots(),
    notes: sheet?.notes ?? null,
  }
}

async function saveGroup(ctx: StoreContext, group: Group, input: CoatingSheetInput, existing: CoatingSheet | null, post: boolean, options: { dryRun: boolean; byName: string | null }) {
  const parsed = coatingSheetInputSchema.safeParse(input)
  if (!parsed.success) throw new PlantError(`Check ${parsed.error.issues[0]?.path.join('.') ?? 'the values'}`)
  if (options.dryRun) return existing ? 'updated' : 'created'
  const sheet = existing ? await updateSheet(ctx, existing, parsed.data, options.byName) : await createSheet(ctx, parsed.data, options.byName)
  if (post) await postSheet(ctx, sheet, options.byName)
  return existing ? 'updated' : 'created'
}

async function runGroups(
  ctx: StoreContext,
  rows: UploadRow[],
  options: { dryRun: boolean; byName: string | null },
  merge: (group: Group, input: CoatingSheetInput, helpers: Awaited<ReturnType<typeof lookups>>, errors: UploadRowError[]) => Promise<{ input: CoatingSheetInput; post: boolean; ok: boolean }>,
  label: string,
) {
  const helpers = await lookups(ctx)
  const errors: UploadRowError[] = []
  let created = 0
  let updated = 0
  let posted = 0
  for (const group of groupRows(rows, helpers.dryerFor, errors)) {
    const existing = await ctx.em.findOne(CoatingSheet, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, dryerId: group.dryerId, sheetDate: group.date, deletedAt: null })
    if (existing?.status === 'posted') {
      for (const row of group.rows) errors.push({ row: row.sheetRow, error: `The ${existing.dryerCode} sheet for ${group.date} is posted. Reopen it in the app to change it.` })
      continue
    }
    const merged = await merge(group, existingInput(existing, group.date, group.dryerId), helpers, errors)
    if (!merged.ok) continue
    try {
      const result = await saveGroup(ctx, group, merged.input, existing, merged.post, options)
      if (result === 'created') created += 1
      else updated += 1
      if (merged.post) posted += 1
    } catch (error) {
      if (!(error instanceof PlantError)) throw error
      for (const row of group.rows) errors.push({ row: row.sheetRow, error: error.message })
    }
  }
  return {
    created,
    updated,
    skipped: 0,
    failed: errors.length,
    errors,
    plan: [created ? `${created} new dryer sheets (${label})` : null, updated ? `${updated} dryer sheets updated (${label})` : null, posted ? `${posted} sheets posted: raw cloth and resin out, B-stage lots on the board` : null].filter((line): line is string => Boolean(line)),
  }
}

export const dryerRowsRegister: UploadRegister = {
  key: 'dryer_sheets',
  label: 'Dryer sheets · cloth rows',
  department: 'Coating',
  paperRef: 'Quality Control Report, Dryer No. N',
  hint: 'One row per cloth row of the dryer sheet. Rows with the same date and dryer make one sheet; a row replaces the same S.N. Upload the two-hourly log (DBP, Olic acid, Remarks kg) with the "Dryer sheets · time slots" tile first if you want the day output used. Post = Yes on any row posts that sheet.',
  columns: ROW_COLUMNS,
  dated: true,
  viewFeature: 'cc_production.coating.view',
  manageFeature: 'cc_production.coating.enter',
  run: async (ctx, rows, options) => {
    const resinLots = await tankResinLots(ctx)
    return runGroups(
      ctx,
      rows,
      options,
      async (group, input, helpers, errors) => {
        let ok = true
        let post = false
        const bySn = new Map(input.rows.map((row) => [row.sn, row]))
        for (const row of group.rows) {
          const values = row.values
          const cloth = helpers.clothFor(values.cloth ?? '')
          if (!cloth) {
            errors.push({ row: row.sheetRow, error: `Cloth "${values.cloth}" is not in the reinforcement list` })
            ok = false
            continue
          }
          const resinText = (values.resin ?? '').trim()
          const resinLot = resinText && !/^p\.?\s*f\.?$/i.test(resinText) ? resinLots.find((lot) => (lot.lotNumber ?? '').toLowerCase() === resinText.toLowerCase()) : null
          if (resinText && !/^p\.?\s*f\.?$/i.test(resinText) && !resinLot) {
            errors.push({ row: row.sheetRow, error: `Resin batch "${resinText}" has nothing left in the resin tank` })
            ok = false
            continue
          }
          const number = (key: string) => (values[key] === undefined || values[key] === '' ? null : Number(values[key]))
          bySn.set(Number(values.sn), {
            sn: Number(values.sn),
            clothProductId: cloth.id,
            gsm: number('gsm'),
            kushan: number('kushan'),
            treatedWeight: number('treated'),
            rawKg: number('raw') ?? 0,
            balanceRawKg: number('balance'),
            coatedNos: number('nos') ?? 0,
            resinLotId: resinLot?.lotId ?? null,
            rcPct: number('rc'),
            vcPct: number('vc'),
          })
          if ((values.post ?? '').toLowerCase().startsWith('y')) post = true
        }
        return { input: { ...input, rows: [...bySn.values()].sort((left, right) => left.sn - right.sn) }, post, ok }
      },
      'cloth rows',
    )
  },
}

export const dryerSlotsRegister: UploadRegister = {
  key: 'dryer_slots',
  label: 'Dryer sheets · time slots',
  department: 'Coating',
  paperRef: 'Quality Control Report, Dryer No. N — Time, DBP, Olic acid, Remarks',
  hint: 'One row per time slot written on the dryer sheet. Afternoon times 1.00–7.00 are read as 1 pm–7 pm, as on the sheet; write the evening 8.00 and 10.00 slots as 20.00 and 22.00. DBP and Olic acid post as chemical issues when the sheet is posted.',
  columns: SLOT_COLUMNS,
  dated: true,
  viewFeature: 'cc_production.coating.view',
  manageFeature: 'cc_production.coating.enter',
  run: async (ctx, rows, options) =>
    runGroups(
      ctx,
      rows,
      options,
      async (group, input) => {
        const slots = new Map(input.slots.map((slot) => [slot.time.replace('.', ':').padStart(5, '0'), slot]))
        for (const row of group.rows) {
          const time = slotTime(row.values.time ?? '')
          const number = (key: string) => (row.values[key] === undefined || row.values[key] === '' ? null : Number(row.values[key]))
          slots.set(time, { time, dbpKg: number('dbp'), oleicKg: number('oleic'), outputKg: number('output') })
        }
        return { input: { ...input, slots: [...slots.values()].sort((left, right) => left.time.localeCompare(right.time)) }, post: false, ok: true }
      },
      'time slots',
    ),
}
