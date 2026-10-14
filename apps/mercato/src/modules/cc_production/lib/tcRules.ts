export type TcCheck =
  | { kind: 'min'; value: number; strict?: boolean }
  | { kind: 'max'; value: number }
  | { kind: 'range'; nominal: number | 'thickness'; tolerance: number | 'by_thickness' }
  | { kind: 'text' }

export type TcRow = {
  key: string
  property: string
  specified: string
  unit: string
  check: TcCheck
  optional?: boolean
  criteria?: string
  defaultObserved?: string
}

export type TcLegendEntry = { code: string; a: string; b: string; c: string; result: string }
export type TcLastColumn = 'remark' | 'criteria'

export type TcObserved = Record<string, string>
export type TcRemark = 'OK' | 'Not OK' | ''

export function numbersIn(text: string): number[] {
  const found = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/g)
  return found ? found.map(Number) : []
}

export function thicknessTolerance(mm: number): number {
  if (mm <= 1) return 0.12
  if (mm <= 3) return 0.25
  if (mm <= 6) return 0.4
  if (mm <= 10) return 0.6
  if (mm <= 20) return 0.9
  if (mm <= 50) return 1.5
  return 2.5
}

function toleranceOf(check: Extract<TcCheck, { kind: 'range' }>, thicknessMm: number | null): number | null {
  if (check.tolerance === 'by_thickness') return thicknessMm === null ? null : thicknessTolerance(thicknessMm)
  return check.tolerance
}

export function specifiedText(row: TcRow, thicknessMm: number | null): string {
  if (row.check.kind === 'range' && row.check.nominal === 'thickness' && thicknessMm !== null) {
    const tolerance = toleranceOf(row.check, thicknessMm)
    if (tolerance !== null) return `${Number.isInteger(thicknessMm) && thicknessMm < 10 ? String(thicknessMm) : thicknessMm.toFixed(1)} ± ${tolerance.toFixed(2)} mm`
  }
  return row.specified
}

export function remarkFor(row: TcRow, observed: string | undefined, thicknessMm: number | null): TcRemark {
  const text = (observed ?? '').trim()
  if (!text) return row.optional ? 'OK' : ''
  const check = row.check
  if (check.kind === 'text') return 'OK'
  const values = numbersIn(text)
  if (!values.length) return 'Not OK'
  if (check.kind === 'min') {
    const first = values[0]
    return (check.strict ? first > check.value : first >= check.value) ? 'OK' : 'Not OK'
  }
  if (check.kind === 'max') return values[0] <= check.value ? 'OK' : 'Not OK'
  const nominal = check.nominal === 'thickness' ? thicknessMm : check.nominal
  const tolerance = toleranceOf(check, thicknessMm)
  if (nominal === null || tolerance === null) return ''
  return values.every((value) => value >= nominal - tolerance - 1e-9 && value <= nominal + tolerance + 1e-9) ? 'OK' : 'Not OK'
}

export function evaluateRows(rows: TcRow[], observed: TcObserved, thicknessMm: number | null): Array<{ row: TcRow; specified: string; observed: string; remark: TcRemark }> {
  return rows.map((row) => ({ row, specified: specifiedText(row, thicknessMm), observed: observed[row.key] ?? '', remark: remarkFor(row, observed[row.key], thicknessMm) }))
}

export function notOkRows(rows: TcRow[], observed: TcObserved, thicknessMm: number | null): TcRow[] {
  return evaluateRows(rows, observed, thicknessMm).filter((entry) => entry.remark === 'Not OK').map((entry) => entry.row)
}

export function missingRows(rows: TcRow[], observed: TcObserved, thicknessMm: number | null): TcRow[] {
  return evaluateRows(rows, observed, thicknessMm).filter((entry) => entry.remark === '').map((entry) => entry.row)
}

export const IS2036_STANDARD = 'IS 2036 : 1995'

export const P2_ROWS: TcRow[] = [
  { key: 'appearance', property: 'Appearance', specified: 'Smooth', unit: '--', check: { kind: 'text' } },
  { key: 'finish', property: 'Finish', specified: '', unit: '--', check: { kind: 'text' }, optional: true },
  { key: 'thickness', property: 'Thickness', specified: '± 0.60 mm', unit: 'Mm', check: { kind: 'range', nominal: 'thickness', tolerance: 0.6 } },
  { key: 'density', property: 'Density', specified: '> 1.35', unit: 'gm/cc', check: { kind: 'min', value: 1.35, strict: true } },
  { key: 'water', property: 'Water absorption\nAfter 24 hrs. immersion in Water', specified: '545', unit: 'mg., max.', check: { kind: 'max', value: 545 } },
  { key: 'oil', property: 'Oil absorption\nAfter 24 hrs. immersion in Hot Oil at 90°C', specified: '--', unit: 'mg., max.', check: { kind: 'text' } },
  { key: 'wear', property: 'Wear Resistance', specified: '350', unit: 'Cycles, min.', check: { kind: 'min', value: 350 } },
  { key: 'crossBreaking', property: 'Cross breaking strength', specified: '130', unit: 'N/mm², min.', check: { kind: 'min', value: 130 } },
  { key: 'tensile', property: 'Tensile strength', specified: '60', unit: 'N/mm², min.', check: { kind: 'min', value: 60 } },
  { key: 'compression', property: 'Compression strength', specified: '200', unit: 'N/mm², min.', check: { kind: 'min', value: 200 } },
  { key: 'insulationAir', property: 'Insulation resistance\nIn Air', specified: '--', unit: 'MΩ, min.', check: { kind: 'text' } },
  { key: 'insulationWater', property: 'Insulation resistance\nAfter 24 hrs. immersion in Water', specified: '100', unit: 'MΩ, min.', check: { kind: 'min', value: 100 } },
  { key: 'dielectric', property: 'Dielectric strength, Edgewise\nIn Hot Oil at 90°C', specified: '12', unit: 'KV', check: { kind: 'min', value: 12 } },
  { key: 'machinability', property: 'Machinability', specified: 'Drilling / Machining operation', unit: '--', check: { kind: 'text' } },
]

