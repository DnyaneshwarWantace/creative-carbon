import { expect, test, type APIRequestContext } from '@playwright/test'

const BASE = process.env.CC_BASE_URL ?? 'http://localhost:3010'
const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const PASSWORD = 'Store!Test9pass'
const storeEmail = `e2e-store-${stamp}@example.com`

type Adjustment = { id: string; code: string; status: string; lotId: string | null; movementId: string | null; reversalId: string | null; updatedAt: string; error?: string }
type Stocktake = { id: string; status: string; lines: Array<{ lotId: string; book: number; counted: number; difference: number; movementId?: string | null }>; updatedAt: string }
type Lot = { lot: { onHand: number; status?: string }; movements: Array<{ id: string; qty: number; adjustmentId?: string | null; reverses?: string | null; reversedBy?: string | null }> }

async function loginAs(playwright: { request: { newContext: (options: { baseURL: string }) => Promise<APIRequestContext> } }) {
  const context = await playwright.request.newContext({ baseURL: BASE })
  const response = await context.post('/api/auth/login', { data: { email: storeEmail, password: PASSWORD } })
  expect(response.status(), await response.text()).toBeLessThan(400)
  return context
}

async function adjustment(request: APIRequestContext, id: string): Promise<Adjustment> {
  return (await request.get(`/api/cc_store/adjustments?id=${id}`)).json()
}

async function adjAct(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  return request.post('/api/cc_store/adjustments/action', { data: { id, ...body }, headers: { [LOCK]: (await adjustment(request, id)).updatedAt } })
}

async function lot(request: APIRequestContext, id: string): Promise<Lot> {
  return (await request.get(`/api/cc_production/stock/lot?id=${id}`)).json()
}

async function stocktake(request: APIRequestContext, id: string): Promise<Stocktake> {
  return (await request.get(`/api/cc_production/stocktakes?id=${id}`)).json()
}

async function countAct(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  return request.post('/api/cc_production/stocktakes/action', { data: { id, ...body }, headers: { [LOCK]: (await stocktake(request, id)).updatedAt } })
}

async function activity(request: APIRequestContext, type: string, id: string) {
  return ((await (await request.get(`/api/cc_audit/activity?type=${type}&id=${id}`)).json()) as { items: Array<{ action: string; reason: string | null }> }).items
}

