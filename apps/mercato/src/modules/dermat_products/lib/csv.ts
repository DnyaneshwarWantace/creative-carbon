export type CsvTable = { headers: string[]; rows: string[][] }

function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t']
  let best = ','
  let bestCount = -1
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

export function parseCsv(input: string): CsvTable {
  const text = input.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = detectDelimiter(firstLine)
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += char
    }
  }
  if (field.length || record.length) {
    record.push(field)
    records.push(record)
  }
  const nonEmpty = records.filter((row) => row.some((cell) => cell.trim().length))
  const [headerRow = [], ...rows] = nonEmpty
  return { headers: headerRow.map((header) => header.trim()), rows }
}

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '')
}
