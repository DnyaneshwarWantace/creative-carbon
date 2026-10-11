import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Upload = { id: string; status: string; updatedAt: string; records: Array<{ type: string; id: string; label: string; created: boolean; undone?: boolean }> }
type Preview = { unavailable: string | null; allowed: boolean; blockedBy: Array<{ label: string }>; undo: string[] }
type Activity = { action: string; reason: string | null; links: Array<{ type: string; id: string }> | null }

async function upload(request: APIRequestContext, id: string): Promise<Upload> {
  return (await request.get(`/api/cc_production/upload/history?id=${id}`)).json()
}

async function preview(request: APIRequestContext, id: string): Promise<Preview> {
  return (await request.get(`/api/cc_production/upload/undo?id=${id}`)).json()
}

async function undo(request: APIRequestContext, id: string, reason?: string) {
  return request.post('/api/cc_production/upload/undo', { data: { id, ...(reason ? { reason } : {}) }, headers: { [LOCK]: (await upload(request, id)).updatedAt } })
}

async function activity(request: APIRequestContext, id: string): Promise<Activity[]> {
  return ((await (await request.get(`/api/cc_audit/activity?type=upload&id=${id}`)).json()) as { items: Activity[] }).items
}

test.describe.serial('Phase F · an upload lists what it made and is undone as a whole while unused', () => {
  let openingId: string
  let mouldsId: string
  const lotA = `E2E18-OP-A-${stamp}`
  const lotB = `E2E18-OP-B-${stamp}`
  const die = `E2E18-D-${stamp}`

  test('an upload keeps the records it made and logs itself on its timeline', async ({ request }) => {
    const opening = await request.post('/api/cc_production/upload', {
      data: {
        register: 'opening_stock',
        dryRun: false,
        rows: [
          { 'Stock as on': today, Store: 'Warehouse A', 'Item (name or code)': 'Methanol', 'Lot / batch no.': lotA, Quantity: '10' },
          { 'Stock as on': today, Store: 'Warehouse A', 'Item (name or code)': 'Methanol', 'Lot / batch no.': lotB, Quantity: '5' },
        ],
      },
    })
    expect(opening.ok(), await opening.text()).toBeTruthy()
    openingId = ((await opening.json()) as { batchId: string }).batchId
    const made = await upload(request, openingId)
    expect(made.records.map((record) => record.label).sort()).toEqual([lotA, lotB].sort())
    expect(made.records.every((record) => record.type === 'lot' && record.created)).toBeTruthy()
    expect((await activity(request, openingId)).find((item) => item.action === 'uploaded')?.links?.length).toBe(2)

    const moulds = await request.post('/api/cc_production/upload', { data: { register: 'moulds', dryRun: false, rows: [{ 'Die No.': die, Type: 'Die', Description: 'e2e18 bush' }] } })
    expect(moulds.ok(), await moulds.text()).toBeTruthy()
    mouldsId = ((await moulds.json()) as { batchId: string }).batchId
    expect((await upload(request, mouldsId)).records).toEqual([expect.objectContaining({ type: 'master', label: expect.stringContaining(die), created: true })])
  })

  test('undo is refused while a record the upload made is used, and names it', async ({ request }) => {
    const lot = (await upload(request, openingId)).records.find((record) => record.label === lotA)!
    const products = ((await (await request.get('/api/cc_products/search?kinds=chemical&q=Methanol')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Methanol')!.id
    expect((await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'out', quantity: 1, lotId: lot.id, reason: 'Physical count difference', note: 'e2e18' } })).ok()).toBeTruthy()
    const check = await preview(request, openingId)
    expect(check.blockedBy.map((entry) => entry.label).join(' ')).toContain(lotA)
    const refused = await undo(request, openingId, 'Wrong cutover date')
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toContain(lotA)
    expect((await upload(request, openingId)).status).toBe('done')
  })

  test('undo needs a reason; it reverses each record, logs the reason and cannot run twice', async ({ request }) => {
    expect((await undo(request, mouldsId)).status()).toBe(400)
    expect((await preview(request, mouldsId)).blockedBy).toEqual([])
    const done = await undo(request, mouldsId, 'Uploaded to the wrong plant')
    expect(done.ok(), await done.text()).toBeTruthy()
    const after = await upload(request, mouldsId)
    expect(after.status).toBe('undone')
    expect(after.records.every((record) => record.undone)).toBeTruthy()
    const masters = ((await (await request.get('/api/cc_production/masters?type=moulds')).json()) as { items: Array<{ dieNo: string }> }).items
    expect(masters.some((row) => row.dieNo === die)).toBeFalsy()
    expect((await activity(request, mouldsId)).find((item) => item.action === 'undone')?.reason).toBe('Uploaded to the wrong plant')
    expect((await preview(request, mouldsId)).unavailable).toMatch(/already undone/)
    expect((await undo(request, mouldsId, 'Again')).status()).toBe(409)
  })

  test('an unused opening-stock upload is undone: its lots are taken back out of stock', async ({ request }) => {
    const lotC = `E2E18-OP-C-${stamp}`
    const loaded = await request.post('/api/cc_production/upload', { data: { register: 'opening_stock', dryRun: false, rows: [{ 'Stock as on': today, Store: 'Warehouse A', 'Item (name or code)': 'Methanol', 'Lot / batch no.': lotC, Quantity: '7' }] } })
    const id = ((await loaded.json()) as { batchId: string }).batchId
    const lotId = (await upload(request, id)).records[0].id
    expect(((await (await request.get(`/api/cc_production/stock/lot?id=${lotId}`)).json()) as { lot: { onHand: number } }).lot.onHand).toBe(7)
    const done = await undo(request, id, 'Counted twice')
    expect(done.ok(), await done.text()).toBeTruthy()
    expect(((await (await request.get(`/api/cc_production/stock/lot?id=${lotId}`)).json()) as { lot: { onHand: number } }).lot.onHand).toBe(0)
  })

  test('the upload page opens', async ({ request }) => {
    expect((await request.get(`/backend/upload/history/${openingId}`)).status()).toBe(200)
  })

  test('cleanup: the opening lots go back out', async ({ request }) => {
    const items = ((await (await request.get('/api/cc_store/stock?place=wh_a')).json()) as { items: Array<{ productId: string; lots: Array<{ lotId: string; lotNumber: string | null; free: number }> }> }).items
    for (const item of items) {
      for (const lot of item.lots.filter((entry) => entry.lotNumber === lotA || entry.lotNumber === lotB)) {
        if (lot.free > 0) expect((await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId: item.productId, direction: 'out', quantity: lot.free, lotId: lot.lotId, reason: 'Physical count difference', note: 'e2e18 cleanup' } })).ok()).toBeTruthy()
      }
    }
  })
})
