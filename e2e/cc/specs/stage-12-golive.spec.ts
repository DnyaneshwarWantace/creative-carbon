import { expect, test, type APIRequestContext } from '@playwright/test'

const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const LOT = `OPEN-E2E-${stamp}`

type Report = { cutoverDate: string | null; targetDays: number; percent: number; checks: Array<{ key: string; state: string; title: string; detail: string; confirmedBy?: string | null }> }
type Sheet = { live: boolean; saved: boolean; rows: Array<{ productId: string; title: string; system: number; paper: number | null; diff: number | null; matched: boolean | null }> }

async function upload(request: APIRequestContext, dryRun: boolean) {
  const row = (store: string, item: string, lot: string, quantity: string, extra: Record<string, string> = {}) => ({ 'Stock as on': today, Store: store, 'Item (name or code)': item, 'Lot / batch no.': lot, Quantity: quantity, ...extra })
  return request.post('/api/cc_production/upload', {
    data: {
      register: 'opening_stock',
      dryRun,
      rows: [
        row('Warehouse A', 'Phenol', `${LOT}-PH`, '125.500'),
        row('FG store', 'Fabric 10x10 Sheet', `${LOT}-SH`, '40', { 'Thickness (mm)': '6', Size: '8x4', 'Pieces (nos)': '4', 'QC status': 'Approved' }),
        row('Godown 9', 'Phenol', `${LOT}-X1`, '10'),
        row('Warehouse A', 'No such item anywhere', `${LOT}-X2`, '10'),
        row('Resin tank', 'Phenol', `${LOT}-X3`, '10'),
        row('Warehouse A', 'Phenol', `${LOT}-PH`, '1'),
      ],
    },
  })
}

async function lotQty(request: APIRequestContext, place: string, lot: string): Promise<{ onHand: number; status: string } | null> {
  const book = (await (await request.get(`/api/cc_store/stock?place=${place}&q=${encodeURIComponent(LOT)}`)).json()) as { items: Array<{ lots: Array<{ lotNumber: string | null; onHand: number; status: string }> }> }
  return book.items.flatMap((item) => item.lots).find((entry) => entry.lotNumber === lot) ?? null
}

