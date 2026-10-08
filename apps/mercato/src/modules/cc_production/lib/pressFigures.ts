import type { PressDaylight } from '../data/entities'

function kg3(value: number): number {
  return Math.round(value * 1000) / 1000
}

type DaylightLike = { sheets: Array<{ grade: string; thicknessMm: number; count?: number; weightKg: number }> }

export type SizeLine = { grade: string; thicknessMm: number; count: number; kg: number }

export function pressFigures(daylights: PressDaylight[] | DaylightLike[]) {
  const lines = new Map<string, SizeLine>()
  for (const daylight of daylights) {
    for (const sheet of daylight.sheets) {
      const key = `${sheet.grade}|${sheet.thicknessMm}`
      const line = lines.get(key) ?? { grade: sheet.grade, thicknessMm: Number(sheet.thicknessMm), count: 0, kg: 0 }
      line.count += Number(sheet.count ?? 1)
      line.kg = kg3(line.kg + Number(sheet.weightKg) * Number(sheet.count ?? 1))
      lines.set(key, line)
    }
  }
  const smallest = new Map<string, number>()
  for (const line of lines.values()) smallest.set(line.grade, Math.min(smallest.get(line.grade) ?? Infinity, line.thicknessMm))
  const sizeLines = [...lines.values()].sort((left, right) => (smallest.get(left.grade)! - smallest.get(right.grade)!) || left.grade.localeCompare(right.grade) || left.thicknessMm - right.thicknessMm)
  const totalSheets = sizeLines.reduce((sum, line) => sum + line.count, 0)
  const totalKg = kg3(sizeLines.reduce((sum, line) => sum + line.kg, 0))
  const byGrade = new Map<string, number>()
  for (const line of sizeLines) byGrade.set(line.grade, kg3((byGrade.get(line.grade) ?? 0) + line.kg))
  const paperLines = sizeLines.map((line, index) => `${line.thicknessMm}mm = ${line.count}${index === sizeLines.length - 1 ? `/${totalSheets}` : ''}`)
  return { sizeLines, paperLines, totalSheets, totalKg, kgByGrade: Object.fromEntries(byGrade) as Record<string, number> }
}

