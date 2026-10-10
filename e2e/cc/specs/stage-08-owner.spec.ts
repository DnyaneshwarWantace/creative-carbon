import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const stamp = Date.now()
const YEAR = 2100 + (stamp % 800)
const DATE = `${YEAR}-03-14`

type Owner = {
  produced: { press: { kg: number; sheets: number }; moulding: { pieces: number; kg: number; machines: number }; resin: { kg: number; yieldPct: number | null } }
  plan: { exists: boolean; rows: Array<{ area: string; resource: string; actual: number; plannedQty: number; pct: number | null }> }
  shortfall: unknown[]
  breakdowns: { idleMachines: Array<{ number: number }>; damaged: Array<{ reason: string }>; bstageAtRisk: unknown[]; clashes: Array<{ screen: string; recordRef: string }>; failedBatches: unknown[] }
}
type MouldingDay = { shifts: Array<{ shift: number; version: string; entries: Array<{ id: string; pressId: string; pressNumber: number; status: string; productionNos: number }> }> }

async function owner(request: APIRequestContext, date: string): Promise<Owner> {
  const response = await request.get(`/api/cc_production/owner?date=${date}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

async function mouldingDay(request: APIRequestContext): Promise<MouldingDay> {
  return (await request.get(`/api/cc_production/moulding?date=${DATE}`)).json()
}

async function clearDay(request: APIRequestContext) {
  const load = async () => (await mouldingDay(request)).shifts.find((entry) => entry.shift === 1)
  let current = await load()
  for (const entry of current?.entries.filter((candidate) => candidate.status === 'posted') ?? []) {
    current = await load()
    await request.post('/api/cc_production/moulding/action', { data: { entryDate: DATE, shift: 1, action: 'reopen', pressId: entry.pressId, reason: 'e2e cleanup' }, headers: { [LOCK]: current!.version } })
  }
  current = await load()
  if (current?.entries.length) await request.put('/api/cc_production/moulding', { data: { entryDate: DATE, shift: 1, entries: [] }, headers: { [LOCK]: current.version } })
  await request.put('/api/cc_production/plan', { data: { planDate: DATE, lines: [] } })
}

test.describe.serial('Stage 8 · stock, owner overview, offline, demo', () => {
  let presses: Array<{ id: string; number: number }>
  let chemicalLot: { lotId: string; productId: string }

  test.beforeAll(async ({ request }) => {
    await clearDay(request)
  })

  test.afterAll(async ({ request }) => {
    await clearDay(request)
  })

  test('fixtures: two moulding machines posted on a test day (Stage 6)', async ({ request }) => {
    const setup = (await (await request.get('/api/cc_production/moulding/setup')).json()) as { presses: Array<{ id: string; number: number }> }
    presses = setup.presses
    const machine = (number: number) => presses.find((press) => press.number === number)!.id
    const saved = await request.put('/api/cc_production/moulding', {
      data: {
        entryDate: DATE,
        shift: 1,
        entries: [
          { pressId: machine(12), dieNo: '1142', orderQty: 100, articleWeightKg: 0.65, productionNos: 17 },
          { pressId: machine(11), dieNo: '1221', orderQty: 50, articleWeightKg: 0.9, productionNos: 10 },
        ],
      },
    })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const day = (await saved.json()) as MouldingDay
    const posted = await request.post('/api/cc_production/moulding/action', { data: { entryDate: DATE, shift: 1, action: 'post' }, headers: { [LOCK]: day.shifts[0].version } })
    expect(posted.ok(), await posted.text()).toBeTruthy()
  })

  test('the production plan is written for the day and the overview compares it with what was posted', async ({ request }) => {
    const before = (await (await request.get(`/api/cc_production/plan?date=${DATE}`)).json()) as { updatedAt: string | null; lines: unknown[] }
    expect(before.lines).toEqual([])
    const plan = await request.put('/api/cc_production/plan', { data: { planDate: DATE, lines: [{ area: 'moulding', resource: '12', item: '1142', plannedQty: 30, unit: 'nos' }, { area: 'moulding', resource: '11', plannedQty: 10, unit: 'nos' }, { area: 'press', resource: '22', plannedQty: 900, unit: 'kg' }] } })
    expect(plan.ok(), await plan.text()).toBeTruthy()
    const data = await owner(request, DATE)
    expect(data.produced.moulding).toEqual({ pieces: 27, kg: 20.05, machines: 2 })
    expect(data.produced.press.kg).toBe(0)
    expect(data.plan.rows.map((row) => [row.area, row.resource, row.actual, row.pct])).toEqual([
      ['moulding', '12', 17, 57],
      ['moulding', '11', 10, 100],
      ['press', '22', 0, 0],
    ])
    expect(data.breakdowns.idleMachines.map((press) => press.number)).not.toContain(12)
    expect(data.breakdowns.idleMachines.map((press) => press.number)).toContain(13)
  })

  test('one stock grid for every type and store, with lots and a lot page', async ({ request }) => {
    const resinSetup = (await (await request.get('/api/cc_production/resin/setup')).json()) as { chemicals: Array<{ id: string; title: string }> }
    const methanol = resinSetup.chemicals.find((entry) => entry.title === 'Methanol')!.id
    const added = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_b', productId: methanol, direction: 'in', quantity: 10, newLot: { lotNumber: `E2E8-ME-${stamp}` }, reason: 'Opening stock', note: 'e2e stage 8' } })
    expect(added.ok(), await added.text()).toBeTruthy()
    const grid = (await (await request.get('/api/cc_production/stock?kind=chemical&place=wh_b')).json()) as { items: Array<{ productId: string; title: string; place: string; qty: number; lots: number; oldestDays: number | null; reorder: boolean }>; places: unknown[] }
    expect(grid.places).toHaveLength(6)
    expect(grid.places.map((place: { key: string }) => place.key)).toContain('jobwork')
    const row = grid.items.find((item) => item.productId === methanol)!
    expect(row.place).toBe('wh_b')
    expect(row.qty).toBeGreaterThanOrEqual(10)
    expect(row.oldestDays).not.toBeNull()
    const lots = (await (await request.get('/api/cc_production/finishing/lots?kinds=chemical')).json()) as { items: Array<{ lotId: string; lotNumber: string; productId: string }> }
    const lot = lots.items.find((entry) => entry.lotNumber === `E2E8-ME-${stamp}`)!
    chemicalLot = { lotId: lot.lotId, productId: lot.productId }
    const page = (await (await request.get(`/api/cc_production/stock/lot?id=${lot.lotId}`)).json()) as { lot: { onHand: number; placeLabel: string }; movements: Array<{ qty: number; reason: string | null }> }
    expect(page.lot).toEqual(expect.objectContaining({ onHand: 10, placeLabel: 'Warehouse B' }))
    expect(page.movements[0].qty).toBe(10)
  })

  test('stocktake posts only the difference, with the count date', async ({ request }) => {
    const sheet = (await (await request.get('/api/cc_production/stocktake?place=wh_b&kind=chemical')).json()) as { items: Array<{ lotId: string }> }
    expect(sheet.items.some((item) => item.lotId === chemicalLot.lotId)).toBeTruthy()
    const result = await request.post('/api/cc_production/stocktake', { data: { place: 'wh_b', countDate: today, lines: [{ lotId: chemicalLot.lotId, counted: 9.5 }], note: 'e2e count' } })
    expect(result.ok(), await result.text()).toBeTruthy()
    expect(((await result.json()) as { adjusted: number }).adjusted).toBe(1)
    const page = (await (await request.get(`/api/cc_production/stock/lot?id=${chemicalLot.lotId}`)).json()) as { lot: { onHand: number }; movements: Array<{ qty: number; reason: string | null }> }
    expect(page.lot.onHand).toBe(9.5)
    expect(page.movements.at(-1)).toEqual(expect.objectContaining({ qty: -0.5 }))
    expect(page.movements.at(-1)?.reason).toMatch(new RegExp(`Stocktake ${today}: counted 9.5, book 10`))
    const wrongStore = await request.post('/api/cc_production/stocktake', { data: { place: 'wh_a', countDate: today, lines: [{ lotId: chemicalLot.lotId, counted: 1 }] } })
    expect(wrongStore.status()).toBe(400)
  })

  test('offline: a queued save replays without the version (last save wins) and the clash is logged for the owner', async ({ request }) => {
    const machine = (number: number) => presses.find((press) => press.number === number)!.id
    const first = await request.put('/api/cc_production/moulding', { data: { entryDate: DATE, shift: 2, entries: [{ pressId: machine(5), dieNo: '1230', articleWeightKg: 3.4, productionNos: 4 }] } })
    const staleVersion = ((await first.json()) as MouldingDay).shifts[1].version
    const other = await request.put('/api/cc_production/moulding', { data: { entryDate: DATE, shift: 2, entries: [{ pressId: machine(5), dieNo: '1230', articleWeightKg: 3.4, productionNos: 6 }] }, headers: { [LOCK]: staleVersion } })
    expect(other.ok()).toBeTruthy()
    const stale = await request.put('/api/cc_production/moulding', { data: { entryDate: DATE, shift: 2, entries: [{ pressId: machine(5), dieNo: '1230', articleWeightKg: 3.4, productionNos: 9 }] }, headers: { [LOCK]: staleVersion } })
    expect(stale.status()).toBe(409)
    const clash = await request.post('/api/cc_production/clash', { data: { screen: 'Moulding register', recordRef: `${DATE} shift 2`, detail: 'e2e offline replay' } })
    expect(clash.status()).toBe(201)
    const replay = await request.put('/api/cc_production/moulding', { data: { entryDate: DATE, shift: 2, entries: [{ pressId: machine(5), dieNo: '1230', articleWeightKg: 3.4, productionNos: 9 }] } })
    expect(replay.ok(), await replay.text()).toBeTruthy()
    expect(((await replay.json()) as MouldingDay).shifts[1].entries[0].productionNos).toBe(9)
    const data = await owner(request, today)
    expect(data.breakdowns.clashes.some((row) => row.recordRef === `${DATE} shift 2`)).toBeTruthy()
  })

  test('installs to the home screen: manifest, icons and the offline worker are served', async ({ request }) => {
    const manifest = await request.get('/cc-manifest.webmanifest')
    expect(manifest.ok()).toBeTruthy()
    const body = JSON.parse(await manifest.text()) as { name: string; display: string; icons: Array<{ src: string }> }
    expect(body).toEqual(expect.objectContaining({ name: 'Creative Carbon Composites', display: 'standalone' }))
    for (const icon of body.icons) expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy()
    const worker = await request.get('/cc-sw.js')
    expect(worker.ok()).toBeTruthy()
    expect(await worker.text()).toContain('cc-plant-v1')
  })

  test('the demo data, when loaded, shows their own numbers', async ({ request }) => {
    const resin = (await (await request.get('/api/cc_production/resin/batches?search=CCCPL/110726/06')).json()) as { items: Array<{ batchNo: string; yieldPct: number; totalInputKg: number }> }
    test.skip(!resin.items.some((item) => item.batchNo === 'CCCPL/110726/06'), 'demo data not loaded (node scripts/cc-seed/seed-demo.mjs)')
    expect(resin.items.find((item) => item.batchNo === 'CCCPL/110726/06')).toEqual(expect.objectContaining({ totalInputKg: 2971.5, yieldPct: 53.8 }))
    const press = (await (await request.get('/api/cc_production/press/batches?date=2026-10-02')).json()) as { items: Array<{ batchNo: string; totalKg: number; totalSheets: number }> }
    expect(press.items.find((item) => item.batchNo === 'F/03/10/2026')).toEqual(expect.objectContaining({ totalKg: 996.3, totalSheets: 24 }))
    const day = await owner(request, '2026-10-02')
    expect(day.produced.press).toEqual(expect.objectContaining({ kg: 3596.4, sheets: 78 }))
    const sheets = (await (await request.get('/api/cc_production/coating/sheets?date=2026-07-03')).json()) as { items: Array<{ dryerCode: string; outputTotal: number }> }
    expect(sheets.items.find((item) => item.dryerCode === 'Dryer 2')?.outputTotal).toBe(1570.66)
  })

  test('owner and stock pages open', async ({ request }) => {
    for (const path of ['/backend/owner', `/backend/owner/plan?date=${DATE}`, '/backend/stock', '/backend/stock/stocktake', `/backend/stock/lots/${chemicalLot.lotId}`]) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })

  test('clean up: test moulding reopened and removed, test stock out', async ({ request }) => {
    for (const shift of [1, 2]) {
      let day = await mouldingDay(request)
      for (const entry of day.shifts[shift - 1].entries.filter((candidate) => candidate.status === 'posted')) {
        const reopened = await request.post('/api/cc_production/moulding/action', { data: { entryDate: DATE, shift, action: 'reopen', pressId: entry.pressId, reason: 'e2e cleanup' }, headers: { [LOCK]: day.shifts[shift - 1].version } })
        expect(reopened.ok(), await reopened.text()).toBeTruthy()
        day = (await reopened.json()) as MouldingDay
      }
      const cleared = await request.put('/api/cc_production/moulding', { data: { entryDate: DATE, shift, entries: [] }, headers: { [LOCK]: day.shifts[shift - 1].version } })
      expect(cleared.ok(), await cleared.text()).toBeTruthy()
    }
    const out = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_b', productId: chemicalLot.productId, direction: 'out', quantity: 9.5, lotId: chemicalLot.lotId, reason: 'Physical count difference', note: 'e2e stage 8 cleanup' } })
    expect(out.ok(), await out.text()).toBeTruthy()
  })
})
