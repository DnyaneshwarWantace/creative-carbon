import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const YEAR = 2100 + (stamp % 800)
const DATE = `${YEAR}-06-13`
const round = (value: number) => Math.round(value * 1000) / 1000

type Entry = { id: string; pressId: string; pressNumber: number; dieNo: string; productionNos: number; total: number; orderQty: number | null; status: string; outputLotNumber: string | null; weightKg: number }
type Shift = { shift: number; version: string; entries: Entry[]; grandTotal: number; weightTotal: number; signoff: { shiftIncharge: string | null; storeIncharge: string | null; authorised: string | null } }
type Day = { shifts: Shift[]; errors?: string[]; error?: string }
type Setup = { presses: Array<{ id: string; number: number }>; operators: string[]; chindi: Array<{ id: string; title: string }>; cloths: Array<{ id: string; title: string }> }

type Column = { m: number; dieNo: string; orderQty?: number; articleWeightKg: number; productionNos: number; operatorName?: string; priorMade?: number; dieHeatTime?: string; chindiKg?: number; clothKg?: number; clothNote?: string; cloth?: string }

const SHIFT_1: Column[] = [
  { m: 1, dieNo: '500', orderQty: 15, articleWeightKg: 1.6, productionNos: 7, operatorName: 'Anjani', priorMade: 8, chindiKg: 2 },
  { m: 2, dieNo: '1155', orderQty: 22, articleWeightKg: 15.3, productionNos: 3, operatorName: 'Anjani', priorMade: 1 },
  { m: 3, dieNo: '1140RL', orderQty: 40, articleWeightKg: 5.3, productionNos: 8, operatorName: 'Anil', priorMade: 32, dieHeatTime: '(34mm)' },
  { m: 4, dieNo: '1138', orderQty: 400, articleWeightKg: 6.3, productionNos: 7, operatorName: 'Nagendra', clothKg: 1.5, clothNote: '15x2, 6x1', cloth: '10x10' },
  { m: 10, dieNo: '16x11x1000', orderQty: 10000, articleWeightKg: 0.6, productionNos: 36 },
  { m: 11, dieNo: '1221', orderQty: 50, articleWeightKg: 0.9, productionNos: 17, operatorName: 'Rajesh' },
  { m: 12, dieNo: '1142', orderQty: 100, articleWeightKg: 0.65, productionNos: 17, operatorName: 'Rajesh', priorMade: 80 },
  { m: 15, dieNo: '520', orderQty: 100, articleWeightKg: 2.1, productionNos: 10, operatorName: 'Anil', priorMade: 75, dieHeatTime: '(27mm)' },
  { m: 19, dieNo: '1206', orderQty: 100, articleWeightKg: 2.25, productionNos: 12, operatorName: 'Anjani', priorMade: 8 },
  { m: 20, dieNo: '1401RA', orderQty: 100, articleWeightKg: 5.2, productionNos: 7, operatorName: 'Nagendra', priorMade: 7, dieHeatTime: '(29mm)' },
]

