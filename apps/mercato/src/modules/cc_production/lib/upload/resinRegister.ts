import { Reactor, ResinBatch } from '../../data/entities'
import { resinBatchInputSchema } from '../../data/validators'
import { createBatch, chemicalProducts, failBatch, nextBatchNo, postBatch, STANDARD_MATERIALS, updateBatch } from '../resin'
import { PlantError } from '../server'
import type { UploadColumn, UploadRegister, UploadRowError } from './types'

const materialKey = (name: string) => `kg_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`

const READING_COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'startHeating', label: 'Start heating' },
  { key: 'stopHeating', label: 'Stop heating' },
  { key: 'reactionStart', label: 'Reaction start' },
  { key: 'reactionComplete', label: 'Reaction complete' },
]

const COLUMNS: UploadColumn[] = [
  { key: 'date', label: 'Date', kind: 'date', required: true, aliases: ['Dt', 'Dt.'] },
  { key: 'vessel', label: 'Vessel', kind: 'text', required: true, aliases: ['Reactor', 'Vessel No'], example: 'CCCPL-VES-2' },
  { key: 'batchNo', label: 'Batch No.', kind: 'text', aliases: ['Batch', 'Batch No'], example: 'Blank = next number' },
  { key: 'grade', label: 'Grade', kind: 'select', required: true, listKey: 'resin_grades' },
  ...STANDARD_MATERIALS.map((name) => ({ key: materialKey(name), label: `${name} (kg)`, kind: 'number' as const, aliases: [name] })),
  ...READING_COLUMNS.flatMap((reading) => [
    { key: `${reading.key}_temp`, label: `${reading.label} °C`, kind: 'number' as const },
    { key: `${reading.key}_time`, label: `${reading.label} time`, kind: 'time' as const },
  ]),
  { key: 'vacuumStart', label: 'Vacuum start time', kind: 'time', aliases: ['Water removal under vacuum'] },
  { key: 'coolingDuration', label: 'Cooling time (h:mm)', kind: 'time', aliases: ['Cooling time'] },
  { key: 'ph', label: 'pH', kind: 'number' },
  { key: 'gelTimeSec', label: 'Gel time (sec)', kind: 'number', aliases: ['Gel time'] },
  { key: 'viscositySec', label: 'Viscosity (sec)', kind: 'number', aliases: ['Viscosity'] },
  { key: 'solidPct', label: 'Solid content (%)', kind: 'number', aliases: ['Solid content', 'Solid %'] },
  { key: 'waterRemovedKg', label: 'Water removed (kg)', kind: 'number', aliases: ['Water'] },
  { key: 'yieldKg', label: 'Resin yield (kg)', kind: 'number', aliases: ['Resin yield', 'Yield', 'Resin'] },
  { key: 'post', label: 'Post', kind: 'select', options: ['Yes', 'No'], example: 'Yes takes the chemicals out of stock' },
  { key: 'failReason', label: 'Failed reason', kind: 'text', example: 'Only for a failed batch' },
  { key: 'notes', label: 'Remarks', kind: 'text' },
]

const blankNumber = (value: string | undefined) => (value === undefined || value === '' ? null : value)