const C = 'C-24/27/65'
const E05 = 'E-0.5hrs/at 90 C'

export const P3_ROWS: TcRow[] = [
  { key: 'appearance', property: 'Appearance', specified: 'Smooth', unit: '--', check: { kind: 'text' }, criteria: C, defaultObserved: 'Smooth' },
  { key: 'finish', property: 'Finish', specified: '', unit: '--', check: { kind: 'text' }, criteria: C, defaultObserved: 'Moulded' },
  { key: 'thickness', property: 'Thickness', specified: '', unit: 'Mm', check: { kind: 'range', nominal: 'thickness', tolerance: 'by_thickness' }, criteria: C },
  { key: 'density', property: 'Density', specified: '> 1.28', unit: 'gm/cc', check: { kind: 'min', value: 1.28, strict: true }, criteria: C },
  { key: 'water', property: 'Water absorption\nAfter 24 hrs. immersion in Water', specified: '<1.20 %', unit: 'mg., max.', check: { kind: 'max', value: 1.2 }, criteria: C },
  { key: 'oil', property: 'Oil absorption\nAfter 24 hrs. immersion in Hot Oil at 90°C', specified: '--', unit: 'mg., max.', check: { kind: 'text' }, criteria: C },
  { key: 'flammability', property: 'Flammability', specified: 'FV-0', unit: 'Seconds', check: { kind: 'text' }, criteria: C, defaultObserved: 'Conforms' },
  { key: 'wear', property: 'Wear Resistance', specified: '350', unit: 'Cycles, min.', check: { kind: 'min', value: 350 }, criteria: C },
  { key: 'crossBreaking', property: 'Cross breaking strength', specified: '130', unit: 'MPa, min.', check: { kind: 'min', value: 130 }, criteria: C },
  { key: 'tensile', property: 'Tensile strength', specified: '100', unit: 'N/mm², min.', check: { kind: 'min', value: 100 }, criteria: C },
  { key: 'compression', property: 'Compression strength', specified: '120', unit: 'N/mm², min.', check: { kind: 'min', value: 120 }, criteria: C },
  { key: 'insulationAir', property: 'Insulation resistance\nIn Air', specified: '--', unit: 'MΩ, min.', check: { kind: 'text' }, criteria: C },
  { key: 'insulationWater', property: 'Insulation resistance\nAfter 24 hrs. immersion in Water', specified: '100', unit: 'MΩ, min.', check: { kind: 'min', value: 100 }, criteria: 'E-24/50 D-24/23' },
  { key: 'dielectricFlat', property: 'Dielectric strength, Perpendicular\n(Flatwise In Hot Oil at 90°C)', specified: '5.0', unit: 'KV/mm', check: { kind: 'min', value: 5 }, criteria: E05 },
  { key: 'dielectricEdge', property: 'Dielectric strength, Parallel\n(Edgewise In Hot Oil at 90°C)', specified: '25', unit: 'KV, min.', check: { kind: 'text' }, criteria: E05 },
  { key: 'machinability', property: 'Machinability', specified: 'Drilling / Machining operation', unit: '--', check: { kind: 'text' }, criteria: C, defaultObserved: 'Complied' },
]

export const P3_LEGEND: TcLegendEntry[] = [
  { code: 'C-24/27/65', a: 'Conditioning 24 HRS', b: '27 DEG C', c: '65 HUMIDITY', result: 'CONFIRMS' },
  { code: 'E-0.5hrs/at 90 C', a: 'AT ELEVATED TEMPERATURE', b: '½ HR CONDITIONING', c: '90 DEG C', result: 'CONFIRMS' },
  { code: 'E-24/50', a: 'AT ELEVATED TEMPERATURE', b: '50 DEG C', c: '24 HRS', result: 'CONFIRMS' },
  { code: 'D-24/23', a: 'IN DISTILL WATER', b: '24 HRS', c: '23 DEG C', result: 'CONFIRMS' },
]
