import type { CoatingRow, CoatingSlot } from '../data/entities'

const DEFAULT_RESIN_FRACTION = 0.45

function kg3(value: number): number {
  return Math.round(value * 1000) / 1000
}

export type SheetFigures = {
  rows: Array<{ sn: number; consumedKg: number; bstageKg: number; resinKg: number; estimated: boolean }>
  rawTotal: number
  balanceTotal: number
  nosTotal: number
  outputTotal: number
  dbpTotal: number
  oleicTotal: number
  bstageTotal: number
  resinTotal: number
}

export function sheetFigures(rows: Array<Pick<CoatingRow, 'sn' | 'rawKg' | 'balanceRawKg' | 'coatedNos' | 'treatedWeight' | 'kushan' | 'rcPct'>>, slots: CoatingSlot[]): SheetFigures {
  const consumed = rows.map((row) => kg3(Math.max(0, row.rawKg - (row.balanceRawKg ?? 0))))
  const estimates = rows.map((row, index) => {
    if (row.treatedWeight && row.kushan) return consumed[index] * (row.treatedWeight / row.kushan)
    if (row.rcPct && row.rcPct < 100) return consumed[index] / (1 - row.rcPct / 100)
    return consumed[index] / (1 - DEFAULT_RESIN_FRACTION)
  })
  const outputTotal = kg3(slots.reduce((sum, slot) => sum + (slot.outputKg ?? 0), 0))
  const dbpTotal = kg3(slots.reduce((sum, slot) => sum + (slot.dbpKg ?? 0), 0))
  const oleicTotal = kg3(slots.reduce((sum, slot) => sum + (slot.oleicKg ?? 0), 0))
  const estimateTotal = estimates.reduce((sum, value) => sum + value, 0)
  const scale = outputTotal > 0 && estimateTotal > 0 ? outputTotal / estimateTotal : 1
  const bstage = estimates.map((value) => kg3(value * scale))
  if (outputTotal > 0 && bstage.length) {
    const drift = kg3(outputTotal - bstage.reduce((sum, value) => sum + value, 0))
    const last = bstage.length - 1
    bstage[last] = kg3(bstage[last] + drift)
  }
  const bstageTotal = kg3(bstage.reduce((sum, value) => sum + value, 0))
  const additives = dbpTotal + oleicTotal
  const resin = bstage.map((value, index) => kg3(Math.max(0, value - consumed[index] - (bstageTotal ? (additives * value) / bstageTotal : 0))))
  return {
    rows: rows.map((row, index) => ({ sn: row.sn, consumedKg: consumed[index], bstageKg: bstage[index], resinKg: resin[index], estimated: !(outputTotal > 0) })),
    rawTotal: kg3(rows.reduce((sum, row) => sum + row.rawKg, 0)),
    balanceTotal: kg3(rows.reduce((sum, row) => sum + (row.balanceRawKg ?? 0), 0)),
    nosTotal: rows.reduce((sum, row) => sum + row.coatedNos, 0),
    outputTotal,
    dbpTotal,
    oleicTotal,
    bstageTotal,
    resinTotal: kg3(resin.reduce((sum, value) => sum + value, 0)),
  }
}

