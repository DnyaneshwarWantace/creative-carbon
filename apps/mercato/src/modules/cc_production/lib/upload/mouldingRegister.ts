import { MouldingEntry, Press } from '../../data/entities'
import { mouldingEntrySchema, type MouldingEntryInput } from '../../data/validators'
import { clothProducts } from '../coating'
import { postShift, saveShift } from '../moulding'
import { PlantError } from '../server'
import type { UploadColumn, UploadRegister, UploadRow, UploadRowError } from './types'

const COLUMNS: UploadColumn[] = [
  { key: 'date', label: 'Date', kind: 'date', required: true, aliases: ['Dt', 'Dt.'] },
  { key: 'shift', label: 'Shift', kind: 'select', required: true, options: ['1', '2'], aliases: ['Shift No'] },
  { key: 'machine', label: 'Machine No.', kind: 'int', required: true, aliases: ['Machine', 'M/c', 'Press'] },
  { key: 'dieNo', label: 'Die No.', kind: 'text', required: true, aliases: ['Die'] },
  { key: 'dieHeatTime', label: 'Die Heat Time', kind: 'text' },
  { key: 'orderQty', label: 'Order Qty.', kind: 'int', aliases: ['Order Qty', 'Order'] },
  { key: 'articleWeightKg', label: 'Weight of Article', kind: 'number', required: true, aliases: ['Article weight', 'Weight of article (kg)'] },
  { key: 'chindiKg', label: 'Weight of Chindi', kind: 'number', aliases: ['Chindi'] },
  { key: 'clothKg', label: 'Weight of Cloth', kind: 'number', aliases: ['Cloth kg'] },
  { key: 'cloth', label: 'Cloth item', kind: 'text', example: '10x10' },
  { key: 'productionNos', label: 'Shift Prod.', kind: 'int', required: true, aliases: ['1st Shift Prod.', '2nd Shift Prod.', 'Production', 'Prod'] },
  { key: 'startTime', label: 'Start Time', kind: 'time' },
  { key: 'operatorName', label: 'Operator Name', kind: 'text', listKey: 'operators', aliases: ['Operator'] },
  { key: 'priorMade', label: 'Made before', kind: 'int', example: 'Pieces of this order made before this register' },
  { key: 'post', label: 'Post', kind: 'select', options: ['Yes', 'No'], example: 'Yes on any row posts that shift' },
]

type Group = { date: string; shift: number; rows: UploadRow[] }

export const mouldingRegister: UploadRegister = {
  key: 'moulding',
  label: 'Moulded products register',
  department: 'Press & moulding',
  paperRef: 'Moulded products daily production register (machines 1–20, two shifts)',
  hint: 'One row per machine column of one shift. Rows replace the same machine in that shift; other machines already entered stay. A die can be on only one machine in a shift. Post = Yes posts the shift.',
  columns: COLUMNS,
  dated: true,
  viewFeature: 'cc_production.moulding.view',
  manageFeature: 'cc_production.moulding.enter',
  run: async (ctx, rows, options) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    const presses = await ctx.em.find(Press, { ...scope, deletedAt: null, usage: { $in: ['moulding', 'both'] } })
    const cloths = await clothProducts(ctx)
    const errors: UploadRowError[] = []
    const groups = new Map<string, Group>()
    for (const row of rows) {
      const key = `${row.values.date}|${row.values.shift}`
      const group = groups.get(key) ?? { date: row.values.date, shift: Number(row.values.shift), rows: [] }
      group.rows.push(row)
      groups.set(key, group)
    }
    let created = 0
    let updated = 0
    let posted = 0
    for (const group of groups.values()) {
      const fail = (message: string) => {
        for (const row of group.rows) errors.push({ row: row.sheetRow, error: message })
      }
      try {
        const existing = await ctx.em.find(MouldingEntry, { ...scope, entryDate: group.date, shift: group.shift, deletedAt: null })
        const inputs = new Map<string, MouldingEntryInput>()
        for (const item of existing.filter((candidate) => candidate.status === 'draft')) {
          inputs.set(item.pressId, mouldingEntrySchema.parse({ ...item, pressId: item.pressId, articleWeightKg: item.articleWeightKg, chindiKg: item.chindiKg, clothKg: item.clothKg, bstageKg: item.bstageKg }))
        }
        for (const row of group.rows) {
          const press = presses.find((entry) => entry.number === Number(row.values.machine))
          if (!press) throw new PlantError(`Row ${row.sheetRow}: machine ${row.values.machine} is not a moulding machine`)
          if (existing.some((item) => item.pressId === press.id && item.status === 'posted')) throw new PlantError(`Machine ${press.number} in shift ${group.shift} is posted. Reopen it in the app to change it.`)
          const cloth = row.values.cloth ? cloths.find((entry) => entry.title.toLowerCase() === row.values.cloth.toLowerCase()) : null
          if (row.values.cloth && !cloth) throw new PlantError(`Row ${row.sheetRow}: cloth "${row.values.cloth}" is not in the list`)
          const parsed = mouldingEntrySchema.safeParse({ ...row.values, pressId: press.id, clothProductId: cloth?.id ?? null })
          if (!parsed.success) throw new PlantError(`Row ${row.sheetRow}: check ${parsed.error.issues[0]?.path.join('.') ?? 'the values'}`)
          if (inputs.has(press.id) || existing.some((item) => item.pressId === press.id)) updated += 1
          else created += 1
          inputs.set(press.id, parsed.data)
        }
        const post = group.rows.some((row) => (row.values.post ?? '').toLowerCase().startsWith('y'))
        if (options.dryRun) {
          if (post) posted += 1
          continue
        }
        await saveShift(ctx, group.date, group.shift, [...inputs.values()], options.byName)
        if (post) {
          const result = await postShift(ctx, group.date, group.shift, null, options.byName)
          posted += result.posted
          if (result.errors.length) fail(`Saved; not posted: ${result.errors.join(' · ')}`)
        }
      } catch (error) {
        if (!(error instanceof PlantError)) throw error
        fail(error.message)
      }
    }
    return {
      created,
      updated,
      skipped: 0,
      failed: errors.length,
      errors,
      plan: [created ? `${created} machine entries added` : null, updated ? `${updated} machine entries updated` : null, posted ? `${posted} posted: moulded lots made` : null].filter((line): line is string => Boolean(line)),
    }
  },
}
