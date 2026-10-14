import { amountInWords, hsnSummary, letterheadHtml, tallyDate } from '../printKit'
import { DEFAULT_LETTERHEAD } from '../../../cc_accounts/lib/letterhead'
import { formatSeriesCode, renderSeriesText } from '../../../cc_accounts/lib/numberSeries'

describe('print kit', () => {
  it('writes rupees in words the Indian way, like Tally', () => {
    expect(amountInWords(0)).toBe('INR Zero Only')
    expect(amountInWords(9236)).toBe('INR Nine Thousand Two Hundred Thirty Six Only')
    expect(amountInWords(60546)).toBe('INR Sixty Thousand Five Hundred Forty Six Only')
    expect(amountInWords(164722)).toBe('INR One Lakh Sixty Four Thousand Seven Hundred Twenty Two Only')
    expect(amountInWords(110330)).toBe('INR One Lakh Ten Thousand Three Hundred Thirty Only')
    expect(amountInWords(10000000)).toBe('INR One Crore Only')
    expect(amountInWords(1234.5)).toBe('INR One Thousand Two Hundred Thirty Four and Fifty Paise Only')
  })

  it('groups tax by HSN and rate', () => {
    const rows = hsnSummary(
      [
        { hsn: '39269099', taxable: 4790, gstPercent: 18 },
        { hsn: '39269099', taxable: 46520, gstPercent: 18 },
      ],
      true,
    )
    expect(rows).toEqual([{ hsn: '39269099', taxable: 51310, rate: 18, cgst: 0, sgst: 0, igst: 9235.8, tax: 9235.8 }])
    const local = hsnSummary([{ hsn: '48239018', taxable: 1000, gstPercent: 18 }], false)
    expect(local[0]).toMatchObject({ cgst: 90, sgst: 90, igst: 0, tax: 180 })
  })

  it('prints dates as Tally does', () => {
    expect(tallyDate('2026-10-09')).toBe('9-Oct-26')
  })

  it('numbers documents in the client formats', () => {
    const date = new Date('2026-09-18T12:00:00')
    expect(renderSeriesText('CCPL/{FYFULL}/MS/', date)).toBe('CCPL/2026-2027/MS/')
    expect(formatSeriesCode({ prefix: 'CCCPL/A/', suffix: '/{FY2}', pad: 3, startAt: 1 }, 25, date)).toBe('CCCPL/A/025/2026-27')
    expect(formatSeriesCode({ prefix: '', suffix: '', pad: 3, startAt: 1 }, 14, date)).toBe('014')
    expect(renderSeriesText('{FY2}', new Date('2027-02-01T12:00:00'))).toBe('2026-27')
  })

  it('puts the logo, badges and company lines on the letterhead', () => {
    const html = letterheadHtml({ name: 'Creative Carbon Composites Pvt. Ltd.', gstin: '24AAICC5600P1ZJ', phone: '+91- 79-26585065', email: 'creativecarbon@gmail.com', website: 'www.phenlicsheet.in', letterhead: DEFAULT_LETTERHEAD }, 'http://x')
    expect(html).toContain('http://x/ccpl-logo.png')
    expect(html).toContain('http://x/ccpl-iso-badges.png')
    expect(html).toContain('CREATIVE CARBON')
    expect(html).toContain('COMPOSITES PVT. LTD.')
    expect(html).toContain('CIN U25209GJ2020PTC111813')
    expect(html).toContain('GSTIN : 24AAICC5600P1ZJ')
    expect(letterheadHtml({ name: 'X Y', letterhead: { ...DEFAULT_LETTERHEAD, showBadges: false } }, 'http://x')).not.toContain('badges.png')
  })
})