test.describe.serial('Stage 12 · opening stock, paper vs system, go-live checklist', () => {
  let before: Report

  test('opening stock: checked first, problems per row, then loaded into the right stores', async ({ request }) => {
    before = (await (await request.get('/api/cc_dashboard/golive')).json()) as Report
    const check = await upload(request, true)
    expect(check.ok(), await check.text()).toBeTruthy()
    const dry = (await check.json()) as { created: number; errors: Array<{ row: number; error: string }>; plan: string[] }
    expect(dry.created).toBe(2)
    const messages = dry.errors.map((entry) => entry.error).join(' | ')
    expect(messages).toMatch(/Store "Godown 9" is not one of/)
    expect(messages).toMatch(/not in the item master/)
    expect(messages).toMatch(/Only resin goes in the Resin tank/)
    expect(messages).toMatch(/twice in the file/)
    expect(dry.plan.join(' ')).toMatch(/into the Warehouse A/)
    expect(await lotQty(request, 'wh_a', `${LOT}-PH`)).toBeNull()

    const post = (await (await upload(request, false)).json()) as { created: number }
    expect(post.created).toBe(2)
    expect(await lotQty(request, 'wh_a', `${LOT}-PH`)).toMatchObject({ onHand: 125.5, status: 'available' })
    expect(await lotQty(request, 'fg', `${LOT}-SH`)).toMatchObject({ onHand: 40 })
  })

  test('opening stock is loaded once: the same lots again are refused', async ({ request }) => {
    const again = (await (await upload(request, false)).json()) as { created: number; errors: Array<{ error: string }> }
    expect(again.created).toBe(0)
    expect(again.errors.map((entry) => entry.error).join(' | ')).toMatch(/already in stock; opening stock is loaded once/)
    expect(await lotQty(request, 'wh_a', `${LOT}-PH`)).toMatchObject({ onHand: 125.5 })
  })

  test('paper vs system: a difference is flagged, an agreeing book is not; past days without a check are refused', async ({ request }) => {
    const sheet = (await (await request.get(`/api/cc_store/parallel?place=wh_a&date=${today}`)).json()) as Sheet
    expect(sheet.live).toBe(true)
    const phenol = sheet.rows.find((row) => row.title === 'Phenol')!
    expect(phenol.system).toBeGreaterThanOrEqual(125.5)
    const off = (await (await request.post('/api/cc_store/parallel', { data: { place: 'wh_a', date: today, rows: [{ productId: phenol.productId, paper: phenol.system + 50 }], note: 'e2e' } })).json()) as Sheet
    expect(off.rows.find((row) => row.productId === phenol.productId)).toMatchObject({ diff: 50, matched: false })
    const bad = (await (await request.get('/api/cc_store/parallel?summary=1&targetDays=14')).json()) as { streak: number; days: Array<{ date: string; agrees: boolean; differences: Array<{ title: string }> }> }
    expect(bad.days[0]).toMatchObject({ date: today, agrees: false })
    expect(bad.streak).toBe(0)
    const fixed = (await (await request.post('/api/cc_store/parallel', { data: { place: 'wh_a', date: today, rows: [{ productId: phenol.productId, paper: phenol.system + 0.2 }] } })).json()) as Sheet
    expect(fixed.rows.find((row) => row.productId === phenol.productId)?.matched).toBe(true)
    const pastDay = await request.post('/api/cc_store/parallel', { data: { place: 'wh_a', date: '2001-01-02', rows: [{ productId: phenol.productId, paper: 1 }] } })
    expect(pastDay.status()).toBe(409)
  })

  test('go-live checklist: worked out from the data, on-site items ticked with a name', async ({ request }) => {
    const report = (await (await request.get('/api/cc_dashboard/golive')).json()) as Report
    const state = (key: string) => report.checks.find((check) => check.key === key)
    expect(state('opening')?.state).not.toBe('todo')
    expect(state('opening')?.detail).toMatch(/Warehouse A/)
    expect(state('test_data')?.state).toBe('warn')
    expect(report.checks.map((check) => check.key)).toEqual(expect.arrayContaining(['company', 'items', 'parties', 'plant', 'people', 'tally', 'parallel', 'series', 'training', 'hosting']))
    const ticked = (await (await request.put('/api/cc_dashboard/golive', { data: { confirm: { key: 'training', done: true }, targetDays: 3 } })).json()) as Report
    expect(ticked.checks.find((check) => check.key === 'training')).toMatchObject({ state: 'done', confirmedBy: expect.any(String) })
    expect(ticked.checks.find((check) => check.key === 'parallel')?.title).toMatch(/3 days in a row/)
    const unticked = (await (await request.put('/api/cc_dashboard/golive', { data: { confirm: { key: 'training', done: false }, targetDays: before.targetDays } })).json()) as Report
    expect(unticked.checks.find((check) => check.key === 'training')?.state).toBe(before.checks.find((check) => check.key === 'training')?.state)
  })

  test('pages open and the opening-stock template downloads', async ({ request }) => {
    for (const path of ['/backend/golive', '/backend/store/parallel', '/backend/upload']) expect((await request.get(path)).status(), path).toBe(200)
    const template = await request.get(`/api/cc_production/upload/template?register=opening_stock&date=${today}`)
    expect(template.ok()).toBeTruthy()
  })

  test('cleanup: the test opening lots are taken back out', async ({ request }) => {
    for (const [place, lot] of [['wh_a', `${LOT}-PH`], ['fg', `${LOT}-SH`]]) {
      const book = (await (await request.get(`/api/cc_store/stock?place=${place}&q=${encodeURIComponent(LOT)}`)).json()) as { items: Array<{ productId: string; lots: Array<{ lotId: string | null; lotNumber: string | null; onHand: number }> }> }
      const item = book.items.find((entry) => entry.lots.some((row) => row.lotNumber === lot))!
      const entry = item.lots.find((row) => row.lotNumber === lot)!
      const out = await request.post('/api/cc_store/stock/adjust', { data: { place, productId: item.productId, direction: 'out', quantity: entry.onHand, lotId: entry.lotId, reason: 'Physical count difference', note: 'e2e cleanup' } })
      expect(out.ok(), await out.text()).toBeTruthy()
    }
  })
})
