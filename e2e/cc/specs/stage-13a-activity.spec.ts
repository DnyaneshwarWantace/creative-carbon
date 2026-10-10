import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Item = { id: string; at: string; action: string; kind: string; summary: string | null; reason: string | null; changes: Array<{ field: string; label: string; from: unknown; to: unknown; money?: boolean }>; by: string | null; legacy: boolean }
type Page = { total: number; totalPages: number; counts: Record<string, number>; items: Item[]; error?: string }

async function timeline(request: APIRequestContext, type: string, id: string, extra = ''): Promise<Page> {
  return (await request.get(`/api/cc_audit/activity?type=${type}&id=${id}${extra}`)).json()
}

test.describe.serial('Phase A · one activity log and timeline for every record', () => {
  let vendorId: string

  test('a new vendor is logged with who and the details given', async ({ request }) => {
    const created = await request.post('/api/cc_vendors/vendors', { data: { name: `E2E13 Resins ${stamp}`, contactPhone: '9822011111', organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(created.status(), await created.text()).toBe(201)
    vendorId = ((await created.json()) as { id: string }).id
    const page = await timeline(request, 'vendor', vendorId)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ action: 'created', kind: 'change', legacy: false, by: expect.any(String) })
    expect(page.items[0].changes.map((change) => change.label)).toEqual(expect.arrayContaining(['Name', 'Phone', 'Vendor code']))
  })

  test('an edit stores only what changed, as old → new with the form labels', async ({ request }) => {
    const before = ((await (await request.get(`/api/cc_vendors/vendors?id=${vendorId}`)).json()) as { items: Array<{ updated_at: string }> }).items[0]
    const saved = await request.put('/api/cc_vendors/vendors', { data: { id: vendorId, contactPhone: '9822022222', paymentTerms: '45 days credit' }, headers: { [LOCK]: before.updated_at } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const page = await timeline(request, 'vendor', vendorId)
    const edit = page.items.find((item) => item.action === 'edited')!
    expect(edit.changes).toEqual([
      { field: 'contactPhone', label: 'Phone', from: '+919822011111', to: '+919822022222' },
      { field: 'paymentTerms', label: 'Payment terms', from: null, to: '45 days credit' },
    ])
    const nothing = await request.put('/api/cc_vendors/vendors', { data: { id: vendorId, contactPhone: '9822022222' } })
    expect(nothing.ok()).toBeTruthy()
    expect((await timeline(request, 'vendor', vendorId)).items.filter((item) => item.action === 'edited')).toHaveLength(1)
  })

  test('records with their own history (enquiry) and order events show in the same timeline', async ({ request }) => {
    const enquiry = await request.post('/api/cc_crm/enquiries', { data: { source: 'IndiaMART', receivedAt: new Date().toISOString(), companyName: `E2E13 Prospect ${stamp}`, contactName: 'Mr Shah', subject: 'Sheets' } })
    expect(enquiry.status(), await enquiry.text()).toBe(201)
    const enquiryId = ((await enquiry.json()) as { id: string }).id
    const enquiryPage = await timeline(request, 'enquiry', enquiryId)
    expect(enquiryPage.items.length).toBeGreaterThan(0)
    expect(enquiryPage.items.every((item) => item.legacy)).toBe(true)

    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E13 Buyer ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const order = await request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId, quantity: 10, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
    expect(order.status(), await order.text()).toBe(201)
    const orderId = ((await order.json()) as { id: string }).id
    const orderPage = await timeline(request, 'order', orderId)
    expect(orderPage.items.map((item) => item.action)).toEqual(expect.arrayContaining(['created']))
    expect(orderPage.items.every((item) => item.legacy)).toBe(true)
    const current = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { updatedAt: string }
    await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'e2e cleanup' }, headers: { [LOCK]: current.updatedAt } })
    const cancelled = await timeline(request, 'order', orderId, '&kind=correction')
    expect(cancelled.items.length).toBeGreaterThan(0)
    expect(cancelled.items.every((item) => item.kind === 'correction')).toBe(true)
  })

  test('the API refuses unknown types and pages over 100; another record id returns nothing', async ({ request }) => {
    expect((await request.get(`/api/cc_audit/activity?type=nothing&id=${vendorId}`)).status()).toBe(400)
    expect((await request.get(`/api/cc_audit/activity?type=vendor&id=${vendorId}&pageSize=101`)).status()).toBe(400)
    const other = await timeline(request, 'vendor', '00000000-0000-0000-0000-000000000000')
    expect(other.items).toEqual([])
  })

  test('cleanup', async ({ request }) => {
    expect((await request.delete(`/api/cc_vendors/vendors?id=${vendorId}`)).ok()).toBeTruthy()
  })
})
