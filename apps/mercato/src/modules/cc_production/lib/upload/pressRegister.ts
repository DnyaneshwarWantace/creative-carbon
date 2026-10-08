import { Press, PressBatch } from '../../data/entities'
import { pressBatchInputSchema } from '../../data/validators'
import { createPressBatch, postPressBatch, updatePressBatch } from '../press'
import { PlantError } from '../server'
import type { UploadColumn, UploadRegister, UploadRow, UploadRowError } from './types'

const COLUMNS: UploadColumn[] = [
  { key: 'date', label: 'Date', kind: 'date', required: true, aliases: ['Dt', 'Dt.'] },
  { key: 'press', label: 'Press No.', kind: 'int', required: true, aliases: ['Press', 'Press Number'] },
  { key: 'batchNo', label: 'Batch No.', kind: 'text', aliases: ['Load / Batch Number', 'Load No', 'Batch'], example: 'Blank = next F/NN/MM/YYYY; rows with the same Batch No. are one load' },
  { key: 'daylight', label: 'Daylight', kind: 'int', required: true, aliases: ['Daylight No', 'DL'] },
  { key: 'thickness', label: 'Thickness (mm)', kind: 'number', required: true, aliases: ['Thickness', 'Thickness mm', 'mm'] },
  { key: 'count', label: 'Sheets', kind: 'int', aliases: ['Sheet count', 'Nos'], example: '1.5 mm × 10 → 10' },
  { key: 'weight', label: 'Loading weight (kg)', kind: 'text', required: true, aliases: ['Loading weight', 'Weight'], example: '117.600 or 6.200/6.400' },
  { key: 'grade', label: 'Grade', kind: 'text', aliases: ['Grade / weave', 'Item'], example: 'F2F3, 10x10, 6x6 (ditto copies the row above)' },
  { key: 'cycleNo', label: 'Cycle no.', kind: 'int' },
  { key: 'checkedBy', label: 'Checked by', kind: 'text' },
  { key: 'remark', label: 'Remark', kind: 'text' },
  { key: 'post', label: 'Post', kind: 'select', options: ['Yes', 'No'], example: 'Yes on any row posts that batch' },
]

function weights(text: string) {
  const parts = text
    .split('/')
    .map((part) => Number(part.trim().replace(/,/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!parts.length) return null
  return { weightKg: Math.max(...parts), weightMinKg: parts.length > 1 ? Math.min(...parts) : null }
}

type Group = { key: string; batchNo: string | null; date: string; pressNumber: number; rows: UploadRow[] }

export const pressLoadingRegister: UploadRegister = {
  key: 'press_loading',
  label: 'Press loading register',
  department: 'Press & moulding',
  paperRef: 'Press loading register + daily production batch report CCCPL/F/PRP/02',
  hint: 'One row per sheet in a daylight (a daylight with a 15 mm and a 10 mm sheet is two rows). Rows with the same Batch No. are one load; leave Batch No. blank for one new load per date and press. Post = Yes takes the B-stage oldest first and makes the pressed lots.',
  columns: COLUMNS,
  dated: true,
  viewFeature: 'cc_production.press.view',
  manageFeature: 'cc_production.press.enter',
  run: async (ctx, rows, options) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    const presses = await ctx.em.find(Press, { ...scope, deletedAt: null })
    const errors: UploadRowError[] = []
    const groups = new Map<string, Group>()
    let lastGrade = ''
    for (const row of rows) {
      const grade = (row.values.grade ?? '').trim()
      if (grade) lastGrade = grade
      else row.values.grade = lastGrade
      const batchNo = (row.values.batchNo ?? '').trim().toUpperCase() || null
      const key = batchNo ? `no|${batchNo}` : `day|${row.values.date}|${row.values.press}`
      const group = groups.get(key) ?? { key, batchNo, date: row.values.date, pressNumber: Number(row.values.press), rows: [] }
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
        const press = presses.find((entry) => entry.number === group.pressNumber)
        if (!press) throw new PlantError(`Press ${group.pressNumber} is not in the plant list`)
        const daylights = new Map<number, Array<{ thicknessMm: number; count: number; weightKg: number; weightMinKg: number | null; grade: string }>>()
        for (const row of group.rows) {
          const weight = weights(row.values.weight ?? '')
          if (!weight) throw new PlantError(`Row ${row.sheetRow}: loading weight is not a number`)
          if (!row.values.grade) throw new PlantError(`Row ${row.sheetRow}: grade is missing`)
          const no = Number(row.values.daylight)
          const list = daylights.get(no) ?? []
          list.push({ thicknessMm: Number(row.values.thickness), count: Number(row.values.count) || 1, weightKg: weight.weightKg, weightMinKg: weight.weightMinKg, grade: row.values.grade })
          daylights.set(no, list)
        }
        const first = group.rows[0].values
        const parsed = pressBatchInputSchema.safeParse({
          batchDate: group.date,
          pressId: press.id,
          cycleNo: first.cycleNo || null,
          daylights: [...daylights.entries()].map(([no, sheets]) => ({ no, sheets })),
          checkedBy: group.rows.map((row) => row.values.checkedBy).find(Boolean) ?? null,
          remark: group.rows.map((row) => row.values.remark).find(Boolean) ?? null,
        })
        if (!parsed.success) throw new PlantError(`Check ${parsed.error.issues[0]?.path.join('.') ?? 'the rows'}`)
        const bookNo = group.batchNo?.replace(/^F\/(\d)\//, 'F/0$1/') ?? null
        group.batchNo = bookNo
        const existing = bookNo ? await ctx.em.findOne(PressBatch, { ...scope, batchNo: bookNo }) : null
        if (bookNo && !existing && !/^F\/\d{2,3}\/\d{2}\/\d{4}$/.test(bookNo)) throw new PlantError(`Batch No. ${bookNo} is not in the F/NN/MM/YYYY form`)
        if (existing && existing.status !== 'draft') throw new PlantError(`${existing.batchNo} is ${existing.status}. Reopen it in the app to change it.`)
        const post = group.rows.some((row) => (row.values.post ?? '').toLowerCase().startsWith('y'))
        if (options.dryRun) {
          if (existing) updated += 1
          else created += 1
          if (post) posted += 1
          continue
        }
        const batch = existing ? await updatePressBatch(ctx, existing, parsed.data, options.byName) : await createPressBatch(ctx, parsed.data, options.byName, group.batchNo)
        if (existing) updated += 1
        else created += 1
        if (post) {
          try {
            await postPressBatch(ctx, batch, options.byName)
            posted += 1
          } catch (error) {
            if (!(error instanceof PlantError)) throw error
            fail(`${batch.batchNo} saved, not posted: ${error.message}`)
          }
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
      plan: [created ? `${created} new press batches` : null, updated ? `${updated} press batches updated` : null, posted ? `${posted} posted: B-stage out, pressed lots made` : null].filter((line): line is string => Boolean(line)),
    }
  },
}