export const resinBatchRegister: UploadRegister = {
  key: 'resin_batches',
  label: 'Resin batches',
  department: 'Resin plant',
  paperRef: 'CCCPL/F/QC/03 · Phenol formaldehyde resin batch report',
  hint: 'One row per batch, as on the batch report. Leave Batch No. blank for the next number of that day. Post = Yes takes the chemicals out of stock (oldest lot first) and puts the resin into the resin tank; a Failed reason writes the chemicals off as scrap.',
  columns: COLUMNS,
  dated: true,
  viewFeature: 'cc_production.resin.view',
  manageFeature: 'cc_production.resin.enter',
  run: async (ctx, rows, options) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    const reactors = await ctx.em.find(Reactor, { ...scope, deletedAt: null })
    const chemicals = await chemicalProducts(ctx)
    const chemicalByName = new Map(chemicals.map((chemical) => [chemical.title.toLowerCase(), chemical]))
    const reactorFor = (value: string) => {
      const wanted = value.trim().toUpperCase()
      return reactors.find((reactor) => reactor.code.toUpperCase() === wanted || reactor.code.toUpperCase().endsWith(`-${wanted}`) || reactor.code.toUpperCase().endsWith(wanted.replace(/^VES\s*/, 'VES-')))
    }
    const errors: UploadRowError[] = []
    const nextNumbers = new Map<string, number>()
    const usedNumbers = new Set<string>()
    let created = 0
    let updated = 0
    let posted = 0
    let failed = 0

    for (const row of rows) {
      const values = row.values
      try {
        const reactor = reactorFor(values.vessel ?? '')
        if (!reactor) throw new PlantError(`Vessel "${values.vessel}" is not in the plant list`)
        const materials = STANDARD_MATERIALS.map((name) => ({ name, kg: Number(values[materialKey(name)] || 0) }))
          .filter((line) => line.kg > 0)
          .map((line) => {
            const chemical = chemicalByName.get(line.name.toLowerCase())
            if (!chemical) throw new PlantError(`${line.name} is not in the item list`)
            return { productId: chemical.id, kg: line.kg, lotId: null }
          })
        const process: Record<string, unknown> = {
          vacuumStart: values.vacuumStart || null,
          coolingDuration: values.coolingDuration || null,
        }
        for (const reading of READING_COLUMNS) process[reading.key] = { tempC: blankNumber(values[`${reading.key}_temp`]), time: values[`${reading.key}_time`] || null }
        const parsed = resinBatchInputSchema.safeParse({
          batchDate: values.date,
          batchNo: values.batchNo || undefined,
          reactorId: reactor.id,
          grade: (values.grade ?? '').toUpperCase(),
          materials,
          process,
          tests: { ph: blankNumber(values.ph), gelTimeSec: blankNumber(values.gelTimeSec), viscositySec: blankNumber(values.viscositySec), solidPct: blankNumber(values.solidPct) },
          waterRemovedKg: blankNumber(values.waterRemovedKg),
          yieldKg: blankNumber(values.yieldKg),
          notes: values.notes || null,
        })
        if (!parsed.success) {
          const field = parsed.error.issues[0]?.path.join('.') ?? ''
          throw new PlantError(field.startsWith('grade') ? 'Grade is missing' : field.startsWith('batchDate') ? 'Date is not a date' : `Check ${field}`)
        }
        const input = parsed.data
        const wantsPost = (values.post ?? '').toLowerCase().startsWith('y')
        const failReason = (values.failReason ?? '').trim()
        if (wantsPost && failReason) throw new PlantError('A batch is either posted or failed, not both')
        if (wantsPost && !(input.yieldKg && input.yieldKg > 0)) throw new PlantError('Enter the resin yield to post')

        let batchNo = input.batchNo
        if (!batchNo) {
          const offset = nextNumbers.get(input.batchDate) ?? 0
          batchNo = await nextBatchNo(ctx, input.batchDate, offset)
          nextNumbers.set(input.batchDate, offset + 1)
        }
        if (usedNumbers.has(batchNo)) throw new PlantError(`Batch No. ${batchNo} appears twice in this file`)
        usedNumbers.add(batchNo)
        const existing = await ctx.em.findOne(ResinBatch, { ...scope, batchNo, deletedAt: null })
        if (existing && existing.status !== 'draft') throw new PlantError(`${batchNo} is already ${existing.status}. Reopen it in the app to change it.`)

        if (options.dryRun) {
          if (existing) updated += 1
          else created += 1
          if (wantsPost) posted += 1
          if (failReason) failed += 1
          continue
        }
        const batch = existing ? await updateBatch(ctx, existing, { ...input, batchNo }, options.byName) : await createBatch(ctx, { ...input, batchNo }, options.byName)
        if (existing) updated += 1
        else created += 1
        if (wantsPost) {
          try {
            await postBatch(ctx, batch, options.byName)
            posted += 1
          } catch (error) {
            if (!(error instanceof PlantError)) throw error
            errors.push({ row: row.sheetRow, error: `Saved as not posted: ${error.message}` })
          }
        }
        if (failReason) {
          await failBatch(ctx, batch, failReason, options.byName)
          failed += 1
        }
      } catch (error) {
        if (!(error instanceof PlantError)) throw error
        errors.push({ row: row.sheetRow, error: error.message })
      }
    }
    return {
      created,
      updated,
      skipped: 0,
      failed: errors.length,
      errors,
      plan: [
        created ? `${created} new resin batches` : null,
        updated ? `${updated} draft batches updated` : null,
        posted ? `${posted} posted: chemicals out of stock, resin into the resin tank` : null,
        failed ? `${failed} marked failed (chemicals written off)` : null,
      ].filter((line): line is string => Boolean(line)),
    }
  },
}
