import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const LOT = `E2E14-${stamp}`

type Event = { action: string; stageKey: string | null; note: string | null; changes: Array<{ key: string; label: string; from: unknown; to: unknown }> }
type Order = { id: string; updatedAt: string; revision: number; held: { reason: string | null } | null; status: string; customerId: string; deliveryDate: string | null; lines: Array<{ id: string; productId: string; quantity: number; rate: number | null; gstPercent: number; specs: Record<string, Record<string, string>> }>; stages: Array<{ key: string; status: string }>; events: Event[] }

async function load(request: APIRequestContext, id: string): Promise<Order> {
  return (await (await request.get(`/api/cc_orders/orders?id=${id}`)).json()) as Order
}

function amendBody(order: Order, quantity: number, revisionNote?: string) {
  return {
    id: order.id,
    orderDate: today,
    customerId: order.customerId,
    deliveryDate: '2099-01-31',
    lines: order.lines.map((line) => ({ productId: line.productId, quantity, rate: line.rate, gstPercent: line.gstPercent, specs: line.specs })),
    ...(revisionNote === undefined ? {} : { revisionNote }),
  }
}

test.describe.serial('Phase B · sales order: amend with reason, hold, undo allocation, blocks after invoice', () => {
  let productId: string
  let orderId: string
  let lineId: string
  let lotId: string
  let proformaId: string
  let invoiceId: string

  test('fixtures: FG stock, an order on credit, a proforma', async ({ request }) => {
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const stocked = await request.post('/api/cc_store/stock/adjust', { data: { place: 'fg', productId, direction: 'in', quantity: 30, newLot: { lotNumber: LOT }, reason: 'Opening stock', note: 'e2e phase B orders' } })
    expect(stocked.ok(), await stocked.text()).toBeTruthy()
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E14 Buyer ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const created = await request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId, quantity: 10, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    orderId = ((await created.json()) as { id: string }).id
    const booked = await load(request, orderId)
    lineId = booked.lines[0].id
    expect(booked.revision).toBe(1)
    const pi = await request.post('/api/cc_accounts/proformas', { data: { orderId } })
    expect(pi.ok(), await pi.text()).toBeTruthy()
    proformaId = ((await pi.json()) as { id: string }).id
    const skipped = await request.post('/api/cc_orders/orders/stage', { data: { orderId, stageKey: 'advance', action: 'skip', note: 'On credit (e2e)' }, headers: { [LOCK]: (await load(request, orderId)).updatedAt } })
    expect(skipped.ok(), await skipped.text()).toBeTruthy()
  })

  test('amending needs a reason; it makes revision 2 with every change old → new', async ({ request }) => {
    const order = await load(request, orderId)
    const bare = await request.put('/api/cc_orders/orders', { data: amendBody(order, 12), headers: { [LOCK]: order.updatedAt } })
    expect(bare.status()).toBe(400)
    expect(((await bare.json()) as { error: string }).error).toMatch(/Write why/)
    const saved = await request.put('/api/cc_orders/orders', { data: amendBody(order, 12, 'Customer phoned for 2 more sheets'), headers: { [LOCK]: order.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    expect(((await saved.json()) as { revision: number }).revision).toBe(2)
    const after = await load(request, orderId)
    expect(after.revision).toBe(2)
    const edit = after.events.find((event) => event.action === 'edited')!
    expect(edit.note).toMatch(/Revision 2.*Customer phoned/)
    expect(edit.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Delivery date', to: '2099-01-31' }),
      expect.objectContaining({ label: 'Fabric 10x10 Sheet qty', from: 10, to: 12 }),
    ]))
    lineId = after.lines[0].id
  })

  test('hold stops stage work until released; both carry a reason into the timeline', async ({ request }) => {
    let order = await load(request, orderId)
    expect((await request.post('/api/cc_orders/orders/hold', { data: { id: orderId, action: 'hold' }, headers: { [LOCK]: order.updatedAt } })).status()).toBe(400)
    const held = await request.post('/api/cc_orders/orders/hold', { data: { id: orderId, action: 'hold', reason: 'Customer asked to wait for drawing approval' }, headers: { [LOCK]: order.updatedAt } })
    expect(held.ok(), await held.text()).toBeTruthy()
    order = (await held.json()) as Order
    expect(order.held?.reason).toBe('Customer asked to wait for drawing approval')
    const blocked = await request.post('/api/cc_orders/orders/stage', { data: { orderId, stageKey: 'allocation', action: 'start' }, headers: { [LOCK]: order.updatedAt } })
    expect(blocked.status()).toBe(409)
    expect(((await blocked.json()) as { error: string }).error).toMatch(/on hold/)
    const released = await request.post('/api/cc_orders/orders/hold', { data: { id: orderId, action: 'release', reason: 'Drawing approved' }, headers: { [LOCK]: order.updatedAt } })
    expect(released.ok(), await released.text()).toBeTruthy()
    expect(((await released.json()) as Order).held).toBeNull()
    const timeline = (await (await request.get(`/api/cc_audit/activity?type=order&id=${orderId}&kind=stage`)).json()) as { items: Array<{ action: string; reason: string | null }> }
    expect(timeline.items.find((item) => item.action === 'held')?.reason).toBe('Customer asked to wait for drawing approval')
    expect(timeline.items.find((item) => item.action === 'released')?.reason).toBe('Drawing approved')
  })

  test('a done allocation can be undone with a reason: the stage reopens and the stock is free', async ({ request }) => {
    const candidates = ((await (await request.get(`/api/cc_orders/orders/fulfilment?id=${orderId}&lineId=${lineId}`)).json()) as { items: Array<{ lotId: string; lotNumber: string }> }).items
    lotId = candidates.find((entry) => entry.lotNumber === LOT)!.lotId
    const taken = await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'allocate', orderId, lineId, lotId, qty: 12 } })
    expect(taken.ok(), await taken.text()).toBeTruthy()
    const ready = await request.post('/api/cc_orders/orders/stage', { data: { orderId, stageKey: 'allocation', action: 'step', stepKey: 'ready', done: true }, headers: { [LOCK]: (await load(request, orderId)).updatedAt } })
    expect(ready.ok(), await ready.text()).toBeTruthy()
    const done = await request.post('/api/cc_orders/orders/stage', { data: { orderId, stageKey: 'allocation', action: 'complete', data: { allocation_status: 'All from stock' } }, headers: { [LOCK]: (await load(request, orderId)).updatedAt } })
    expect(done.ok(), await done.text()).toBeTruthy()
    const view = (await (await request.get(`/api/cc_orders/orders/fulfilment?id=${orderId}`)).json()) as { lines: Array<{ allocations: Array<{ id: string; status: string }> }> }
    const allocationId = view.lines[0].allocations.find((entry) => entry.status === 'reserved')!.id
    expect((await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'undo', orderId, allocationId } })).status()).toBe(400)
    const undone = await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'undo', orderId, allocationId, reason: 'Wrong lot picked, customer wants the newer batch' } })
    expect(undone.ok(), await undone.text()).toBeTruthy()
    const order = await load(request, orderId)
    expect(order.stages.find((stage) => stage.key === 'allocation')?.status).toBe('open')
    const after = (await (await request.get(`/api/cc_orders/orders/fulfilment?id=${orderId}`)).json()) as { lines: Array<{ allocated: number }> }
    expect(after.lines[0].allocated).toBe(0)
    const corrections = (await (await request.get(`/api/cc_audit/activity?type=order&id=${orderId}&kind=correction`)).json()) as { items: Array<{ action: string; reason: string | null }> }
    expect(corrections.items.find((item) => item.action === 'allocation_undone')?.reason).toBe('Wrong lot picked, customer wants the newer batch')
  })

  test('once invoiced the order cannot be amended or cancelled; cancelling it later cancels the proforma', async ({ request }) => {
    const again = await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'allocate', orderId, lineId, lotId, qty: 12 } })
    expect(again.ok(), await again.text()).toBeTruthy()
    const created = await request.post('/api/cc_accounts/invoices', { data: { orderId, invoiceDate: today } })
    expect(created.status(), await created.text()).toBe(201)
    invoiceId = ((await created.json()) as { id: string }).id
    let order = await load(request, orderId)
    const amend = await request.put('/api/cc_orders/orders', { data: amendBody(order, 14, 'More sheets'), headers: { [LOCK]: order.updatedAt } })
    expect(amend.status()).toBe(409)
    expect(((await amend.json()) as { error: string }).error).toMatch(/credit note/)
    const cancel = await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'Customer cancelled' }, headers: { [LOCK]: order.updatedAt } })
    expect(cancel.status()).toBe(409)
    const invoice = (await (await request.get(`/api/cc_accounts/invoices?id=${invoiceId}`)).json()) as { updatedAt: string }
    expect((await request.post('/api/cc_accounts/invoices/action', { data: { id: invoiceId, action: 'cancel', reason: 'e2e: cancel to test order cancel' }, headers: { [LOCK]: invoice.updatedAt } })).ok()).toBeTruthy()
    order = await load(request, orderId)
    const cancelled = await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'Customer cancelled (e2e)' }, headers: { [LOCK]: order.updatedAt } })
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
    const pi = (await (await request.get(`/api/cc_accounts/proformas?id=${proformaId}`)).json()) as { status: string }
    expect(pi.status).toBe('cancelled')
  })

  test('cleanup: take the test stock back out', async ({ request }) => {
    const stock = (await (await request.get(`/api/cc_store/stock?place=fg&q=${LOT}`)).json()) as { items: Array<{ productId: string; lots?: Array<{ lotId: string; lotNumber: string; free: number }> }> }
    for (const item of stock.items) {
      for (const lot of item.lots ?? []) {
        if (lot.lotNumber !== LOT || lot.free <= 0) continue
        const out = await request.post('/api/cc_store/stock/adjust', { data: { place: 'fg', productId: item.productId, direction: 'out', quantity: lot.free, lotId: lot.lotId, reason: 'Physical count difference', note: 'e2e phase B cleanup' } })
        expect(out.ok(), await out.text()).toBeTruthy()
      }
    }
  })
})
