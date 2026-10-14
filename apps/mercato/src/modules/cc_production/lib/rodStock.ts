export type RodStockInput = { srNo: number; odText: string; odFrom: number; odTo: number | null; lengthMm: number; quantity: number }

type Grid = unknown[][]

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const rich = value as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> }
    if (Array.isArray(rich.richText)) return rich.richText.map((part) => part.text).join('').trim()
    return text(rich.text ?? rich.result)
  }
  return String(value).replace(/\s+/g, ' ').trim()
}

function numbers(value: string): number[] {
  return (value.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
}

export function parseRodStock(rows: Grid): RodStockInput[] {
  const out: RodStockInput[] = []
  for (const row of rows) {
    for (let at = 0; at + 3 < row.length; at += 4) {
      const serial = text(row[at])
      if (!/^\d+$/.test(serial)) continue
      const odText = text(row[at + 1])
      const od = numbers(odText)
      const length = Number(text(row[at + 2]).replace(/,/g, ''))
      const quantity = Number(text(row[at + 3]).replace(/,/g, ''))
      if (!od.length || !Number.isFinite(length) || length <= 0 || !Number.isFinite(quantity)) continue
      const low = Math.min(...od)
      const high = Math.max(...od)
      out.push({ srNo: Number(serial), odText, odFrom: low, odTo: high === low ? null : high, lengthMm: Math.round(length), quantity: Math.round(quantity) })
    }
  }
  return out
}

export function looksLikeRodStock(rows: Grid): boolean {
  return rows.slice(0, 4).some((row) => row.some((cell) => /^rod\s*od$/i.test(text(cell))) && row.some((cell) => /^qty\.?$/i.test(text(cell))))
}

export type RodStockRow = { id: string; srNo: number | null; odText: string; odFrom: number; odTo: number | null; lengthMm: number; quantity: number }

export function findRods(rows: RodStockRow[], query: { od?: number; length?: number; lengthTolerance: number }): RodStockRow[] {
  return rows.filter((row) => {
    if (query.od !== undefined && !(query.od >= row.odFrom - 1e-9 && query.od <= (row.odTo ?? row.odFrom) + 1e-9)) return false
    if (query.length !== undefined && Math.abs(row.lengthMm - query.length) > query.lengthTolerance) return false
    return true
  })
}
