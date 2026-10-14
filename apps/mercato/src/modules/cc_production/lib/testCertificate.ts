import { z } from 'zod'

export const tcRowSchema = z.object({
  property: z.string().trim().min(1).max(200),
  condition: z.string().trim().max(200).default(''),
  specified: z.string().trim().max(120).default(''),
  unit: z.string().trim().max(40).default(''),
  rule: z.enum(['min', 'max', 'range', 'text']).default('text'),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  observed: z.string().trim().max(120).default(''),
  remark: z.string().trim().max(40).default(''),
  criteria: z.string().trim().max(80).default(''),
})

export const tcLegendSchema = z.object({ code: z.string().trim().max(40), a: z.string().trim().max(60).default(''), b: z.string().trim().max(60).default(''), c: z.string().trim().max(60).default(''), result: z.string().trim().max(40).default('CONFIRMS') })

export const certificateSchema = z.object({
  template: z.string().trim().max(40).default(''),
  tcNo: z.string().trim().max(80).default(''),
  traceability: z.string().trim().max(120).default(''),
  customer: z.string().trim().max(200).default(''),
  product: z.string().trim().max(200).default(''),
  grade: z.string().trim().max(40).default(''),
  thickness: z.string().trim().max(40).default(''),
  standard: z.string().trim().max(80).default('IS 2036 : 1995'),
  lastColumn: z.enum(['remark', 'criteria']).default('remark'),
  rows: z.array(tcRowSchema).max(40).default([]),
  legend: z.array(tcLegendSchema).max(12).default([]),
  testedBy: z.string().trim().max(120).default(''),
  verifiedBy: z.string().trim().max(120).default(''),
})

export type TcRow = z.infer<typeof tcRowSchema>
export type Certificate = z.infer<typeof certificateSchema>

type TemplateRow = Partial<TcRow> & Pick<TcRow, 'property'>

