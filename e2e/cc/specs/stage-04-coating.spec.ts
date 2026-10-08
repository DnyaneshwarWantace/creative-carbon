import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const stamp = Date.now()
const PAST_YEAR = 1990 + (stamp % 30)
const YY = String(PAST_YEAR).slice(2)
const PAPER_DATE = `${PAST_YEAR}-07-03`
const LOT = `B-0307${YY}`

type Setup = { dryers: Array<{ id: string; code: string; kind: string }>; cloths: Array<{ id: string; title: string; free: number }>; resinLots: Array<{ lotId: string; lotNumber: string | null; free: number }> }
type Sheet = {
  id: string
  status: 'draft' | 'posted'
  updatedAt: string
  dryerCode: string
  rows: Array<{ sn: number; clothTitle: string; bstageLotId: string | null; bstageLotNumber: string | null; bstageKg: number | null; resinKg: number | null; rawLots: Array<{ kg: number }>; resinBatchNo: string | null }>
  figures: { rawTotal: number; nosTotal: number; outputTotal: number; bstageTotal: number; resinTotal: number; dbpTotal: number }
  warnings: string[]
  issueIds: string[]
  error?: string
}
type Board = { columns: Array<{ band: string; lots: Array<{ lotId: string; lotNumber: string; ageDays: number; nosLeft: number | null; onHandKg: number; resinBatchNo: string | null; clothTitle: string | null }> }> }
type Chemical = { id: string; title: string; free: number; lots: Array<{ lotId: string; lotNumber: string | null; place: string; free: number }> }

const round = (value: number) => Math.round(value * 1000) / 1000

async function coatingSetup(request: APIRequestContext): Promise<Setup> {
  const response = await request.get('/api/cc_production/coating/setup')
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

async function chemicals(request: APIRequestContext): Promise<Chemical[]> {
  return ((await (await request.get('/api/cc_production/resin/setup')).json()) as { chemicals: Chemical[] }).chemicals
}

async function clothFree(request: APIRequestContext, title: string): Promise<number> {
  return (await coatingSetup(request)).cloths.find((cloth) => cloth.title === title)!.free
}

async function tankFree(request: APIRequestContext): Promise<number> {
  return round((await coatingSetup(request)).resinLots.reduce((sum, lot) => sum + lot.free, 0))
}

async function sheetFor(request: APIRequestContext, date: string, dryerId: string): Promise<Sheet | null> {
  const list = (await (await request.get(`/api/cc_production/coating/sheets?date=${date}`)).json()) as { items: Array<{ id: string; dryerId: string }> }
  const found = list.items.find((item) => item.dryerId === dryerId)
  return found ? ((await (await request.get(`/api/cc_production/coating/sheets?id=${found.id}`)).json()) as Sheet) : null
}

async function sheetAction(request: APIRequestContext, sheet: Sheet, action: 'post' | 'reopen' | 'delete') {
  return request.post('/api/cc_production/coating/sheets/action', { data: { id: sheet.id, action }, headers: { [LOCK]: sheet.updatedAt } })
}

async function removeSheet(request: APIRequestContext, date: string, dryerId: string) {
  let sheet = await sheetFor(request, date, dryerId)
  if (!sheet) return
  if (sheet.status === 'posted') {
    const reopened = await sheetAction(request, sheet, 'reopen')
    expect(reopened.ok(), await reopened.text()).toBeTruthy()
    sheet = (await reopened.json()) as Sheet
  }
  expect((await sheetAction(request, sheet, 'delete')).ok()).toBeTruthy()
}

async function addStock(request: APIRequestContext, productId: string, quantity: number, lotNumber: string) {
  const response = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'in', quantity, newLot: { lotNumber }, reason: 'Opening stock', note: 'e2e stage 4' } })
  expect(response.ok(), await response.text()).toBeTruthy()
}

