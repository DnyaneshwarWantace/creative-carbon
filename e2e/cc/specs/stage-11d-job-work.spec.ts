import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Challan = { id: string; code: string; status: string; updatedAt: string; lines: Array<{ lineId: string; qty: number; returnedQty: number; lossQty: number; pending: number; fromPlace: string }>; totals: { sent: number; returned: number; loss: number; out: number; value: number }; error?: string }

async function lotIn(request: APIRequestContext, lotId: string, place: string): Promise<number> {
  const book = (await (await request.get(`/api/cc_store/stock?place=${place}&q=E2E11JW${stamp}`)).json()) as { items: Array<{ lots: Array<{ lotId: string | null; onHand: number }> }> }
  return book.items.flatMap((item) => item.lots).filter((lot) => lot.lotId === lotId).reduce((sum, lot) => sum + lot.onHand, 0)
}

async function act(request: APIRequestContext, challan: Challan, body: Record<string, unknown>) {
  return request.post('/api/cc_purchase/job-work/action', { data: { id: challan.id, ...body }, headers: { [LOCK]: challan.updatedAt } })
}

test.describe.serial('Stage 11 · job-work challan: out to the job worker, back with loss, never lost from stock', () => {
  let vendorId: string
  let productId: string
  let lotId: string
  let challan: Challan

  test('fixtures: a job worker and 100 kg of sheet in the FG store', async ({ request }) => {
    const vendor = await request.post('/api/cc_vendors/vendors', { data: { name: `E2E11 Machining Works ${stamp}`, category: 'both', organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(vendor.status(), await vendor.text()).toBe(201)
    vendorId = ((await vendor.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const received = await request.post('/api/cc_production/fg-direct', { data: { inDate: today, supplier: 'E2E maker', invoiceNo: `E2E11JW${stamp}`, productId, sheetSize: '8x4', thicknessMm: 6, nos: 10, kg: 100 } })
    expect(received.status(), await received.text()).toBe(201)
    lotId = ((await received.json()) as { lotId: string }).lotId
    const lots = (await (await request.get(`/api/cc_purchase/job-work?lots=1&q=E2E11JW${stamp}`)).json()) as { items: Array<{ lotId: string; free: number }> }
    expect(lots.items.find((lot) => lot.lotId === lotId)?.free).toBe(100)
  })

  test('sending more than is free is refused; a challan moves the stock to "At job worker"', async ({ request }) => {
    const tooMuch = await request.post('/api/cc_purchase/job-work', { data: { vendorId, challanDate: today, process: 'Machining', lines: [{ lotId, qty: 150 }] } })
    expect(tooMuch.status()).toBe(409)
    const created = await request.post('/api/cc_purchase/job-work', { data: { vendorId, challanDate: today, process: 'Machining', expectedReturn: today, vehicleNo: 'gj07ab1234', lines: [{ lotId, qty: 60, value: 18000 }] } })
    expect(created.status(), await created.text()).toBe(201)
    challan = (await created.json()) as Challan
    expect(challan.code).toMatch(/^CCCPL\/JW\/\d{4}\/\d{4}$/)
    expect(challan.status).toBe('open')
    expect(challan.totals).toMatchObject({ sent: 60, out: 60, value: 18000 })
    expect(await lotIn(request, lotId, 'jobwork')).toBe(60)
    expect(await lotIn(request, lotId, 'fg')).toBe(40)
  })

  test('part back with process loss; the loss leaves stock, the rest stays out', async ({ request }) => {
    const back = await act(request, challan, { action: 'receive', date: today, note: 'Their DC 77', lines: [{ lineId: challan.lines[0].lineId, qty: 30, lossQty: 2, toPlace: 'fg' }] })
    expect(back.ok(), await back.text()).toBeTruthy()
    challan = (await back.json()) as Challan
    expect(challan.status).toBe('part_returned')
    expect(challan.totals).toMatchObject({ returned: 30, loss: 2, out: 28 })
    expect(await lotIn(request, lotId, 'jobwork')).toBe(28)
    expect(await lotIn(request, lotId, 'fg')).toBe(70)
    const tooMuch = await act(request, challan, { action: 'receive', date: today, lines: [{ lineId: challan.lines[0].lineId, qty: 29 }] })
    expect(tooMuch.status()).toBe(409)
  })

  test('a stale page cannot receive; cancelling after something came back is refused', async ({ request }) => {
    const stale = await request.post('/api/cc_purchase/job-work/action', { data: { id: challan.id, action: 'receive', date: today, lines: [{ lineId: challan.lines[0].lineId, qty: 1 }] }, headers: { [LOCK]: '2001-01-01T00:00:00.000Z' } })
    expect(stale.status()).toBe(409)
    const cancel = await act(request, challan, { action: 'cancel', reason: 'e2e try' })
    expect(cancel.status()).toBe(409)
  })

  test('the rest comes back: all back, nothing left at the job worker', async ({ request }) => {
    const back = await act(request, challan, { action: 'receive', date: today, lines: [{ lineId: challan.lines[0].lineId, qty: 28 }] })
    expect(back.ok(), await back.text()).toBeTruthy()
    challan = (await back.json()) as Challan
    expect(challan.status).toBe('returned')
    expect(await lotIn(request, lotId, 'jobwork')).toBe(0)
    expect(await lotIn(request, lotId, 'fg')).toBe(98)
  })

  test('a challan nothing came back on can be cancelled; the stock returns', async ({ request }) => {
    const created = (await (await request.post('/api/cc_purchase/job-work', { data: { vendorId, challanDate: today, process: 'Cutting to size', lines: [{ lotId, qty: 10 }] } })).json()) as Challan
    expect(await lotIn(request, lotId, 'fg')).toBe(88)
    const cancelled = await act(request, created, { action: 'cancel', reason: 'Job worker not available (e2e)' })
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
    expect(((await cancelled.json()) as Challan).status).toBe('cancelled')
    expect(await lotIn(request, lotId, 'fg')).toBe(98)
  })

  test('pages open and stock cannot be moved to "At job worker" by hand', async ({ request }) => {
    for (const path of ['/backend/purchase/job-work', '/backend/purchase/job-work/new', `/backend/purchase/job-work/${challan.id}`]) {
      expect((await request.get(path)).status(), path).toBe(200)
    }
    const manual = await request.post('/api/cc_store/stock/transfer', { data: { productId, lotId, from: 'fg', to: 'jobwork', quantity: 1 } })
    expect(manual.status()).toBeGreaterThanOrEqual(400)
  })
})
