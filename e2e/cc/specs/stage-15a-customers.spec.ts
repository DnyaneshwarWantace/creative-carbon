import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Item = { action: string; kind: string; reason: string | null; summary: string | null; source: string; changes: Array<{ field: string; label: string; from: unknown; to: unknown }> }

function customerBody(name: string, phone: string) {
  return { name, gstType: 'unregistered', phone, billing: { street: '12 GIDC', district: 'Vadodara', state: 'Gujarat', pin: '390010', country: 'India' }, contacts: [] }
}

async function create(request: APIRequestContext, name: string, phone: string, extra: Record<string, unknown> = {}): Promise<string> {
  const response = await request.post('/api/cc_customers/customers', { data: { ...customerBody(name, phone), ...extra } })
  expect(response.status(), await response.text()).toBe(201)
  return ((await response.json()) as { id: string }).id
}

async function version(request: APIRequestContext, id: string): Promise<string> {
  const rows = (await (await request.get(`/api/customers/companies?id=${id}&pageSize=1`)).json()) as { items: Array<{ updated_at: string; status?: string | null }> }
  return rows.items[0].updated_at
}

async function timeline(request: APIRequestContext, id: string, kind?: string): Promise<Item[]> {
  return ((await (await request.get(`/api/cc_audit/activity?type=customer&id=${id}${kind ? `&kind=${kind}` : ''}`)).json()) as { items: Item[] }).items
}

async function order(request: APIRequestContext, customerId: string, productId: string) {
  return request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId, quantity: 5, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
}

async function action(request: APIRequestContext, data: Record<string, unknown>) {
  return request.post('/api/cc_customers/customers/action', { data })
}

test.describe.serial('Phase C · customer: change history, inactive, merge', () => {
  let productId: string
  let keepId: string
  let dupId: string
  let otherId: string
  const orders: string[] = []
  const invoices: string[] = []

  test('creating and editing a customer is logged with every change old → new', async ({ request }) => {
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    keepId = await create(request, `E2E15 Keep ${stamp}`, '9822066661')
    const created = await timeline(request, keepId)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ action: 'created', summary: 'Created from the customer form' })
    expect(created[0].changes.map((change) => change.label)).toEqual(expect.arrayContaining(['Name', 'Phone', 'Billing address']))
    const saved = await request.put('/api/cc_customers/customers', { data: { id: keepId, ...customerBody(`E2E15 Keep ${stamp}`, '9822066662'), salesManager: 'Ravi' }, headers: { [LOCK]: await version(request, keepId) } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const edit = (await timeline(request, keepId)).find((item) => item.action === 'edited')!
    expect(edit.changes).toEqual([
      { field: 'phone', label: 'Phone', from: '+919822066661', to: '+919822066662' },
      { field: 'salesManager', label: 'Sales manager', from: null, to: 'Ravi' },
    ])
    dupId = await create(request, `E2E15 Keep Dup ${stamp}`, '9822066663', { source: 'import' })
    expect((await timeline(request, dupId))[0]).toMatchObject({ summary: 'Created from the Excel import', source: 'upload' })
  })

  test('a customer with an open order cannot be set inactive; merging moves the order and hides the duplicate', async ({ request }) => {
    const booked = await order(request, dupId, productId)
    expect(booked.status(), await booked.text()).toBe(201)
    const orderId = ((await booked.json()) as { id: string }).id
    orders.push(orderId)
    expect((await action(request, { id: dupId, action: 'deactivate' })).status()).toBe(400)
    const blocked = await action(request, { id: dupId, action: 'deactivate', reason: 'Duplicate entry' })
    expect(blocked.status()).toBe(409)
    expect(((await blocked.json()) as { error: string }).error).toMatch(/still open/)
    const merged = await action(request, { id: keepId, action: 'merge', mergeId: dupId, reason: 'Same company typed twice' })
    expect(merged.ok(), await merged.text()).toBeTruthy()
    expect(((await merged.json()) as { moved: string[] }).moved).toEqual(['1 orders'])
    const moved = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { customerId: string }
    expect(moved.customerId).toBe(keepId)
    expect((await timeline(request, keepId, 'correction')).find((item) => item.action === 'merged_in')?.reason).toBe('Same company typed twice')
    expect((await timeline(request, dupId, 'correction')).map((item) => item.action)).toContain('merged_away')
    const refused = await order(request, dupId, productId)
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/merged/)
  })

  test('set inactive once nothing is open: hidden from new orders until set active again', async ({ request }) => {
    const current = (await (await request.get(`/api/cc_orders/orders?id=${orders[0]}`)).json()) as { updatedAt: string }
    expect((await request.post('/api/cc_orders/orders/cancel', { data: { id: orders[0], reason: 'e2e: free the customer' }, headers: { [LOCK]: current.updatedAt } })).ok()).toBeTruthy()
    const off = await action(request, { id: keepId, action: 'deactivate', reason: 'Company closed its Vadodara unit' })
    expect(off.ok(), await off.text()).toBeTruthy()
    const refused = await order(request, keepId, productId)
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/inactive/)
    const on = await action(request, { id: keepId, action: 'activate', reason: 'They reopened' })
    expect(on.ok(), await on.text()).toBeTruthy()
    const corrections = await timeline(request, keepId, 'correction')
    expect(corrections.find((item) => item.action === 'deactivated')?.changes).toEqual([{ field: 'status', label: 'Status', from: 'active', to: 'inactive' }])
  })

  test('two customers with invoices in the same month cannot be merged', async ({ request }) => {
    otherId = await create(request, `E2E15 Other ${stamp}`, '9822066664')
    for (const customerId of [keepId, otherId]) {
      const booked = await order(request, customerId, productId)
      expect(booked.status(), await booked.text()).toBe(201)
      const orderId = ((await booked.json()) as { id: string }).id
      orders.push(orderId)
      const invoice = await request.post('/api/cc_accounts/invoices', { data: { orderId, invoiceDate: today } })
      expect(invoice.status(), await invoice.text()).toBe(201)
      invoices.push(((await invoice.json()) as { id: string }).id)
    }
    const clash = await action(request, { id: keepId, action: 'merge', mergeId: otherId, reason: 'Same group' })
    expect(clash.status()).toBe(409)
    expect(((await clash.json()) as { error: string }).error).toMatch(/same month|invoices in/)
  })

  test('cleanup', async ({ request }) => {
    for (const id of invoices) {
      const doc = (await (await request.get(`/api/cc_accounts/invoices?id=${id}`)).json()) as { updatedAt: string }
      await request.post('/api/cc_accounts/invoices/action', { data: { id, action: 'cancel', reason: 'e2e cleanup' }, headers: { [LOCK]: doc.updatedAt } })
    }
    for (const id of orders.slice(1)) {
      const current = (await (await request.get(`/api/cc_orders/orders?id=${id}`)).json()) as { updatedAt: string }
      await request.post('/api/cc_orders/orders/cancel', { data: { id, reason: 'e2e cleanup' }, headers: { [LOCK]: current.updatedAt } })
    }
  })
})
