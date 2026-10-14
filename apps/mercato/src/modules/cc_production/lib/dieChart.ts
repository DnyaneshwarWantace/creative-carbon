import ExcelJS from 'exceljs'
import type { StoreContext } from '../../cc_store/lib/server'
import { Mould, RodStock } from '../data/entities'
import { DIE_FAMILIES, type DieFamilyKey } from './dieFamilies'

type Scope = Pick<StoreContext, 'em' | 'tenantId' | 'organizationId'>

export type ChartMould = {
  family: DieFamilyKey
  chartNo: number
  dieNo: string
  mouldType: 'die' | 'plate'
  description: string | null
  size: string | null
  finish: 'mirror' | 'satin' | null
  dimensions: Record<string, number | string>
  weightKg: number | null
  cavities: number | null
  chartPage: string | null
  customerRef: string | null
  drawingNo: string | null
}

export type ChartRod = { srNo: number; odText: string; odFrom: number; odTo: number | null; lengthMm: number; quantity: number }

export type ParsedChart = { kind: 'die_chart' | 'cavity_list' | 'rod_stock'; moulds: ChartMould[]; rods: ChartRod[]; warnings: string[] }

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('result' in record) return cellText(record.result)
    if ('text' in record) return cellText(record.text)
    if (Array.isArray(record.richText)) return (record.richText as Array<{ text?: string }>).map((part) => part.text ?? '').join('')
    return ''
  }
  return String(value).trim()
}

function blank(text: string): boolean {
  return !text || /^[.…\s]+$/.test(text)
}

function numberOf(value: unknown): number | null {
  const text = cellText(value).replace(/,/g, '')
  if (blank(text)) return null
  const match = text.match(/-?\d+(?:\.\d+)?/)
  return match && /^-?\d+(?:\.\d+)?$/.test(text) ? Number(match[0]) : null
}

function headerKey(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function rowsOf(sheet: ExcelJS.Worksheet): Array<{ row: number; cells: unknown[] }> {
  const rows: Array<{ row: number; cells: unknown[] }> = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    rows.push({ row: rowNumber, cells: Array.isArray(row.values) ? row.values.slice(1) : [] })
  })
  return rows
}