function row(input: TemplateRow): TcRow {
  return tcRowSchema.parse(input)
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

function thicknessRow(mm: number | null, criteria: string): TcRow {
  if (!mm) return row({ property: 'Thickness', unit: 'Mm', criteria })
  const tolerance = thicknessTolerance(mm)
  const shown = Number.isInteger(mm) && mm < 10 ? String(mm) : mm.toFixed(1)
  return row({ property: 'Thickness', specified: `${shown} ± ${tolerance.toFixed(tolerance < 0.5 && tolerance * 10 === Math.round(tolerance * 10) ? 1 : 2)} mm`, unit: 'Mm', rule: 'range', min: Math.round((mm - tolerance) * 100) / 100, max: Math.round((mm + tolerance) * 100) / 100, criteria })
}

const P2_ROWS = (mm: number | null): TcRow[] => [
  row({ property: 'Appearance', specified: 'Smooth', unit: '--', observed: 'Smooth' }),
  row({ property: 'Finish', unit: '--' }),
  thicknessRow(mm, ''),
  row({ property: 'Density', specified: '> 1.35', unit: 'gm/cc', rule: 'min', min: 1.35 }),
  row({ property: 'Water absorption', condition: 'After 24 hrs. immersion in Water', specified: '545', unit: 'mg., max.', rule: 'max', max: 545 }),
  row({ property: 'Oil absorption', condition: 'After 24 hrs. immersion in Hot Oil at 90°C', specified: '--', unit: 'mg., max.' }),
  row({ property: 'Wear Resistance', specified: '350', unit: 'Cycles, min.', rule: 'min', min: 350 }),
  row({ property: 'Cross breaking strength', specified: '130', unit: 'N/mm2, min.', rule: 'min', min: 130 }),
  row({ property: 'Tensile strength', specified: '60', unit: 'N/mm2, min.', rule: 'min', min: 60 }),
  row({ property: 'Compression strength', specified: '200', unit: 'N/mm2, min.', rule: 'min', min: 200 }),
  row({ property: 'Insulation resistance', condition: 'In Air', specified: '--', unit: 'MΩ, min.' }),
  row({ property: 'Insulation resistance', condition: 'After 24 hrs. immersion in Water', specified: '100', unit: 'MΩ, min.', rule: 'min', min: 100 }),
  row({ property: 'Dielectric strength, Edgewise', condition: 'In Hot Oil at 90°C', specified: '12', unit: 'KV', rule: 'text' }),
  row({ property: 'Machinability', specified: 'Drilling / Machining operation', unit: '--', observed: 'Complied' }),
]

const C = 'C-24/27/65'
const E05 = 'E-0.5hrs/at 90 C'

const P3_ROWS = (mm: number | null): TcRow[] => [
  row({ property: 'Appearance', specified: 'Smooth', unit: '--', observed: 'Smooth', criteria: C }),
  row({ property: 'Finish', unit: '--', observed: 'Moulded', criteria: C }),
  thicknessRow(mm, C),
  row({ property: 'Density', specified: '> 1.28', unit: 'gm/cc', rule: 'min', min: 1.28, criteria: C }),
  row({ property: 'Water absorption', condition: 'After 24 hrs. immersion in Water', specified: '<1.20 %', unit: 'mg., max.', rule: 'max', max: 1.2, criteria: C }),
  row({ property: 'Oil absorption', condition: 'After 24 hrs. immersion in Hot Oil at 90°C', specified: '--', unit: 'mg., max.', criteria: C }),
  row({ property: 'Flammability', specified: 'FV-0', unit: 'Seconds', observed: 'Conforms', criteria: C }),
  row({ property: 'Wear Resistance', specified: '350', unit: 'Cycles, min.', rule: 'min', min: 350, criteria: C }),
  row({ property: 'Cross breaking strength', specified: '130', unit: 'MPa, min.', rule: 'min', min: 130, criteria: C }),
  row({ property: 'Tensile strength', specified: '100', unit: 'N/mm2, min.', rule: 'min', min: 100, criteria: C }),
  row({ property: 'Compression strength', specified: '120', unit: 'N/mm2, min.', rule: 'min', min: 120, criteria: C }),
  row({ property: 'Insulation resistance', condition: 'In Air', specified: '--', unit: 'MΩ, min.', criteria: C }),
  row({ property: 'Insulation resistance', condition: 'After 24 hrs. immersion in Water', specified: '100', unit: 'MΩ, min.', rule: 'min', min: 100, criteria: 'E-24/50 D-24/23' }),
  row({ property: 'Dielectric strength, Perpendicular', condition: '(Flatwise In Hot Oil at 90°C)', specified: '5.0', unit: 'KV/mm', rule: 'min', min: 5, criteria: E05 }),
  row({ property: 'Dielectric strength, Parallel', condition: '(Edgewise In Hot Oil at 90°C)', specified: '25', unit: 'KV, min.', rule: 'text', criteria: E05 }),
  row({ property: 'Machinability', specified: 'Drilling / Machining operation', unit: '--', observed: 'Complied', criteria: C }),
]

const P3_LEGEND = [
  { code: 'C-24/27/65', a: 'Conditioning 24 HRS', b: '27 DEG C', c: '65 HUMIDITY', result: 'CONFIRMS' },
  { code: 'E-0.5hrs/at 90 C', a: 'AT ELEVATED TEMPERATURE', b: '½ HR CONDITIONING', c: '90 DEG C', result: 'CONFIRMS' },
  { code: 'E-24/50', a: 'AT ELEVATED TEMPERATURE', b: '50 DEG C', c: '24 HRS', result: 'CONFIRMS' },
  { code: 'D-24/23', a: 'IN DISTILL WATER', b: '24 HRS', c: '23 DEG C', result: 'CONFIRMS' },
]

export const TC_TEMPLATES: Array<{ key: string; label: string; grade: string; product: string; lastColumn: 'remark' | 'criteria'; rows: (mm: number | null) => TcRow[]; legend: Certificate['legend'] }> = [
  { key: 'p2', label: 'P2 phenolic sheet (remark column)', grade: 'P2', product: 'PHENOLIC SHEET', lastColumn: 'remark', rows: P2_ROWS, legend: [] },
  { key: 'p3', label: 'P3 paper phenolic sheet (test criteria column)', grade: 'P3', product: 'PAPER PHENOLIC SHEET', lastColumn: 'criteria', rows: P3_ROWS, legend: P3_LEGEND },
]

export function numbersIn(text: string): number[] {
  return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

export function judge(item: TcRow): 'OK' | 'NOT OK' | '' {
  const observed = item.observed.trim()
  if (!observed) return ''
  if (item.rule === 'text') return 'OK'
  const values = numbersIn(observed.replace(/^>\s*/, ''))
  if (!values.length) return 'OK'
  const low = Math.min(...values)
  const high = Math.max(...values)
  if (item.rule === 'min') return item.min == null || low >= item.min ? 'OK' : 'NOT OK'
  if (item.rule === 'max') return item.max == null || high <= item.max ? 'OK' : 'NOT OK'
  return (item.min == null || low >= item.min) && (item.max == null || high <= item.max) ? 'OK' : 'NOT OK'
}

export function withRemarks(certificate: Certificate): Certificate {
  return { ...certificate, rows: certificate.rows.map((item) => ({ ...item, remark: judge(item) })) }
}

export function certificateGaps(certificate: Certificate): { missing: string[]; failing: string[] } {
  const checked = withRemarks(certificate)
  return {
    missing: checked.rows.filter((item) => !item.observed.trim()).map((item) => [item.property, item.condition].filter(Boolean).join(' ')),
    failing: checked.rows.filter((item) => item.remark === 'NOT OK').map((item) => [item.property, item.condition].filter(Boolean).join(' ')),
  }
}

export function traceabilityFrom(lotRefs: string | null | undefined): string {
  const match = (lotRefs ?? '').match(/F\/[0-9A-Z]+\/[0-9]+\/[0-9]{4}/i)
  return match ? match[0] : ''
}

export function newCertificate(input: { templateKey: string; tcNo: string; lotRefs: string | null; customer: string | null; itemTitle: string | null; thicknessMm: number | null; testedBy: string; verifiedBy: string }): Certificate {
  const template = TC_TEMPLATES.find((entry) => entry.key === input.templateKey) ?? TC_TEMPLATES[0]
  return withRemarks(
    certificateSchema.parse({
      template: template.key,
      tcNo: input.tcNo,
      traceability: traceabilityFrom(input.lotRefs),
      customer: input.customer ?? '',
      product: template.product,
      grade: template.grade,
      thickness: input.thicknessMm ? `${input.thicknessMm} MM` : '',
      lastColumn: template.lastColumn,
      rows: template.rows(input.thicknessMm),
      legend: template.legend,
      testedBy: input.testedBy,
      verifiedBy: input.verifiedBy,
    }),
  )
}
