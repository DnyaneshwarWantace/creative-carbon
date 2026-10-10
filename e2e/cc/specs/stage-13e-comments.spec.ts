import { expect, test, type APIRequestContext } from '@playwright/test'

const BASE = process.env.CC_BASE_URL ?? 'http://localhost:3010'
const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const PASSWORD = 'Notify!Test9pass'
const accountsEmail = `e2e-notify-acc-${stamp}@example.com`
const crmEmail = `e2e-notify-crm-${stamp}@example.com`

type Notice = { type: string; title: string; body: string | null; linkHref: string | null; sourceEntityId: string | null }

async function loginAs(playwright: { request: { newContext: (options: { baseURL: string }) => Promise<APIRequestContext> } }, email: string) {
  const context = await playwright.request.newContext({ baseURL: BASE })
  const response = await context.post('/api/auth/login', { data: { email, password: PASSWORD } })
  expect(response.status(), await response.text()).toBeLessThan(400)
  return context
}

async function notices(context: APIRequestContext, type: string, sourceEntityId: string): Promise<Notice[]> {
  const response = await context.get(`/api/notifications?type=${type}&sourceEntityId=${sourceEntityId}&pageSize=50`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return ((await response.json()) as { items: Notice[] }).items
}

test.describe.serial('Phase A · comments with @mention, and the maker is told when a record is corrected', () => {
  let accountsId: string
  let crmId: string
  let vendorId: string
  let orderId: string
  let paymentId: string

  test('fixtures: an accounts user, a CRM-only user and a vendor', async ({ request }) => {
    const accounts = await request.post('/api/auth/users', { data: { email: accountsEmail, name: `E2E Notify Accounts ${stamp}`, password: PASSWORD, organizationId: process.env.CC_ORG, roles: ['Accounts'] } })
    expect(accounts.status(), await accounts.text()).toBeLessThan(300)
    const crm = await request.post('/api/auth/users', { data: { email: crmEmail, name: `E2E Notify Crm ${stamp}`, password: PASSWORD, organizationId: process.env.CC_ORG, roles: ['Sales (CRM)'] } })
    expect(crm.status(), await crm.text()).toBeLessThan(300)
    const people = ((await (await request.get('/api/cc_audit/people')).json()) as { items: Array<{ id: string; name: string }> }).items
    accountsId = people.find((person) => person.name === `E2E Notify Accounts ${stamp}`)!.id
    crmId = people.find((person) => person.name === `E2E Notify Crm ${stamp}`)!.id
    const vendor = await request.post('/api/cc_vendors/vendors', { data: { name: `E2E13 Notify ${stamp}`, contactPhone: '9822044444', organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(vendor.status(), await vendor.text()).toBe(201)
    vendorId = ((await vendor.json()) as { id: string }).id
  })

  test('a comment lands in the timeline; only mentioned people who can open the record are notified', async ({ request, playwright }) => {
    expect((await request.post('/api/cc_audit/comments', { data: { type: 'vendor', id: vendorId, text: '   ' } })).status()).toBe(400)
    const text = `@E2E Notify Accounts ${stamp} please check the GST number; @E2E Notify Crm ${stamp} FYI`
    const sent = await request.post('/api/cc_audit/comments', { data: { type: 'vendor', id: vendorId, text, mentions: [accountsId, crmId] } })
    expect(sent.status(), await sent.text()).toBe(201)
    expect(((await sent.json()) as { notified: string[] }).notified).toEqual([accountsId])
    const timeline = (await (await request.get(`/api/cc_audit/activity?type=vendor&id=${vendorId}&kind=comment`)).json()) as { items: Array<{ summary: string; by: string | null; links: Array<{ type: string; id: string }> }> }
    expect(timeline.items).toHaveLength(1)
    expect(timeline.items[0]).toMatchObject({ summary: text, by: expect.any(String) })
    expect(timeline.items[0].links.map((link) => link.id)).toEqual([accountsId, crmId])
    const accounts = await loginAs(playwright, accountsEmail)
    const mine = await notices(accounts, 'cc_audit.comment.mentioned', vendorId)
    expect(mine).toHaveLength(1)
    expect(mine[0].linkHref).toBe(`/backend/cc_vendors/${vendorId}`)
    expect(mine[0].body).toContain('GST number')
    await accounts.dispose()
    const crm = await loginAs(playwright, crmEmail)
    expect(await notices(crm, 'cc_audit.comment.mentioned', vendorId)).toHaveLength(0)
    expect((await crm.post('/api/cc_audit/comments', { data: { type: 'vendor', id: vendorId, text: 'not mine' } })).status()).toBe(403)
    await crm.dispose()
  })

  test('the accounts user records a payment; when it is voided they are told, with the reason', async ({ request, playwright }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E13 Notify Buyer ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const order = await request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId, quantity: 10, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
    expect(order.status(), await order.text()).toBe(201)
    orderId = ((await order.json()) as { id: string }).id
    const accounts = await loginAs(playwright, accountsEmail)
    const paid = await accounts.post('/api/cc_accounts/payments', { data: { orderId, kind: 'advance', amount: 500, paidOn: today, reference: `E2E13N-${stamp}` } })
    expect(paid.ok(), await paid.text()).toBeTruthy()
    const list = (await (await request.get(`/api/cc_accounts/payments?orderId=${orderId}`)).json()) as { items: Array<{ id: string; updatedAt: string }> }
    paymentId = list.items[0].id
    const voided = await request.post('/api/cc_accounts/payments/void', { data: { id: paymentId, reason: 'Cheque bounced (e2e notify)' }, headers: { [LOCK]: list.items[0].updatedAt } })
    expect(voided.ok(), await voided.text()).toBeTruthy()
    const told = await notices(accounts, 'cc_audit.record.corrected', paymentId)
    expect(told).toHaveLength(1)
    expect(told[0].body).toContain('Cheque bounced (e2e notify)')
    expect(told[0].linkHref).toBe(`/backend/accounts/payments/${paymentId}`)
    await accounts.dispose()
  })

  test('cleanup', async ({ request }) => {
    const current = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { updatedAt: string }
    await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'e2e cleanup' }, headers: { [LOCK]: current.updatedAt } })
    expect((await request.delete(`/api/cc_vendors/vendors?id=${vendorId}`)).ok()).toBeTruthy()
    for (const id of [accountsId, crmId]) expect((await request.delete(`/api/auth/users?id=${id}`)).ok()).toBeTruthy()
  })
})
