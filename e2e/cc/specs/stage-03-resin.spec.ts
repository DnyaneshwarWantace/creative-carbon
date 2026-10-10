import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'

type Chemical = { id: string; title: string; letter: string | null; standard: boolean; free: number; lots: Array<{ lotId: string; lotNumber: string | null; place: string; free: number }> }
type Setup = { nextBatchNo: string | null; reactors: Array<{ id: string; code: string }>; grades: string[]; chemicals: Chemical[] }
type Batch = {
  id: string
  batchNo: string
  status: 'draft' | 'posted' | 'failed'
  updatedAt: string
  totalInputKg: number
  yieldKg: number | null
  yieldPct: number | null
  materials: Array<{ productId: string; kg: number; lots: Array<{ lotId: string; kg: number; place: string }> }>
  resin: { lotNumber: string | null; leftKg: number | null } | null
  canReopen: boolean
  chemistSign: string | null
  compare: { batches: unknown[] }
  history: Array<{ action: string }>
  error?: string
}
type Register = { phenolColumns: boolean; opening: number; closing: number; rows: Array<{ day: string; use: number; received: number; water?: number; resin?: number; refs: string[] }>; totals: { received: number; use: number; water?: number; resin?: number } }

const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const month = today.slice(0, 7)
const stamp = Date.now()

