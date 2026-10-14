import { certificateGaps, judge, newCertificate, tcRowSchema, traceabilityFrom } from '../testCertificate'

describe('test certificate checks', () => {
  it('judges min, max, range and text rows like the client TCs', () => {
    expect(judge(tcRowSchema.parse({ property: 'Density', rule: 'min', min: 1.35, observed: '1.40' }))).toBe('OK')
    expect(judge(tcRowSchema.parse({ property: 'Density', rule: 'min', min: 1.35, observed: '1.30' }))).toBe('NOT OK')
    expect(judge(tcRowSchema.parse({ property: 'Water absorption', rule: 'max', max: 545, observed: '130' }))).toBe('OK')
    expect(judge(tcRowSchema.parse({ property: 'Thickness', rule: 'range', min: 9.4, max: 10.6, observed: '9.7 to 10.4' }))).toBe('OK')
    expect(judge(tcRowSchema.parse({ property: 'Thickness', rule: 'range', min: 9.4, max: 10.6, observed: '9.2 to 10.4' }))).toBe('NOT OK')
    expect(judge(tcRowSchema.parse({ property: 'Insulation', rule: 'min', min: 100, observed: '>2000' }))).toBe('OK')
    expect(judge(tcRowSchema.parse({ property: 'Dielectric', rule: 'text', observed: 'Pass at 25 KV' }))).toBe('OK')
    expect(judge(tcRowSchema.parse({ property: 'Density', rule: 'min', min: 1.35, observed: '' }))).toBe('')
  })

  it('builds the P2 template for 10 mm with the client thickness tolerance', () => {
    const tc = newCertificate({ templateKey: 'p2', tcNo: 'CCCPL/2026-27/051', lotRefs: 'F/03/10/2026 10mm P2', customer: 'RCPL', itemTitle: 'Phenolic sheet', thicknessMm: 10, testedBy: 'Vimal', verifiedBy: 'Dhairya Shah, Director' })
    expect(tc.rows.find((row) => row.property === 'Thickness')).toMatchObject({ specified: '10.0 ± 0.60 mm', min: 9.4, max: 10.6 })
    expect(tc.traceability).toBe('F/03/10/2026')
    expect(tc.lastColumn).toBe('remark')
    expect(certificateGaps(tc).missing.length).toBeGreaterThan(0)
    expect(traceabilityFrom('none')).toBe('')
  })

  it('builds the P3 template with the test-criteria column and legend', () => {
    const tc = newCertificate({ templateKey: 'p3', tcNo: '', lotRefs: null, customer: 'Sai Prasad', itemTitle: null, thicknessMm: 6, testedBy: '', verifiedBy: '' })
    expect(tc.lastColumn).toBe('criteria')
    expect(tc.legend.map((item) => item.code)).toEqual(['C-24/27/65', 'E-0.5hrs/at 90 C', 'E-24/50', 'D-24/23'])
    expect(tc.rows.find((row) => row.property === 'Thickness')?.specified).toBe('6 ± 0.4 mm')
  })
})
