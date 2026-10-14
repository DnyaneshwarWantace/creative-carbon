import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const SHOTS = process.env.CC_SHOTS_DIR

type CustomerPo = { poDate: string; amendmentNo: number; offerRef: string; vendorCode: string; buyerName: string; buyerPhone: string; buyerEmail: string; indentNo: string; indentDate: string; division: string; priceBasis: string; freight: string; packing: string; carrier: string; insurance: string; docsRequired: string[]; docsSent: string[]; acknowledged: boolean }
type Order = { id: string; updatedAt: string; revision: number; customerPoRef: string | null; customerPo: CustomerPo | null; lines: Array<{ id: string; quantity: number; specs: Record<string, Record<string, string>> }>; events: Array<{ note: string | null }> }

async function order(request: APIRequestContext, id: string): Promise<Order> {
  return (await request.get(`/api/cc_orders/orders?id=${id}`)).json()
}

const USHA: CustomerPo = {
  poDate: '2026-09-12',
  amendmentNo: 0,
  offerRef: 'CCCPL/100',
  vendorCode: '1106246931',
  buyerName: 'Gagan Gandha',
  buyerPhone: '01882-353229',
  buyerEmail: 'ggandha@example.com',
  indentNo: '',
  indentDate: '',
  division: 'Wire & Wire Ropes Division-North',
  priceBasis: 'EXW Ahmedabad',
  freight: 'Our transporter collects',
  packing: 'Nil',
  carrier: 'UML nominated transporter',
  insurance: 'Insurance by UML on despatch intimation',
  docsRequired: ['Original tax invoice', 'E-way bill', 'LR copy', 'Packing list', 'Test certificate'],
  docsSent: [],
  acknowledged: false,
}

test.describe.serial('Phase L · customer PO details on the order, like the Usha Martin PO', () => {
  let orderId: string

  test('fixtures: an order booked from the PO', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `Usha Martin E2E ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const created = await request.post('/api/cc_orders/orders', { data: { orderDate: '2026-09-13', customerId, customerPoRef: '4115020675', lines: [{ productId: products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id, quantity: 120, rate: 700, gstPercent: 18, specs: { material: { form: 'Sheet', grade: 'F3', thickness_mm: '135' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    orderId = ((await created.json()) as { id: string }).id
  })

  test('the PO header, documents asked for and the line item code are saved and logged', async ({ request }) => {
    let current = await order(request, orderId)
    const saved = await request.put('/api/cc_orders/orders/customer-po', { data: { id: orderId, customerPo: USHA, lines: [{ lineId: current.lines[0].id, itemCode: '1300113093', description: "HYLUM SHEET 4' X 4', THICKNESS-135MM, GRADE F3", deliveryDate: '2026-10-14' }] }, headers: { [LOCK]: current.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    current = await order(request, orderId)
    expect(current.customerPo).toMatchObject({ poDate: '2026-09-12', offerRef: 'CCCPL/100', vendorCode: '1106246931', docsRequired: USHA.docsRequired })
    expect(current.lines[0].specs.customer).toEqual({ item_code: '1300113093', description: "HYLUM SHEET 4' X 4', THICKNESS-135MM, GRADE F3", delivery_date: '2026-10-14' })
    const log = ((await (await request.get(`/api/cc_audit/activity?type=order&id=${orderId}`)).json()) as { items: Array<{ action: string; changes: Array<{ field: string; to: unknown }> | null }> }).items
    expect(log.find((item) => item.action === 'customer_po')?.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'po.vendorCode', to: '1106246931' })]))
  })

  test('editing the order keeps the line item code', async ({ request }) => {
    const current = await order(request, orderId)
    const full = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as Record<string, unknown> & { lines: Array<{ productId: string; quantity: number; rate: number; gstPercent: number; specs: Record<string, Record<string, string>> }> }
    const edited = await request.put('/api/cc_orders/orders', { data: { id: orderId, orderDate: '2026-09-13', customerId: full.customerId, customerPoRef: '4115020675', productRemarks: 'Grade F3', revisionNote: 'Grade noted from the PO', lines: full.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, rate: line.rate, gstPercent: line.gstPercent, specs: { material: line.specs.material } })) }, headers: { [LOCK]: current.updatedAt } })
    expect(edited.ok(), await edited.text()).toBeTruthy()
    expect((await order(request, orderId)).lines[0].specs.customer?.item_code).toBe('1300113093')
  })

  test('an amendment needs a note and raises the order revision', async ({ request }) => {
    let current = await order(request, orderId)
    const lines = [{ lineId: current.lines[0].id, itemCode: '1300113093', description: '', deliveryDate: '2026-10-20' }]
    const noNote = await request.put('/api/cc_orders/orders/customer-po', { data: { id: orderId, customerPo: { ...current.customerPo, amendmentNo: 1 }, lines }, headers: { [LOCK]: current.updatedAt } })
    expect(noNote.status()).toBe(400)
    const before = current.revision
    const amended = await request.put('/api/cc_orders/orders/customer-po', { data: { id: orderId, customerPo: { ...current.customerPo, amendmentNo: 1, acknowledged: true }, lines, amendmentNote: 'Delivery moved to 20 Oct' }, headers: { [LOCK]: current.updatedAt } })
    expect(amended.ok(), await amended.text()).toBeTruthy()
    current = await order(request, orderId)
    expect(current.revision).toBe(before + 1)
    expect(current.events.some((event) => (event.note ?? '').includes('PO amendment 1: Delivery moved to 20 Oct'))).toBeTruthy()
  })

  test('a new tax invoice carries the PO date, vendor code, terms and carrier', async ({ request }) => {
    const current = await order(request, orderId)
    const created = await request.post('/api/cc_accounts/invoices', { data: { orderId, invoiceDate: '2026-10-09', lines: [{ orderLineId: current.lines[0].id, quantity: 120 }] } })
    expect(created.status(), await created.text()).toBe(201)
    const invoiceId = ((await created.json()) as { id: string }).id
    const invoice = (await (await request.get(`/api/cc_accounts/invoices?id=${invoiceId}`)).json()) as { billDetails: { buyerOrderNo: string; buyerOrderDate: string; otherReferences: string | null; termsOfDelivery: string | null; dispatchedThrough: string | null } }
    expect(invoice.billDetails).toMatchObject({ buyerOrderNo: '4115020675', buyerOrderDate: '2026-09-12', otherReferences: 'Vendor code 1106246931', dispatchedThrough: 'UML nominated transporter' })
    expect(invoice.billDetails.termsOfDelivery).toContain('EXW AHMEDABAD')
  })

  test('the order page shows the Customer PO tab and the documents still to send', async ({ page }) => {
    await page.goto(`/backend/orders/${orderId}`)
    await expect(page.getByText(/The PO asks for:|Acknowledge the customer PO/).first()).toBeVisible({ timeout: 30_000 }).catch(() => undefined)
    await page.getByRole('radio', { name: 'Customer PO' }).or(page.getByRole('tab', { name: 'Customer PO' })).first().click()
    await expect(page.getByLabel('Our vendor code with them')).toHaveValue('1106246931')
    await expect(page.getByText('5 documents to send')).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/customer-po.png`, fullPage: true })
  })
})
