import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const YEAR = 2008 + (stamp % 7)
const DAY = `${YEAR}-${String(1 + (stamp % 12)).padStart(2, '0')}-${String(1 + (stamp % 27)).padStart(2, '0')}`

type Invoice = {
  id: string
  code: string
  status: string
  interState: boolean
  placeOfSupply: string | null
  updatedAt: string
  lines: Array<{ gstPercent: number; igst: number; taxable: number }>
  totals: { taxable: number; gst: number; igst: number; payable: number }
  exportDetails: { supply: 'lut' | 'igst'; currency: string; exchangeRate: number | null; incoterm: string | null; portOfLoading: string | null; country: string | null; shippingBillNo: string | null } | null
  error?: string
}

async function get(request: APIRequestContext, id: string): Promise<Invoice> {
  return (await request.get(`/api/cc_accounts/invoices?id=${id}`)).json()
}

async function put(request: APIRequestContext, invoice: Invoice, body: Record<string, unknown>) {
  return request.put('/api/cc_accounts/invoices', { data: { id: invoice.id, ...body }, headers: { [LOCK]: invoice.updatedAt } })
}

test.describe.serial('Stage 11 · export invoice (LUT, currency, exchange rate, Tally in rupees)', () => {
  let invoiceId: string

  test('an export order gives a zero-rated export invoice with the shipment details from the order', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E11 Gulf Buyer ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(customer.ok(), await customer.text()).toBeTruthy()
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const created = await request.post('/api/cc_orders/orders', {
      data: { orderDate: DAY, customerId, market: 'export', incoterm: 'FOB', portOfLoading: 'Mundra', country: 'UAE', currency: 'USD', lines: [{ productId, quantity: 100, rate: 4.2, gstPercent: 18, specs: { material: { form: 'Sheet', grade: 'Fabric', weave: '10x10', sheet_size: '8x4', thickness_mm: '10' } } }] },
    })
    expect(created.status(), await created.text()).toBe(201)
    const orderId = ((await created.json()) as { id: string }).id
    const response = await request.post('/api/cc_accounts/invoices', { data: { orderId, invoiceDate: DAY } })
    expect(response.status(), await response.text()).toBe(201)
    const invoice = (await response.json()) as Invoice
    invoiceId = invoice.id
    expect(invoice.exportDetails).toMatchObject({ supply: 'lut', currency: 'USD', exchangeRate: null, incoterm: 'FOB', portOfLoading: 'Mundra', country: 'UAE' })
    expect(invoice.interState).toBe(true)
    expect(invoice.placeOfSupply).toMatch(/^96 Other countries/)
    expect(invoice.lines[0].gstPercent).toBe(0)
    expect(invoice.totals.gst).toBe(0)
    expect(invoice.totals.taxable).toBe(420)
  })

  test('it cannot be issued without the exchange rate', async ({ request }) => {
    const invoice = await get(request, invoiceId)
    const issue = await request.post('/api/cc_accounts/invoices/action', { data: { id: invoiceId, action: 'issue' }, headers: { [LOCK]: invoice.updatedAt } })
    expect(issue.status()).toBe(400)
    expect(((await issue.json()) as { error: string }).error).toMatch(/exchange rate/)
  })

  test('switching to "with IGST" puts 18% IGST on; back to LUT takes it off', async ({ request }) => {
    let invoice = await get(request, invoiceId)
    const igst = await put(request, invoice, { exportDetails: { supply: 'igst', exchangeRate: 83.25 } })
    expect(igst.ok(), await igst.text()).toBeTruthy()
    invoice = (await igst.json()) as Invoice
    expect(invoice.lines[0].gstPercent).toBe(18)
    expect(invoice.totals.igst).toBeCloseTo(75.6, 2)
    const lut = await put(request, invoice, { exportDetails: { supply: 'lut' } })
    expect(lut.ok(), await lut.text()).toBeTruthy()
    invoice = (await lut.json()) as Invoice
    expect(invoice.totals.gst).toBe(0)
    expect(invoice.exportDetails?.exchangeRate).toBe(83.25)
  })

  test('after issue: rate and GST are locked, the shipping bill can still be added', async ({ request }) => {
    let invoice = await get(request, invoiceId)
    const issue = await request.post('/api/cc_accounts/invoices/action', { data: { id: invoiceId, action: 'issue' }, headers: { [LOCK]: invoice.updatedAt } })
    expect(issue.ok(), await issue.text()).toBeTruthy()
    invoice = await get(request, invoiceId)
    const rate = await put(request, invoice, { exportDetails: { exchangeRate: 90 } })
    expect(rate.status()).toBe(409)
    invoice = await get(request, invoiceId)
    const sb = await put(request, invoice, { exportDetails: { shippingBillNo: '7712345', containerNo: 'MSKU1234567' } })
    expect(sb.ok(), await sb.text()).toBeTruthy()
    expect(((await sb.json()) as Invoice).exportDetails?.shippingBillNo).toBe('7712345')
  })

  test('Tally gets the export invoice in rupees on the Export Sales ledger, balanced', async ({ request }) => {
    const invoice = await get(request, invoiceId)
    const summary = (await (await request.get(`/api/cc_accounts/tally?from=${DAY}&to=${DAY}&kinds=sales&format=summary`)).json()) as { unbalanced: string[]; preview: Array<{ number: string; narration: string; entries: Array<{ ledger: string; amount: number }> }> }
    const voucher = summary.preview.find((entry) => entry.number === invoice.code)!
    expect(summary.unbalanced).not.toContain(invoice.code)
    const sales = voucher.entries.find((entry) => entry.ledger === 'Export Sales' || entry.ledger.toLowerCase().includes('export'))!
    expect(sales.amount).toBeCloseTo(420 * 83.25, 2)
    expect(voucher.narration).toMatch(/USD 420 @ ₹83.25/)
    expect(voucher.narration).toMatch(/SB 7712345/)
  })
})