function cleanCode(raw: string): { code: string; note: string | null } {
  const parts = raw
    .split(/\n+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const code = (parts[0] ?? '').replace(/\s*-\s*/g, '-').replace(/\s*\/\s*$/, '').trim()
  return { code, note: parts.length > 1 ? parts.slice(1).join(' ').replace(/\s*\/\s*/g, ' / ').trim() : null }
}

function familyForSheet(name: string): DieFamilyKey | null {
  const upper = name.toUpperCase()
  if (/IN\s*SIDE/.test(upper)) return 'inside_bearing'
  if (upper.includes('FIBER BEARING') || upper.includes('FIBRE BEARING')) return 'fibre_bearing'
  if (upper.includes('KEY')) return 'fibre_key'
  if (upper.includes('HANGER')) return 'hanger'
  if (upper.includes('PLATE')) return 'sheet_plate'
  return null
}

function parseFamilySheet(family: DieFamilyKey, sheet: ExcelJS.Worksheet, warnings: string[]): ChartMould[] {
  const def = DIE_FAMILIES[family]
  const rows = rowsOf(sheet)
  const header = rows.findIndex((entry) => entry.cells.some((cell) => headerKey(cellText(cell)) === 'CODENO'))
  if (header < 0) {
    warnings.push(`${sheet.name}: no "CODE NO." header found`)
    return []
  }
  const columns = new Map<string, number>()
  rows[header].cells.forEach((cell, index) => {
    const key = headerKey(cellText(cell))
    if (key && !columns.has(key)) columns.set(key, index)
  })
  const known = new Set(['NO', 'CODENO', 'WTKG', 'RF', 'CUTDWGNO', ...def.dimensions.map((dimension) => headerKey(dimension))])
  let page: string | null = null
  rows[header].cells.forEach((cell) => {
    const text = cellText(cell)
    if (/^PAGE\s*\d+/i.test(text)) page = text.toUpperCase()
  })
  const out: ChartMould[] = []
  for (const entry of rows.slice(header + 1)) {
    const at = (key: string) => (columns.has(key) ? entry.cells[columns.get(key)!] : undefined)
    const chartNo = numberOf(at('NO'))
    const codeText = cellText(at('CODENO'))
    const extras: string[] = []
    entry.cells.forEach((cell, index) => {
      const text = cellText(cell)
      if (!text) return
      if (/^PAGE\s*\d+/i.test(text)) page = text.toUpperCase()
      else if (![...columns.entries()].some(([key, column]) => column === index && known.has(key))) extras.push(text)
    })
    if (chartNo === null) continue
    const dimensions: Record<string, number | string> = {}
    for (const dimension of def.dimensions) {
      const raw = cellText(at(headerKey(dimension)))
      if (blank(raw)) continue
      const value = numberOf(raw)
      if (value === null) extras.push(raw)
      else dimensions[dimension] = value
    }
    const weightRaw = cellText(at('WTKG'))
    const weight = numberOf(weightRaw) ?? (weightRaw.match(/\d+(?:\.\d+)?/) ? Number(weightRaw.match(/\d+(?:\.\d+)?/)![0]) : null)
    const { code, note } = blank(codeText) ? { code: '', note: null } : cleanCode(codeText)
    const drawing = cellText(at('CUTDWGNO'))
    const dieNo = code || (blank(drawing) ? `${def.short}-${chartNo}` : drawing)
    const notes = [note, weightRaw && numberOf(weightRaw) === null && !blank(weightRaw) ? weightRaw : null, ...extras].filter(Boolean).join(' · ')
    out.push({
      family,
      chartNo,
      dieNo,
      mouldType: 'die',
      description: [def.label, notes].filter(Boolean).join(' · '),
      size: null,
      finish: null,
      dimensions,
      weightKg: weight,
      cavities: null,
      chartPage: page,
      customerRef: blank(cellText(at('RF'))) ? null : cellText(at('RF')),
      drawingNo: blank(drawing) ? null : drawing,
    })
  }
  return out
}

function parsePlates(sheet: ExcelJS.Worksheet): ChartMould[] {
  const out: ChartMould[] = []
  let index = 0
  for (const entry of rowsOf(sheet).slice(1)) {
    const name = cellText(entry.cells[0])
    const count = numberOf(entry.cells[3])
    if (!name) continue
    index += 1
    const size = cellText(entry.cells[1]) || null
    const glossy = /gloss/i.test(name)
    out.push({
      family: 'sheet_plate',
      chartNo: index,
      dieNo: `PLATE ${glossy ? 'GLOSSY' : /matt/i.test(name) ? 'MATT' : name.toUpperCase()} ${size ?? ''}`.trim(),
      mouldType: 'plate',
      description: name,
      size,
      finish: glossy ? 'mirror' : /matt/i.test(name) ? 'satin' : null,
      dimensions: count === null ? {} : { count },
      weightKg: null,
      cavities: null,
      chartPage: null,
      customerRef: cellText(entry.cells[2]) || null,
      drawingNo: null,
    })
  }
  return out
}

function parseCavityList(sheet: ExcelJS.Worksheet): ChartMould[] {
  const rows = rowsOf(sheet)
  const header = rows.findIndex((entry) => entry.cells.some((cell) => headerKey(cellText(cell)) === 'CAVITY'))
  if (header < 0) return []
  const headerCells = rows[header].cells.map((cell) => headerKey(cellText(cell)))
  const blocks = headerCells.map((key, index) => (key === 'SRNO' ? index : -1)).filter((index) => index >= 0)
  const out: ChartMould[] = []
  for (const entry of rows.slice(header)) {
    const drawingText = cellText(entry.cells[1])
    const rodNo = numberOf(entry.cells[0])
    const rod = drawingText.match(/(CCPL\s*-\s*DWG\s*-\s*ROD\s*-\s*\d+)\s*\(([^)]*)\)/i)
    if (rod && rodNo !== null) {
      const drawing = rod[1].replace(/\s+/g, '')
      const inside = rod[2]
      const diameters = [...inside.matchAll(/∅\s*(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]))
      const length = inside.match(/LENGTH\s*-?\s*(\d+)/i)
      const dimensions: Record<string, number | string> = {}
      if (diameters[0] !== undefined) dimensions.OD = diameters[0]
      if (diameters[1] !== undefined) dimensions.ID = diameters[1]
      if (diameters.length > 2) dimensions.Steps = diameters.slice(1).join(' / ')
      if (length) dimensions.L = Number(length[1])
      out.push({ family: 'rod_drawing', chartNo: rodNo, dieNo: `${drawing.replace(/^CCPL-DWG-/i, '')} Ø${diameters.join('×Ø')}${length ? `×${length[1]}` : ''}`, mouldType: 'die', description: `Rod drawing ${inside.trim()}`, size: null, finish: null, dimensions, weightKg: null, cavities: null, chartPage: null, customerRef: null, drawingNo: drawing })
    }
    if (entry === rows[header]) continue
    for (const start of blocks) {
      const sr = numberOf(entry.cells[start])
      const od = cellText(entry.cells[start + 1])
      const length = numberOf(entry.cells[start + 2])
      if (sr === null || blank(od)) continue
      const odValue = numberOf(od)
      out.push({
        family: 'tube',
        chartNo: sr,
        dieNo: `TUBE OD ${od.replace(/\s+/g, ' ')}${length !== null ? ` L${length}` : ''}`,
        mouldType: 'die',
        description: 'Tube / rod cavity mould',
        size: null,
        finish: null,
        dimensions: { OD: odValue ?? od.replace(/\s+/g, ' '), ...(length !== null ? { L: length } : {}) },
        weightKg: null,
        cavities: numberOf(entry.cells[start + 3]),
        chartPage: null,
        customerRef: cellText(entry.cells[start + 4]) || null,
        drawingNo: null,
      })
    }
  }
  return out
}

