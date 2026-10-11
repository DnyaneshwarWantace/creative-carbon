import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Activity = { action: string; reason: string | null; changes: Array<{ field: string; label: string; from: unknown; to: unknown }> | null }
type FgLot = { lotId: string; lotNumber: string; place: string; onHand: number; free: number; status: string }
type BstageMove = { id: string; kg: number; reasonCode: string | null; reverses: string | null; reversedBy: string | null; canUndoScrap: boolean }
type Thickness = { id: string; result: string; outOfTolerance: number; readings: number[]; updatedAt: string }
type LabTest = { id: string; updatedAt: string; revision: number; issuedAt: string | null; reports: Array<{ id: string; fileName: string }>; supersededReports: Array<{ id: string; fileName: string; revision: number | null }>; revisions: Array<{ revision: number; reason: string }> }

async function activity(request: APIRequestContext, type: string, id: string): Promise<Activity[]> {
  return ((await (await request.get(`/api/cc_audit/activity?type=${type}&id=${id}`)).json()) as { items: Activity[] }).items
}

async function finishing<T>(request: APIRequestContext, kind: string, id: string): Promise<T> {
  return (await request.get(`/api/cc_production/records/finishing?kind=${kind}&id=${id}`)).json()
}

async function fgLots(request: APIRequestContext): Promise<FgLot[]> {
  return ((await (await request.get('/api/cc_production/finishing/lots')).json()) as { items: FgLot[] }).items
}

async function product(request: APIRequestContext, kinds: string, title: string): Promise<string> {
  const items = ((await (await request.get(`/api/cc_products/search?kinds=${kinds}&q=${encodeURIComponent(title)}`)).json()) as { items: Array<{ id: string; title: string }> }).items
  return items.find((item) => item.title === title)!.id
}

