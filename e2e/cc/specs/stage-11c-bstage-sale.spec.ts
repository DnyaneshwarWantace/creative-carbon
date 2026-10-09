import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const YEAR = 2015 + (stamp % 7)
const DAY = `${YEAR}-${String(1 + (stamp % 12)).padStart(2, '0')}-${String(1 + (stamp % 27)).padStart(2, '0')}`

type BoardLot = { lotId: string; lotNumber: string; productId: string; title: string; freeKg: number; ageDays: number; band: string; clothTitle: string | null; gsm: number | null }
type Invoice = { id: string; code: string; updatedAt: string; lines: Array<{ quantity: number; unit: string | null; bstageLots?: Array<{ lotNumber: string; kg: number; cloth: string | null; gsm: number | null; madeOn: string | null }> | null }> }

async function order(request: APIRequestContext, id: string) {
  return (await (await request.get(`/api/cc_orders/orders?id=${id}`)).json()) as { id: string; updatedAt: string; lines: Array<{ id: string }> }
}

test.describe.serial('Stage 11 · B-stage sale: old lots need a reason, the invoice lists the lots', () => {
  let lot: BoardLot
  let orderId: string
  let lineId: string
  let invoice: Invoice

  test('fixtures: a B-stage order with the advance skipped', async ({ request }) => {
    const board = (await (await request.get('/api/cc_production/bstage')).json()) as { columns: Array<{ band: string; lots: BoardLot[] }> }
    const old = board.columns.filter((column) => column.band === 'expired' || column.band === 'blocked').flatMap((column) => column.lots).find((entry) => entry.freeKg >= 2)
    test.skip(!old, 'no expired B-stage lot with free stock (load the demo or e2e data)')
    lot = old!
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E11 Prepreg Buyer ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(customer.ok(), await customer.text()).toBeTruthy()
    const customerId = ((await customer.json()) as { id: string }).id
    const created = await request.post('/api/cc_orders/orders', { data: { orderDate: DAY, customerId, lines: [{ productId: lot.productId, quantity: 1.5, rate: 260, gstPercent: 18, specs: { material: { form: 'B-stage' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    orderId = ((await created.json()) as { id: string }).id
    const booked = await order(request, orderId)
    lineId = booked.lines[0].id
    const skipped = await request.post('/api/cc_orders/orders/stage', { data: { orderId, stageKey: 'advance', action: 'skip', note: 'On credit (e2e)' }, headers: { [LOCK]: booked.updatedAt } })
    expect(skipped.ok(), await skipped.text()).toBeTruthy()
  })

  test('an expired B-stage lot is refused without a reason and taken with one', async ({ request }) => {
    const refused = await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'allocate', orderId, lineId, lotId: lot.lotId, qty: 1.5 } })
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/Give a reason to sell it/)
    const taken = await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'allocate', orderId, lineId, lotId: lot.lotId, qty: 1.5, reason: 'Customer agreed after a press trial (e2e)' } })
    expect(taken.ok(), await taken.text()).toBeTruthy()
    const events = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { events?: Array<{ note: string | null; message?: string | null }> }
    expect(JSON.stringify(events)).toContain('Customer agreed after a press trial (e2e)')
  })

  test('the invoice carries the lots supplied, per kg', async ({ request }) => {
    const created = await request.post('/api/cc_accounts/invoices', { data: { orderId, invoiceDate: DAY } })
    expect(created.status(), await created.text()).toBe(201)
    invoice = (await created.json()) as Invoice
    expect(invoice.lines[0].unit).toBe('kg')
    expect(invoice.lines[0].bstageLots).toEqual([expect.objectContaining({ lotNumber: lot.lotNumber, kg: 1.5 })])
    expect(invoice.lines[0].bstageLots?.[0].madeOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('cleanup: cancel the invoice and the order, the lot is free again', async ({ request }) => {
    const latest = (await (await request.get(`/api/cc_accounts/invoices?id=${invoice.id}`)).json()) as Invoice
    expect((await request.post('/api/cc_accounts/invoices/action', { data: { id: invoice.id, action: 'cancel', reason: 'e2e cleanup' }, headers: { [LOCK]: latest.updatedAt } })).ok()).toBeTruthy()
    const current = await order(request, orderId)
    const cancelled = await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'e2e cleanup' }, headers: { [LOCK]: current.updatedAt } })
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
  })
})
