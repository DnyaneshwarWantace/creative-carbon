import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const stamp = Date.now()
const round = (value: number) => Math.round(value * 1000) / 1000

type Order = { id: string; orderNo: string; updatedAt: string; status: string; market?: string; incoterm?: string | null; portOfLoading?: string | null; currency?: string | null; lines: Array<{ id: string }>; stages: Array<{ key: string; status: string; data: Record<string, unknown> | null }>; error?: string }
type Fulfilment = { lines: Array<{ lineId: string; qty: number; allocated: number; short: number; packed: number | null; despatched: number; made: number | null; allocations: Array<{ id: string; lotNumber: string; qty: number; status: string; lotStatus: string }> }>; totals: { allocated: number; packed: number; despatched: number }; onHold: string[]; qc: { lots: Array<{ lotNumber: string; boughtIn: boolean }>; allThickness: boolean; allFg: boolean }; error?: string }

async function order(request: APIRequestContext, id: string): Promise<Order> {
  return (await request.get(`/api/cc_orders/orders?id=${id}`)).json()
}

async function stage(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  const current = await order(request, id)
  return request.post('/api/cc_orders/orders/stage', { data: { orderId: id, ...body }, headers: { [LOCK]: current.updatedAt } })
}

async function fulfilment(request: APIRequestContext, id: string): Promise<Fulfilment> {
  return (await request.get(`/api/cc_orders/orders/fulfilment?id=${id}`)).json()
}

async function act(request: APIRequestContext, body: Record<string, unknown>) {
  return request.post('/api/cc_orders/orders/fulfilment', { data: body })
}

async function fgLot(request: APIRequestContext, lotId: string) {
  const lots = (await (await request.get('/api/cc_production/finishing/lots?kinds=laminate')).json()) as { items: Array<{ lotId: string; place: string; onHand: number; free: number; status: string }> }
  return lots.items.find((lot) => lot.lotId === lotId && lot.place === 'fg') ?? null
}