async function day(request: APIRequestContext): Promise<Day> {
  const response = await request.get(`/api/cc_production/moulding?date=${DATE}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

async function clearDay(request: APIRequestContext, date: string) {
  for (const shift of [1, 2]) {
    const load = async () => ((await (await request.get(`/api/cc_production/moulding?date=${date}`)).json()) as Day).shifts.find((entry) => entry.shift === shift)
    let current = await load()
    for (const entry of current?.entries.filter((candidate) => candidate.status === 'posted') ?? []) {
      current = await load()
      await request.post('/api/cc_production/moulding/action', { data: { entryDate: date, shift, action: 'reopen', pressId: entry.pressId, reason: 'e2e cleanup' }, headers: { [LOCK]: current!.version } })
    }
    current = await load()
    if (current?.entries.length) await request.put('/api/cc_production/moulding', { data: { entryDate: date, shift, entries: [] }, headers: { [LOCK]: current.version } })
  }
}

async function freeKg(request: APIRequestContext, productId: string): Promise<number> {
  const stock = (await (await request.get('/api/cc_store/stock?place=wh_a')).json()) as { items: Array<{ productId: string; usable: number }> }
  return stock.items.find((item) => item.productId === productId)?.usable ?? 0
}

test.describe.serial('Stage 6 · moulded products', () => {
  let setup: Setup
  const machine = (number: number) => setup.presses.find((press) => press.number === number)!.id

  const toInput = (column: Column) => ({
    pressId: machine(column.m),
    dieNo: column.dieNo,
    orderQty: column.orderQty ?? null,
    articleWeightKg: column.articleWeightKg,
    productionNos: column.productionNos,
    operatorName: column.operatorName ?? null,
    priorMade: column.priorMade ?? null,
    dieHeatTime: column.dieHeatTime ?? null,
    chindiKg: column.chindiKg ?? null,
    clothKg: column.clothKg ?? null,
    clothNote: column.clothNote ?? null,
    clothProductId: column.cloth ? setup.cloths.find((cloth) => cloth.title === column.cloth)!.id : null,
  })

  const putShift = async (request: APIRequestContext, shift: number, columns: Column[]) => {
    const current = (await day(request)).shifts.find((entry) => entry.shift === shift)!
    return request.put('/api/cc_production/moulding', { data: { entryDate: DATE, shift, entries: columns.map(toInput) }, headers: current.entries.length ? { [LOCK]: current.version } : {} })
  }

  const act = async (request: APIRequestContext, shift: number, action: string, pressId?: string) => {
    const current = (await day(request)).shifts.find((entry) => entry.shift === shift)!
    return request.post('/api/cc_production/moulding/action', { data: { entryDate: DATE, shift, action, ...(pressId ? { pressId } : {}), ...(action === 'reopen' ? { reason: 'e2e correction' } : {}) }, headers: { [LOCK]: current.version } })
  }

  test('the register knows machines 1–20, the operators and the dies (Stage 1 masters)', async ({ request }) => {
    setup = (await (await request.get('/api/cc_production/moulding/setup')).json()) as Setup
    for (let number = 1; number <= 20; number += 1) expect(setup.presses.map((press) => press.number)).toContain(number)
    expect(setup.presses.map((press) => press.number)).not.toContain(21)
    expect(setup.operators).toEqual(expect.arrayContaining(['Anjani', 'Anil', 'Nagendra', 'Rajesh']))
    const lookup = (await (await request.get('/api/cc_production/moulding/dies?lookup=1142,NOPE-9')).json()) as { items: Array<{ dieNo: string; found: boolean }> }
    expect(lookup.items).toEqual(expect.arrayContaining([expect.objectContaining({ dieNo: '1142', found: true }), expect.objectContaining({ dieNo: 'NOPE-9', found: false })]))
  })

  test('fixtures: chindi and cloth in Warehouse A', async ({ request }) => {
    for (const [productId, quantity, lotNumber] of [
      [setup.chindi[0].id, 100, `E2E6-CH-${stamp}`],
      [setup.cloths.find((cloth) => cloth.title === '10x10')!.id, 50, `E2E6-CL-${stamp}`],
    ] as Array<[string, number, string]>) {
      const response = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'in', quantity, newLot: { lotNumber }, reason: 'Opening stock', note: 'e2e stage 6' } })
      expect(response.ok(), await response.text()).toBeTruthy()
    }
  })

  test('the 13 June 1st shift types in: running totals like "97 of 100", grand and weight totals', async ({ request }) => {
    const saved = await putShift(request, 1, SHIFT_1)
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const shift = ((await saved.json()) as Day).shifts[0]
    const byMachine = (number: number) => shift.entries.find((entry) => entry.pressNumber === number)!
    expect(shift.entries).toHaveLength(10)
    expect(byMachine(12).total).toBe(97)
    expect(byMachine(1).total).toBe(15)
    expect(byMachine(2).total).toBe(4)
    expect(byMachine(15).total).toBe(85)
    expect(byMachine(19).total).toBe(20)
    expect(byMachine(20).total).toBe(14)
    expect(shift.grandTotal).toBe(124)
    expect(shift.weightTotal).toBe(275.95)
  })

  test('a die cannot be on two machines in the same shift; another shift is fine', async ({ request }) => {
    const clash = await putShift(request, 1, [...SHIFT_1, { m: 13, dieNo: '1142', articleWeightKg: 0.65, productionNos: 1 }])
    expect(clash.status()).toBe(409)
    expect(((await clash.json()) as { error: string }).error).toMatch(/Die 1142 is already on machine 12 in shift 1/)
    const unknown = await putShift(request, 1, [...SHIFT_1, { m: 13, dieNo: 'NOPE-9', articleWeightKg: 1, productionNos: 1 }])
    expect(unknown.status()).toBe(400)
    const second = await putShift(request, 2, [{ m: 12, dieNo: '1142', orderQty: 100, articleWeightKg: 0.65, productionNos: 3, operatorName: 'Rajesh' }])
    expect(second.ok(), await second.text()).toBeTruthy()
    const entry = ((await second.json()) as Day).shifts[1].entries[0]
    expect(entry.total).toBe(100)
  })

  test('posting the 1st shift takes chindi and cloth out and makes moulded lots in pieces', async ({ request }) => {
    const chindiBefore = await freeKg(request, setup.chindi[0].id)
    const clothId = setup.cloths.find((cloth) => cloth.title === '10x10')!.id
    const clothBefore = await freeKg(request, clothId)
    const posted = await act(request, 1, 'post')
    expect(posted.ok(), await posted.text()).toBeTruthy()
    const result = (await posted.json()) as Day
    expect(result.errors).toEqual([])
    const shift = result.shifts[0]
    expect(shift.entries.every((entry) => entry.status === 'posted')).toBeTruthy()
    const m12 = shift.entries.find((entry) => entry.pressNumber === 12)!
    expect(m12.outputLotNumber).toBe(`M-1306${String(YEAR).slice(2)}-S1-P12`)
    expect(await freeKg(request, setup.chindi[0].id)).toBe(round(chindiBefore - 2))
    expect(await freeKg(request, clothId)).toBe(round(clothBefore - 1.5))

    const detail = (await (await request.get(`/api/cc_production/moulding?id=${m12.id}`)).json()) as { leftNos: number; run: Array<{ total: number }>; productionNos: number }
    expect(detail.leftNos).toBe(17)
    expect(detail.run.map((entry) => entry.total)).toEqual([97, 100])

    const floor = (await (await request.get('/api/cc_store/stock?place=floor')).json()) as { items: Array<{ title: string; lots: Array<{ lotNumber: string | null; onHand: number }> }> }
    const moulded = floor.items.find((item) => item.lots.some((lot) => lot.lotNumber === m12.outputLotNumber))
    expect(moulded?.title).toMatch(/^Moulded 1142/)

    const blocked = await putShift(request, 1, [{ m: 13, dieNo: '1142', articleWeightKg: 0.65, productionNos: 1 }])
    expect(blocked.status()).toBe(409)
  })

  test('die availability shows which machine holds each die in each shift', async ({ request }) => {
    const data = (await (await request.get(`/api/cc_production/moulding/dies?date=${DATE}`)).json()) as { dies: Array<{ dieNo: string; shift1: number | null; shift2: number | null }>; idleMachines: Record<string, number[]> }
    expect(data.dies.find((die) => die.dieNo === '1142')).toEqual(expect.objectContaining({ shift1: 12, shift2: 12 }))
    expect(data.dies.find((die) => die.dieNo === '500')).toEqual(expect.objectContaining({ shift1: 1, shift2: null }))
    expect(data.idleMachines['1']).toEqual(expect.arrayContaining([5, 6, 7, 8, 9]))
  })

  test('three sign-offs are recorded and never hold up posting; reopen gives the stock back', async ({ request }) => {
    for (const action of ['sign_shift', 'sign_store', 'sign_authorised']) expect((await act(request, 1, action)).ok()).toBeTruthy()
    const signoff = (await day(request)).shifts[0].signoff
    expect(signoff.shiftIncharge && signoff.storeIncharge && signoff.authorised).toBeTruthy()
    const chindiBefore = await freeKg(request, setup.chindi[0].id)
    const reopened = await act(request, 1, 'reopen', machine(1))
    expect(reopened.ok(), await reopened.text()).toBeTruthy()
    expect(((await reopened.json()) as Day).shifts[0].entries.find((entry) => entry.pressNumber === 1)!.status).toBe('draft')
    expect(await freeKg(request, setup.chindi[0].id)).toBe(round(chindiBefore + 2))
  })

  test('a shift comes in through the upload tile and posts (Stage 2 upload centre)', async ({ request }) => {
    const csv = ['Date,Shift,Machine No.,Die No.,Order Qty.,Weight of Article,Shift Prod.,Operator Name,Post', `13/06/${YEAR},2,5,1230,60,3.400,9,Anil,Yes`, `do,do,6,4306L,100,1.220,4,Vinod,`].join('\n')
    const response = await request.post('/api/cc_production/upload', { multipart: { register: 'moulding', dryRun: 'false', file: { name: `moulding-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) } } })
    expect(response.ok(), await response.text()).toBeTruthy()
    const report = (await response.json()) as { created: number; failed: number; errors: unknown[] }
    expect(report.failed, JSON.stringify(report.errors)).toBe(0)
    expect(report.created).toBe(2)
    const shift = (await day(request)).shifts[1]
    expect(shift.entries.map((entry) => entry.pressNumber).sort((a, b) => a - b)).toEqual([5, 6, 12])
    expect(shift.entries.every((entry) => entry.status === 'posted')).toBeTruthy()
    expect(shift.grandTotal).toBe(16)
  })

  test('moulding pages open', async ({ request }) => {
    const entryId = (await day(request)).shifts[0].entries[0].id
    for (const path of [`/backend/moulding?date=${DATE}`, `/backend/moulding/entries/${entryId}`, `/backend/moulding/dies?date=${DATE}`]) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })

  test.afterAll(async ({ request }) => {
    await clearDay(request, DATE)
  })

  test('clean up: every entry reopened and removed, test stock taken back out', async ({ request }) => {
    await clearDay(request, DATE)
    expect((await day(request)).shifts.every((shift) => shift.entries.length === 0)).toBeTruthy()
    const stock = (await (await request.get('/api/cc_store/stock?place=wh_a')).json()) as { items: Array<{ productId: string; lots: Array<{ lotId: string; lotNumber: string | null; free: number }> }> }
    for (const item of stock.items) {
      for (const lot of item.lots) {
        if (!(lot.lotNumber ?? '').startsWith('E2E6-') || !(lot.free > 0)) continue
        const out = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId: item.productId, direction: 'out', quantity: lot.free, lotId: lot.lotId, reason: 'Physical count difference', note: 'e2e stage 6 cleanup' } })
        expect(out.ok(), await out.text()).toBeTruthy()
      }
    }
  })
})
