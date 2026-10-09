import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const stamp = Date.now()
let YEAR = 2100 + (stamp % 800)
let BOOK_DATE = `${YEAR}-10-02`
const round = (value: number) => Math.round(value * 1000) / 1000

type Sheet = { thicknessMm: number; count?: number; weightKg: number; weightMinKg?: number | null; grade: string }
type Batch = {
  id: string
  batchNo: string
  status: 'draft' | 'posted' | 'cancelled'
  updatedAt: string
  warnings: string[]
  figures: { paperLines: string[]; totalSheets: number; totalKg: number; kgByGrade: Record<string, number>; sizeLines: Array<{ grade: string; thicknessMm: number; count: number; kg: number }> }
  picks: Array<{ grade: string; lotId: string; lotNumber: string; kg: number }>
  outputs: Array<{ grade: string; thicknessMm: number; productTitle: string; lotNumber: string; kg: number; nos: number }>
  error?: string
}
type PressSetup = { nextBatchNo: string; presses: Array<{ id: string; number: number }>; tolerances: Array<{ thicknessMm: number }>; lots: Array<{ lotId: string; lotNumber: string; freeKg: number; grades: string[] }> }

const dl = (no: number, ...sheets: Sheet[]) => ({ no, sheets })

const F01 = [dl(1, { thicknessMm: 1.5, count: 10, weightKg: 6.4, weightMinKg: 6.2, grade: 'F2F3' }), dl(2, { thicknessMm: 15, count: 4, weightKg: 69.6, grade: '10x10' }), dl(3, { thicknessMm: 25, count: 4, weightKg: 118.05, grade: '10x10' })]
const F02 = [dl(1, { thicknessMm: 1.5, count: 10, weightKg: 6.4, weightMinKg: 6.2, grade: 'F2F3' }), dl(2, { thicknessMm: 25, count: 8, weightKg: 118.1, grade: '10x10' })]
const F03 = [
  dl(1, { thicknessMm: 25, weightKg: 117.6, grade: '10x10' }),
  dl(2, { thicknessMm: 25, weightKg: 118.2, grade: '10x10' }),
  dl(3, { thicknessMm: 1.5, count: 10, weightKg: 6.4, weightMinKg: 6.2, grade: 'F2F3' }),
  dl(4, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.2, grade: '10x10' }),
  dl(5, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.3, grade: '10x10' }),
  dl(6, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 45.8, grade: '10x10' }),
  dl(7, { thicknessMm: 15, weightKg: 69.7, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.4, grade: '10x10' }),
  dl(8, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.5, grade: '10x10' }),
  dl(9, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.6, grade: '10x10' }),
]
const F04 = [
  dl(1, { thicknessMm: 1.5, count: 10, weightKg: 6.4, weightMinKg: 6.2, grade: 'F2F3' }),
  dl(2, { thicknessMm: 27, weightKg: 125, grade: 'F2F3' }),
  dl(3, { thicknessMm: 15, count: 6, weightKg: 69.6, grade: '10x10' }),
  dl(4, { thicknessMm: 35, weightKg: 170.1, grade: '6x6' }),
]

