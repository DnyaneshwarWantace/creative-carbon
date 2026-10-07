import type { FormulaLine } from '../types'

export function totalsOf(lines: FormulaLine[]) {
  const fixed = lines.filter((line) => !line.isBalance).reduce((sum, line) => sum + (Number(line.percent) || 0), 0)
  const balanceCount = lines.filter((line) => line.isBalance).length
  const balance = balanceCount ? Math.max(0, 100 - fixed) : 0
  const total = fixed + balance
  return { fixed: round(fixed), balance: round(balance), total: round(total), balanceCount, complete: Math.abs(total - 100) < 0.001 && fixed <= 100.001 && balanceCount <= 1 }
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function lineQuantity(line: FormulaLine, balance: number, batchSize: number | null): number | null {
  if (batchSize == null) return null
  const percent = line.isBalance ? balance : Number(line.percent) || 0
  return round((batchSize * percent) / 100, 3)
}

export function newLineId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function blankLine(partial: Partial<FormulaLine> = {}): FormulaLine {
  return { id: newLineId(), phase: null, productId: null, code: null, name: '', function: null, percent: 0, isBalance: false, note: null, ...partial }
}
