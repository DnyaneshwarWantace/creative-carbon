import ExcelJS from 'exceljs'
import type { UploadColumn, UploadRegister } from './types'

const TEMPLATE_ROWS = 60

function columnLetter(index: number): string {
  let value = index + 1
  let letters = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }
  return letters
}

function headerLabel(column: UploadColumn): string {
  return column.required ? `${column.label} *` : column.label
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true }
  row.alignment = { vertical: 'middle', wrapText: true }
  row.height = 30
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEAE2' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF8C8072' } } }
  })
}

function formatColumns(sheet: ExcelJS.Worksheet, columns: UploadColumn[]) {
  columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1)
    target.width = column.width ?? Math.max(12, Math.min(28, column.label.length + 4))
    if (column.kind === 'number') target.numFmt = '0.000'
    if (column.kind === 'date') target.numFmt = 'dd/mm/yyyy'
  })
}

export async function buildTemplate(register: UploadRegister, lists: Record<string, string[]>, date: string | null): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Creative Carbon Composites'
  const sheet = workbook.addWorksheet(register.label.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.addRow(register.columns.map(headerLabel))
  styleHeader(sheet.getRow(1))
  formatColumns(sheet, register.columns)

  const listSheet = workbook.addWorksheet('Lists', { state: 'veryHidden' })
  let listColumn = 0
  register.columns.forEach((column, index) => {
    const values = column.listKey ? (lists[column.listKey] ?? column.options ?? []) : (column.options ?? [])
    if (!values.length) return
    listColumn += 1
    values.forEach((value, row) => {
      listSheet.getCell(row + 1, listColumn).value = value
    })
    const range = `Lists!$${columnLetter(listColumn - 1)}$1:$${columnLetter(listColumn - 1)}$${values.length}`
    for (let row = 2; row <= TEMPLATE_ROWS + 1; row += 1) {
      sheet.getCell(row, index + 1).dataValidation = { type: 'list', allowBlank: !column.required, formulae: [range], showErrorMessage: false }
    }
  })

  const dateIndex = register.columns.findIndex((column) => column.kind === 'date')
  if (register.dated && date && dateIndex >= 0) {
    const [year, month, day] = date.split('-').map(Number)
    for (let row = 2; row <= TEMPLATE_ROWS + 1; row += 1) sheet.getCell(row, dateIndex + 1).value = new Date(Date.UTC(year, month - 1, day))
  }

  const help = workbook.addWorksheet('How to fill')
  help.getColumn(1).width = 28
  help.getColumn(2).width = 90
  help.addRow([register.label, register.paperRef ?? ''])
  help.getRow(1).font = { bold: true, size: 13 }
  help.addRow(['', register.hint])
  help.addRow([])
  help.addRow(['Column', 'How to fill it'])
  styleHeader(help.getRow(4))
  for (const column of register.columns) {
    const rules = [
      column.required ? 'Required.' : 'Optional.',
      column.kind === 'number' ? 'Number; kg to three decimals. NIL or - counts as 0.' : null,
      column.kind === 'int' ? 'Whole number.' : null,
      column.kind === 'date' ? 'Date, e.g. 02/10/2026 or 2/10/26.' : null,
      column.kind === 'time' ? 'Time, e.g. 9.10 or 09:10.' : null,
      column.options?.length || column.listKey ? 'Pick from the list in the cell.' : null,
      column.example ? `e.g. ${column.example}` : null,
    ].filter(Boolean)
    help.addRow([column.label, rules.join(' ')])
  }
  help.addRow([])
  help.addRow(['Ditto', 'A " or ,, in a cell copies the value from the row above, as on paper.'])
  help.addRow(['Upload', 'Upload the file in Upload centre. You see what will be saved before anything is posted. Rows with problems come back in a file with a Reason column.'])

  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildErrorFile(register: UploadRegister, rows: Array<{ row: number; values: Record<string, string>; reason: string }>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(register.label.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.addRow([...register.columns.map(headerLabel), 'Sheet row', 'Reason'])
  styleHeader(sheet.getRow(1))
  formatColumns(sheet, register.columns)
  sheet.getColumn(register.columns.length + 2).width = 60
  for (const entry of rows) {
    const added = sheet.addRow([...register.columns.map((column) => entry.values[column.key] ?? ''), entry.row, entry.reason])
    added.getCell(register.columns.length + 2).font = { color: { argb: 'FFB23B3B' } }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
