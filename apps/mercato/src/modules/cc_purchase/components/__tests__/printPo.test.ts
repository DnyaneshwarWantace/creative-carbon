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
  it('prints like the client PO: boxed grid, # instruction, delivery place, basic total, terms and warranty', () => {
    const html = buildPurchaseOrderHtml({ ...po, vendorAddress: 'Mumbai West' }, { name: 'Creative Carbon Composites Pvt. Ltd.', gstin: '24AAICC5600P1ZJ' })
    expect(html).toContain('TO-:')
    expect(html).toContain('>PURCHASE ORDER<')
    expect(html).toContain('CCCPL/F/PUR/03')
    expect(html).toContain('KETAN CHEMICAL')
    expect(html).toContain('MUMBAI WEST')
    expect(html).toContain('P.O NO- CCCPL/A/025/2026-27')
    expect(html).toContain('DATE- 08.10.2026')
    expect(html).toContain('OUR GST NO: 24AAICC5600P1ZJ')
    expect(html).toContain('RATE PER<br>(@)KGS')
    expect(html).toContain('BASIC AMT')
    expect(html).toContain('>#</td>')
    expect(html).toContain('PLEASE PROVIDE TEST CERTIFICATE ALONG WITH DELIVERY')
    expect(html).toContain('DELIVERY - KANERA PLANT')
    expect(html).toContain('TOTAL .RS :-</td><td class="c b">90000.00')
    expect(html).toContain('<b>TAXES-;</b> IGST EXTRA AS APPLICABLE')
    expect(html).toContain('<b>PAYMENT-:</b> ROUTINE')
    expect(html).toContain('GAURANTY/WARRANTY-: 12 MONTHS FROM SUPPLY')
    expect(html).not.toContain('THROUGH-:')
  })

  it('shows the supplier logo when there is one', () => {
    expect(buildPurchaseOrderHtml({ ...po, partyLogoUrl: 'data:image/png;base64,AAAA' })).toContain('data:image/png;base64,AAAA')
  })
})
