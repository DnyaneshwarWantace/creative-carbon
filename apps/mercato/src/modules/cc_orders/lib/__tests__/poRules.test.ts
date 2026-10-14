import { acknowledgementDue, addDaysIso, earliestDelivery, nextAmendmentNo, openDocuments, termsOfDelivery } from '../poRules'

describe('customer PO rules', () => {
  it('asks for an acknowledgement 7 days after the PO date until it is acknowledged', () => {
    expect(addDaysIso('2026-09-28', 7)).toBe('2026-10-05')
    expect(acknowledgementDue('2026-09-28', null, '2026-10-01')).toEqual({ due: '2026-10-05', overdue: false, daysLeft: 4 })
    expect(acknowledgementDue('2026-09-28', null, '2026-10-09')).toMatchObject({ overdue: true, daysLeft: -4 })
    expect(acknowledgementDue('2026-09-28', '2026-09-30T10:00:00Z', '2026-10-09')).toEqual({ due: null, overdue: false, daysLeft: null })
    expect(acknowledgementDue(null, null, '2026-10-09').due).toBeNull()
  })

  it('finds the earliest line delivery and counts late lines only while the order is open', () => {
    const lines = [{ deliveryDate: '2026-11-20' }, { deliveryDate: '2026-10-05' }, { deliveryDate: null }]
    expect(earliestDelivery(lines, false, '2026-10-14')).toEqual({ earliest: '2026-10-05', lateCount: 1 })
    expect(earliestDelivery(lines, true, '2026-10-14').lateCount).toBe(0)
    expect(earliestDelivery([], false, '2026-10-14')).toEqual({ earliest: null, lateCount: 0 })
  })

  it('lists the documents still to send', () => {
    expect(openDocuments([{ key: 'tax_invoice', state: 'sent' }, { key: 'lr_copy', state: 'pending' }, { key: 'mtc', state: 'pending' }])).toEqual([
      { key: 'lr_copy', label: 'LR copy (lorry receipt)' },
      { key: 'mtc', label: 'Manufacturer test certificate (MTC)' },
    ])
    expect(openDocuments([])).toEqual([])
  })

  it('writes the terms of delivery for the invoice and skips empty parts', () => {
    expect(termsOfDelivery({ priceBasis: 'Ex Factory', freight: 'On actual', packingForwarding: 'Nil', insurance: null })).toBe('Ex Factory, Freight On actual, P&F Nil')
    expect(termsOfDelivery({ priceBasis: null, freight: null, packingForwarding: null, insurance: null })).toBeNull()
  })

  it('numbers amendments one after the last', () => {
    expect(nextAmendmentNo([])).toBe('1')
    expect(nextAmendmentNo([{ no: '1', date: null, note: null, byName: null, at: '' }, { no: '2', date: null, note: null, byName: null, at: '' }])).toBe('3')
  })
})
