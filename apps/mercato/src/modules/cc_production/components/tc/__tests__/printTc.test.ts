import { buildTcHtml, type PrintableTc } from '../printTc'

const tc: PrintableTc = {
  code: 'CCCPL/2026-27/001',
  certDate: '2026-10-06',
  customerName: 'Sample Customer',
  productLabel: 'PHENOLIC SHEET',
  grade: 'P2',
  standard: 'IS 2036 : 1995',
  thicknessMm: 10,
  traceability: null,
  testedBy: 'Lab Person (Laboratory Department)',
  verifiedBy: 'Director Name (Director)',
  status: 'issued',
  rows: [{ property: 'Density', specified: '> 1.35', unit: 'gm/cc', observed: '1.40', remark: 'OK' }],
}

describe('test certificate print with a criteria column', () => {
  it('prints the criteria in the last column and the legend below', () => {
    const html = buildTcHtml({ ...tc, lastColumn: 'criteria', legend: [{ code: 'C-24/27/65', a: 'Conditioning 24 HRS', b: '27 DEG C', c: '65 HUMIDITY', result: 'CONFIRMS' }], rows: [{ property: 'Density', specified: '> 1.28', unit: 'gm/cc', observed: '1.30', remark: 'OK', criteria: 'C-24/27/65' }] }, null, false)
    expect(html).toContain('<th>Test Criteria</th>')
    expect(html).toContain('<td>C-24/27/65</td></tr></tbody></table>')
    expect(html).toContain('Conditioning 24 HRS')
    expect(html).toContain('CONFIRMS')
    expect(html).not.toContain('<td>OK</td>')
  })
})

describe('test certificate print', () => {
  it('prints the header lines the way the paper does', () => {
    const html = buildTcHtml(tc, null, false)
    expect(html).toContain('TEST CERTIFICATE')
    expect(html).toContain('– CCCPL/2026-27/001')
    expect(html).toContain('– 06.10.26')
    expect(html).toContain('– 10.0 MM')
    expect(html).toContain('Specified value as per<br>IS 2036 : 1995')
    expect(html).toContain('Tested By: &nbsp;Lab Person (Laboratory Department)')
    expect(html).toContain('Verified By: Director Name (Director)')
    expect(html).not.toContain('DRAFT')
  })

  it('marks a certificate that is not issued as a draft and escapes text', () => {
    const html = buildTcHtml({ ...tc, status: 'draft', customerName: '<b>X</b>' }, null, false)
    expect(html).toContain('DRAFT')
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })
})

describe('test certificate print with the customer logo', () => {
  it('shows the customer logo beside the header lines only when there is one', () => {
    expect(buildTcHtml({ ...tc, partyLogoUrl: 'data:image/png;base64,AAAA' }, null, false)).toContain('<div class="custlogo"><img class="plogo" src="data:image/png;base64,AAAA"')
    expect(buildTcHtml(tc, null, false)).not.toContain('custlogo"><img')
  })
})

describe('test certificate print with production traceability', () => {
  it('prints Production Traceability right under the TC No. like the client's P3 certificate', () => {
    const html = buildTcHtml({ ...tc, traceability: 'F/110/7/2026-27/' }, null, false)
    expect(html.indexOf('Production Traceability')).toBeGreaterThan(html.indexOf('TC No.'))
    expect(html.indexOf('Production Traceability')).toBeLessThan(html.indexOf('>Date<'))
  })
})