async function setup(request: APIRequestContext, date?: string): Promise<PressSetup> {
  const response = await request.get(`/api/cc_production/press/setup?date=${date ?? BOOK_DATE}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

async function bstageFree(request: APIRequestContext, grade: string): Promise<number> {
  return round((await setup(request)).lots.filter((lot) => lot.grades.includes(grade)).reduce((sum, lot) => sum + lot.freeKg, 0))
}

async function action(request: APIRequestContext, batch: Batch, name: string, reason?: string) {
  return request.post('/api/cc_production/press/batches/action', { data: { id: batch.id, action: name, ...(reason ? { reason } : {}) }, headers: { [LOCK]: batch.updatedAt } })
}

async function addStock(request: APIRequestContext, productId: string, quantity: number, lotNumber: string) {
  const response = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'in', quantity, newLot: { lotNumber }, reason: 'Opening stock', note: 'e2e stage 5' } })
  expect(response.ok(), await response.text()).toBeTruthy()
}

test.describe.serial('Stage 5 · laminate pressing', () => {
  let press: { id: string; number: number }
  let mixer: { id: string; dryerUpdatedAt?: string }
  let resinBatchId = ''
  let coatingSheetId = ''
  const batches: Record<string, Batch> = {}

  test('the press form knows the laminate presses, the loading tolerance and the next F/NN/MM/YYYY', async ({ request }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const probe = await setup(request, `${YEAR}-10-02`)
      if (probe.nextBatchNo === `F/01/10/${YEAR}`) break
      YEAR += 1
      if (YEAR > 2999) YEAR = 2100
    }
    BOOK_DATE = `${YEAR}-10-02`
    const data = await setup(request)
    expect(data.nextBatchNo).toBe(`F/01/10/${YEAR}`)
    expect(data.presses.map((entry) => entry.number)).toEqual(expect.arrayContaining([21, 22, 23, 24, 25]))
    expect(data.presses.map((entry) => entry.number)).not.toContain(1)
    expect(data.tolerances.map((entry) => entry.thicknessMm)).toEqual(expect.arrayContaining([25, 15, 10]))
    press = data.presses.find((entry) => entry.number === 21)!
  })

  test('fixtures: coated B-stage for F2F3 paper, 10x10 and 6x6 made today (Stages 3–4)', async ({ request }) => {
    const coating = (await (await request.get('/api/cc_production/coating/setup')).json()) as { dryers: Array<{ id: string; code: string }>; cloths: Array<{ id: string; title: string }> }
    mixer = { id: coating.dryers.find((dryer) => dryer.code === 'Mixer oven')!.id }
    const cloth = (title: string) => coating.cloths.find((entry) => entry.title === title)!.id
    const existing = (await (await request.get(`/api/cc_production/coating/sheets?date=${today}`)).json()) as { items: Array<{ id: string; dryerId: string }> }
    expect(existing.items.some((item) => item.dryerId === mixer.id), 'a Mixer oven sheet already exists today').toBeFalsy()
    await addStock(request, cloth('10x10'), 1700, `E2E5-10x10-${stamp}`)
    await addStock(request, cloth('6x6'), 100, `E2E5-6x6-${stamp}`)
    await addStock(request, cloth('Washing F2 1500'), 220, `E2E5-F2-${stamp}`)
    const chems = ((await (await request.get('/api/cc_production/resin/setup')).json()) as { reactors: Array<{ id: string }>; chemicals: Array<{ id: string; title: string }> })
    const chem = (title: string) => chems.chemicals.find((entry) => entry.title === title)!.id
    await addStock(request, chem('Phenol'), 1000, `E2E5-PH-${stamp}`)
    await addStock(request, chem('Formaldehyde'), 1000, `E2E5-FO-${stamp}`)
    const resin = (await (await request.post('/api/cc_production/resin/batches', { data: { batchDate: today, reactorId: chems.reactors[0].id, grade: 'PFC', materials: [{ productId: chem('Phenol'), kg: 1000 }, { productId: chem('Formaldehyde'), kg: 1000 }], yieldKg: 1800 } })).json()) as { id: string; updatedAt: string }
    resinBatchId = resin.id
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: resin.id, action: 'post' }, headers: { [LOCK]: resin.updatedAt } })).ok()).toBeTruthy()
    const sheet = (await (await request.post('/api/cc_production/coating/sheets', {
      data: {
        sheetDate: today,
        dryerId: mixer.id,
        rows: [
          { sn: 1, clothProductId: cloth('10x10'), rawKg: 1000, coatedNos: 400, rcPct: 45 },
          { sn: 2, clothProductId: cloth('10x10'), rawKg: 700, coatedNos: 280, rcPct: 45 },
          { sn: 3, clothProductId: cloth('6x6'), rawKg: 100, coatedNos: 40, rcPct: 45 },
          { sn: 4, clothProductId: cloth('Washing F2 1500'), rawKg: 220, coatedNos: 90, rcPct: 45 },
        ],
      },
    })).json()) as { id: string; updatedAt: string }
    coatingSheetId = sheet.id
    const posted = await request.post('/api/cc_production/coating/sheets/action', { data: { id: sheet.id, action: 'post' }, headers: { [LOCK]: sheet.updatedAt } })
    expect(posted.ok(), await posted.text()).toBeTruthy()
    expect(await bstageFree(request, '10x10')).toBeGreaterThanOrEqual(3045.3)
    expect(await bstageFree(request, 'F2F3')).toBeGreaterThanOrEqual(381)
  })

  test('F/01 to F/04 of 2 Oct type in with the book totals and the n/18, n/24 counts', async ({ request }) => {
    const expected: Array<[string, typeof F01, number, number, string]> = [
      ['F01', F01, 814.6, 18, '25mm = 4/18'],
      ['F02', F02, 1008.8, 18, '25mm = 8/18'],
      ['F03', F03, 996.3, 24, '25mm = 2/24'],
      ['F04', F04, 776.7, 18, '35mm = 1/18'],
    ]
    for (const [name, daylights, total, sheets, lastLine] of expected) {
      const response = await request.post('/api/cc_production/press/batches', { data: { batchDate: BOOK_DATE, pressId: press.id, daylights, checkedBy: 'e2e' } })
      expect(response.status(), await response.text()).toBe(201)
      const batch = (await response.json()) as Batch
      batches[name] = batch
      expect(batch.batchNo).toBe(`F/0${name.slice(2)}/10/${YEAR}`)
      expect(batch.figures.totalKg).toBe(total)
      expect(batch.figures.totalSheets).toBe(sheets)
      expect(batch.figures.paperLines[batch.figures.paperLines.length - 1]).toBe(lastLine)
    }
    expect(batches.F03.figures.paperLines).toEqual(['1.5mm = 10', '10mm = 6', '15mm = 6', '25mm = 2/24'])
    expect(batches.F04.figures.sizeLines.map((line) => line.grade)).toEqual(['F2F3', 'F2F3', '10x10', '6x6'])
    expect(batches.F03.warnings).toHaveLength(3)
    expect(batches.F03.warnings.join(' ')).toMatch(/Daylight 9: 10 mm loaded at 46.6 kg, specified 45.8–46.3 kg/)
    expect(batches.F01.warnings).toEqual([])

    const report = (await (await request.get(`/api/cc_production/press/batches?date=${BOOK_DATE}`)).json()) as { items: Array<{ batchNo: string; totalKg: number }> }
    expect(report.items.map((item) => item.totalKg).sort()).toEqual([1008.8, 776.7, 814.6, 996.3].sort())
  })

  test('posting F/03 takes B-stage oldest first per grade and makes one pressed lot per grade + thickness', async ({ request }) => {
    const before10 = await bstageFree(request, '10x10')
    const beforePaper = await bstageFree(request, 'F2F3')
    const posted = await action(request, batches.F03, 'post')
    expect(posted.ok(), await posted.text()).toBeTruthy()
    const batch = (await posted.json()) as Batch
    batches.F03 = batch
    expect(batch.status).toBe('posted')
    expect(round(batch.picks.filter((pick) => pick.grade === '10x10').reduce((sum, pick) => sum + pick.kg, 0))).toBe(932.3)
    expect(batch.picks.find((pick) => pick.grade === '10x10')!.lotNumber).toMatch(/-1$/)
    expect(await bstageFree(request, '10x10')).toBe(round(before10 - 932.3))
    expect(await bstageFree(request, 'F2F3')).toBe(round(beforePaper - 64))
    expect(batch.outputs.map((output) => [output.grade, output.thicknessMm, output.kg, output.nos])).toEqual([
      ['F2F3', 1.5, 64, 10],
      ['10x10', 10, 277.8, 6],
      ['10x10', 15, 418.7, 6],
      ['10x10', 25, 235.8, 2],
    ])
    expect(batch.outputs[0].productTitle).toBe('F2F3 10x10 Sheet')
    expect(batch.outputs[1].productTitle).toBe('Fabric 10x10 Sheet')

    const lot = (await (await request.get(`/api/cc_production/bstage?lotId=${batch.picks[0].lotId}`)).json()) as { movements: Array<{ reason: string | null }> }
    expect(lot.movements.some((movement) => (movement.reason ?? '').includes(batch.batchNo))).toBeTruthy()
  })

  test('picking a lot that is not the oldest needs a reason', async ({ request }) => {
    const lots = (await setup(request)).lots.filter((lot) => lot.grades.includes('10x10'))
    const second = lots.find((lot) => /-2$/.test(lot.lotNumber))!
    const update = async (reason: string) => {
      const response = await request.put('/api/cc_production/press/batches', { data: { id: batches.F04.id, batchDate: BOOK_DATE, pressId: press.id, daylights: F04, lotChoices: [{ grade: '10x10', lotId: second.lotId, reason }] }, headers: { [LOCK]: batches.F04.updatedAt } })
      expect(response.ok(), await response.text()).toBeTruthy()
      batches.F04 = (await response.json()) as Batch
    }
    await update('')
    const refused = await action(request, batches.F04, 'post')
    expect(refused.status()).toBe(400)
    expect(((await refused.json()) as { error: string }).error).toMatch(/instead of the oldest lot/)
    batches.F04 = (await (await request.get(`/api/cc_production/press/batches?id=${batches.F04.id}`)).json()) as Batch
    await update('Order needs the 2nd roll (e2e)')
    const posted = await action(request, batches.F04, 'post')
    expect(posted.ok(), await posted.text()).toBeTruthy()
    batches.F04 = (await posted.json()) as Batch
    expect(batches.F04.picks.find((pick) => pick.grade === '10x10')!.lotId).toBe(second.lotId)
    expect(batches.F04.outputs.find((output) => output.grade === '6x6')?.productTitle).toBe('Fabric 6x6 Sheet')
  })

  test('numbers stay gap-free: a draft can only be cancelled, its number is kept, the next batch gets F/05', async ({ request }) => {
    const noReason = await action(request, batches.F02, 'cancel')
    expect(noReason.status()).toBe(400)
    const cancelled = await action(request, batches.F02, 'cancel', 'Press tripped (e2e)')
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
    batches.F02 = (await cancelled.json()) as Batch
    expect(batches.F02.status).toBe('cancelled')
    expect((await setup(request)).nextBatchNo).toBe(`F/05/10/${YEAR}`)
    const otherMonth = await request.put('/api/cc_production/press/batches', { data: { id: batches.F01.id, batchDate: `${YEAR}-11-01`, pressId: press.id, daylights: F01 }, headers: { [LOCK]: batches.F01.updatedAt } })
    expect(otherMonth.status()).toBe(409)
  })

  test('reopen reverses a press batch while its pressed lots are untouched; review never blocks', async ({ request }) => {
    const before = await bstageFree(request, '10x10')
    const reviewed = await action(request, batches.F03, 'review')
    expect(reviewed.ok()).toBeTruthy()
    batches.F03 = (await reviewed.json()) as Batch
    const reopened = await action(request, batches.F03, 'reopen')
    expect(reopened.ok(), await reopened.text()).toBeTruthy()
    batches.F03 = (await reopened.json()) as Batch
    expect(batches.F03.status).toBe('draft')
    expect(batches.F03.outputs).toEqual([])
    expect(await bstageFree(request, '10x10')).toBe(round(before + 932.3))
  })

  test('the loading register comes in through the upload tile with the book batch number and posts', async ({ request }) => {
    const csv = [
      'Date,Press No.,Batch No.,Daylight,Thickness (mm),Sheets,Loading weight (kg),Grade,Post',
      `3/10/${YEAR},21,F/6/10/${YEAR},1,25,1,117.900,10x10,Yes`,
      `do,do,do,2,15,1,69.500,do,`,
      `do,do,do,2,10,1,46.000,do,`,
      `do,do,do,3,1.5,10,6.200/6.400,F2F3,`,
    ].join('\n')
    const posted = await request.post('/api/cc_production/upload', { multipart: { register: 'press_loading', dryRun: 'false', file: { name: `press-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) } } })
    expect(posted.ok(), await posted.text()).toBeTruthy()
    const report = (await posted.json()) as { created: number; failed: number; plan: string[]; errors: unknown[] }
    expect(report.failed, JSON.stringify(report.errors)).toBe(0)
    expect(report.created).toBe(1)
    const list = (await (await request.get(`/api/cc_production/press/batches?month=${YEAR}-10`)).json()) as { items: Array<{ id: string; batchNo: string; status: string; totalKg: number; totalSheets: number }> }
    const uploaded = list.items.find((item) => item.batchNo === `F/06/10/${YEAR}`)!
    expect(uploaded.status).toBe('posted')
    expect(uploaded.totalKg).toBe(round(117.9 + 69.5 + 46 + 64))
    expect(uploaded.totalSheets).toBe(13)
    batches.F06 = (await (await request.get(`/api/cc_production/press/batches?id=${uploaded.id}`)).json()) as Batch
  })

  test('press pages open', async ({ request }) => {
    for (const path of ['/backend/press/batches', '/backend/press/batches/new', `/backend/press/batches/${batches.F03.id}`, `/backend/press/daily-report?date=${BOOK_DATE}`, `/backend/press/loading?press=${press.id}&date=${BOOK_DATE}`]) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })

  test('clean up: test batches reopened and cancelled, B-stage, resin and stock returned', async ({ request }) => {
    for (const key of ['F01', 'F03', 'F04', 'F06']) {
      let batch = (await (await request.get(`/api/cc_production/press/batches?id=${batches[key].id}`)).json()) as Batch
      if (batch.status === 'posted') batch = (await (await action(request, batch, 'reopen')).json()) as Batch
      if (batch.status === 'draft') expect((await action(request, batch, 'cancel', 'e2e cleanup')).ok()).toBeTruthy()
    }
    let sheet = (await (await request.get(`/api/cc_production/coating/sheets?id=${coatingSheetId}`)).json()) as { id: string; status: string; updatedAt: string }
    sheet = (await (await request.post('/api/cc_production/coating/sheets/action', { data: { id: sheet.id, action: 'reopen' }, headers: { [LOCK]: sheet.updatedAt } })).json()) as typeof sheet
    expect(sheet.status).toBe('draft')
    expect((await request.post('/api/cc_production/coating/sheets/action', { data: { id: sheet.id, action: 'delete' }, headers: { [LOCK]: sheet.updatedAt } })).ok()).toBeTruthy()
    let resin = (await (await request.get(`/api/cc_production/resin/batches?id=${resinBatchId}`)).json()) as { id: string; updatedAt: string }
    resin = (await (await request.post('/api/cc_production/resin/batches/action', { data: { id: resin.id, action: 'reopen' }, headers: { [LOCK]: resin.updatedAt } })).json()) as typeof resin
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: resin.id, action: 'delete' }, headers: { [LOCK]: resin.updatedAt } })).ok()).toBeTruthy()
    const stock = (await (await request.get('/api/cc_store/stock?place=wh_a')).json()) as { items: Array<{ productId: string; lots: Array<{ lotId: string; lotNumber: string | null; free: number }> }> }
    for (const item of stock.items) {
      for (const lot of item.lots) {
        if (!(lot.lotNumber ?? '').startsWith('E2E5-') || !(lot.free > 0)) continue
        const out = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId: item.productId, direction: 'out', quantity: lot.free, lotId: lot.lotId, reason: 'Physical count difference', note: 'e2e stage 5 cleanup' } })
        expect(out.ok(), await out.text()).toBeTruthy()
      }
    }
  })
})