function parseRodStock(sheet: ExcelJS.Worksheet): ChartRod[] {
  const rows = rowsOf(sheet)
  const header = rows.findIndex((entry) => entry.cells.some((cell) => headerKey(cellText(cell)) === 'RODOD'))
  if (header < 0) return []
  const headerCells = rows[header].cells.map((cell) => headerKey(cellText(cell)))
  const blocks = headerCells.map((key, index) => (key === 'SRNO' ? index : -1)).filter((index) => index >= 0)
  const out: ChartRod[] = []
  for (const entry of rows.slice(header + 1)) {
    for (const start of blocks) {
      const sr = numberOf(entry.cells[start])
      const odText = cellText(entry.cells[start + 1]).replace(/\s+/g, ' ')
      const lengthMm = numberOf(entry.cells[start + 2])
      const quantity = numberOf(entry.cells[start + 3])
      if (sr === null || blank(odText) || lengthMm === null || quantity === null) continue
      const values = (odText.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
      if (!values.length) continue
      out.push({ srNo: sr, odText, odFrom: Math.min(...values), odTo: values.length > 1 ? Math.max(...values) : null, lengthMm: Math.round(lengthMm), quantity: Math.round(quantity) })
    }
  }
  return out
}

export async function parseChartWorkbook(buffer: Buffer): Promise<ParsedChart> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const warnings: string[] = []
  const sheets = workbook.worksheets.filter((sheet) => sheet.state !== 'hidden')
  if (sheets.some((sheet) => familyForSheet(sheet.name) && familyForSheet(sheet.name) !== 'sheet_plate')) {
    const moulds: ChartMould[] = []
    for (const sheet of sheets) {
      const family = familyForSheet(sheet.name)
      if (!family) continue
      moulds.push(...(family === 'sheet_plate' ? parsePlates(sheet) : parseFamilySheet(family, sheet, warnings)))
    }
    return { kind: 'die_chart', moulds, rods: [], warnings }
  }
  for (const sheet of sheets) {
    const rows = rowsOf(sheet).slice(0, 5)
    const headers = rows.flatMap((entry) => entry.cells.map((cell) => headerKey(cellText(cell))))
    if (headers.includes('CAVITY')) return { kind: 'cavity_list', moulds: parseCavityList(sheet), rods: [], warnings }
    if (headers.includes('RODOD')) return { kind: 'rod_stock', moulds: [], rods: parseRodStock(sheet), warnings }
  }
  throw new Error('[internal] unrecognised workbook')
}

export type ChartImportReport = { kind: ParsedChart['kind']; byFamily: Record<string, number>; created: number; updated: number; unchanged: number; duplicates: Array<{ dieNo: string; count: number }>; warnings: string[] }

function sortedJson(value: Record<string, number | string>): string {
  return JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]))
}

