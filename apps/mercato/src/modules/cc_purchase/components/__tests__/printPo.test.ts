import { buildPurchaseOrderHtml } from '../printPo'
import type { PoView } from '../shared'

const po: PoView = {
  id: 'p1',
  code: 'CCCPL/A/025/2026-27',
  vendorId: 'v1',
  vendorName: 'KETAN CHEMICAL',
  vendorGstin: '24AAAAA0000A1Z5',
  vendorPhone: null,
  vendorContact: null,
  poDate: '2026-10-08',
  expectedDate: null,
  status: 'approved',
  notes: null,
  terms: 'Routine',
  printTerms: { specialInstruction: 'Please provide test certificate along with delivery', deliveryPlace: 'Kanera plant', taxes: 'IGST extra as applicable', guarantee: '12 months from supply' },
  orderRefs: [],
  createdByName: null,
  approvedByName: null,
  approvedAt: null,
  history: [],
  createdAt: '2026-10-08T00:00:00Z',
  updatedAt: '2026-10-08T00:00:00Z',
  lines: [{ id: 'l1', productId: 'x', title: 'Phenol', code: null, unit: 'KG', quantity: 1000, rate: 90, gstPercent: 18, amount: 90000, received: 0 }] as unknown as PoView['lines'],
  subtotal: 90000,
  gst: 16200,
  total: 106200,
  grns: [],
}

describe('purchase order print', () => {
  it('prints the form number, special instruction, terms and the warranty line, and leaves empty terms out', () => {
    const html = buildPurchaseOrderHtml(po, { name: 'Creative Carbon Composites Pvt. Ltd.' })
    expect(html).toContain('Form No. CCCPL/F/PUR/03')
    expect(html).toContain('PURCHASE ORDER')
    expect(html).toContain('Please provide test certificate along with delivery')
    expect(html).toContain('Kanera plant')
    expect(html).toContain('IGST extra as applicable')
    expect(html).toContain('12 months from supply')
    expect(html).toContain('INR One Lakh Six Thousand Two Hundred Only')
    expect(html).not.toContain('Through')
  })

  it('shows the supplier logo when there is one', () => {
    expect(buildPurchaseOrderHtml({ ...po, partyLogoUrl: 'data:image/png;base64,AAAA' })).toContain('data:image/png;base64,AAAA')
  })
})
