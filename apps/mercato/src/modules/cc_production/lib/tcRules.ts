export type TcCheck =
  | { kind: 'min'; value: number; strict?: boolean }
  | { kind: 'max'; value: number }
  | { kind: 'range'; nominal: number | 'thickness'; tolerance: number }
  | { kind: 'text' }

export type TcRow = {
  key: string
  property: string
  specified: string
  unit: string
  check: TcCheck
  optional?: boolean
}

export type TcObserved = Record<string, string>
export type TcRemark = 'OK' | 'Not OK' | ''

export function numbersIn(text: string): number[] {
  const found = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/g)
  return found ? found.map(Number) : []
}

export function specifiedText(row: TcRow, thicknessMm: number | null): string {
  if (row.check.kind === 'range' && row.check.nominal === 'thickness' && thicknessMm !== null) {
    return `${thicknessMm.toFixed(1)} ± ${row.check.tolerance.toFixed(2)} mm`
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
  if (nominal === null) return ''
  return values.every((value) => value >= nominal - check.tolerance - 1e-9 && value <= nominal + check.tolerance + 1e-9) ? 'OK' : 'Not OK'
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