async function pdf(request: APIRequestContext, recordId: string, name: string) {
  const uploaded = await request.post('/api/attachments', { multipart: { entityId: 'cc_production:lab_test', recordId, file: { name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n') } } })
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy()
}

test.describe.serial('Phase E · plant register corrections with reasons, limits and old → new timelines', () => {
  let sheetProduct: string
  let bstageLotId: string
  let thickness: Thickness
  let directId: string
  let directLot: string
  let damageId: string
  let labId: string

  test('B-stage scrap is undone by a linked counter-entry, once only, with a reason', async ({ request }) => {
    const bstageProduct = ((await (await request.get('/api/cc_products/search?kinds=bstage')).json()) as { items: Array<{ id: string }> }).items[0].id
    const added = await request.post('/api/cc_store/stock/adjust', { data: { place: 'floor', productId: bstageProduct, direction: 'in', quantity: 20, newLot: { lotNumber: `E2E17-BS-${stamp}` }, reason: 'Opening stock', note: 'e2e stage 17' } })
    expect(added.ok(), await added.text()).toBeTruthy()
    bstageLotId = ((await (await request.get(`/api/cc_store/adjustments?id=${((await added.json()) as { id: string }).id}`)).json()) as { lotId: string }).lotId
    expect((await request.post('/api/cc_production/bstage/scrap', { data: { lotId: bstageLotId, kg: 6, reason: 'Torn at the edge (e2e)' } })).ok()).toBeTruthy()
    let lot = (await (await request.get(`/api/cc_production/bstage?lotId=${bstageLotId}`)).json()) as { onHandKg: number; movements: BstageMove[] }
    expect(lot.onHandKg).toBe(14)
    const scrap = lot.movements.find((move) => move.reasonCode === 'bstage_scrap')!
    expect(scrap.canUndoScrap).toBe(true)
    expect((await request.post('/api/cc_production/bstage/unscrap', { data: { lotId: bstageLotId, movementId: scrap.id } })).status()).toBe(400)
    const undone = await request.post('/api/cc_production/bstage/unscrap', { data: { lotId: bstageLotId, movementId: scrap.id, reason: 'Edge can be trimmed, sheet is usable' } })
    expect(undone.ok(), await undone.text()).toBeTruthy()
    lot = (await undone.json()) as typeof lot
    expect(lot.onHandKg).toBe(20)
    const counter = lot.movements.find((move) => move.reverses === scrap.id)!
    expect(lot.movements.find((move) => move.id === scrap.id)?.reversedBy).toBe(counter.id)
    expect((await request.post('/api/cc_production/bstage/unscrap', { data: { lotId: bstageLotId, movementId: scrap.id, reason: 'Again' } })).status()).toBe(409)
    const log = await activity(request, 'lot', bstageLotId)
    expect(log.find((item) => item.action === 'scrapped')?.reason).toBe('Torn at the edge (e2e)')
    expect(log.find((item) => item.action === 'scrap_undone')?.reason).toBe('Edge can be trimmed, sheet is usable')
  })

  test('a thickness reading is corrected with a reason; the result is worked out again and logged old → new', async ({ request }) => {
    sheetProduct = await product(request, 'laminate', 'Fabric 6x6 Sheet')
    const created = await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotRef: `E2E17-T-${stamp}`, targetMm: 10, minusMm: 0.2, plusMm: 0.8, readings: [10.1, 10.2, 10.3, 10.1, 10.2, 10.3, 10.1, 10.2, 10.3, 10.1, 10.2, 11.5] } })
    expect(created.status(), await created.text()).toBe(201)
    thickness = (await created.json()) as Thickness
    expect(thickness).toMatchObject({ result: 'hold', outOfTolerance: 1 })
    const readings = [...thickness.readings.slice(0, 11), 10.5]
    expect((await request.post('/api/cc_production/thickness/action', { data: { id: thickness.id, action: 'correct', readings }, headers: { [LOCK]: thickness.updatedAt } })).status()).toBe(400)
    const corrected = await request.post('/api/cc_production/thickness/action', { data: { id: thickness.id, action: 'correct', readings, reason: '11.5 was mistyped, gauge showed 10.5' }, headers: { [LOCK]: thickness.updatedAt } })
    expect(corrected.ok(), await corrected.text()).toBeTruthy()
    const stale = await request.post('/api/cc_production/thickness/action', { data: { id: thickness.id, action: 'correct', readings, reason: 'Again' }, headers: { [LOCK]: thickness.updatedAt } })
    expect(stale.status()).toBe(409)
    thickness = (await corrected.json()) as Thickness
    expect(thickness).toMatchObject({ result: 'pass', outOfTolerance: 0 })
    const entry = (await activity(request, 'thickness', thickness.id)).find((item) => item.action === 'reading_corrected')!
    expect(entry.reason).toBe('11.5 was mistyped, gauge showed 10.5')
    expect(entry.changes).toEqual(expect.arrayContaining([{ field: 'readings[11]', label: 'Reading 12', from: 11.5, to: 10.5 }, { field: 'result', label: 'Result', from: 'hold', to: 'pass' }]))
  })

  test('a thickness hold is released only by the quality release right, with a reason', async ({ request }) => {
    expect((await request.post('/api/cc_production/thickness/action', { data: { id: thickness.id, action: 'release', reason: 'Not on hold' }, headers: { [LOCK]: thickness.updatedAt } })).status()).toBe(409)
    const held = (await (await request.post('/api/cc_production/thickness', { data: { inspectDate: today, lotRef: `E2E17-H-${stamp}`, targetMm: 10, minusMm: 0.2, plusMm: 0.8, readings: [10.1, 10.2, 10.3, 10.1, 10.2, 10.3, 10.1, 10.2, 10.3, 10.1, 10.2, 11.5] } })).json()) as Thickness
    expect((await request.post('/api/cc_production/thickness/action', { data: { id: held.id, action: 'release' }, headers: { [LOCK]: held.updatedAt } })).status()).toBe(400)
    const released = await request.post('/api/cc_production/thickness/action', { data: { id: held.id, action: 'release', reason: 'Customer accepts +1.5 on this order' }, headers: { [LOCK]: held.updatedAt } })
    expect(released.ok(), await released.text()).toBeTruthy()
    expect(((await released.json()) as Thickness).result).toBe('released')
    expect((await activity(request, 'thickness', held.id)).find((item) => item.action === 'hold_released')?.reason).toBe('Customer accepts +1.5 on this order')
  })

  test('bought-in goods: details corrected old → new; reversed while unused; refused once used', async ({ request }) => {
    const received = await request.post('/api/cc_production/fg-direct', { data: { inDate: today, supplier: 'Other maker (e2e17)', invoiceNo: `INV17-${stamp}`, productId: sheetProduct, sheetSize: '8x4', thicknessMm: 12, nos: 4, kg: 40 } })
    expect(received.status(), await received.text()).toBe(201)
    const body = (await received.json()) as { id: string; lotId: string }
    directId = body.id
    directLot = body.lotId
    let record = await finishing<{ updatedAt: string; status: string }>(request, 'direct_in', directId)
    const corrected = await request.post('/api/cc_production/fg-direct/action', { data: { id: directId, action: 'correct', invoiceNo: `INV17B-${stamp}`, reason: 'Invoice number typed wrong' }, headers: { [LOCK]: record.updatedAt } })
    expect(corrected.ok(), await corrected.text()).toBeTruthy()
    const log = await activity(request, 'fg_direct_in', directId)
    expect(log.find((item) => item.action === 'corrected')?.changes).toEqual([{ field: 'invoiceNo', label: 'Invoice no', from: `INV17-${stamp}`, to: `INV17B-${stamp}` }])

    const damaged = await request.post('/api/cc_production/damage', { data: { entryDate: today, lotId: directLot, kg: 5, reason: 'Corner broken (e2e17)' } })
    expect(damaged.status(), await damaged.text()).toBe(201)
    damageId = ((await damaged.json()) as { id: string }).id
    record = await finishing<{ updatedAt: string; status: string }>(request, 'direct_in', directId)
    const refused = await request.post('/api/cc_production/fg-direct/action', { data: { id: directId, action: 'reverse', reason: 'Wrong supplier' }, headers: { [LOCK]: record.updatedAt } })
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/already used/)
  })

  test('a damage write-off is undone within 7 days with a reason, once', async ({ request }) => {
    const record = await finishing<{ updatedAt: string; status: string }>(request, 'damage', damageId)
    expect((await request.post('/api/cc_production/damage/undo', { data: { id: damageId }, headers: { [LOCK]: record.updatedAt } })).status()).toBe(400)
    const undone = await request.post('/api/cc_production/damage/undo', { data: { id: damageId, reason: 'Sheet was fine after cleaning' }, headers: { [LOCK]: record.updatedAt } })
    expect(undone.ok(), await undone.text()).toBeTruthy()
    expect((await finishing<{ status: string }>(request, 'damage', damageId)).status).toBe('undone')
    expect((await fgLots(request)).find((lot) => lot.lotId === directLot)?.onHand).toBe(40)
    const again = await finishing<{ updatedAt: string }>(request, 'damage', damageId)
    expect((await request.post('/api/cc_production/damage/undo', { data: { id: damageId, reason: 'Again' }, headers: { [LOCK]: again.updatedAt } })).status()).toBe(409)
    expect((await activity(request, 'damage', damageId)).find((item) => item.action === 'undone')?.reason).toBe('Sheet was fine after cleaning')
  })

  test('bought-in goods are reversed by a counter-entry once the lot is whole again', async ({ request }) => {
    const record = await finishing<{ updatedAt: string }>(request, 'direct_in', directId)
    expect((await request.post('/api/cc_production/fg-direct/action', { data: { id: directId, action: 'reverse' }, headers: { [LOCK]: record.updatedAt } })).status()).toBe(400)
    const reversed = await request.post('/api/cc_production/fg-direct/action', { data: { id: directId, action: 'reverse', reason: 'Goods went back to the supplier' }, headers: { [LOCK]: record.updatedAt } })
    expect(reversed.ok(), await reversed.text()).toBeTruthy()
    expect((await finishing<{ status: string }>(request, 'direct_in', directId)).status).toBe('reversed')
    expect((await fgLots(request)).find((lot) => lot.lotId === directLot)?.onHand ?? 0).toBe(0)
    expect((await activity(request, 'fg_direct_in', directId)).find((item) => item.action === 'reversed')?.reason).toBe('Goods went back to the supplier')
  })

  test('a lab report is issued; an issued report cannot be edited, only amended to a new revision that keeps the old PDF', async ({ request }) => {
    const created = await request.post('/api/cc_production/lab', { data: { testDate: today, testType: 'Electrical', itemTitle: 'Fabric 6x6 Sheet', reportNo: `LR17-${stamp}`, result: 'pending' } })
    expect(created.status(), await created.text()).toBe(201)
    labId = ((await created.json()) as { id: string }).id
    let lab = (await (await request.get(`/api/cc_production/lab?id=${labId}`)).json()) as LabTest
    expect((await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'issue' }, headers: { [LOCK]: lab.updatedAt } })).status()).toBe(400)
    const edited = await request.put('/api/cc_production/lab', { data: { id: labId, testDate: today, testType: 'Electrical', itemTitle: 'Fabric 6x6 Sheet', reportNo: `LR17-${stamp}`, standard: 'IS 2036', result: 'pass' }, headers: { [LOCK]: lab.updatedAt } })
    expect(edited.ok(), await edited.text()).toBeTruthy()
    const edit = (await activity(request, 'lab_test', labId)).find((item) => item.action === 'edited')!
    expect(edit.changes).toEqual(expect.arrayContaining([{ field: 'result', label: 'Result', from: 'pending', to: 'pass' }, { field: 'standard', label: 'Standard', from: null, to: 'IS 2036' }]))
    lab = (await (await request.get(`/api/cc_production/lab?id=${labId}`)).json()) as LabTest
    const noFile = await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'issue' }, headers: { [LOCK]: lab.updatedAt } })
    expect(noFile.status()).toBe(409)
    await pdf(request, labId, `rev0-${stamp}.pdf`)
    lab = (await (await request.get(`/api/cc_production/lab?id=${labId}`)).json()) as LabTest
    const issued = await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'issue' }, headers: { [LOCK]: lab.updatedAt } })
    expect(issued.ok(), await issued.text()).toBeTruthy()
    lab = (await issued.json()) as LabTest
    expect(lab.issuedAt).toBeTruthy()
    const blocked = await request.put('/api/cc_production/lab', { data: { id: labId, testDate: today, testType: 'Electrical', itemTitle: 'Fabric 6x6 Sheet', result: 'fail' }, headers: { [LOCK]: lab.updatedAt } })
    expect(blocked.status()).toBe(409)
    expect(((await blocked.json()) as { error: string }).error).toMatch(/Amend/)
    expect((await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'amend' }, headers: { [LOCK]: lab.updatedAt } })).status()).toBe(400)
    const amended = await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'amend', reason: 'Customer asked for the breakdown voltage too' }, headers: { [LOCK]: lab.updatedAt } })
    expect(amended.ok(), await amended.text()).toBeTruthy()
    lab = (await amended.json()) as LabTest
    expect(lab).toMatchObject({ revision: 1, issuedAt: null, reports: [] })
    expect(lab.supersededReports).toEqual([expect.objectContaining({ fileName: `rev0-${stamp}.pdf`, revision: 0 })])
    expect(lab.revisions).toEqual([expect.objectContaining({ revision: 0, reason: 'Customer asked for the breakdown voltage too' })])
    expect((await request.get(`/api/attachments/file/${lab.supersededReports[0].id}`)).ok()).toBeTruthy()
    await pdf(request, labId, `rev1-${stamp}.pdf`)
    lab = (await (await request.get(`/api/cc_production/lab?id=${labId}`)).json()) as LabTest
    const reissued = await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'issue' }, headers: { [LOCK]: lab.updatedAt } })
    expect(reissued.ok(), await reissued.text()).toBeTruthy()
    lab = (await reissued.json()) as LabTest
    expect(lab.reports.map((file) => file.fileName)).toEqual([`rev1-${stamp}.pdf`])
    const log = await activity(request, 'lab_test', labId)
    expect(log.find((item) => item.action === 'amended')?.reason).toBe('Customer asked for the breakdown voltage too')
    expect(log.filter((item) => item.action === 'issued').length).toBe(2)
  })

  test('editing a draft register logs each changed field old → new on its timeline', async ({ request }) => {
    const setup = (await (await request.get('/api/cc_production/resin/setup')).json()) as { reactors: Array<{ id: string }>; chemicals: Array<{ id: string; title: string }> }
    const phenol = setup.chemicals.find((entry) => entry.title === 'Phenol')!.id
    const base = { batchDate: today, reactorId: setup.reactors[0].id, grade: 'PFC', materials: [{ productId: phenol, kg: 100 }], yieldKg: 80, notes: 'e2e17' }
    const created = await request.post('/api/cc_production/resin/batches', { data: base })
    expect(created.status(), await created.text()).toBe(201)
    const batch = (await created.json()) as { id: string; updatedAt: string }
    const changed = await request.put('/api/cc_production/resin/batches', { data: { ...base, id: batch.id, materials: [{ productId: phenol, kg: 120 }], yieldKg: 95 }, headers: { [LOCK]: batch.updatedAt } })
    expect(changed.ok(), await changed.text()).toBeTruthy()
    const edit = (await activity(request, 'resin_batch', batch.id)).find((item) => item.action === 'edited')!
    expect(edit.changes).toEqual(expect.arrayContaining([
      { field: 'materials[0].kg', label: 'Chemical 1 · Kg', from: 100, to: 120 },
      { field: 'yieldKg', label: 'Yield kg', from: 80, to: 95 },
    ]))
    const current = (await (await request.get(`/api/cc_production/resin/batches?id=${batch.id}`)).json()) as { updatedAt: string }
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: batch.id, action: 'delete' }, headers: { [LOCK]: current.updatedAt } })).ok()).toBeTruthy()
  })

  test('the detail pages open', async ({ request }) => {
    for (const path of [`/backend/quality/thickness/${thickness.id}`, `/backend/fg/direct-in/${directId}`, `/backend/fg/damage/${damageId}`, `/backend/quality/lab/${labId}`, `/backend/bstage/lots/${bstageLotId}`]) {
      expect((await request.get(path)).status(), path).toBe(200)
    }
  })

  test('cleanup', async ({ request }) => {
    const lot = (await (await request.get(`/api/cc_production/bstage?lotId=${bstageLotId}`)).json()) as { productId: string; onHandKg: number }
    if (lot.onHandKg > 0) expect((await request.post('/api/cc_store/stock/adjust', { data: { place: 'floor', productId: lot.productId, direction: 'out', quantity: lot.onHandKg, lotId: bstageLotId, reason: 'Physical count difference', note: 'e2e stage 17 cleanup' } })).ok()).toBeTruthy()
  })
})
