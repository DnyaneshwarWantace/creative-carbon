import { buildTcHtml, type PrintableTc } from '../printTc'

const tc: PrintableTc = {
  code: 'CCCPL/2026-27/051',
  certDate: '2026-10-06',
  customerName: 'RCPL',
  productLabel: 'PHENOLIC SHEET',
  grade: 'P2',
  standard: 'IS 2036 : 1995',
  thicknessMm: 10,
  traceability: null,
  testedBy: 'Vimal (Laboratory Department)',
  verifiedBy: 'Dhairya Shah (Director)',
  status: 'issued',
  rows: [{ property: 'Density', specified: '> 1.35', unit: 'gm/cc', observed: '1.40', remark: 'OK' }],
}

describe('test certificate print', () => {
  it('prints the header lines the way the paper does', () => {
    const html = buildTcHtml(tc, null, false)
    expect(html).toContain('TEST CERTIFICATE')
    expect(html).toContain('– CCCPL/2026-27/051')
    expect(html).toContain('– 06.10.26')
    expect(html).toContain('– 10.0 MM')
    expect(html).toContain('Specified value as per<br>IS 2036 : 1995')
    expect(html).toContain('Tested By: &nbsp;Vimal (Laboratory Department)')
    expect(html).toContain('Verified By: Dhairya Shah (Director)')
    expect(html).not.toContain('DRAFT')
  })

  it('marks a certificate that is not issued as a draft and escapes text', () => {
    const html = buildTcHtml({ ...tc, status: 'draft', customerName: '<b>X</b>' }, null, false)
    expect(html).toContain('DRAFT')
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })
})
