import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const stamp = Date.now()

type Order = { id: string; orderNo: string; updatedAt: string; status: string; lines: Array<{ id: string }> }
type Despatch = { id: string; orderId: string; status: string; transporter: string | null; vehicleNo: string | null; lrNumber: string | null; netKg: number | null; packages: number | null; invoices: Array<{ code: string }>; shipped: Array<{ allocationId: string; lotNumber: string; shipped: number; canReturn: number }>; returns: Array<{ newLotId: string; newLotNumber: string; qty: number }>; canCorrect: boolean; updatedAt: string }

async function order(request: APIRequestContext, id: string): Promise<Order> {
  return (await request.get(`/api/cc_orders/orders?id=${id}`)).json()
}

async function stage(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  const current = await order(request, id)
  return request.post('/api/cc_orders/orders/stage', { data: { orderId: id, ...body }, headers: { [LOCK]: current.updatedAt } })
}

async function despatch(request: APIRequestContext, id: string): Promise<Despatch> {
  return (await request.get(`/api/cc_orders/dispatches/detail?id=${id}`)).json()
}

async function act(request: APIRequestContext, record: Despatch, body: Record<string, unknown>) {
  return request.post('/api/cc_orders/dispatches/action', { data: { id: record.id, ...body }, headers: { [LOCK]: record.updatedAt } })
}

