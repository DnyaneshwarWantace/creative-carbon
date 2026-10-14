export type ChartImportRow = Record<string, string | number>
export type SheetGrid = { name: string; rows: unknown[][] }

const FAMILY_BY_SHEET: Array<{ test: RegExp; family: string }> = [
  { test: /in\s*side.*bearing/i, family: 'inside_bearing' },
  { test: /bearing/i, family: 'fibre_bearing' },
  { test: /key/i, family: 'fibre_key' },
  { test: /hanger/i, family: 'hanger' },
  { test: /plate/i, family: 'plate' },
]

const HEADER_KEY: Record<string, string> = {
  no: 'serialNo',
  codeno: 'code',
  r: 'r1',
  r1: 'r1',
  r2: 'r2',
  r3: 'r3',
  r4: 'r4',
  t: 't',
  k: 'k',
  l1: 'l1',
  l2: 'l2',
  w: 'w',
  h: 'h1',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  d: 'd',
  wtkg: 'weightKg',
  rf: 'customerRef',
  cutdwgno: 'cutDrawingNo',
}

const BLANK_MARK = /^[.…\s]*$/
const PAGE_MARK = /^page\s*(\d+)$/i

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const rich = value as { text?: unknown; richText?: Array<{ text: string }>; result?: unknown }
    if (Array.isArray(rich.richText)) return rich.richText.map((part) => part.text).join('').trim()
    if (rich.text !== undefined) return cellText(rich.text)
    if (rich.result !== undefined) return cellText(rich.result)
    return ''
  }
  const text = String(value).replace(/\s+/g, ' ').trim()
  return BLANK_MARK.test(text) ? '' : text
}

function headerKey(value: unknown): string {
  return cellText(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function weightParts(text: string): { weight: string; note: string } {
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  return match ? { weight: match[1], note: match[2].trim() } : { weight: '', note: text }
}

function splitCode(raw: unknown): { code: string; note: string } {
  const lines = String(raw ?? '').split(/\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line && !BLANK_MARK.test(line))
  return { code: lines[0] ?? '', note: lines.slice(1).join(' ') }
}

function convertTable(sheet: SheetGrid, family: string): ChartImportRow[] {
  const headerAt = sheet.rows.findIndex((row) => row.some((cell) => headerKey(cell) === 'codeno'))
  if (headerAt < 0) return []
  const keys = sheet.rows[headerAt].map((cell) => HEADER_KEY[headerKey(cell)] ?? '')
  const out: ChartImportRow[] = []
  let page = ''
  sheet.rows.forEach((row, index) => {
    if (index < headerAt) return
    for (const cell of row) {
      const marker = PAGE_MARK.exec(cellText(cell))
      if (marker) page = marker[1]
    }
    if (index === headerAt) return
    const item: ChartImportRow = { family }
    const notes: string[] = []
    keys.forEach((key, column) => {
      if (!key) return
      const raw = row[column]
      if (key === 'code') {
        const { code, note } = splitCode(typeof raw === 'string' ? raw : cellText(raw))
        item.code = code
        if (note) notes.push(note)
        return
      }
      const text = cellText(raw)
      if (!text) return
      if (key === 'weightKg') {
        const { weight, note } = weightParts(text)
        if (weight) item.weightKg = weight
        if (note) notes.push(note)
        return
      }
      item[key] = text
    })
    const filled = Object.keys(item).some((key) => !['family', 'serialNo', 'code'].includes(key))
    if (!item.code && item.serialNo && filled) item.code = `No code #${item.serialNo}`
    if (!item.code) return
    if (page) item.chartPage = page
    if (notes.length) item.note = notes.join(' · ')
    out.push(item)
  })
  return out
}

function convertPlates(sheet: SheetGrid): ChartImportRow[] {
  return sheet.rows.slice(1).flatMap((row) => {
    const code = cellText(row[0])
    if (!code) return []
    const item: ChartImportRow = { family: 'plate', code }
    const size = cellText(row[1])
    const quantity = cellText(row[3])
    if (size) item.size = size
    if (quantity) item.quantity = quantity
    return [item]
  })
}

export function convertChartWorkbook(sheets: SheetGrid[]): ChartImportRow[] {
  const out: ChartImportRow[] = []
  for (const sheet of sheets) {
    const family = FAMILY_BY_SHEET.find((entry) => entry.test.test(sheet.name))?.family
    if (!family) continue
    out.push(...(family === 'plate' ? convertPlates(sheet) : convertTable(sheet, family)))
  }
  return out
}

function rodDrawing(text: string): ChartImportRow | null {
  const match = text.match(/^(.*?)\s*\((.*)\)\s*$/)
  if (!match) return null
  const code = match[1].replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim()
  const spec = match[2]
  const length = spec.match(/LENGTH\s*-?\s*(\d+(?:\.\d+)?)/i)?.[1]
  const diameters = Array.from(spec.matchAll(/∅\s*(\d+(?:\.\d+)?)/g)).map((found) => found[1])
  const item: ChartImportRow = { family: 'rod', code }
  if (diameters[0]) item.od = diameters[0]
  if (diameters[1] && /∅\s*[\d.]+\s*X\s*∅/i.test(spec)) item.idDia = diameters[1]
  if (length) item.lengthMm = length
  if (diameters.length > 2 || (diameters.length === 2 && !item.idDia)) item.note = spec.replace(/\s*LENGTH.*$/i, '').trim()
  return item
}

function tubeFrom(row: unknown[], at: number): ChartImportRow | null {
  const serial = cellText(row[at])
  const od = cellText(row[at + 1])
  if (!/^\d+$/.test(serial) || !od) return null
  const item: ChartImportRow = { family: 'tube', serialNo: serial, code: `TUBE ${od.replace(/\s*,\s*/g, ',')}`, od }
  const length = cellText(row[at + 2])
  const cavities = cellText(row[at + 3])
  const customer = cellText(row[at + 4])
  if (length) item.lengthMm = length
  if (/^\d+$/.test(cavities)) item.cavities = cavities
  if (customer) item.customerRef = customer
  return item
}

export function convertCavityList(sheet: SheetGrid): ChartImportRow[] {
  const out: ChartImportRow[] = []
  for (const row of sheet.rows) {
    const serial = cellText(row[0])
    const drawing = typeof row[1] === 'string' ? row[1] : ''
    if (/^\d+$/.test(serial) && /ROD/i.test(drawing)) {
      const rod = rodDrawing(drawing.replace(/\s+/g, ' ').trim())
      if (rod) out.push({ ...rod, serialNo: serial })
    }
    for (const at of [5, 10]) {
      const tube = tubeFrom(row, at)
      if (tube) out.push(tube)
    }
  }
  return out
}

export function convertClientWorkbook(sheets: SheetGrid[]): ChartImportRow[] {
  const first = sheets[0]
  if (first && /cavity/i.test(cellText(first.rows[0]?.[1]))) return convertCavityList(first)
  return convertChartWorkbook(sheets)
}
