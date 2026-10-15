import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const SHOTS = process.env.CC_SHOTS_DIR

function gstin(stateCode: string): string {
  const letters = Array.from({ length: 5 }, (_, index) => CHARS[10 + ((stamp >> (index * 3)) % 26)]).join('')
  const digits = String(stamp % 10000).padStart(4, '0')
  const body = `${stateCode}${letters}${digits}Q1Z`
  let sum = 0
  for (let index = 0; index < 14; index += 1) {
    const product = CHARS.indexOf(body[index]) * (index % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return body + CHARS[(36 - (sum % 36)) % 36]
}

const GST = gstin('07')
const NAME = `Sample Traders E2E ${stamp}`

type Party = { name: string; address: string | null; gstin: string | null; pan: string | null; stateName: string | null; stateCode: string | null }
type Bill = { buyer: Party; consignee: Party; remarks: string | null; lineNotes: string[]; dispatchedThrough: string | null; destination: string | null; buyerOrderNo: string | null; paymentTerms: string | null; irn: string | null; ackNo: string | null; signedQr: string | null }
type Doc = { id: string; code: string; status: string; updatedAt: string; billDetails: Bill; ewayBillNo?: string | null }

async function get(request: APIRequestContext, kind: 'proformas' | 'invoices', id: string): Promise<Doc> {
  return (await request.get(`/api/cc_accounts/${kind}?id=${id}`)).json()
}

async function frameText(page: Page): Promise<string> {
  const frame = page.frameLocator('iframe').first()
  await expect(frame.locator('body')).toContainText('Description of Goods', { timeout: 30_000 })
  return (await frame.locator('body').innerText()).replace(/\s+/g, ' ')
}

test.describe.serial('Phases J and K · proforma and tax invoice in the Tally layout the client uses', () => {
  let orderId: string
  let lineIds: string[]
  let piId: string
  let invoiceId: string

  test('fixtures: a Delhi customer and a two-line laminate order like the client bill', async ({ request }) => {
    const customer = await request.post('/api/cc_customers/customers', {
      data: {
        category: 'business',
        name: NAME,
        legalName: NAME,
        gstType: 'registered',
        gstin: GST,
        phone: '9000000001',
        email: `sample-${stamp}@example.com`,
        paymentTerms: '30_days',
        billing: { street: 'Plot 7, Sample Industrial Area', district: 'New Delhi', state: 'Delhi', pin: '110020', country: 'India' },
        shipping: null,
        contacts: [],
      },
    })
    expect(customer.status(), await customer.text()).toBe(201)
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const created = await request.post('/api/cc_orders/orders', {
      data: {
        orderDate: '2026-10-05',
        customerId,
        paymentRemarks: '30 days credit',
        lines: [
          { productId, quantity: 610.25, rate: 125, gstPercent: 18, specs: { material: { form: 'Sheet', sheet_size: '8x4', thickness_mm: '1.2' } } },
          { productId, quantity: 240.5, rate: 125, gstPercent: 18, specs: { material: { form: 'Sheet', sheet_size: '8x4', thickness_mm: '2.5' } } },
        ],
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    orderId = ((await created.json()) as { id: string }).id
    lineIds = ((await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { lines: Array<{ id: string }> }).lines.map((line) => line.id)
  })

  test('a proforma is filled from the order and customer: parties, PAN, state code, item second lines, remarks', async ({ request }) => {
    const made = await request.post('/api/cc_accounts/proformas', { data: { orderId, piDate: '2026-09-20' } })
    expect(made.ok(), await made.text()).toBeTruthy()
    piId = ((await made.json()) as { id: string }).id
    const pi = await get(request, 'proformas', piId)
    expect(pi.code).toMatch(/^\d{3,}$/)
    expect(pi.billDetails.buyer).toMatchObject({ name: NAME.toUpperCase(), gstin: GST, pan: GST.slice(2, 12), stateName: 'Delhi', stateCode: '07' })
    expect(pi.billDetails.buyer.address).toContain('110020')
    expect(pi.billDetails.consignee.name).toBe(NAME.toUpperCase())
    expect(pi.billDetails.lineNotes).toEqual(['8X4X1.2MM', '8X4X2.5MM'])
    expect(pi.billDetails.buyerOrderNo).toBe('VERBAL')
    expect(pi.billDetails.paymentTerms).toBe('30 DAYS CREDIT')
    expect(pi.billDetails.remarks).toBe(`AS PER PROFORMA INVOICE N ${pi.code} DT 20 09 2026`)
  })

  test('bill details are edited and logged; the proforma prints in the Tally layout', async ({ request, page }) => {
    const pi = await get(request, 'proformas', piId)
    const saved = await request.put('/api/cc_accounts/proformas', { data: { id: piId, billDetails: { dispatchedThrough: 'TRANSPORT', destination: 'PLANT TO NEW DELHI', consignee: { address: 'Godown 2, Narela, Delhi' } } }, headers: { [LOCK]: pi.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const after = await get(request, 'proformas', piId)
    expect(after.billDetails).toMatchObject({ dispatchedThrough: 'TRANSPORT', destination: 'PLANT TO NEW DELHI' })
    expect(after.billDetails.consignee.address).toBe('Godown 2, Narela, Delhi')
    expect(after.billDetails.buyer.address).toContain('110020')
    const log = ((await (await request.get(`/api/cc_audit/activity?type=proforma&id=${piId}`)).json()) as { items: Array<{ action: string; changes: Array<{ field: string; to: unknown }> | null }> }).items
    expect(log.find((item) => item.action === 'bill_details')?.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'bill.destination', to: 'PLANT TO NEW DELHI' })]))
    await page.goto(`/backend/accounts/proformas/${piId}`)
    const text = await frameText(page)
    for (const part of ['Proforma Invoice', '(ORIGINAL FOR RECIPIENT)', 'CREATIVE CARBON COMPOSITES PRIVATE LIMITED', 'UDYAM', 'Consignee (Ship to)', 'Buyer (Bill to)', 'Place of Supply', 'Mode/Terms of Payment', 'Buyer’s Order No.', 'Dispatched through', 'TRANSPORT', 'PLANT TO NEW DELHI', '8X4X1.2MM', 'OUTPUT IGST - 18%', '1,06,343.75', 'Amount Chargeable (in words)', 'INR One Lakh Twenty Five Thousand Four Hundred', 'Tax Amount (in words)', 'Company’s PAN', 'Declaration', 'Company’s Bank Details', 'Authorised Signatory', 'This is a Computer Generated Invoice']) expect(text, part).toContain(part)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/proforma.png`, fullPage: true })
  })

  test('the tax invoice gets the bill-no remark, picks up the e-way bill, and keeps four copies', async ({ request }) => {
    const created = await request.post('/api/cc_accounts/invoices', { data: { orderId, invoiceDate: '2026-10-05', lines: lineIds.map((orderLineId, index) => ({ orderLineId, quantity: index === 0 ? 610.25 : 240.5 })) } })
    expect(created.status(), await created.text()).toBe(201)
    invoiceId = ((await created.json()) as { id: string }).id
    let doc = await get(request, 'invoices', invoiceId)
    expect(doc.code).toMatch(/^\d{3,}$/)
    expect(doc.billDetails.remarks).toBe(`AS PER BILL NO. ${doc.code} DT.05.10.2026`)
    const eway = await request.put('/api/cc_accounts/invoices', { data: { id: invoiceId, ewayBillNo: '100000000099' }, headers: { [LOCK]: doc.updatedAt } })
    expect(eway.ok(), await eway.text()).toBeTruthy()
    doc = await get(request, 'invoices', invoiceId)
    expect(doc.billDetails.remarks).toBe(`AS PER BILL NO. ${doc.code} DT.05.10.2026 - EWAY BILL NO.100000000099`)
    const issued = await request.post('/api/cc_accounts/invoices/action', { data: { id: invoiceId, action: 'issue' }, headers: { [LOCK]: doc.updatedAt } })
    expect(issued.ok(), await issued.text()).toBeTruthy()
    doc = await get(request, 'invoices', invoiceId)
    const irn = await request.put('/api/cc_accounts/invoices', { data: { id: invoiceId, billDetails: { irn: 'e2e0000000000000000000000000000000000000000000000000000000000001', ackNo: '100000000000001', ackDate: '2026-10-05', signedQr: 'eyJhbGciOiJSUzI1NiJ9.e2e-signed-qr.payload' } }, headers: { [LOCK]: doc.updatedAt } })
    expect(irn.ok(), await irn.text()).toBeTruthy()
    doc = await get(request, 'invoices', invoiceId)
    expect(doc.status).toBe('issued')
    expect(doc.billDetails).toMatchObject({ ackNo: '100000000000001', signedQr: 'eyJhbGciOiJSUzI1NiJ9.e2e-signed-qr.payload' })
  })

  test('the invoice page shows the e-Invoice block with the QR and the Tally layout', async ({ page }) => {
    await page.goto(`/backend/accounts/invoices/${invoiceId}`)
    const text = await frameText(page)
    for (const part of ['Tax Invoice', '(ORIGINAL FOR RECIPIENT)', 'e-Invoice', 'IRN', 'Ack No.', '100000000000001', 'Invoice No.', 'Delivery Note', 'Reference No. & Date.', 'Dispatch Doc No.', 'Delivery Note Date', 'Terms of Delivery', 'FABRIC 10X10 SHEET', '8X4X2.5MM', 'OUTPUT IGST - 18%', 'Total', '850.75 KG.', 'EWAY BILL NO.100000000099', 'INR One Lakh Twenty Five Thousand Four Hundred']) expect(text, part).toContain(part)
    await expect(page.frameLocator('iframe').first().locator('img[alt="e-Invoice QR"]')).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/invoice.png`, fullPage: true })
  })
})
