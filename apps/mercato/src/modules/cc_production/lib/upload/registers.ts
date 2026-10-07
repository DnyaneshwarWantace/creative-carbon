import { MASTER_DEFS, type MasterColumn, type MasterDef } from '../masterDefs'
import { importMasters } from '../masters'
import type { UploadColumn, UploadRegister } from './types'

function fromMasterColumn(column: MasterColumn): UploadColumn {
  if (column.kind === 'select') return { key: column.key, label: column.label, kind: 'select', required: column.required, options: (column.options ?? []).map((option) => option.label), aliases: column.importHeaders }
  if (column.kind === 'customer') return { key: column.key, label: column.label, kind: 'text', aliases: column.importHeaders, example: 'Customer name as in the customer list' }
  if (column.kind === 'bool') return { key: column.key, label: column.label, kind: 'select', options: ['Yes', 'No'], aliases: column.importHeaders }
  return { key: column.key, label: column.label, kind: column.kind === 'int' ? 'int' : column.kind === 'number' ? 'number' : 'text', required: column.required, aliases: column.importHeaders, example: column.placeholder }
}

function masterRegister(def: MasterDef, department: string, paperRef: string | null): UploadRegister {
  return {
    key: def.type,
    label: def.label,
    department,
    paperRef,
    hint: def.hint,
    columns: def.columns.map(fromMasterColumn),
    dated: false,
    viewFeature: def.viewFeature,
    manageFeature: def.manageFeature,
    run: async (ctx, rows, options) => {
      const report = await importMasters(ctx, def, rows.map((row) => row.values), options.dryRun, options.byName)
      const sheetRow = (index: number) => rows[index - 2]?.sheetRow ?? index
      return {
        created: report.created,
        updated: report.updated,
        skipped: 0,
        failed: report.failed,
        errors: report.errors.map((entry) => ({ row: sheetRow(entry.row), error: entry.error })),
        plan: [
          report.created ? `${report.created} new ${def.label.toLowerCase()}` : null,
          report.updated ? `${report.updated} existing ${def.label.toLowerCase()} updated` : null,
        ].filter((line): line is string => Boolean(line)),
      }
    },
  }
}

export const UPLOAD_REGISTERS: UploadRegister[] = [
  masterRegister(MASTER_DEFS.moulds, 'Press & moulding', 'Mould / die list (Excel)'),
  masterRegister(MASTER_DEFS.tolerances, 'Press & moulding', 'Press loading register — specified range'),
  masterRegister(MASTER_DEFS.prices, 'Sales', 'Small and big size price lists'),
]

export function uploadRegister(key: string): UploadRegister | null {
  return UPLOAD_REGISTERS.find((register) => register.key === key) ?? null
}
