import { P2_ROWS, P3_ROWS, evaluateRows, missingRows, notOkRows, remarkFor, specifiedText } from '../tcRules'

const row = (key: string) => P2_ROWS.find((entry) => entry.key === key)!

describe('test certificate rules', () => {
  it('marks density against the strict minimum', () => {
    expect(remarkFor(row('density'), '1.40', 10)).toBe('OK')
    expect(remarkFor(row('density'), '1.30', 10)).toBe('Not OK')
    expect(remarkFor(row('density'), '1.35', 10)).toBe('Not OK')
  })

  it('takes the thickness band from the certificate thickness', () => {
    expect(specifiedText(row('thickness'), 10)).toBe('10.0 ± 0.60 mm')
    expect(remarkFor(row('thickness'), '9.7 to 10.4', 10)).toBe('OK')
    expect(remarkFor(row('thickness'), '9.3 to 10.4', 10)).toBe('Not OK')
    expect(remarkFor(row('thickness'), '6.2', 6)).toBe('OK')
  })

  it('reads the first number for minimum and maximum rows', () => {
    expect(remarkFor(row('water'), '130', 10)).toBe('OK')
    expect(remarkFor(row('water'), '600', 10)).toBe('Not OK')
    expect(remarkFor(row('dielectric'), 'Pass at 25 KV (Withstand for 1 minute)', 10)).toBe('OK')
    expect(remarkFor(row('insulationWater'), '1000', 10)).toBe('OK')
    expect(remarkFor(row('compression'), '251.48', 10)).toBe('OK')
  })

  it('accepts any entry on text rows and an empty optional row, but flags empty required rows', () => {
    expect(remarkFor(row('appearance'), 'Smooth', 10)).toBe('OK')
    expect(remarkFor(row('finish'), '', 10)).toBe('OK')
    expect(remarkFor(row('appearance'), '', 10)).toBe('')
    expect(remarkFor(row('tensile'), 'high', 10)).toBe('Not OK')
  })

  it('reproduces the RCPL P2 10 mm certificate: every row OK', () => {
    const observed = { appearance: 'Smooth', thickness: '9.7 to 10.4', density: '1.40', water: '130', oil: '10', wear: '500', crossBreaking: '150', tensile: '66.0', compression: '251.48', insulationAir: '>2000', insulationWater: '1000', dielectric: 'Pass at 25 KV (Withstand for 1 minute)', machinability: 'Complied' }
    const result = evaluateRows(P2_ROWS, observed, 10)
    expect(result.every((entry) => entry.remark === 'OK')).toBe(true)
    expect(notOkRows(P2_ROWS, observed, 10)).toHaveLength(0)
    expect(missingRows(P2_ROWS, observed, 10)).toHaveLength(0)
  })
})

describe('P3 paper phenolic certificate', () => {
  const p3 = (key: string) => P3_ROWS.find((entry) => entry.key === key)!

  it('takes the thickness band from the thickness table', () => {
    expect(specifiedText(p3('thickness'), 6)).toBe('6 ± 0.40 mm')
    expect(remarkFor(p3('thickness'), '5.8 to 6.3', 6)).toBe('OK')
    expect(remarkFor(p3('thickness'), '5.5', 6)).toBe('Not OK')
    expect(specifiedText(p3('thickness'), 10)).toBe('10.0 ± 0.60 mm')
  })

  it('judges the P3 limits', () => {
    expect(remarkFor(p3('density'), '1.30', 6)).toBe('OK')
    expect(remarkFor(p3('density'), '1.25', 6)).toBe('Not OK')
    expect(remarkFor(p3('tensile'), '100', 6)).toBe('OK')
    expect(remarkFor(p3('dielectricFlat'), '4.0', 6)).toBe('Not OK')
  })

  it('carries a criteria code on every row and a preset for the fixed observations', () => {
    expect(P3_ROWS.every((entry) => Boolean(entry.criteria))).toBe(true)
    expect(p3('machinability').defaultObserved).toBe('Complied')
  })
})
