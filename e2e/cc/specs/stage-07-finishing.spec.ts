import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const stamp = Date.now()
const YEAR = 2100 + (stamp % 800)
const PRESS_DATE = `${YEAR}-10-05`
const round = (value: number) => Math.round(value * 1000) / 1000

type Lot = { lotId: string; lotNumber: string; productId: string; title: string; kind: string; unit: string; place: string; status: string; onHand: number; free: number; nosLeft: number | null; thicknessMm: number | null; cutSize: string | null }
type Setup = { floorLots: Lot[]; cutSizes: string[]; rejectionReasons: string[]; testTypes: string[]; standards: string[] }

async function setup(request: APIRequestContext): Promise<Setup> {
  const response = await request.get('/api/cc_production/finishing/setup')
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

async function lotsIn(request: APIRequestContext, place: string): Promise<Lot[]> {
  const items = ((await (await request.get('/api/cc_production/finishing/lots')).json()) as { items: Lot[] }).items
  return items.filter((lot) => lot.place === place)
}

async function addStock(request: APIRequestContext, productId: string, quantity: number, lotNumber: string) {
  const response = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'in', quantity, newLot: { lotNumber }, reason: 'Opening stock', note: 'e2e stage 7' } })
  expect(response.ok(), await response.text()).toBeTruthy()
}