function same(row: Mould, item: ChartMould): boolean {
  return (
    row.dieNo === item.dieNo &&
    (row.description ?? null) === item.description &&
    sortedJson(row.dimensions ?? {}) === sortedJson(item.dimensions) &&
    (row.weightKg == null ? null : Number(row.weightKg)) === item.weightKg &&
    (row.cavities ?? null) === item.cavities &&
    (row.chartPage ?? null) === item.chartPage &&
    (row.customerRef ?? null) === item.customerRef &&
    (row.drawingNo ?? null) === item.drawingNo &&
    (row.size ?? null) === item.size
  )
}

export async function importChart(ctx: Scope, parsed: ParsedChart, options: { dryRun: boolean; byName: string | null; fileName: string }): Promise<ChartImportReport> {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const report: ChartImportReport = { kind: parsed.kind, byFamily: {}, created: 0, updated: 0, unchanged: 0, duplicates: [], warnings: [...parsed.warnings] }
  if (parsed.kind === 'rod_stock') {
    const existing = await ctx.em.find(RodStock, { ...scope, deletedAt: null })
    for (const item of parsed.rods) {
      report.byFamily.rod_stock = (report.byFamily.rod_stock ?? 0) + 1
      const row = existing.find((entry) => entry.srNo === item.srNo && entry.source === 'tube_rod_list')
      if (row) {
        const changed = row.odText !== item.odText || Number(row.odFrom) !== item.odFrom || (row.odTo == null ? null : Number(row.odTo)) !== item.odTo || row.lengthMm !== item.lengthMm || row.quantity !== item.quantity
        if (!changed) {
          report.unchanged += 1
          continue
        }
        report.updated += 1
        if (!options.dryRun) Object.assign(row, { odText: item.odText, odFrom: String(item.odFrom), odTo: item.odTo == null ? null : String(item.odTo), lengthMm: item.lengthMm, quantity: item.quantity })
      } else {
        report.created += 1
        if (!options.dryRun) ctx.em.persist(ctx.em.create(RodStock, { ...scope, srNo: item.srNo, odText: item.odText, odFrom: String(item.odFrom), odTo: item.odTo == null ? null : String(item.odTo), lengthMm: item.lengthMm, quantity: item.quantity, source: 'tube_rod_list', notes: options.fileName }))
      }
    }
    if (!options.dryRun) await ctx.em.flush()
    return report
  }
  const existing = await ctx.em.find(Mould, { ...scope, deletedAt: null })
  const counts = new Map<string, number>()
  for (const item of parsed.moulds) counts.set(item.dieNo.toUpperCase(), (counts.get(item.dieNo.toUpperCase()) ?? 0) + 1)
  report.duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([dieNo, count]) => ({ dieNo, count }))
  for (const item of parsed.moulds) {
    report.byFamily[item.family] = (report.byFamily[item.family] ?? 0) + 1
    const row = existing.find((entry) => entry.family === item.family && entry.chartNo === item.chartNo) ?? existing.find((entry) => !entry.family && entry.dieNo.toUpperCase() === item.dieNo.toUpperCase() && counts.get(item.dieNo.toUpperCase()) === 1)
    const values = {
      dieNo: item.dieNo,
      mouldType: item.mouldType,
      family: item.family,
      chartNo: item.chartNo,
      description: item.description,
      size: item.size,
      dimensions: item.dimensions,
      weightKg: item.weightKg == null ? null : String(item.weightKg),
      cavities: item.cavities,
      chartPage: item.chartPage,
      customerRef: item.customerRef,
      drawingNo: item.drawingNo,
      ...(item.finish ? { finish: item.finish } : {}),
    }
    if (row) {
      if (row.family === item.family && same(row, item)) {
        report.unchanged += 1
        continue
      }
      report.updated += 1
      if (!options.dryRun) {
        Object.assign(row, values)
        row.updatedByName = options.byName
      }
    } else {
      report.created += 1
      if (!options.dryRun) {
        const created = ctx.em.create(Mould, { ...scope, ...values, updatedByName: options.byName } as never)
        ctx.em.persist(created)
        existing.push(created as Mould)
      }
    }
  }
  if (!options.dryRun) await ctx.em.flush()
  return report
}

export function dimensionMatch(dimensions: Record<string, number | string> | null | undefined, wanted: Record<string, number>, tolerance: number): boolean {
  for (const [key, value] of Object.entries(wanted)) {
    const have = dimensions?.[key]
    if (typeof have !== 'number' || Math.abs(have - value) > tolerance) return false
  }
  return true
}
