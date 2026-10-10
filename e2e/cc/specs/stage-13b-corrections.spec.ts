import { expect, test } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const FAKE = '00000000-0000-4000-8000-000000000000'

test.describe.serial('Phase A · every correction needs a reason, refuses a stale page and lands in the timeline', () => {
  let orderId: string
  let paymentId: string
  let paymentUpdatedAt: string

  test('no reason → 400 with the field message, on every correction endpoint', async ({ request }) => {
    const calls: Array<[string, Record<string, unknown>]> = [
      ['/api/cc_production/resin/batches/action', { id: FAKE, action: 'reopen' }],
      ['/api/cc_production/resin/batches/action', { id: FAKE, action: 'fail', reason: 'x' }],
      ['/api/cc_production/press/batches/action', { id: FAKE, action: 'cancel' }],
      ['/api/cc_production/moulding/action', { entryDate: today, shift: 1, action: 'reopen', pressId: FAKE }],
      ['/api/cc_production/coating/sheets/action', { id: FAKE, action: 'reopen' }],
      ['/api/cc_production/fg-inspection/action', { id: FAKE, action: 'reopen' }],
      ['/api/cc_production/cutting/reverse', { id: FAKE }],
      ['/api/cc_purchase/indents/action', { id: FAKE, action: 'cancel' }],
      ['/api/cc_crm/quotations/action', { id: FAKE, action: 'reopen' }],
      ['/api/cc_accounts/invoices/action', { id: FAKE, action: 'cancel' }],
      ['/api/cc_accounts/proformas/action', { id: FAKE, action: 'cancel', reason: '  ' }],
      ['/api/cc_orders/orders/stage', { orderId: FAKE, stageKey: 'dispatch', action: 'revert' }],
    ]
    for (const [url, data] of calls) {
      const response = await request.post(url, { data })
      expect(response.status(), url).toBe(400)
      expect(((await response.json()) as { error: string }).error, url).toMatch(/Write why/)
    }
    const posting = await request.post('/api/cc_production/coating/sheets/action', { data: { id: FAKE, action: 'post' } })
    expect(posting.status()).not.toBe(400)
  })

  test('fixtures: an order with a payment', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E13 Payer ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const order = await request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId, quantity: 10, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
    expect(order.status(), await order.text()).toBe(201)
    orderId = ((await order.json()) as { id: string }).id
    const paid = await request.post('/api/cc_accounts/payments', { data: { orderId, kind: 'advance', amount: 1000, paidOn: today, reference: `E2E13-${stamp}` } })
    expect(paid.ok(), await paid.text()).toBeTruthy()
    const payment = (await paid.json()) as { id?: string; payments?: Array<{ id: string; updatedAt: string; reference: string | null }> }
    const list = (await (await request.get(`/api/cc_accounts/payments?orderId=${orderId}`)).json()) as { items: Array<{ id: string; updatedAt: string }> }
    const found = payment.id ? list.items.find((item) => item.id === payment.id) : list.items[0]
    paymentId = found!.id
    paymentUpdatedAt = found!.updatedAt
  })

  test('a stale page cannot void; with a reason it is voided and the timeline shows it with the reason', async ({ request }) => {
    const stale = await request.post('/api/cc_accounts/payments/void', { data: { id: paymentId, reason: 'Bounced cheque (e2e)' }, headers: { [LOCK]: '2001-01-01T00:00:00.000Z' } })
    expect(stale.status()).toBe(409)
    const voided = await request.post('/api/cc_accounts/payments/void', { data: { id: paymentId, reason: 'Bounced cheque (e2e)' }, headers: { [LOCK]: paymentUpdatedAt } })
    expect(voided.ok(), await voided.text()).toBeTruthy()
    const timeline = (await (await request.get(`/api/cc_audit/activity?type=payment&id=${paymentId}&kind=correction`)).json()) as { items: Array<{ action: string; reason: string | null; by: string | null; legacy: boolean }> }
    expect(timeline.items).toHaveLength(1)
    expect(timeline.items[0]).toMatchObject({ action: 'voided', reason: 'Bounced cheque (e2e)', legacy: false, by: expect.any(String) })
  })

  test('cancelling the order is a correction with its reason, shown once', async ({ request }) => {
    const current = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { updatedAt: string }
    const cancelled = await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'Customer changed the spec (e2e)' }, headers: { [LOCK]: current.updatedAt } })
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
    const timeline = (await (await request.get(`/api/cc_audit/activity?type=order&id=${orderId}&kind=correction`)).json()) as { items: Array<{ action: string; reason: string | null }> }
    expect(timeline.items.filter((item) => item.action === 'cancelled')).toHaveLength(1)
    expect(timeline.items.find((item) => item.action === 'cancelled')?.reason).toBe('Customer changed the spec (e2e)')
  })
})