test.describe.serial('Stage 4 · coating (dryer sheets) and the B-stage board', () => {
  let setup: Setup
  let dryer: (code: string) => { id: string; code: string }
  let cloth: (title: string) => { id: string; title: string }
  let resinBatch: { id: string; batchNo: string; updatedAt: string }
  let resinLotId = ''
  let dryer2: Sheet

  test('the dryer sheet knows the dryers, the mixer oven and the cloths', async ({ request }) => {
    setup = await coatingSetup(request)
    expect(setup.dryers.map((entry) => entry.code)).toEqual(expect.arrayContaining(['Dryer 1', 'Dryer 2', 'Dryer 3', 'Mixer oven']))
    expect(setup.cloths.map((entry) => entry.title)).toEqual(expect.arrayContaining(['10x10', '6x6', 'G 6x6', 'G 10x10']))
    dryer = (code) => setup.dryers.find((entry) => entry.code === code)!
    cloth = (title) => setup.cloths.find((entry) => entry.title === title)!
    for (const code of ['Dryer 2', 'Dryer 3']) await removeSheet(request, PAPER_DATE, dryer(code).id)
    await removeSheet(request, today, dryer('Dryer 1').id)
  })

  test('fixtures: cloth and chemicals in Warehouse A, a resin batch posted into the tank (Stage 3)', async ({ request }) => {
    for (const [title, kg] of [['10x10', 1400], ['6x6', 400], ['G 6x6', 100], ['G 10x10', 200]] as Array<[string, number]>) await addStock(request, cloth(title).id, kg, `E2E4-${title.replace(/\s/g, '')}-${stamp}`)
    const chems = await chemicals(request)
    const chem = (title: string) => chems.find((entry) => entry.title === title)!
    await addStock(request, chem('Phenol').id, 1200, `E2E4-PH-${stamp}`)
    await addStock(request, chem('Formaldehyde').id, 1500, `E2E4-FO-${stamp}`)
    await addStock(request, chem('DBP').id, 40, `E2E4-DBP-${stamp}`)
    const reactor = ((await (await request.get('/api/cc_production/resin/setup')).json()) as { reactors: Array<{ id: string }> }).reactors[0]
    const created = await request.post('/api/cc_production/resin/batches', { data: { batchDate: today, reactorId: reactor.id, grade: 'PFC', materials: [{ productId: chem('Phenol').id, kg: 1200 }, { productId: chem('Formaldehyde').id, kg: 1500 }], yieldKg: 1500 } })
    expect(created.status(), await created.text()).toBe(201)
    const draft = (await created.json()) as { id: string; updatedAt: string; batchNo: string }
    const posted = await request.post('/api/cc_production/resin/batches/action', { data: { id: draft.id, action: 'post' }, headers: { [LOCK]: draft.updatedAt } })
    expect(posted.ok(), await posted.text()).toBeTruthy()
    resinBatch = (await posted.json()) as typeof resinBatch
    resinLotId = (await coatingSetup(request)).resinLots.find((lot) => lot.lotNumber === resinBatch.batchNo)!.lotId
  })

  test('the 3 July Dryer 2 sheet (photo figures, test year) types in and gives the ringed totals: 861 kg raw, 786 nos, 1570 kg output', async ({ request }) => {
    const clothBefore = await clothFree(request, '10x10')
    const body = {
      sheetDate: PAPER_DATE,
      dryerId: dryer('Dryer 2').id,
      rows: [
        { sn: 1, clothProductId: cloth('10x10').id, gsm: 300, kushan: 1070, treatedWeight: 1960, rawKg: 347, balanceRawKg: 0, coatedNos: 325, rcPct: 45, vcPct: 3.3, resinLotId },
        { sn: 2, clothProductId: cloth('10x10').id, gsm: 300, kushan: 980, treatedWeight: 1790, rawKg: 151, balanceRawKg: 0, coatedNos: 160, rcPct: 45, vcPct: 3.1, resinLotId },
        { sn: 3, clothProductId: cloth('6x6').id, gsm: 400, kushan: 1240, treatedWeight: 2260, rawKg: 298, balanceRawKg: 0, coatedNos: 235, rcPct: 45, vcPct: 3.4, resinLotId },
        { sn: 4, clothProductId: cloth('G 6x6').id, gsm: 280, kushan: 980, treatedWeight: 1760, rawKg: 65, balanceRawKg: 0, coatedNos: 66, rcPct: 44, vcPct: 3.2, resinLotId },
      ],
      slots: [
        { time: '8.00', outputKg: 637 },
        { time: '10.00', outputKg: 286.4 },
        { time: '12.00', outputKg: 531.1 },
        { time: '14.00', dbpKg: 16, outputKg: 116.16 },
        { time: '16.00' },
        { time: '18.00' },
        { time: '20.00' },
        { time: '22.00' },
      ],
    }
    const response = await request.post('/api/cc_production/coating/sheets', { data: body })
    expect(response.status(), await response.text()).toBe(201)
    const draft = (await response.json()) as Sheet
    expect(draft.status).toBe('draft')
    expect(draft.figures.rawTotal).toBe(861)
    expect(draft.figures.nosTotal).toBe(786)
    expect(draft.figures.outputTotal).toBe(1570.66)
    expect(draft.figures.bstageTotal).toBe(1570.66)
    expect(draft.warnings).toEqual([])
    expect(await clothFree(request, '10x10')).toBe(clothBefore)

    const duplicate = await request.post('/api/cc_production/coating/sheets', { data: body })
    expect(duplicate.status()).toBe(409)

    const tankBefore = await tankFree(request)
    const dbpBefore = (await chemicals(request)).find((entry) => entry.title === 'DBP')!.free
    const posted = await sheetAction(request, draft, 'post')
    expect(posted.ok(), await posted.text()).toBeTruthy()
    dryer2 = (await posted.json()) as Sheet
    expect(dryer2.status).toBe('posted')
    expect(dryer2.rows.map((row) => row.bstageLotNumber)).toEqual([`${LOT}-D2-1`, `${LOT}-D2-2`, `${LOT}-D2-3`, `${LOT}-D2-4`])
    expect(round(dryer2.rows.reduce((sum, row) => sum + (row.bstageKg ?? 0), 0))).toBe(1570.66)
    expect(dryer2.rows[0].resinBatchNo).toBe(resinBatch.batchNo)
    expect(await clothFree(request, '10x10')).toBe(round(clothBefore - 498))
    expect(await tankFree(request)).toBe(round(tankBefore - dryer2.figures.resinTotal))
    expect(round(1570.66 - 861 - 16)).toBe(dryer2.figures.resinTotal)
    expect((await chemicals(request)).find((entry) => entry.title === 'DBP')!.free).toBe(round(dbpBefore - 16))
    expect(dryer2.issueIds).toHaveLength(1)
  })

  test('the resin batch shows where its resin went (Stage 3 → Stage 4)', async ({ request }) => {
    const batch = (await (await request.get(`/api/cc_production/resin/batches?id=${resinBatch.id}`)).json()) as { wentTo: Array<{ id: string; label: string; kg: number }> }
    const toDryer2 = batch.wentTo.filter((entry) => entry.id === dryer2.id)
    expect(toDryer2).toHaveLength(4)
    expect(round(toDryer2.reduce((sum, entry) => sum + entry.kg, 0))).toBe(dryer2.figures.resinTotal)
  })

  test('the lots are on the board with their clocks; a 3 July lot is past 10 days and blocked', async ({ request }) => {
    const board = (await (await request.get(`/api/cc_production/bstage?q=${LOT}-D2`)).json()) as Board
    const mine = new Set(dryer2.rows.map((row) => row.bstageLotId))
    const blocked = board.columns.find((column) => column.band === 'blocked')!
    const ours = blocked.lots.filter((lot) => mine.has(lot.lotId))
    expect(ours.map((lot) => lot.lotNumber).sort()).toEqual([`${LOT}-D2-1`, `${LOT}-D2-2`, `${LOT}-D2-3`, `${LOT}-D2-4`])
    const first = ours.find((lot) => lot.lotNumber === `${LOT}-D2-1`)!
    expect(first.nosLeft).toBe(325)
    expect(first.clothTitle).toBe('10x10')
    expect(first.resinBatchNo).toBe(resinBatch.batchNo)
    const lot = (await (await request.get(`/api/cc_production/bstage?lotId=${dryer2.rows[0].bstageLotId}`)).json()) as { title: string; madeKg: number; movements: Array<{ kg: number }> }
    expect(lot.title).toBe('B-stage 10x10 PFC')
    expect(lot.movements[0].kg).toBe(lot.madeKg)
  })

  test("today's lot is fresh; once part of it is scrapped the sheet cannot be reopened", async ({ request }) => {
    const created = await request.post('/api/cc_production/coating/sheets', { data: { sheetDate: today, dryerId: dryer('Dryer 1').id, rows: [{ sn: 1, clothProductId: cloth('10x10').id, rawKg: 20, coatedNos: 10, rcPct: 52, vcPct: 3 }] } })
    expect(created.status(), await created.text()).toBe(201)
    const draft = (await created.json()) as Sheet
    expect(draft.warnings.join(' ')).toMatch(/RC 52%/)
    expect(draft.figures.bstageTotal).toBe(round(20 / 0.48))
    const posted = (await (await sheetAction(request, draft, 'post')).json()) as Sheet
    const lotId = posted.rows[0].bstageLotId!
    const board = (await (await request.get(`/api/cc_production/bstage?q=${posted.rows[0].bstageLotNumber}`)).json()) as Board
    expect(board.columns.find((column) => column.band === 'fresh')!.lots.map((lot) => lot.lotId)).toContain(lotId)

    const scrap = await request.post('/api/cc_production/bstage/scrap', { data: { lotId, kg: 5, reason: 'e2e torn sheet' } })
    expect(scrap.ok(), await scrap.text()).toBeTruthy()
    expect(((await scrap.json()) as { onHandKg: number }).onHandKg).toBe(round(20 / 0.48 - 5))
    const refused = await sheetAction(request, posted, 'reopen')
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/already partly used or scrapped/)

    const product = (await (await request.get(`/api/cc_production/bstage?lotId=${lotId}`)).json()) as { productId: string }
    const back = await request.post('/api/cc_store/stock/adjust', { data: { place: 'floor', productId: product.productId, direction: 'in', quantity: 5, lotId, reason: 'Found in store', note: 'e2e undo scrap' } })
    expect(back.ok(), await back.text()).toBeTruthy()
    await removeSheet(request, today, dryer('Dryer 1').id)
  })

  test('the 3 July Dryer 3 sheet (test year) comes in through the two upload tiles and posts (Stage 2 upload centre)', async ({ request }) => {
    const registers = (await (await request.get('/api/cc_production/upload')).json()) as { items: Array<{ key: string }> }
    expect(registers.items.map((item) => item.key)).toEqual(expect.arrayContaining(['dryer_sheets', 'dryer_slots']))
    const slotsCsv = ['Date,Dryer,Time,DBP,Olic Acid,Remarks', `3/7/${PAST_YEAR},3,4.00,,,241.416`, 'do,do,6.00,,,610.542', 'do,do,20.00,,,615.754', 'do,do,22.00,15,,198.948'].join('\n')
    const slots = await request.post('/api/cc_production/upload', { multipart: { register: 'dryer_slots', dryRun: 'false', file: { name: `slots-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(slotsCsv) } } })
    expect(slots.ok(), await slots.text()).toBeTruthy()
    expect(((await slots.json()) as { created: number }).created).toBe(1)

    const rowsCsv = [
      'Date,Dryer,S.N.,Cloth Name,GSM,Kushan,Treated Cloth Weight,Raw Cloth Weight,Balance Raw Cloth,Coated Cloth Nos,Resine Type / Batch,RC,VC,Post',
      `03/07/${PAST_YEAR},Dryer 3,6,10x10,300,1070,1916,140,NIL,126,P.F,44,3.1,Yes`,
      'do,do,7,10x10,300,1070,1926,343,NIL,317,P.F,44,3.2,',
      'do,do,8,10x10,300,1020,1961,341,NIL,314,P.F,45,3.3,',
      'do,do,9,G-10x10,280,920,1686,109,NIL,118,P.F,45,2.5,',
      'do,do,10,Silk 99,280,920,1686,1,NIL,1,P.F,45,2.5,',
    ].join('\n')
    const check = await request.post('/api/cc_production/upload', { multipart: { register: 'dryer_sheets', dryRun: 'true', file: { name: `rows-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(rowsCsv) } } })
    const preview = (await check.json()) as { errors: Array<{ row: number; error: string }> }
    expect(preview.errors.map((entry) => entry.error).join(' ')).toMatch(/Silk 99/)

    const fixed = rowsCsv.split('\n').slice(0, -1).join('\n')
    const post = await request.post('/api/cc_production/upload', { multipart: { register: 'dryer_sheets', dryRun: 'false', file: { name: `rows-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(fixed) } } })
    const report = (await post.json()) as { updated: number; failed: number; plan: string[] }
    expect(report.failed, JSON.stringify(report)).toBe(0)
    expect(report.updated).toBe(1)
    expect(report.plan.join(' ')).toMatch(/1 sheets posted/)

    const dryer3 = (await sheetFor(request, PAPER_DATE, dryer('Dryer 3').id))!
    expect(dryer3.status).toBe('posted')
    expect(dryer3.figures.rawTotal).toBe(933)
    expect(dryer3.figures.nosTotal).toBe(875)
    expect(dryer3.figures.outputTotal).toBe(1666.66)
    expect(dryer3.figures.dbpTotal).toBe(15)
    expect(dryer3.rows.map((row) => row.bstageLotNumber)).toEqual([`${LOT}-D3-6`, `${LOT}-D3-7`, `${LOT}-D3-8`, `${LOT}-D3-9`])
  })

  test('coating pages open', async ({ request }) => {
    for (const path of ['/backend/coating', `/backend/coating?date=${PAPER_DATE}`, `/backend/coating/${dryer2.id}`, '/backend/bstage', `/backend/bstage/lots/${dryer2.rows[0].bstageLotId}`]) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })

  test('clean up: reopen restores cloth, resin and DBP; test stock taken back out', async ({ request }) => {
    const clothBefore = await clothFree(request, '10x10')
    const tankBefore = await tankFree(request)
    await removeSheet(request, PAPER_DATE, dryer('Dryer 2').id)
    expect(await clothFree(request, '10x10')).toBe(round(clothBefore + 498))
    expect(await tankFree(request)).toBe(round(tankBefore + dryer2.figures.resinTotal))
    await removeSheet(request, PAPER_DATE, dryer('Dryer 3').id)

    const batch = (await (await request.get(`/api/cc_production/resin/batches?id=${resinBatch.id}`)).json()) as { id: string; updatedAt: string }
    const reopened = await request.post('/api/cc_production/resin/batches/action', { data: { id: batch.id, action: 'reopen' }, headers: { [LOCK]: batch.updatedAt } })
    expect(reopened.ok(), await reopened.text()).toBeTruthy()
    const draft = (await reopened.json()) as { id: string; updatedAt: string }
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: draft.id, action: 'delete' }, headers: { [LOCK]: draft.updatedAt } })).ok()).toBeTruthy()

    const stock = (await (await request.get('/api/cc_store/stock?place=wh_a')).json()) as { items: Array<{ productId: string; lots: Array<{ lotId: string; lotNumber: string | null; free: number }> }> }
    const stockLots = stock.items.flatMap((item) => item.lots.map((lot) => ({ productId: item.productId, place: 'wh_a', ...lot })))
    const seen = new Set<string>()
    for (const lot of stockLots) {
      if (!(lot.lotNumber ?? '').startsWith('E2E4-') || !(lot.free > 0) || seen.has(lot.lotId)) continue
      seen.add(lot.lotId)
      const out = await request.post('/api/cc_store/stock/adjust', { data: { place: lot.place, productId: lot.productId, direction: 'out', quantity: lot.free, lotId: lot.lotId, reason: 'Physical count difference', note: 'e2e stage 4 cleanup' } })
      expect(out.ok(), await out.text()).toBeTruthy()
    }
  })
})