test.describe.serial('Stage 7 · cutting, thickness, FG inspection, lab, bought-in', () => {
  const ids: Record<string, string> = {}
  let lot25: Lot
  let lot10: Lot
  let cutLot: Lot
  let fgReport: { id: string; updatedAt: string }

  test('fixtures: a 10x10 press batch made from resin → coating → press (Stages 3–5)', async ({ request }) => {
    const coating = (await (await request.get('/api/cc_production/coating/setup')).json()) as { dryers: Array<{ id: string; code: string }>; cloths: Array<{ id: string; title: string }> }
    const dryer = coating.dryers.find((entry) => entry.code === 'Dryer 3')!
    const existing = (await (await request.get(`/api/cc_production/coating/sheets?date=${today}`)).json()) as { items: Array<{ dryerId: string }> }
    expect(existing.items.some((item) => item.dryerId === dryer.id), 'a Dryer 3 sheet already exists today').toBeFalsy()
    const clothId = coating.cloths.find((cloth) => cloth.title === '10x10')!.id
    await addStock(request, clothId, 220, `E2E7-CL-${stamp}`)
    const resinSetup = (await (await request.get('/api/cc_production/resin/setup')).json()) as { reactors: Array<{ id: string }>; chemicals: Array<{ id: string; title: string }> }
    const chem = (title: string) => resinSetup.chemicals.find((entry) => entry.title === title)!.id
    await addStock(request, chem('Phenol'), 200, `E2E7-PH-${stamp}`)
    await addStock(request, chem('Formaldehyde'), 200, `E2E7-FO-${stamp}`)
    const resin = (await (await request.post('/api/cc_production/resin/batches', { data: { batchDate: today, reactorId: resinSetup.reactors[0].id, grade: 'PFC', materials: [{ productId: chem('Phenol'), kg: 200 }, { productId: chem('Formaldehyde'), kg: 200 }], yieldKg: 300 } })).json()) as { id: string; updatedAt: string }
    ids.resin = resin.id
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: resin.id, action: 'post' }, headers: { [LOCK]: resin.updatedAt } })).ok()).toBeTruthy()
    const sheet = (await (await request.post('/api/cc_production/coating/sheets', { data: { sheetDate: today, dryerId: dryer.id, rows: [{ sn: 1, clothProductId: clothId, rawKg: 200, coatedNos: 80, rcPct: 45 }] } })).json()) as { id: string; updatedAt: string }
    ids.sheet = sheet.id
    expect((await request.post('/api/cc_production/coating/sheets/action', { data: { id: sheet.id, action: 'post' }, headers: { [LOCK]: sheet.updatedAt } })).ok()).toBeTruthy()
    const press = ((await (await request.get(`/api/cc_production/press/setup?date=${PRESS_DATE}`)).json()) as { presses: Array<{ id: string; number: number }> }).presses.find((entry) => entry.number === 22)!
    const batch = (await (await request.post('/api/cc_production/press/batches', {
      data: {
        batchDate: PRESS_DATE,
        pressId: press.id,
        daylights: [
          { no: 1, sheets: [{ thicknessMm: 25, weightKg: 118, grade: '10x10' }] },
          { no: 2, sheets: [{ thicknessMm: 25, weightKg: 118, grade: '10x10' }] },
          { no: 3, sheets: [{ thicknessMm: 10, count: 2, weightKg: 46, grade: '10x10' }] },
        ],
      },
    })).json()) as { id: string; updatedAt: string; batchNo: string }
    ids.press = batch.id
    const posted = await request.post('/api/cc_production/press/batches/action', { data: { id: batch.id, action: 'post' }, headers: { [LOCK]: batch.updatedAt } })
    expect(posted.ok(), await posted.text()).toBeTruthy()
    const floor = (await setup(request)).floorLots
    lot25 = floor.find((lot) => lot.lotNumber === `${batch.batchNo} 25mm 10x10`)!
    lot10 = floor.find((lot) => lot.lotNumber === `${batch.batchNo} 10mm 10x10`)!
    expect(lot25.nosLeft).toBe(2)
    expect(lot25.free).toBe(236)
    expect(lot10.thicknessMm).toBe(10)
  })

  test('cutting: two 25 mm sheets trimmed to 8x4, trim loss 7.8 % within 6–10 %', async ({ request }) => {
    const tooMany = await request.post('/api/cc_production/cutting', { data: { entryDate: today, lotId: lot25.lotId, cutSize: '8x4', sheets: [{ weightKg: 100 }, { weightKg: 100 }, { weightKg: 100 }] } })
    expect(tooMany.status()).toBe(409)
    const response = await request.post('/api/cc_production/cutting', { data: { entryDate: today, lotId: lot25.lotId, cutSize: '8x4', sheets: [{ no: 1, weightKg: 108.6 }, { no: 2, weightKg: 108.9 }] } })
    expect(response.status(), await response.text()).toBe(201)
    const cut = (await response.json()) as { id: string; trimmedKg: number; trimKg: number; trimPct: number; warnings: string[]; outputLotNumber: string; updatedAt: string }
    ids.cut = cut.id
    expect(cut.trimmedKg).toBe(217.5)
    expect(cut.trimKg).toBe(18.5)
    expect(cut.trimPct).toBe(7.8)
    expect(cut.warnings).toEqual([])
    const floor = (await setup(request)).floorLots
    expect(floor.some((lot) => lot.lotId === lot25.lotId)).toBeFalsy()
    cutLot = floor.find((lot) => lot.lotNumber === cut.outputLotNumber)!
    expect(cutLot.nosLeft).toBe(2)
    expect(cutLot.cutSize).toBe('8x4')
    expect(cutLot.thicknessMm).toBe(25)
  })

  test('thickness: 12 readings; out of tolerance holds the lot, a passing re-check frees it', async ({ request }) => {
    const pass = await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotId: cutLot.lotId, minusMm: 0.5, plusMm: 1.2, readings: [25.6, 26.1, 25.7, 25.6, 26.0, 25.8, 25.5, 25.6, 25.5, 25.5, 25.6, 25.6] } })
    expect(pass.status(), await pass.text()).toBe(201)
    const passed = (await pass.json()) as { result: string; outOfTolerance: number; targetMm: number }
    expect(passed).toEqual(expect.objectContaining({ result: 'pass', outOfTolerance: 0, targetMm: 25 }))

    const hold = await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotId: lot10.lotId, grade: 'F2 F3', daylight: 'D4', minusMm: 0.2, plusMm: 0.8, readings: [10.6, 10.8, 10.8, 10.6, 10.9, 10.9, 11.0, 10.8, 10.9, 10.8, 10.8, 10.6] } })
    const held = (await hold.json()) as { result: string; outOfTolerance: number }
    expect(held).toEqual(expect.objectContaining({ result: 'hold', outOfTolerance: 4 }))
    expect((await setup(request)).floorLots.find((lot) => lot.lotId === lot10.lotId)?.status).toBe('hold')

    const refused = await request.post('/api/cc_production/fg-inspection', { data: { reportDate: today, rows: [{ sourceLotId: lot10.lotId, qtyNos: 2, disposition: 'stock' }] } })
    const draft = (await refused.json()) as { id: string; updatedAt: string }
    const post = await request.post('/api/cc_production/fg-inspection/action', { data: { id: draft.id, action: 'post' }, headers: { [LOCK]: draft.updatedAt } })
    expect(post.status()).toBe(409)
    expect(((await post.json()) as { error: string }).error).toMatch(/on hold/)
    fgReport = (await (await request.get(`/api/cc_production/fg-inspection?id=${draft.id}`)).json()) as typeof fgReport

    const recheck = await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotId: lot10.lotId, readings: [10.6, 10.8, 10.8, 10.6, 10.9, 10.9, 11.0, 10.8, 10.9, 10.8, 10.8, 10.6], result: 'pass', notes: 'Accepted by QC head (e2e)' } })
    expect(((await recheck.json()) as { result: string }).result).toBe('pass')
    expect((await setup(request)).floorLots.find((lot) => lot.lotId === lot10.lotId)?.status).toBe('available')
  })

  test('FG inspection: pieces pass into the FG store with where they go; rejected pieces are scrapped', async ({ request }) => {
    const reasons = (await setup(request)).rejectionReasons
    expect(reasons).toContain('Surface defect')
    const noReason = await request.put('/api/cc_production/fg-inspection', { data: { id: fgReport.id, reportDate: today, rows: [{ sourceLotId: cutLot.lotId, qtyNos: 1, rejectNos: 1, disposition: 'stock' }] }, headers: { [LOCK]: fgReport.updatedAt } })
    expect(noReason.status()).toBe(400)
    const saved = await request.put('/api/cc_production/fg-inspection', {
      data: {
        id: fgReport.id,
        reportDate: today,
        inspector: 'e2e QC',
        rows: [
          { sourceLotId: cutLot.lotId, sheetSize: '8x4', qtyNos: 1, rejectNos: 1, rejectReason: 'Surface defect', disposition: 'allocation', customerName: 'BHEL (e2e)' },
          { sourceLotId: lot10.lotId, qtyNos: 2, disposition: 'export' },
        ],
      },
      headers: { [LOCK]: fgReport.updatedAt },
    })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const draft = (await saved.json()) as { id: string; updatedAt: string }
    const posted = await request.post('/api/cc_production/fg-inspection/action', { data: { id: draft.id, action: 'post' }, headers: { [LOCK]: draft.updatedAt } })
    expect(posted.ok(), await posted.text()).toBeTruthy()
    const report = (await posted.json()) as { id: string; updatedAt: string; status: string; totals: { pieces: number; rejected: number; kg: number }; rows: Array<{ outputLotNumber: string; passKg: number; rejectKg: number | null; customerName: string | null; disposition: string }> }
    fgReport = report
    expect(report.status).toBe('posted')
    expect(report.totals).toEqual({ pieces: 3, rejected: 1, kg: round(108.75 + 92) })
    expect(report.rows[0]).toEqual(expect.objectContaining({ passKg: 108.75, rejectKg: 108.75, customerName: 'BHEL (e2e)', disposition: 'allocation' }))
    const fg = await lotsIn(request, 'fg')
    expect(fg.find((lot) => lot.lotNumber === report.rows[0].outputLotNumber)?.onHand).toBe(108.75)
    expect(fg.find((lot) => lot.lotNumber === report.rows[1].outputLotNumber)?.onHand).toBe(92)
    expect((await setup(request)).floorLots.some((lot) => lot.lotId === cutLot.lotId || lot.lotId === lot10.lotId)).toBeFalsy()
  })

  test('lab test per customer specification, with "copy last time"', async ({ request }) => {
    const lists = await setup(request)
    expect(lists.standards).toContain('IS 2036')
    const noCustomer = await request.post('/api/cc_production/lab', { data: { testDate: today, testType: 'Electrical' } })
    expect(noCustomer.status()).toBe(400)
    const created = await request.post('/api/cc_production/lab', { data: { testDate: today, customerName: `BHEL e2e ${stamp}`, itemTitle: 'Fabric 10x10 Sheet', lotRefs: 'F/74/07/26', testType: 'Electrical', standard: 'IS 2036', result: 'pass', notes: 'Electric strength 12 kV/mm' } })
    expect(created.status(), await created.text()).toBe(201)
    const last = (await (await request.get(`/api/cc_production/lab?last=true&customerName=${encodeURIComponent(`BHEL e2e ${stamp}`)}&itemTitle=${encodeURIComponent('Fabric 10x10 Sheet')}`)).json()) as { item: { standard: string; notes: string } | null }
    expect(last.item).toEqual(expect.objectContaining({ standard: 'IS 2036', notes: 'Electric strength 12 kV/mm' }))
  })

  test('bought-in goods go straight into the FG store; damaged material is written off', async ({ request }) => {
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%206x6')).json()) as { items: Array<{ id: string; title: string }> }).items
    const product = products.find((item) => item.title === 'Fabric 6x6 Sheet')!
    const received = await request.post('/api/cc_production/fg-direct', { data: { inDate: today, supplier: 'Other maker (e2e)', invoiceNo: `INV-${stamp}`, productId: product.id, sheetSize: '8x4', thicknessMm: 12, nos: 5, kg: 50 } })
    expect(received.status(), await received.text()).toBe(201)
    const lot = (await received.json()) as { lotId: string; lotNumber: string }
    ids.directLot = lot.lotId
    expect((await lotsIn(request, 'fg')).find((entry) => entry.lotId === lot.lotId)?.onHand).toBe(50)
    const damaged = await request.post('/api/cc_production/damage', { data: { entryDate: today, lotId: lot.lotId, kg: 2.5, reason: 'Corner broken in handling (e2e)' } })
    expect(damaged.status(), await damaged.text()).toBe(201)
    expect((await lotsIn(request, 'fg')).find((entry) => entry.lotId === lot.lotId)?.onHand).toBe(47.5)
    const list = (await (await request.get(`/api/cc_production/fg-direct?month=${today.slice(0, 7)}`)).json()) as { directIns: Array<{ lotNumber: string }>; damages: Array<{ reason: string }> }
    expect(list.directIns.some((row) => row.lotNumber === lot.lotNumber)).toBeTruthy()
    expect(list.damages.some((row) => row.reason === 'Corner broken in handling (e2e)')).toBeTruthy()
  })

  test('finishing pages open', async ({ request }) => {
    for (const path of ['/backend/cutting', '/backend/quality/thickness', '/backend/quality/fg-inspection', '/backend/quality/lab', '/backend/fg/direct-in']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })

  test('clean up: FG reopened, cutting reversed, press, coating and resin undone, test stock out', async ({ request }) => {
    const reopened = await request.post('/api/cc_production/fg-inspection/action', { data: { id: fgReport.id, action: 'reopen', reason: 'e2e correction' }, headers: { [LOCK]: fgReport.updatedAt } })
    expect(reopened.ok(), await reopened.text()).toBeTruthy()
    const cuts = ((await (await request.get(`/api/cc_production/cutting?month=${today.slice(0, 7)}`)).json()) as { items: Array<{ id: string; updatedAt: string }> }).items
    const cut = cuts.find((entry) => entry.id === ids.cut)!
    const reversed = await request.post('/api/cc_production/cutting/reverse', { data: { id: cut.id, reason: 'e2e correction' }, headers: { [LOCK]: cut.updatedAt } })
    expect(reversed.ok(), await reversed.text()).toBeTruthy()
    let batch = (await (await request.get(`/api/cc_production/press/batches?id=${ids.press}`)).json()) as { id: string; updatedAt: string; status: string }
    batch = (await (await request.post('/api/cc_production/press/batches/action', { data: { id: batch.id, action: 'reopen', reason: 'e2e cleanup' }, headers: { [LOCK]: batch.updatedAt } })).json()) as typeof batch
    expect(batch.status).toBe('draft')
    expect((await request.post('/api/cc_production/press/batches/action', { data: { id: batch.id, action: 'cancel', reason: 'e2e cleanup' }, headers: { [LOCK]: batch.updatedAt } })).ok()).toBeTruthy()
    let sheet = (await (await request.get(`/api/cc_production/coating/sheets?id=${ids.sheet}`)).json()) as { id: string; updatedAt: string; status: string }
    sheet = (await (await request.post('/api/cc_production/coating/sheets/action', { data: { id: sheet.id, action: 'reopen', reason: 'e2e cleanup' }, headers: { [LOCK]: sheet.updatedAt } })).json()) as typeof sheet
    expect((await request.post('/api/cc_production/coating/sheets/action', { data: { id: sheet.id, action: 'delete' }, headers: { [LOCK]: sheet.updatedAt } })).ok()).toBeTruthy()
    let resin = (await (await request.get(`/api/cc_production/resin/batches?id=${ids.resin}`)).json()) as { id: string; updatedAt: string }
    resin = (await (await request.post('/api/cc_production/resin/batches/action', { data: { id: resin.id, action: 'reopen', reason: 'e2e cleanup' }, headers: { [LOCK]: resin.updatedAt } })).json()) as typeof resin
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: resin.id, action: 'delete' }, headers: { [LOCK]: resin.updatedAt } })).ok()).toBeTruthy()
    for (const place of ['wh_a', 'fg']) {
      const stock = (await (await request.get(`/api/cc_store/stock?place=${place}`)).json()) as { items: Array<{ productId: string; lots: Array<{ lotId: string; lotNumber: string | null; free: number }> }> }
      for (const item of stock.items) {
        for (const lot of item.lots) {
          if (!(lot.free > 0) || !((lot.lotNumber ?? '').startsWith('E2E7-') || lot.lotId === ids.directLot)) continue
          const out = await request.post('/api/cc_store/stock/adjust', { data: { place, productId: item.productId, direction: 'out', quantity: lot.free, lotId: lot.lotId, reason: 'Physical count difference', note: 'e2e stage 7 cleanup' } })
          expect(out.ok(), await out.text()).toBeTruthy()
        }
      }
    }
    expect((await setup(request)).floorLots.filter((lot) => lot.lotNumber.includes(String(YEAR)))).toEqual([])
  })
})