test.describe.serial('Phase D · lots, adjustments with approval and reverse, stocktake with approval and reverse', () => {
  let productId: string
  let userId: string
  let firstId: string
  let lotA: string
  let lotB: string
  let pendingId: string
  let countId: string

  test('fixtures: a store user who can adjust but not approve', async ({ request }) => {
    const items = ((await (await request.get('/api/cc_products/search?kinds=chemical&q=Methanol')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = items.find((item) => item.title === 'Methanol')!.id
    const created = await request.post('/api/auth/users', { data: { email: storeEmail, name: `E2E16 Store ${stamp}`, password: PASSWORD, organizationId: process.env.CC_ORG, roles: ['Store & despatch'] } })
    expect(created.status(), await created.text()).toBeLessThan(300)
    const people = ((await (await request.get('/api/cc_audit/people')).json()) as { items: Array<{ id: string; name: string }> }).items
    userId = people.find((person) => person.name === `E2E16 Store ${stamp}`)!.id
  })

  test('a hand adjustment is a record, linked from its movement and its lot', async ({ request }) => {
    const added = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'in', quantity: 20, newLot: { lotNumber: `E2E16S-A-${stamp}` }, reason: 'Opening stock', note: 'e2e' } })
    expect(added.ok(), await added.text()).toBeTruthy()
    const body = (await added.json()) as { id: string; status: string }
    expect(body.status).toBe('posted')
    firstId = body.id
    const row = await adjustment(request, firstId)
    expect(row.code).toMatch(/^ADJ-\d{4}$/)
    lotA = row.lotId!
    const movement = (await (await request.get(`/api/cc_store/stock/movement?id=${row.movementId}`)).json()) as { adjustmentId: string; lotId: string; quantity: number }
    expect(movement).toMatchObject({ adjustmentId: firstId, lotId: lotA, quantity: 20 })
    expect((await activity(request, 'lot', lotA)).map((item) => item.action)).toContain('adjusted')
  })

  test('a lot is put on hold and released with a reason', async ({ request }) => {
    expect((await request.post('/api/cc_store/lots', { data: { lotId: lotA, status: 'hold' } })).status()).toBe(400)
    expect((await request.post('/api/cc_store/lots', { data: { lotId: lotA, status: 'hold', reason: 'Smell is off, retest' } })).ok()).toBeTruthy()
    expect((await lot(request, lotA)).lot.status).toBe('hold')
    expect((await request.post('/api/cc_store/lots', { data: { lotId: lotA, status: 'available', reason: 'Retest passed' } })).ok()).toBeTruthy()
    const log = await activity(request, 'lot', lotA)
    expect(log.find((item) => item.action === 'held')?.reason).toBe('Smell is off, retest')
    expect(log.find((item) => item.action === 'released')?.reason).toBe('Retest passed')
  })

  test('an adjustment is reversed by a linked counter-entry; once the lot is used it is refused', async ({ request }) => {
    expect((await adjAct(request, firstId, { action: 'reverse' })).status()).toBe(400)
    const reversed = await adjAct(request, firstId, { action: 'reverse', reason: 'Was already in the books' })
    expect(reversed.ok(), await reversed.text()).toBeTruthy()
    const row = (await reversed.json()) as Adjustment
    expect(row.status).toBe('reversed')
    const page = await lot(request, lotA)
    expect(page.lot.onHand).toBe(0)
    const counter = page.movements.find((move) => move.reverses)!
    expect(page.movements.find((move) => move.id === counter.reverses)?.reversedBy).toBe(counter.id)
    const second = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'in', quantity: 10, newLot: { lotNumber: `E2E16S-B-${stamp}` }, reason: 'Opening stock' } })
    const secondId = ((await second.json()) as { id: string }).id
    lotB = (await adjustment(request, secondId)).lotId!
    expect((await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'out', quantity: 2, lotId: lotB, reason: 'Physical count difference' } })).ok()).toBeTruthy()
    const refused = await adjAct(request, secondId, { action: 'reverse', reason: 'Try' })
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/used since/)
  })

  test('a big adjustment by the store waits for the manager', async ({ request, playwright }) => {
    const store = await loginAs(playwright)
    const big = await store.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'in', quantity: 150, lotId: lotB, reason: 'Opening stock' } })
    expect(big.ok(), `${big.status()} ${await big.text()}`).toBeTruthy()
    const body = (await big.json()) as { id: string; status: string }
    expect(body.status).toBe('pending')
    pendingId = body.id
    expect((await lot(request, lotB)).lot.onHand).toBe(8)
    const denied = await store.post('/api/cc_store/adjustments/action', { data: { id: pendingId, action: 'approve' }, headers: { [LOCK]: (await adjustment(request, pendingId)).updatedAt } })
    expect(denied.status()).toBe(403)
    await store.dispose()
    const rejected = await adjAct(request, pendingId, { action: 'reject', reason: 'Only 15 kg came, not 150' })
    expect(rejected.ok(), await rejected.text()).toBeTruthy()
    expect((await lot(request, lotB)).lot.onHand).toBe(8)
  })

  test('a stocktake by the store needs approval before posting; posted counts can be reversed until stock moves', async ({ request, playwright }) => {
    const store = await loginAs(playwright)
    const counted = await store.post('/api/cc_production/stocktake', { data: { place: 'wh_a', countDate: today, lines: [{ lotId: lotB, counted: 7 }], note: 'e2e count' } })
    expect(counted.ok(), await counted.text()).toBeTruthy()
    const body = (await counted.json()) as { id: string; pending: boolean }
    expect(body.pending).toBe(true)
    countId = body.id
    const early = await store.post('/api/cc_production/stocktakes/action', { data: { id: countId, action: 'post' }, headers: { [LOCK]: (await stocktake(request, countId)).updatedAt } })
    expect(early.status()).toBe(409)
    await store.dispose()
    expect((await countAct(request, countId, { action: 'approve' })).ok()).toBeTruthy()
    const posted = await countAct(request, countId, { action: 'post' })
    expect(posted.ok(), await posted.text()).toBeTruthy()
    expect((await lot(request, lotB)).lot.onHand).toBe(7)
    expect((await countAct(request, countId, { action: 'reverse' })).status()).toBe(400)
    const reversed = await countAct(request, countId, { action: 'reverse', reason: 'Counted the wrong drum' })
    expect(reversed.ok(), await reversed.text()).toBeTruthy()
    expect((await lot(request, lotB)).lot.onHand).toBe(8)
    const again = await request.post('/api/cc_production/stocktake', { data: { place: 'wh_a', countDate: today, lines: [{ lotId: lotB, counted: 6 }] } })
    const againId = ((await again.json()) as { id: string }).id
    expect((await stocktake(request, againId)).status).toBe('posted')
    expect((await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'out', quantity: 1, lotId: lotB, reason: 'Physical count difference' } })).ok()).toBeTruthy()
    const blocked = await countAct(request, againId, { action: 'reverse', reason: 'Try' })
    expect(blocked.status()).toBe(409)
    expect(((await blocked.json()) as { error: string }).error).toMatch(/moved since/)
  })

  test('cleanup', async ({ request }) => {
    const page = await lot(request, lotB)
    if (page.lot.onHand > 0) await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'out', quantity: page.lot.onHand, lotId: lotB, reason: 'Physical count difference', note: 'e2e cleanup' } })
    expect((await request.delete(`/api/auth/users?id=${userId}`)).ok()).toBeTruthy()
  })
})
