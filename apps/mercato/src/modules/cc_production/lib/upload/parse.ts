import ExcelJS from 'exceljs'
import { parseCsv } from '../../../cc_products/lib/csv'
import type { UploadColumn, UploadRegister, UploadRow } from './types'

export type ParsedUpload = {
  rows: UploadRow[]
  unknownHeaders: string[]
  missingColumns: string[]
}

const DITTO = new Set(['"', '″', '〃', ',,', '“', '”', '"', "''", 'do', 'do.', 'ditto', '-do-'])
const EMPTY_NUMBER = new Set(['nil', '-', '—', '–', 'na', 'n/a'])

function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

export function columnForHeader(register: UploadRegister, header: string): UploadColumn | null {
  const wanted = normaliseHeader(header)
  if (!wanted) return null
  return (
    register.columns.find(
      (column) => normaliseHeader(column.label) === wanted || normaliseHeader(column.key) === wanted || (column.aliases ?? []).some((alias) => normaliseHeader(alias) === wanted),
    ) ?? null
  )
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  const text = String(value ?? '').trim()
  if (!text) return null
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`
  const local = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (local) {
    const day = Number(local[1])
    const month = Number(local[2])
    const yearRaw = Number(local[3])
    const year = local[3].length === 2 ? 2000 + yearRaw : local[3].length === 3 ? 2000 + (yearRaw % 100) : yearRaw
    if (day < 1 || day > 31 || month < 1 || month > 12) return null
    return `${year}-${pad(month)}-${pad(day)}`
  }
  return null
}

export function toTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/^(\d{1,2})[:.](\d{2})/)
  if (match) return `${pad(Number(match[1]))}:${match[2]}`
  if (/^\d{1,2}$/.test(text)) return `${pad(Number(text))}:00`
  return null
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('result' in record) return cellText(record.result)
    if ('text' in record) return cellText(record.text)
    if (Array.isArray(record.richText)) return (record.richText as Array<{ text?: string }>).map((part) => part.text ?? '').join('')
    return ''
  }
  return String(value).trim()
}

function normaliseCell(column: UploadColumn, raw: unknown): string {
  if (column.kind === 'date') return toIsoDate(raw) ?? cellText(raw)
  if (column.kind === 'time') return toTime(raw) ?? cellText(raw)
  const text = cellText(raw)
  if (column.kind === 'number' || column.kind === 'int') {
    if (EMPTY_NUMBER.has(text.toLowerCase())) return '0'
    return text.replace(/,/g, '').replace(/\s+/g, '')
  }
  return text
}

function buildRows(register: UploadRegister, headers: unknown[], body: Array<{ sheetRow: number; cells: unknown[] }>): ParsedUpload {
  const mapping = headers.map((header) => columnForHeader(register, cellText(header)))
  const unknownHeaders = headers.map((header, index) => (mapping[index] ? null : cellText(header))).filter((header): header is string => Boolean(header))
  const mapped = new Set(mapping.filter(Boolean).map((column) => column!.key))
  const missingColumns = register.columns.filter((column) => column.required && !mapped.has(column.key)).map((column) => column.label)
  const rows: UploadRow[] = []
  let previous: Record<string, string> = {}
  for (const entry of body) {
    const values: Record<string, string> = {}
    mapping.forEach((column, index) => {
      if (!column) return
      const raw = entry.cells[index]
      const text = cellText(raw)
      values[column.key] = DITTO.has(text.toLowerCase()) ? (previous[column.key] ?? '') : normaliseCell(column, raw)
    })
    if (!Object.values(values).some((value) => value !== '')) continue
    rows.push({ sheetRow: entry.sheetRow, values })
    previous = values
  }
  return { rows, unknownHeaders, missingColumns }
}

function headerScore(register: UploadRegister, cells: unknown[]): number {
  return cells.filter((cell) => columnForHeader(register, cellText(cell))).length
}

export async function parseUploadFile(register: UploadRegister, fileName: string, buffer: Buffer): Promise<ParsedUpload> {
  if (/\.(csv|txt)$/i.test(fileName)) {
    const table = parseCsv(buffer.toString('utf8'))
    return buildRows(register, table.headers, table.rows.map((cells, index) => ({ sheetRow: index + 2, cells })))
  }
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheets = workbook.worksheets.filter((sheet) => sheet.state !== 'hidden' && sheet.name !== 'How to fill' && sheet.name !== 'Lists')
  for (const sheet of sheets) {
    const table: Array<{ sheetRow: number; cells: unknown[] }> = []
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      table.push({ sheetRow: rowNumber, cells: values })
    })
    const headerIndex = table.findIndex((entry) => headerScore(register, entry.cells) >= Math.max(1, Math.ceil(register.columns.filter((column) => column.required).length / 2)))
    if (headerIndex < 0) continue
    return buildRows(register, table[headerIndex].cells, table.slice(headerIndex + 1))
  }
  return { rows: [], unknownHeaders: [], missingColumns: register.columns.filter((column) => column.required).map((column) => column.label) }
}

export function parsePastedRows(register: UploadRegister, rows: Array<Record<string, unknown>>): ParsedUpload {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  return buildRows(register, headers, rows.map((row, index) => ({ sheetRow: index + 2, cells: headers.map((header) => row[header]) })))
}