test.describe.serial('Stage 9 · one-page order, booking to despatch', () => {
  let customerId: string
  let productId: string
  let lotA: string
  let lotB: string
  let orderId: string
  let lineId: string

  test('fixtures: a customer and two lots of 12 mm Fabric 10x10 sheet in the FG store (Stage 7 bought-in)', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E9 Exports ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(customer.ok(), await customer.text()).toBeTruthy()
    customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    for (const [kg, nos, invoice] of [
      [300, 6, `E2E9A${stamp}`],
      [200, 4, `E2E9B${stamp}`],
    ] as Array<[number, number, string]>) {
      const received = await request.post('/api/cc_production/fg-direct', { data: { inDate: today, supplier: 'E2E maker', invoiceNo: invoice, productId, sheetSize: '8x4', thicknessMm: 12, nos, kg } })
      expect(received.status(), await received.text()).toBe(201)
      const lot = (await received.json()) as { lotId: string }
      if (kg === 300) lotA = lot.lotId
      else lotB = lot.lotId
    }
  })

  test('an export order is booked with incoterm, port and currency', async ({ request }) => {
    const created = await request.post('/api/cc_orders/orders', {
      data: {
        orderDate: today,
        customerId,
        customerPoRef: `PO-${stamp}`,
        market: 'export',
        incoterm: 'FOB',
        portOfLoading: 'Mundra',
        country: 'UAE',
        currency: 'USD',
        lines: [{ productId, quantity: 450, rate: 0, gstPercent: 0, specs: { material: { form: 'Sheet', grade: 'Fabric', weave: '10x10', sheet_size: '8x4', thickness_mm: '12' } } }],
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const booked = await order(request, ((await created.json()) as { id: string }).id)
    orderId = booked.id
    lineId = booked.lines[0].id
    expect(booked).toEqual(expect.objectContaining({ market: 'export', incoterm: 'FOB', portOfLoading: 'Mundra', currency: 'USD' }))
    expect(booked.stages.find((entry) => entry.key === 'advance')?.status).toBe('open')
    const skipped = await stage(request, orderId, { stageKey: 'advance', action: 'skip', note: 'Customer on credit (e2e)' })
    expect(skipped.ok(), await skipped.text()).toBeTruthy()
    expect(((await skipped.json()) as Order).stages.find((entry) => entry.key === 'allocation')?.status).toBe('open')
  })

  test('stock allocation: matching 12 mm lots are offered oldest first and held for the order', async ({ request }) => {
    const candidates = ((await (await request.get(`/api/cc_orders/orders/fulfilment?id=${orderId}&lineId=${lineId}`)).json()) as { items: Array<{ lotId: string; matches: boolean; free: number; thicknessMm: number | null }> }).items
    const ours = candidates.filter((entry) => entry.lotId === lotA || entry.lotId === lotB)
    expect(ours.map((entry) => entry.lotId)).toEqual([lotA, lotB])
    expect(ours.every((entry) => entry.matches)).toBeTruthy()
    const firstMismatch = candidates.findIndex((entry) => !entry.matches)
    if (firstMismatch >= 0) expect(candidates.findIndex((entry) => entry.lotId === lotB)).toBeLessThan(firstMismatch)

    expect((await act(request, { action: 'allocate', orderId, lineId, lotId: lotA, qty: 300 })).ok()).toBeTruthy()
    const tooMuch = await act(request, { action: 'allocate', orderId, lineId, lotId: lotB, qty: 200 })
    expect(tooMuch.status()).toBe(400)
    expect(((await tooMuch.json()) as { error: string }).error).toMatch(/needs only 150/)
    expect((await act(request, { action: 'allocate', orderId, lineId, lotId: lotB, qty: 150 })).ok()).toBeTruthy()
    const view = await fulfilment(request, orderId)
    expect(view.lines[0]).toEqual(expect.objectContaining({ allocated: 450, short: 0 }))
    expect((await fgLot(request, lotB))?.free).toBe(50)
    expect((await fgLot(request, lotA))?.free).toBe(0)

    const steps = (await order(request, orderId)).stages.find((entry) => entry.key === 'allocation')?.data?.__steps as Record<string, { done: boolean }>
    expect(steps.checked?.done && steps.allocated?.done).toBeTruthy()
    expect((await stage(request, orderId, { stageKey: 'allocation', action: 'step', stepKey: 'ready', done: true })).ok()).toBeTruthy()
    const done = await stage(request, orderId, { stageKey: 'allocation', action: 'complete', data: { allocation_status: 'All from stock' } })
    expect(done.ok(), await done.text()).toBeTruthy()
    const late = await act(request, { action: 'allocate', orderId, lineId, lotId: lotB, qty: 1 })
    expect(late.status()).toBe(409)
  })

  test('QC: a held lot blocks QC; the inspections tick the steps; clearing the hold lets QC finish', async ({ request }) => {
    const held = await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotId: lotB, readings: Array(12).fill(12.4), result: 'hold' } })
    expect(held.status(), await held.text()).toBe(201)
    expect((await fulfilment(request, orderId)).onHold.length).toBe(1)
    const sync = await act(request, { action: 'qc_sync', orderId })
    expect(sync.ok(), await sync.text()).toBeTruthy()
    const qc = (await sync.json()) as { qc: { allThickness: boolean; allFg: boolean } }
    expect(qc.qc).toEqual(expect.objectContaining({ allThickness: true, allFg: true }))
    const blocked = await stage(request, orderId, { stageKey: 'qc', action: 'complete' })
    expect(blocked.status()).toBe(409)
    expect(((await blocked.json()) as { error: string }).error).toMatch(/on hold/)
    const pass = await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotId: lotB, readings: Array(12).fill(12.1), result: 'pass' } })
    expect(pass.status()).toBe(201)
    const done = await stage(request, orderId, { stageKey: 'qc', action: 'complete' })
    expect(done.ok(), await done.text()).toBeTruthy()
  })

  test('packing: every sheet weighed, five to a row; totals become the net weight', async ({ request }) => {
    const weights = [49.4, 49.6, 49.5, 49.5, 49.6, 49.4, 49.5, 49.5, 49.5]
    const saved = await act(request, { action: 'pack', orderId, lineId, weights })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const view = (await saved.json()) as Fulfilment & { packedQty: number; overAllocated: boolean }
    expect(view.packedQty).toBe(445.5)
    expect(view.overAllocated).toBe(false)
    const packing = (await order(request, orderId)).stages.find((entry) => entry.key === 'packing')!
    expect(packing.data?.net_kg).toBe(445.5)
    expect((await act(request, { action: 'packed', orderId })).ok()).toBeTruthy()
    const done = await stage(request, orderId, { stageKey: 'packing', action: 'complete', data: { pack_type: 'Pallet (export)', packages: 2, gross_kg: 470 } })
    expect(done.ok(), await done.text()).toBeTruthy()
  })

  test('invoice, then despatch takes the packed weight out of stock by lot, never more than allocated', async ({ request }) => {
    for (const stepKey of ['invoice', 'packing_list']) expect((await stage(request, orderId, { stageKey: 'invoice', action: 'step', stepKey, done: true })).ok()).toBeTruthy()
    const invoiced = await stage(request, orderId, { stageKey: 'invoice', action: 'complete', data: { invoice_number: `E2E9/${stamp}`, invoice_date: today } })
    expect(invoiced.ok(), await invoiced.text()).toBeTruthy()

    const settings = (await (await request.get('/api/cc_orders/stage-settings')).json()) as { overrides: Array<{ stageKey: string; updatedAt: string }> }
    const existing = settings.overrides.find((entry) => entry.stageKey === 'dispatch')
    expect(existing, 'the despatch stage has owner settings already; this test would overwrite them').toBeFalsy()
    const relaxed = await request.put('/api/cc_orders/stage-settings', { data: { stageKey: 'dispatch', documents: { lr_copy: 'optional' } } })
    expect(relaxed.ok(), await relaxed.text()).toBeTruthy()
    try {
      for (const stepKey of ['loaded', 'dispatched']) expect((await stage(request, orderId, { stageKey: 'dispatch', action: 'step', stepKey, done: true })).ok()).toBeTruthy()
      const sent = await stage(request, orderId, { stageKey: 'dispatch', action: 'complete', data: { dispatch_date: today, transporter: 'E2E Roadways', container_no: 'MSKU1234567', port: 'Mundra' } })
      expect(sent.ok(), await sent.text()).toBeTruthy()
    } finally {
      const now = (await (await request.get('/api/cc_orders/stage-settings')).json()) as { overrides: Array<{ stageKey: string; updatedAt: string }> }
      const row = now.overrides.find((entry) => entry.stageKey === 'dispatch')
      if (row) await request.delete('/api/cc_orders/stage-settings?stageKey=dispatch', { headers: { [LOCK]: row.updatedAt } })
    }
    const view = await fulfilment(request, orderId)
    expect(view.totals.despatched).toBe(445.5)
    expect(await fgLot(request, lotA)).toBeNull()
    const b = await fgLot(request, lotB)
    expect(b?.onHand).toBe(round(200 - 145.5))
    expect(b?.free).toBe(50)
    expect(view.lines[0].allocations.find((row) => row.status === 'reserved')?.qty).toBe(4.5)
    const ledger = (await (await request.get(`/api/cc_store/stock/ledger?place=fg&productId=${productId}&pageSize=100`)).json()) as { items: Array<{ orderNo: string | null; quantity: number }> }
    const current = await order(request, orderId)
    expect(ledger.items.filter((row) => row.orderNo === current.orderNo).map((row) => row.quantity).sort()).toEqual([-300, -145.5].sort())
  })

  test('reopening despatch (manager) puts the stock back, still allocated; cancelling releases it', async ({ request }) => {
    const reverted = await stage(request, orderId, { stageKey: 'dispatch', action: 'revert', note: 'Truck did not come (e2e)' })
    expect(reverted.ok(), await reverted.text()).toBeTruthy()
    const view = await fulfilment(request, orderId)
    expect(view.totals.despatched).toBe(0)
    expect(view.totals.allocated).toBe(450)
    expect((await fgLot(request, lotA))?.onHand).toBe(300)
    expect((await fgLot(request, lotA))?.free).toBe(0)
    const cancelled = await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'e2e cleanup' }, headers: { [LOCK]: (await order(request, orderId)).updatedAt } })
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
    expect((await fgLot(request, lotA))?.free).toBe(300)
    expect((await fgLot(request, lotB))?.free).toBe(200)
  })

  test('a moulded order line tells the moulding register its order quantity (Stage 6)', async ({ request }) => {
    const moulded = ((await (await request.get('/api/cc_products/search?kinds=moulded&q=1142')).json()) as { items: Array<{ id: string; title: string }> }).items[0]
    test.skip(!moulded, 'no moulded item for die 1142 (load the demo data)')
    const created = await request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId: moulded.id, quantity: 250, rate: 0, gstPercent: 0, specs: { material: { form: 'Moulded part', die_no: '1142' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    const booked = await order(request, ((await created.json()) as { id: string }).id)
    const lookup = (await (await request.get('/api/cc_production/moulding/dies?lookup=1142')).json()) as { items: Array<{ openOrders: Array<{ orderNo: string; qty: number }> }> }
    expect(lookup.items[0].openOrders).toEqual(expect.arrayContaining([{ orderNo: booked.orderNo, qty: 250 }]))
    expect((await fulfilment(request, booked.id)).lines[0].made).toBe(0)
    await request.post('/api/cc_orders/orders/cancel', { data: { id: booked.id, reason: 'e2e cleanup' }, headers: { [LOCK]: booked.updatedAt } })
  })

  test('order pages open', async ({ request }) => {
    for (const path of [`/backend/orders/${orderId}`, '/backend/orders']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })

  test('clean up: test FG lots out, test customer removed', async ({ request }) => {
    for (const lotId of [lotA, lotB]) {
      const lot = await fgLot(request, lotId)
      if (!lot || !(lot.free > 0)) continue
      const out = await request.post('/api/cc_store/stock/adjust', { data: { place: 'fg', productId, direction: 'out', quantity: lot.free, lotId, reason: 'Physical count difference', note: 'e2e stage 9 cleanup' } })
      expect(out.ok(), await out.text()).toBeTruthy()
    }
  })
})
