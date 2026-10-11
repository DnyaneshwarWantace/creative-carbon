import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const DATE = `${2900 + (stamp % 90)}-08-${String(10 + (stamp % 18)).padStart(2, '0')}`

type Sheet = { id: string; updatedAt: string; notes: string | null; status: string }
type Clash = { id: string; status: string; kept: string | null; canPick: boolean; serverByName: string | null; recordHref: string | null; differences: Array<{ field: string; from: unknown; to: unknown }>; updatedAt: string }
type Activity = { action: string; reason: string | null }

async function sheet(request: APIRequestContext, id: string): Promise<Sheet> {
  return (await request.get(`/api/cc_production/coating/sheets?id=${id}`)).json()
}

async function clash(request: APIRequestContext, id: string): Promise<Clash> {
  return (await request.get(`/api/cc_production/clash?id=${id}`)).json()
}

test.describe.serial('Phase F · an offline sync clash keeps both versions; the manager picks one with a reason', () => {
  let sheetId: string
  let clashId: string
  let dryerId: string

  test('the clash captures the version the offline save overwrote', async ({ request }) => {
    const setup = (await (await request.get('/api/cc_production/coating/setup')).json()) as { dryers: Array<{ id: string; code: string }> }
    dryerId = setup.dryers.find((entry) => entry.code === 'Dryer 1')!.id
    const created = await request.post('/api/cc_production/coating/sheets', { data: { sheetDate: DATE, dryerId, rows: [], slots: [], notes: 'Typed in the office' } })
    expect(created.status(), await created.text()).toBe(201)
    sheetId = ((await created.json()) as Sheet).id
    const slots = ((await (await request.get(`/api/cc_production/coating/sheets?id=${sheetId}`)).json()) as { slots: Array<{ time: string; dbpKg: number | null; oleicKg: number | null; outputKg: number | null }> }).slots.map(({ time, dbpKg, oleicKg, outputKg }) => ({ time, dbpKg, oleicKg, outputKg }))
    const offlineBody = { id: sheetId, sheetDate: DATE, dryerId, rows: [], slots, notes: 'Typed on the phone offline' }
    const logged = await request.post('/api/cc_production/clash', { data: { screen: 'Dryer sheet', recordRef: `Dryer 1 ${DATE}`, path: '/api/cc_production/coating/sheets', method: 'PUT', body: offlineBody, queuedAt: new Date().toISOString(), detail: 'e2e clash' } })
    expect(logged.status(), await logged.text()).toBe(201)
    clashId = ((await logged.json()) as { id: string }).id
    expect((await request.put('/api/cc_production/coating/sheets', { data: offlineBody })).ok()).toBeTruthy()
    expect((await sheet(request, sheetId)).notes).toBe('Typed on the phone offline')
    const view = await clash(request, clashId)
    expect(view).toMatchObject({ status: 'open', canPick: true, recordHref: `/backend/coating/${sheetId}` })
    expect(view.differences).toEqual([expect.objectContaining({ field: 'notes', from: 'Typed in the office', to: 'Typed on the phone offline' })])
    const listed = ((await (await request.get('/api/cc_production/clash?status=open')).json()) as { items: Clash[] }).items
    expect(listed.some((item) => item.id === clashId)).toBeTruthy()
  })

  test('putting the earlier version back needs a reason, restores it, and is logged once', async ({ request }) => {
    const before = await clash(request, clashId)
    expect((await request.post('/api/cc_production/clash/pick', { data: { id: clashId, keep: 'server' }, headers: { [LOCK]: before.updatedAt } })).status()).toBe(400)
    const picked = await request.post('/api/cc_production/clash/pick', { data: { id: clashId, keep: 'server', reason: 'The office copy had the checked figures' }, headers: { [LOCK]: before.updatedAt } })
    expect(picked.ok(), await picked.text()).toBeTruthy()
    expect(((await picked.json()) as Clash)).toMatchObject({ status: 'resolved', kept: 'server' })
    expect((await sheet(request, sheetId)).notes).toBe('Typed in the office')
    const after = await clash(request, clashId)
    expect((await request.post('/api/cc_production/clash/pick', { data: { id: clashId, keep: 'offline', reason: 'Again' }, headers: { [LOCK]: after.updatedAt } })).status()).toBe(409)
    const log = ((await (await request.get(`/api/cc_audit/activity?type=sync_clash&id=${clashId}`)).json()) as { items: Activity[] }).items
    expect(log.find((item) => item.action === 'detected')).toBeTruthy()
    expect(log.find((item) => item.action === 'resolved')?.reason).toBe('The office copy had the checked figures')
  })

  test('the clash pages open', async ({ request }) => {
    expect((await request.get('/backend/sync/clashes')).status()).toBe(200)
    expect((await request.get(`/backend/sync/clashes/${clashId}`)).status()).toBe(200)
  })

  test('cleanup: the test sheet is deleted', async ({ request }) => {
    const current = await sheet(request, sheetId)
    expect((await request.post('/api/cc_production/coating/sheets/action', { data: { id: sheetId, action: 'delete' }, headers: { [LOCK]: current.updatedAt } })).ok()).toBeTruthy()
  })
})
