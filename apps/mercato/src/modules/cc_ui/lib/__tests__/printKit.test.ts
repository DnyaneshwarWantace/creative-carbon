import { amountInWords, hsnSummary, letterheadHtml, partyLogoHtml, tallyDate } from '../printKit'
import { DEFAULT_LETTERHEAD } from '../../../cc_accounts/lib/letterhead'
import { formatSeriesCode, renderSeriesText } from '../../../cc_accounts/lib/numberSeries'

describe('print kit', () => {
  it('writes rupees in words the Indian way, like Tally', () => {
    expect(amountInWords(0)).toBe('INR Zero Only')
    expect(amountInWords(4567)).toBe('INR Four Thousand Five Hundred Sixty Seven Only')
    expect(amountInWords(72000)).toBe('INR Seventy Two Thousand Only')
    expect(amountInWords(245310)).toBe('INR Two Lakh Forty Five Thousand Three Hundred Ten Only')
    expect(amountInWords(101101)).toBe('INR One Lakh One Thousand One Hundred One Only')
    expect(amountInWords(10000000)).toBe('INR One Crore Only')
    expect(amountInWords(1234.5)).toBe('INR One Thousand Two Hundred Thirty Four and Fifty Paise Only')
  })

  it('groups tax by HSN and rate', () => {
    const rows = hsnSummary(
      [
        { hsn: '39269099', taxable: 1250.5, gstPercent: 18 },
        { hsn: '39269099', taxable: 3000, gstPercent: 18 },
      ],
      true,
    )
    expect(rows).toEqual([{ hsn: '39269099', taxable: 4250.5, rate: 18, cgst: 0, sgst: 0, igst: 765.09, tax: 765.09 }])
    const local = hsnSummary([{ hsn: '48239018', taxable: 1000, gstPercent: 18 }], false)
    expect(local[0]).toMatchObject({ cgst: 90, sgst: 90, igst: 0, tax: 180 })
  })

  it('prints dates as Tally does', () => {
    expect(tallyDate('2026-10-03')).toBe('3-Oct-26')
  })

  it('numbers documents in the client formats', () => {
    const date = new Date('2026-09-18T12:00:00')
    expect(renderSeriesText('CCPL/{FYFULL}/MS/', date)).toBe('CCPL/2026-2027/MS/')
    expect(formatSeriesCode({ prefix: 'CCCPL/A/', suffix: '/{FY2}', pad: 3, startAt: 1 }, 1, date)).toBe('CCCPL/A/001/2026-27')
    expect(formatSeriesCode({ prefix: '', suffix: '', pad: 3, startAt: 1 }, 14, date)).toBe('014')
    expect(renderSeriesText('{FY2}', new Date('2027-02-01T12:00:00'))).toBe('2026-27')
  })

  it('puts the uploaded logo, badges and company lines on the letterhead, and no image when none is uploaded', () => {
    const letterhead = { ...DEFAULT_LETTERHEAD, logoUrl: '/sample-logo.png', badgesUrl: '/sample-badges.png', cin: 'U00000GJ2000PTC000000' }
    const html = letterheadHtml({ name: 'Sample Laminates Pvt. Ltd.', gstin: '24AAAAA0000A1Z5', phone: '+91-00-00000000', email: 'accounts@example.com', website: 'www.example.com', letterhead }, 'http://x')
    expect(html).toContain('http://x/sample-logo.png')
    expect(html).toContain('http://x/sample-badges.png')
    expect(html).toContain('SAMPLE LAMINATES')
    expect(html).toContain('PVT. LTD.')
    expect(html).toContain('CIN U00000GJ2000PTC000000')
    expect(html).toContain('GSTIN : 24AAAAA0000A1Z5')
    expect(letterheadHtml({ name: 'X Y', letterhead: { ...letterhead, showBadges: false } }, 'http://x')).not.toContain('sample-badges.png')
    expect(letterheadHtml({ name: 'X Y', letterhead: DEFAULT_LETTERHEAD }, 'http://x')).not.toContain('<img')
  })
})

describe('party logo', () => {
  it('prints an uploaded image and nothing for other values', () => {
    expect(partyLogoHtml('data:image/png;base64,AAAA')).toContain('src="data:image/png;base64,AAAA"')
    expect(partyLogoHtml(null)).toBe('')
    expect(partyLogoHtml('javascript:alert(1)')).toBe('')
    expect(partyLogoHtml('https://example.com/x.png')).toBe('')
  })
})