test.describe.serial('Phase B · despatch page: details, 48-hour correction, sales return', () => {
  let productId: string
  let lotId: string
  let orderId: string
  let despatchId: string
  let returnLotId: string

  test('fixtures: an order taken all the way to despatch', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E14 Despatch ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const received = await request.post('/api/cc_production/fg-direct', { data: { inDate: today, supplier: 'E2E maker', invoiceNo: `E2E14D${stamp}`, productId, sheetSize: '8x4', thicknessMm: 12, nos: 2, kg: 100 } })
    expect(received.status(), await received.text()).toBe(201)
    lotId = ((await received.json()) as { lotId: string }).lotId
    const thickness = await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotId, readings: Array(12).fill(12.1), result: 'pass' } })
    expect(thickness.status(), await thickness.text()).toBe(201)
    const created = await request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId, quantity: 100, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet', thickness: '12' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    orderId = ((await created.json()) as { id: string }).id
    const lineId = (await order(request, orderId)).lines[0].id
    expect((await stage(request, orderId, { stageKey: 'advance', action: 'skip', note: 'On credit (e2e)' })).ok()).toBeTruthy()
    const taken = await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'allocate', orderId, lineId, lotId, qty: 100 } })
    expect(taken.ok(), await taken.text()).toBeTruthy()
    expect((await stage(request, orderId, { stageKey: 'allocation', action: 'step', stepKey: 'ready', done: true })).ok()).toBeTruthy()
    expect((await stage(request, orderId, { stageKey: 'allocation', action: 'complete', data: { allocation_status: 'All from stock' } })).ok()).toBeTruthy()
    expect((await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'qc_sync', orderId } })).ok()).toBeTruthy()
    const qc = await stage(request, orderId, { stageKey: 'qc', action: 'complete' })
    expect(qc.ok(), await qc.text()).toBeTruthy()
    expect((await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'pack', orderId, lineId, weights: [50, 50] } })).ok()).toBeTruthy()
    expect((await request.post('/api/cc_orders/orders/fulfilment', { data: { action: 'packed', orderId } })).ok()).toBeTruthy()
    expect((await stage(request, orderId, { stageKey: 'packing', action: 'complete', data: { pack_type: 'Pallet (export)', packages: 1, gross_kg: 108 } })).ok()).toBeTruthy()
    for (const stepKey of ['invoice', 'packing_list']) expect((await stage(request, orderId, { stageKey: 'invoice', action: 'step', stepKey, done: true })).ok()).toBeTruthy()
    expect((await stage(request, orderId, { stageKey: 'invoice', action: 'complete', data: { invoice_number: `E2E14/${stamp}`, invoice_date: today } })).ok()).toBeTruthy()
    const settings = (await (await request.get('/api/cc_orders/stage-settings')).json()) as { overrides: Array<{ stageKey: string }> }
    expect(settings.overrides.find((entry) => entry.stageKey === 'dispatch'), 'the despatch stage has owner settings already; this test would overwrite them').toBeFalsy()
    expect((await request.put('/api/cc_orders/stage-settings', { data: { stageKey: 'dispatch', documents: { lr_copy: 'optional' } } })).ok()).toBeTruthy()
    try {
      for (const stepKey of ['loaded', 'dispatched']) expect((await stage(request, orderId, { stageKey: 'dispatch', action: 'step', stepKey, done: true })).ok()).toBeTruthy()
      const sent = await stage(request, orderId, { stageKey: 'dispatch', action: 'complete', data: { dispatch_date: today, transporter: 'E2E Roadways', vehicle_no: 'GJ 07 AB 1111', lr_number: `LR${stamp}`, dispatch_override: '30 days credit (e2e)' } })
      expect(sent.ok(), await sent.text()).toBeTruthy()
    } finally {
      const now = (await (await request.get('/api/cc_orders/stage-settings')).json()) as { overrides: Array<{ stageKey: string; updatedAt: string }> }
      const row = now.overrides.find((entry) => entry.stageKey === 'dispatch')
      if (row) await request.delete('/api/cc_orders/stage-settings?stageKey=dispatch', { headers: { [LOCK]: row.updatedAt } })
    }
  })

  test('the register links to the despatch page, which carries every fact', async ({ request }) => {
    const register = (await (await request.get(`/api/cc_orders/dispatches?view=done&q=LR${stamp}`)).json()) as { items: Array<{ despatchId: string; orderId: string }> }
    despatchId = register.items.find((row) => row.orderId === orderId)!.despatchId
    const record = await despatch(request, despatchId)
    expect(record).toMatchObject({ orderId, status: 'done', transporter: 'E2E Roadways', vehicleNo: 'GJ 07 AB 1111', netKg: 100, packages: 1, canCorrect: true })
    expect(record.shipped).toEqual([expect.objectContaining({ shipped: 100, canReturn: 100 })])
    expect((await request.get(`/backend/dispatch/${despatchId}`)).status()).toBe(200)
  })

  test('vehicle and LR can be corrected with a reason; old → new lands in the timeline', async ({ request }) => {
    let record = await despatch(request, despatchId)
    expect((await act(request, record, { action: 'correct', fields: { vehicle_no: 'GJ 07 AB 2222' } })).status()).toBe(400)
    const fixed = await act(request, record, { action: 'correct', reason: 'Truck changed at the gate', fields: { vehicle_no: 'GJ 07 AB 2222', lr_number: `LR${stamp}`, transporter: 'E2E Roadways' } })
    expect(fixed.ok(), await fixed.text()).toBeTruthy()
    record = (await fixed.json()) as Despatch
    expect(record.vehicleNo).toBe('GJ 07 AB 2222')
    const timeline = (await (await request.get(`/api/cc_audit/activity?type=dispatch&id=${despatchId}&kind=correction`)).json()) as { items: Array<{ action: string; reason: string | null; changes: Array<{ label: string; from: unknown; to: unknown }> }> }
    const entry = timeline.items.find((item) => item.action === 'details_corrected')!
    expect(entry.reason).toBe('Truck changed at the gate')
    expect(entry.changes).toEqual([{ field: 'vehicle_no', label: 'Vehicle no.', from: 'GJ 07 AB 1111', to: 'GJ 07 AB 2222' }])
    const stale = await request.post('/api/cc_orders/dispatches/action', { data: { id: despatchId, action: 'correct', reason: 'again', fields: { vehicle_no: 'X' } }, headers: { [LOCK]: '2001-01-01T00:00:00.000Z' } })
    expect(stale.status()).toBe(409)
  })

  test('a sales return puts the goods back as a new lot on hold; then the despatch cannot be reversed', async ({ request }) => {
    const record = await despatch(request, despatchId)
    const allocationId = record.shipped[0].allocationId
    expect((await act(request, record, { action: 'return', allocationId, qty: 30, returnedOn: today })).status()).toBe(400)
    expect((await act(request, record, { action: 'return', allocationId, qty: 130, returnedOn: today, reason: 'Edges chipped in transit' })).status()).toBe(409)
    const back = await act(request, record, { action: 'return', allocationId, qty: 30, returnedOn: today, reason: 'Edges chipped in transit' })
    expect(back.ok(), await back.text()).toBeTruthy()
    const after = (await back.json()) as Despatch
    expect(after.returns).toEqual([expect.objectContaining({ qty: 30, newLotNumber: expect.stringMatching(/-R1$/) })])
    expect(after.shipped[0].canReturn).toBe(70)
    returnLotId = after.returns[0].newLotId
    const lots = (await (await request.get('/api/cc_production/finishing/lots?kinds=laminate')).json()) as { items: Array<{ lotId: string; place: string; onHand: number; status: string }> }
    expect(lots.items.find((lot) => lot.lotId === returnLotId)).toMatchObject({ place: 'fg', onHand: 30, status: 'hold' })
    const reverse = await stage(request, orderId, { stageKey: 'dispatch', action: 'revert', note: 'Try to reverse (e2e)' })
    expect(reverse.status()).toBe(409)
    expect(((await reverse.json()) as { error: string }).error).toMatch(/sales return/)
  })

  test('cleanup: the returned stock goes out', async ({ request }) => {
    await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotId: returnLotId, readings: Array(12).fill(12.1), result: 'pass' } })
    const out = await request.post('/api/cc_store/stock/adjust', { data: { place: 'fg', productId, direction: 'out', quantity: 30, lotId: returnLotId, reason: 'Physical count difference', note: 'e2e phase B despatch cleanup' } })
    expect(out.ok(), await out.text()).toBeTruthy()
  })
})