async function setup(request: APIRequestContext, date = today): Promise<Setup> {
  const response = await request.get(`/api/cc_production/resin/setup?date=${date}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

function chemical(data: Setup, title: string): Chemical {
  const found = data.chemicals.find((entry) => entry.title === title)
  expect(found, title).toBeTruthy()
  return found!
}

async function freeKg(request: APIRequestContext, title: string): Promise<number> {
  return chemical(await setup(request), title).free
}

async function register(request: APIRequestContext, productId: string): Promise<Register> {
  const response = await request.get(`/api/cc_production/resin/register?item=${productId}&month=${month}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

async function act(request: APIRequestContext, batch: Batch, action: string, reason?: string) {
  return request.post('/api/cc_production/resin/batches/action', { data: { id: batch.id, action, ...(reason ? { reason } : action === 'reopen' ? { reason: 'e2e correction' } : {}) }, headers: { [LOCK]: batch.updatedAt } })
}

test.describe.serial('Stage 3 · resin plant and the chemical register', () => {
  let data: Setup
  let phenol: Chemical
  let formaldehyde: Chemical
  let methanol: Chemical
  const lotNumbers = { phenol: `E2E3-PH-${stamp}`, formaldehyde: `E2E3-FO-${stamp}`, methanol: `E2E3-ME-${stamp}` }
  let posted: Batch

  test('the batch form knows the vessels, grades, chemicals A–G and the next Batch No.', async ({ request }) => {
    data = await setup(request)
    expect(data.reactors.map((reactor) => reactor.code)).toEqual(expect.arrayContaining(['CCCPL-VES-1', 'CCCPL-VES-2']))
    expect(data.grades).toEqual(['PFC', 'PFA', 'PFAC', 'E-GLASS'])
    const standard = data.chemicals.filter((entry) => entry.standard)
    expect(standard.map((entry) => `${entry.letter} ${entry.title}`)).toEqual(['A Phenol', 'B Formaldehyde', 'C Cardinol', 'D Liquid Ammonia', 'E Caustic Soda Flakes', 'F Methanol', 'G Oxalic Acid'])
    const [year, monthPart, dayPart] = today.split('-')
    expect(data.nextBatchNo).toMatch(new RegExp(`^CCCPL/${dayPart}${monthPart}${year.slice(2)}/\\d{2,}$`))
    phenol = chemical(data, 'Phenol')
    formaldehyde = chemical(data, 'Formaldehyde')
    methanol = chemical(data, 'Methanol')
  })

  test('opening stock goes into Warehouse A (store adjust, Stage 1 stores)', async ({ request }) => {
    for (const [entry, lotNumber, quantity] of [
      [phenol, lotNumbers.phenol, 3000],
      [formaldehyde, lotNumbers.formaldehyde, 3000],
      [methanol, lotNumbers.methanol, 500],
    ] as Array<[Chemical, string, number]>) {
      const response = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId: entry.id, direction: 'in', quantity, newLot: { lotNumber }, reason: 'Opening stock', note: 'e2e stage 3' } })
      expect(response.ok(), await response.text()).toBeTruthy()
    }
    expect(await freeKg(request, 'Phenol')).toBeGreaterThanOrEqual(3000)
  })

  test('a batch is saved as not posted; stock does not move until it is posted', async ({ request }) => {
    const before = await freeKg(request, 'Phenol')
    const reactor = data.reactors.find((entry) => entry.code === 'CCCPL-VES-2')!
    const response = await request.post('/api/cc_production/resin/batches', {
      data: {
        batchDate: today,
        reactorId: reactor.id,
        grade: 'PFC',
        materials: [
          { productId: phenol.id, kg: 1000 },
          { productId: formaldehyde.id, kg: 1200 },
          { productId: methanol.id, kg: 50 },
        ],
        process: { steps: { check_ph_heat: { done: true, ph: 8.2 } }, startHeating: { tempC: 53, time: '9.10' }, stopHeating: { tempC: 86, time: '9:35' }, reactionStart: { tempC: 98, time: '9:53' }, reactionComplete: { tempC: 99, time: '10:31' }, gelChecked: true, vacuumStart: '10:31', coolingDuration: '4:00' },
        tests: { ph: 8, gelTimeSec: 39, viscositySec: 560, solidPct: 79 },
        waterRemovedKg: 100,
        yieldKg: 1100,
      },
    })
    expect(response.status(), await response.text()).toBe(201)
    const batch = (await response.json()) as Batch
    expect(batch.status).toBe('draft')
    expect(batch.batchNo).toMatch(/^CCCPL\/\d{6}\/\d{2,}$/)
    expect(batch.totalInputKg).toBe(2250)
    expect(batch.yieldPct).toBe(48.9)
    expect(await freeKg(request, 'Phenol')).toBe(before)

    const duplicate = await request.post('/api/cc_production/resin/batches', { data: { batchDate: today, batchNo: batch.batchNo, reactorId: reactor.id, grade: 'PFA' } })
    expect(duplicate.status()).toBe(409)

    const stale = await request.put('/api/cc_production/resin/batches', { data: { id: batch.id, batchDate: today, reactorId: reactor.id, grade: 'PFC' }, headers: { [LOCK]: '2000-01-01T00:00:00.000Z' } })
    expect(stale.status()).toBe(409)

    const phenolBefore = await register(request, phenol.id)
    const post = await act(request, batch, 'post')
    expect(post.ok(), await post.text()).toBeTruthy()
    posted = (await post.json()) as Batch
    expect(posted.status).toBe('posted')
    expect(posted.materials.find((line) => line.productId === phenol.id)!.lots.reduce((sum, lot) => sum + lot.kg, 0)).toBe(1000)
    expect(posted.resin?.lotNumber).toBe(batch.batchNo)
    expect(posted.resin?.leftKg).toBe(1100)
    expect(posted.canReopen).toBe(true)
    expect(await freeKg(request, 'Phenol')).toBe(Math.round((before - 1000) * 1000) / 1000)

    const phenolAfter = await register(request, phenol.id)
    expect(phenolAfter.phenolColumns).toBe(true)
    expect(Math.round((phenolAfter.totals.use - phenolBefore.totals.use) * 1000) / 1000).toBe(1000)
    expect(Math.round(((phenolAfter.totals.resin ?? 0) - (phenolBefore.totals.resin ?? 0)) * 1000) / 1000).toBe(1100)
    expect(Math.round(((phenolAfter.totals.water ?? 0) - (phenolBefore.totals.water ?? 0)) * 1000) / 1000).toBe(100)
    expect(phenolAfter.rows.find((row) => row.day === today)?.refs).toContain(batch.batchNo)
    const last = phenolAfter.rows[phenolAfter.rows.length - 1]
    expect(phenolAfter.closing).toBe(last.balance)
  })

  test('the resin lot is in the resin tank and the store ledger shows the movements', async ({ request }) => {
    const tank = await request.get('/api/cc_store/stock?place=tank')
    expect(tank.ok(), await tank.text()).toBeTruthy()
    const body = (await tank.json()) as { items: Array<{ title: string; lots: Array<{ lotNumber: string | null; onHand: number }> }> }
    const resin = body.items.find((item) => item.title === 'P.F. Resin PFC')
    expect(resin?.lots.find((lot) => lot.lotNumber === posted.batchNo)?.onHand).toBe(1100)
  })

  test('posting is refused when stock is short, and nothing moves', async ({ request }) => {
    const reactor = data.reactors[0]
    const before = await freeKg(request, 'Phenol')
    const create = await request.post('/api/cc_production/resin/batches', { data: { batchDate: today, reactorId: reactor.id, grade: 'PFA', materials: [{ productId: formaldehyde.id, kg: 10 }, { productId: phenol.id, kg: before + 5000 }], yieldKg: 10 } })
    const draft = (await create.json()) as Batch
    const formaldehydeBefore = await freeKg(request, 'Formaldehyde')
    const post = await act(request, draft, 'post')
    expect(post.status()).toBe(409)
    expect(((await post.json()) as { error: string }).error).toMatch(/Only .* kg of Phenol/)
    expect(await freeKg(request, 'Phenol')).toBe(before)
    expect(await freeKg(request, 'Formaldehyde')).toBe(formaldehydeBefore)
    const fresh = (await (await request.get(`/api/cc_production/resin/batches?id=${draft.id}`)).json()) as Batch
    expect(fresh.status).toBe('draft')
    const removed = await act(request, fresh, 'delete')
    expect(removed.ok()).toBeTruthy()
  })

  test('chemist and in-charge sign; signing does not hold up posting', async ({ request }) => {
    const signed = await act(request, posted, 'sign_chemist')
    expect(signed.ok(), await signed.text()).toBeTruthy()
    posted = (await signed.json()) as Batch
    expect(posted.chemistSign).toBeTruthy()
    const incharge = await act(request, posted, 'sign_incharge')
    posted = (await incharge.json()) as Batch
    expect(posted.history.map((entry) => entry.action)).toEqual(expect.arrayContaining(['created', 'posted', 'signed_chemist', 'signed_incharge']))
  })

  test('reopen within 24 hours reverses both movements; it can then be posted again', async ({ request }) => {
    const before = await freeKg(request, 'Phenol')
    const preview = (await (await request.get(`/api/cc_production/resin/batches/preview?id=${posted.id}`)).json()) as { undo: string[]; blockedBy: unknown[]; moves: Array<{ title: string; kg: number; direction: string; place: string }> }
    expect(preview.blockedBy).toEqual([])
    expect(preview.moves.filter((move) => move.direction === 'out')).toEqual([expect.objectContaining({ place: 'tank', kg: 1100 })])
    expect(preview.moves.filter((move) => move.direction === 'in' && move.title === 'Phenol').reduce((sum, move) => sum + move.kg, 0)).toBe(1000)
    expect(preview.undo.join(' ')).toMatch(/1100 kg Resin taken out of the resin tank/)
    const reopen = await act(request, posted, 'reopen')
    expect(reopen.ok(), await reopen.text()).toBeTruthy()
    const draft = (await reopen.json()) as Batch
    expect(draft.status).toBe('draft')
    expect(draft.resin).toBeNull()
    expect(await freeKg(request, 'Phenol')).toBe(Math.round((before + 1000) * 1000) / 1000)
    const pickedLot = posted.materials.flatMap((line) => line.lots)[0]
    const ledger = (await (await request.get(`/api/cc_store/stock/ledger?lotId=${pickedLot.lotId}&pageSize=100`)).json()) as { items: Array<{ id: string; reasonCode: string | null; quantity: number; reverses: string | null; reversedBy: string | null }> }
    const counter = ledger.items.find((row) => row.reasonCode === 'resin_reopen' && row.reverses)
    expect(counter, 'the reopen movement names the movement it reverses').toBeTruthy()
    const original = ledger.items.find((row) => row.id === counter!.reverses)
    expect(original?.reversedBy).toBe(counter!.id)
    expect(original!.quantity).toBe(-counter!.quantity)
    const draftPreview = (await (await request.get(`/api/cc_production/resin/batches/preview?id=${posted.id}`)).json()) as { blockedBy: Array<{ label: string }> }
    expect(draftPreview.blockedBy[0]?.label).toMatch(/not posted/)
    const again = await act(request, draft, 'post')
    expect(again.ok(), await again.text()).toBeTruthy()
    posted = (await again.json()) as Batch
    expect(posted.resin?.leftKg).toBe(1100)
    expect(await freeKg(request, 'Phenol')).toBe(before)
  })

  test('a failed batch takes the chemicals out as scrap and puts nothing in the tank', async ({ request }) => {
    const before = await freeKg(request, 'Formaldehyde')
    const create = await request.post('/api/cc_production/resin/batches', { data: { batchDate: today, reactorId: data.reactors[0].id, grade: 'E-GLASS', materials: [{ productId: formaldehyde.id, kg: 25.5 }] } })
    const draft = (await create.json()) as Batch
    const noReason = await act(request, draft, 'fail')
    expect(noReason.status()).toBe(400)
    const fail = await act(request, draft, 'fail', 'Reactor jammed (e2e)')
    expect(fail.ok(), await fail.text()).toBeTruthy()
    const failed = (await fail.json()) as Batch
    expect(failed.status).toBe('failed')
    expect(failed.resin).toBeNull()
    expect(await freeKg(request, 'Formaldehyde')).toBe(Math.round((before - 25.5) * 1000) / 1000)
    const undo = await act(request, failed, 'reopen')
    const reopened = (await undo.json()) as Batch
    expect(await freeKg(request, 'Formaldehyde')).toBe(before)
    await act(request, reopened, 'delete')
  })

  test('a chemical issue to a coating dryer shows as Use on the register; cancelling puts it back', async ({ request }) => {
    const registerBefore = await register(request, methanol.id)
    expect(registerBefore.phenolColumns).toBe(false)
    const before = await freeKg(request, 'Methanol')
    const missingDryer = await request.post('/api/cc_production/resin/issues', { data: { issueDate: today, productId: methanol.id, kg: 12.345, usedFor: 'coating' } })
    expect(missingDryer.status()).toBe(400)
    const issue = await request.post('/api/cc_production/resin/issues', { data: { issueDate: today, productId: methanol.id, kg: 12.345, usedFor: 'coating', dryerCode: 'Dryer 1', note: 'e2e' } })
    expect(issue.status(), await issue.text()).toBe(201)
    const issued = (await issue.json()) as { id: string; updatedAt: string; lots: Array<{ kg: number }> }
    expect(issued.lots.reduce((sum, lot) => sum + lot.kg, 0)).toBe(12.345)
    expect(await freeKg(request, 'Methanol')).toBe(Math.round((before - 12.345) * 1000) / 1000)
    const registerAfter = await register(request, methanol.id)
    expect(Math.round((registerAfter.totals.use - registerBefore.totals.use) * 1000) / 1000).toBe(12.345)
    const listed = (await (await request.get(`/api/cc_production/resin/issues?month=${month}`)).json()) as { items: Array<{ id: string }> }
    expect(listed.items.some((item) => item.id === issued.id)).toBeTruthy()

    const tooMuch = await request.post('/api/cc_production/resin/issues', { data: { issueDate: today, productId: methanol.id, kg: 900000, usedFor: 'other' } })
    expect(tooMuch.status()).toBe(409)

    const cancel = await request.post('/api/cc_production/resin/issues/cancel', { data: { id: issued.id, reason: 'e2e cleanup' }, headers: { [LOCK]: issued.updatedAt } })
    expect(cancel.ok(), await cancel.text()).toBeTruthy()
    expect(await freeKg(request, 'Methanol')).toBe(before)
  })

  test('resin batches upload: template, check, post (Stage 2 upload centre)', async ({ request }) => {
    const registers = (await (await request.get('/api/cc_production/upload')).json()) as { items: Array<{ key: string; canUpload: boolean }> }
    expect(registers.items.find((item) => item.key === 'resin_batches')?.canUpload).toBe(true)
    const template = await request.get(`/api/cc_production/upload/template?register=resin_batches&date=${today}`)
    expect(template.ok()).toBeTruthy()

    const [year, monthPart, dayPart] = today.split('-')
    const paperDate = `${dayPart}/${monthPart}/${year.slice(2)}`
    const before = await freeKg(request, 'Phenol')
    const csv = [
      'Date,Vessel,Batch No.,Grade,Phenol (kg),Formaldehyde (kg),Start heating °C,Start heating time,Resin yield (kg),Water removed (kg),Post',
      `${paperDate},VES-1,,PFA,"1,00.5",120,53,9.10,150,12,Yes`,
      `do,VES-2,,do,10,NIL,,,,,No`,
      `${paperDate},VES-9,,PFC,1,1,,,1,,No`,
    ].join('\n')
    const check = await request.post('/api/cc_production/upload', { multipart: { register: 'resin_batches', dryRun: 'true', file: { name: `resin-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) } } })
    expect(check.ok(), await check.text()).toBeTruthy()
    const preview = (await check.json()) as { created: number; failed: number; plan: string[]; errors: Array<{ row: number; error: string }> }
    expect(preview.created).toBe(2)
    expect(preview.failed).toBe(1)
    expect(preview.errors[0].error).toMatch(/VES-9/)
    expect(preview.plan.join(' ')).toMatch(/1 posted/)
    expect(await freeKg(request, 'Phenol')).toBe(before)

    const post = await request.post('/api/cc_production/upload', { multipart: { register: 'resin_batches', dryRun: 'false', file: { name: `resin-${stamp}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) } } })
    const report = (await post.json()) as { created: number }
    expect(report.created).toBe(2)
    expect(await freeKg(request, 'Phenol')).toBe(Math.round((before - 100.5) * 1000) / 1000)

    const list = (await (await request.get(`/api/cc_production/resin/batches?month=${month}&pageSize=100`)).json()) as { items: Array<{ id: string; batchNo: string; status: string; grade: string; reactorCode: string; yieldKg: number | null; updatedAt: string }> }
    const fromUpload = list.items.filter((item) => item.grade === 'PFA' && (item.yieldKg === 150 || (item.reactorCode === 'CCCPL-VES-2' && item.status === 'draft')))
    const uploadedPost = fromUpload.find((item) => item.status === 'posted' && item.yieldKg === 150)
    expect(uploadedPost?.reactorCode).toBe('CCCPL-VES-1')
    const ditto = fromUpload.find((item) => item.status === 'draft' && item.reactorCode === 'CCCPL-VES-2')
    expect(ditto).toBeTruthy()

    for (const item of [uploadedPost!, ditto!]) {
      let batch = (await (await request.get(`/api/cc_production/resin/batches?id=${item.id}`)).json()) as Batch
      if (batch.status !== 'draft') batch = (await (await act(request, batch, 'reopen')).json()) as Batch
      expect((await act(request, batch, 'delete')).ok()).toBeTruthy()
    }
    expect(await freeKg(request, 'Phenol')).toBe(before)
  })

  test('resin pages open', async ({ request }) => {
    for (const path of ['/backend/resin/batches', '/backend/resin/batches/new', `/backend/resin/batches/${posted.id}`, '/backend/resin/chemical-register', '/backend/resin/issues']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })

  test('clean up: reopen the posted batch and take the test opening stock back out', async ({ request }) => {
    const reopened = (await (await act(request, posted, 'reopen')).json()) as Batch
    expect((await act(request, reopened, 'delete')).ok()).toBeTruthy()
    const current = await setup(request)
    for (const [title, lotNumber] of [
      ['Phenol', lotNumbers.phenol],
      ['Formaldehyde', lotNumbers.formaldehyde],
      ['Methanol', lotNumbers.methanol],
    ]) {
      const entry = chemical(current, title)
      const lot = entry.lots.find((candidate) => candidate.lotNumber === lotNumber)
      if (!lot) continue
      const out = await request.post('/api/cc_store/stock/adjust', { data: { place: lot.place, productId: entry.id, direction: 'out', quantity: lot.free, lotId: lot.lotId, reason: 'Physical count difference', note: 'e2e stage 3 cleanup' } })
      expect(out.ok(), await out.text()).toBeTruthy()
    }
  })
})
