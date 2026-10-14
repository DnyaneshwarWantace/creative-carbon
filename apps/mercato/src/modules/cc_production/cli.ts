import type { ModuleCli } from '@open-mercato/shared/modules/registry'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import ExcelJS from 'exceljs'
import { seedPlantMasters } from './lib/seeds'
import { convertClientWorkbook } from './lib/chartConvert'
import { looksLikeRodStock, parseRodStock } from './lib/rodStock'
import { RodStock } from './data/entities'
import { MASTER_DEFS } from './lib/masterDefs'
import { importMasters } from './lib/masters'

function readFlag(args: string[], names: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    for (const name of names) {
      if (arg === `--${name}` && args[index + 1]) return args[index + 1]
      if (arg.startsWith(`--${name}=`)) return arg.slice(name.length + 3)
    }
  }
  return ''
}

const seed: ModuleCli = {
  command: 'seed',
  async run(rest) {
    const tenantId = readFlag(rest, ['tenant', 'tenantId'])
    const organizationId = readFlag(rest, ['org', 'organizationId'])
    if (!tenantId || !organizationId) {
      console.error('Usage: mercato cc_production seed --tenant <tenantId> --org <organizationId>')
      return
    }
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    await em.transactional((tem) => seedPlantMasters(tem, { tenantId, organizationId }))
    console.log('Plant masters (reactors, dryers, presses, tolerance, known dies) seeded for organization', organizationId)
  },
}

const importChart: ModuleCli = {
  command: 'import-chart',
  async run(rest) {
    const tenantId = readFlag(rest, ['tenant', 'tenantId'])
    const organizationId = readFlag(rest, ['org', 'organizationId'])
    const file = readFlag(rest, ['file'])
    if (!tenantId || !organizationId || !file) {
      console.error('Usage: mercato cc_production import-chart --file <chart.xlsx> --tenant <tenantId> --org <organizationId> [--dry-run]')
      return
    }
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(file)
    const sheets = workbook.worksheets.map((sheet) => {
      const rows: unknown[][] = []
      sheet.eachRow({ includeEmpty: true }, (row, number) => {
        rows[number - 1] = Array.from({ length: sheet.columnCount }, (_, column) => row.getCell(column + 1).value)
      })
      return { name: sheet.name, rows: Array.from(rows, (row) => row ?? []) }
    })
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const dryRun = rest.includes('--dry-run')
    const rodSheet = sheets.find((sheet) => looksLikeRodStock(sheet.rows))
    if (rodSheet) {
      const rods = parseRodStock(rodSheet.rows)
      const result = await em.transactional(async (tem) => {
        const scope = { tenantId, organizationId, deletedAt: null }
        const existing = await tem.find(RodStock, { ...scope, source: 'tube_rod_list' })
        let created = 0
        let updated = 0
        for (const rod of rods) {
          const row = existing.find((entry) => entry.srNo === rod.srNo)
          if (row) updated += 1
          else created += 1
          if (dryRun) continue
          const target = row ?? tem.create(RodStock, { tenantId, organizationId, odText: rod.odText, odFrom: String(rod.odFrom), lengthMm: rod.lengthMm, quantity: rod.quantity })
          target.srNo = rod.srNo
          target.odText = rod.odText
          target.odFrom = rod.odFrom.toFixed(2)
          target.odTo = rod.odTo === null ? null : rod.odTo.toFixed(2)
          target.lengthMm = rod.lengthMm
          target.quantity = rod.quantity
          target.source = 'tube_rod_list'
          tem.persist(target)
        }
        return { created, updated }
      })
      console.log(`${dryRun ? 'Checked' : 'Imported'} ${rods.length} rod stock rows: ${result.created} new, ${result.updated} already there`)
      return
    }
    const rows = convertClientWorkbook(sheets)
    const report = await em.transactional((tem) => importMasters({ em: tem, tenantId, organizationId }, MASTER_DEFS.chart, rows, dryRun, 'chart import'))
    console.log(`${dryRun ? 'Checked' : 'Imported'} ${report.total} chart rows: ${report.created} new, ${report.updated} already there, ${report.failed} failed`)
    for (const error of report.errors.slice(0, 20)) console.log(`  row ${error.row}: ${error.error}`)
  },
}

export default [seed, importChart]
