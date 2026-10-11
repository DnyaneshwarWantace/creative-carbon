import { expect, test, type APIRequestContext } from '@playwright/test'
import ExcelJS from 'exceljs'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Corrections = { count: number; people: Array<{ name: string; count: number }>; items: Array<{ recordName: string | null; href: string | null; action: string; reason: string | null }> }

async function corrections(request: APIRequestContext, scope: 'plant' | 'crm'): Promise<Corrections> {
  return (await request.get(`/api/cc_audit/corrections?scope=${scope}`)).json()
}

test.describe.serial('Phase G · corrections this week on Plant today and the CRM home; activity log export', () => {
  let batchNo: string

  test('a reopened resin batch shows in the plant corrections panel with its reason and link', async ({ request }) => {
    const setup = (await (await request.get('/api/cc_production/resin/setup')).json()) as { reactors: Array<{ id: string }>; chemicals: Array<{ id: string; title: string }> }
    const phenol = setup.chemicals.find((entry) => entry.title === 'Phenol')!.id
    const stock = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId: phenol, direction: 'in', quantity: 50, newLot: { lotNumber: `E2E19-PH-${stamp}` }, reason: 'Opening stock', note: 'e2e19' } })
    expect(stock.ok(), await stock.text()).toBeTruthy()
    const created = await request.post('/api/cc_production/resin/batches', { data: { batchDate: today, reactorId: setup.reactors[0].id, grade: 'PFC', materials: [{ productId: phenol, kg: 20 }], yieldKg: 15 } })
    let batch = (await created.json()) as { id: string; batchNo: string; updatedAt: string; status: string }
    batchNo = batch.batchNo
    batch = (await (await request.post('/api/cc_production/resin/batches/action', { data: { id: batch.id, action: 'post' }, headers: { [LOCK]: batch.updatedAt } })).json()) as typeof batch
    expect(batch.status).toBe('posted')
    batch = (await (await request.post('/api/cc_production/resin/batches/action', { data: { id: batch.id, action: 'reopen', reason: 'Phenol weight typed wrong (e2e19)' }, headers: { [LOCK]: batch.updatedAt } })).json()) as typeof batch
    expect(batch.status).toBe('draft')
    const panel = await corrections(request, 'plant')
    const entry = panel.items.find((item) => item.reason === 'Phenol weight typed wrong (e2e19)')!
    expect(entry).toMatchObject({ recordName: batchNo, href: `/backend/resin/batches/${batch.id}` })
    expect(panel.count).toBeGreaterThan(0)
    expect(panel.people.length).toBeGreaterThan(0)
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: batch.id, action: 'delete' }, headers: { [LOCK]: batch.updatedAt } })).ok()).toBeTruthy()
    const lots = ((await (await request.get('/api/cc_store/stock?place=wh_a')).json()) as { items: Array<{ productId: string; lots: Array<{ lotId: string; lotNumber: string | null; free: number }> }> }).items
    const lot = lots.flatMap((item) => item.lots.map((entry) => ({ ...entry, productId: item.productId }))).find((entry) => entry.lotNumber === `E2E19-PH-${stamp}`)
    if (lot?.free) await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId: lot.productId, direction: 'out', quantity: lot.free, lotId: lot.lotId, reason: 'Physical count difference', note: 'e2e19 cleanup' } })
  })

  test('a reopened enquiry shows in the CRM corrections panel', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E19 CRM ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const created = await request.post('/api/cc_crm/enquiries', { data: { source: 'IndiaMART', receivedAt: new Date().toISOString(), customerId, contactName: 'Mr Shah', subject: `E2E19 rods ${stamp}` } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const id = ((await created.json()) as { id: string }).id
    const act = async (body: Record<string, unknown>) => request.post('/api/cc_crm/enquiries/action', { data: { id, ...body }, headers: { [LOCK]: ((await (await request.get(`/api/cc_crm/enquiries?id=${id}`)).json()) as { updatedAt: string }).updatedAt } })
    expect((await act({ action: 'stage', stage: 'lost', lostReason: 'Price too high' })).ok()).toBeTruthy()
    expect((await act({ action: 'reopen', reason: 'Customer called back (e2e19)' })).ok()).toBeTruthy()
    const panel = await corrections(request, 'crm')
    expect(panel.items.find((item) => item.reason === 'Customer called back (e2e19)')?.href).toBe(`/backend/crm/enquiries/${id}`)
    expect((await corrections(request, 'plant')).items.some((item) => item.reason === 'Customer called back (e2e19)')).toBeFalsy()
  })

  test('the activity log filters by kind and exports to Excel with the right columns', async ({ request }) => {
    const rows = ((await (await request.get(`/api/cc_audit/log?from=${today}&to=${today}&kind=correction`)).json()) as { items: Array<{ record: string; reason: string; kind: string }> }).items
    expect(rows.every((row) => row.kind === 'correction')).toBeTruthy()
    expect(rows.some((row) => row.record === batchNo && row.reason === 'Phenol weight typed wrong (e2e19)')).toBeTruthy()
    const file = await request.get(`/api/cc_audit/log?from=${today}&to=${today}&kind=correction&format=xlsx`)
    expect(file.ok()).toBeTruthy()
    expect(file.headers()['content-disposition']).toContain('.xlsx')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load((await file.body()) as unknown as ArrayBuffer)
    const sheet = workbook.getWorksheet('Activity log')!
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(['When (IST)', 'Record type', 'Record', 'Action', 'Kind', 'Summary', 'Reason', 'Old → new', 'Who', 'Source', 'Link'])
    expect(sheet.rowCount - 1).toBeGreaterThanOrEqual(rows.length)
  })

  test('the owner, CRM home and audit pages open', async ({ request }) => {
    for (const path of ['/backend/owner', '/backend/crm', '/backend/audit', '/backend/settings/changes']) expect((await request.get(path)).status(), path).toBe(200)
  })
})
