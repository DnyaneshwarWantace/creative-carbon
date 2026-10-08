import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const YEAR = 2100 + (stamp % 800)
const DATE = `${YEAR}-05-09`

type SeriesItem = { key: string; label: string; prefix: string; suffix: string; pad: number; startAt: number; kind: string; next: string; defaults: { prefix: string; suffix: string; pad: number; startAt: number } }
type Series = { items: SeriesItem[]; updatedAt: string | null; hasCompany: boolean }

async function series(request: APIRequestContext): Promise<Series> {
  return (await request.get('/api/cc_accounts/number-series')).json()
}

async function saveSeries(request: APIRequestContext, data: Series, changes: Record<string, Partial<SeriesItem>>) {
  const items = data.items.map((item) => ({ key: item.key, prefix: item.prefix, suffix: item.suffix, pad: item.pad, startAt: item.startAt, ...(changes[item.key] ?? {}) }))
  return request.put('/api/cc_accounts/number-series', { data: { items }, headers: data.updatedAt ? { [LOCK]: data.updatedAt } : {} })
}

test.describe.serial('Codes, dropdown masters and views on the plant pages', () => {
  test('company details exist so number series can be set (Masters → Company details)', async ({ request }) => {
    const company = (await (await request.get('/api/cc_accounts/company')).json()) as { id: string | null; updatedAt: string | null }
    if (!company.id) {
      const saved = await request.put('/api/cc_accounts/company', { data: { name: 'Creative Carbon Composites Pvt. Ltd.', address: 'Kanera, Kheda, Gujarat' } })
      expect(saved.ok(), await saved.text()).toBeTruthy()
    }
    expect((await series(request)).hasCompany).toBe(true)
  })

  test('the number series master lists the plant numbers and lot formats with their next code', async ({ request }) => {
    const data = await series(request)
    const byKey = (key: string) => data.items.find((item) => item.key === key)!
    expect(byKey('RB').defaults.prefix).toBe('CCCPL/{DD}{MM}{YY}/')
    expect(byKey('PB')).toEqual(expect.objectContaining({ prefix: 'F/', suffix: '/{MM}/{YYYY}', pad: 2 }))
    for (const key of ['LOT_BS', 'LOT_PR', 'LOT_MO', 'LOT_CUT', 'LOT_FG', 'LOT_BI']) expect(byKey(key).kind, key).toBe('template')
    expect(byKey('LOT_BS').next).toMatch(/^B-\d{6}-D2-1$/)
    expect(byKey('LOT_PR').next).toBe('F/03/10/2026 25mm 10x10')
  })

  test('a lot format must keep the codes that keep lots apart', async ({ request }) => {
    const refused = await saveSeries(request, await series(request), { LOT_BS: { prefix: 'B-{DD}{MM}{YY}-{DRYER}' } })
    expect(refused.status()).toBe(400)
    expect(((await refused.json()) as { error: string }).error).toMatch(/must keep \{SN\}/)
  })

  test('a changed resin batch series and press series are used for new numbers, then put back', async ({ request }) => {
    const saved = await saveSeries(request, await series(request), { RB: { prefix: 'RB/{DD}{MM}{YY}-', pad: 3 }, PB: { prefix: 'PB-', suffix: '-{MM}{YY}', pad: 3 } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const resin = (await (await request.get(`/api/cc_production/resin/setup?date=${DATE}`)).json()) as { nextBatchNo: string }
    expect(resin.nextBatchNo).toBe(`RB/0905${String(YEAR).slice(2)}-001`)
    const press = (await (await request.get(`/api/cc_production/press/setup?date=${DATE}`)).json()) as { nextBatchNo: string }
    expect(press.nextBatchNo).toBe(`PB-001-05${String(YEAR).slice(2)}`)
    const current = await series(request)
    const reset = await saveSeries(request, current, Object.fromEntries(current.items.map((item) => [item.key, { ...item.defaults }])))
    expect(reset.ok(), await reset.text()).toBeTruthy()
    expect(((await (await request.get(`/api/cc_production/resin/setup?date=${DATE}`)).json()) as { nextBatchNo: string }).nextBatchNo).toBe(`CCCPL/0905${String(YEAR).slice(2)}/01`)
  })

  test('resin grades and the reason lists come from the dropdown master', async ({ request }) => {
    const lists = (await (await request.get('/api/cc_lists/lists')).json()) as { items: Array<{ key: string; options: Array<{ value: string; active: boolean }> }> }
    const list = (key: string) => lists.items.find((item) => item.key === key)!
    for (const key of ['resin_grades', 'resin_fail_reasons', 'press_grades', 'bstage_scrap_reasons', 'damage_reasons', 'cut_sizes', 'fg_rejection_reasons', 'lab_test_types', 'lab_standards', 'operators']) expect(list(key), key).toBeTruthy()
    expect(list('resin_grades').options.map((option) => option.value)).toEqual(['PFC', 'PFA', 'PFAC', 'E-GLASS'])

    const resinSetup = (await (await request.get('/api/cc_production/resin/setup')).json()) as { reactors: Array<{ id: string }>; grades: string[]; failReasons: string[] }
    expect(resinSetup.failReasons).toContain('Reactor jammed')
    const unknown = await request.post('/api/cc_production/resin/batches', { data: { batchDate: DATE, reactorId: resinSetup.reactors[0].id, grade: 'PF-HT' } })
    expect(unknown.status()).toBe(400)
    expect(((await unknown.json()) as { error: string }).error).toMatch(/not in the resin grades list/)

    const added = await request.put('/api/cc_lists/lists', { data: { key: 'resin_grades', options: [...list('resin_grades').options.map((option) => ({ value: option.value, active: option.active })), { value: 'PF-HT', active: true }] } })
    expect(added.ok(), await added.text()).toBeTruthy()
    expect(((await (await request.get('/api/cc_production/resin/setup')).json()) as { grades: string[] }).grades).toContain('PF-HT')
    const draft = await request.post('/api/cc_production/resin/batches', { data: { batchDate: DATE, reactorId: resinSetup.reactors[0].id, grade: 'pf-ht' } })
    expect(draft.status(), await draft.text()).toBe(201)
    const batch = (await draft.json()) as { id: string; updatedAt: string; grade: string }
    expect(batch.grade).toBe('PF-HT')
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: batch.id, action: 'delete' }, headers: { [LOCK]: batch.updatedAt } })).ok()).toBeTruthy()
    expect((await request.put('/api/cc_lists/lists', { data: { key: 'resin_grades', reset: true } })).ok()).toBeTruthy()

    const pressSetup = (await (await request.get('/api/cc_production/press/setup')).json()) as { grades: string[] }
    expect(pressSetup.grades).toEqual(expect.arrayContaining(['F2F3', '10x10', '6x6']))
  })

  test('a saved view (columns) on a plant list is kept per user', async ({ request }) => {
    const tableId = 'cc_production.resin_batches'
    const name = `e2e view ${stamp}`
    const saved = await request.post(`/api/perspectives/${tableId}`, { data: { name, settings: { columnOrder: ['batchNo', 'date', 'yieldPct'], columnVisibility: { batchNo: true, date: true, yieldPct: true, vessel: false }, pageSize: 25 }, isDefault: false, applyToRoles: [], setRoleDefault: false } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const index = (await (await request.get(`/api/perspectives/${tableId}`)).json()) as { perspectives: Array<{ id: string; name: string; settings: { columnOrder?: string[]; pageSize?: number } }> }
    const view = index.perspectives.find((entry) => entry.name === name)!
    expect(view.settings).toEqual(expect.objectContaining({ columnOrder: ['batchNo', 'date', 'yieldPct'], pageSize: 25 }))
    expect((await request.delete(`/api/perspectives/${tableId}/${view.id}`)).ok()).toBeTruthy()
  })

  test('number series and dropdown pages open', async ({ request }) => {
    for (const path of ['/backend/accounts/number-series', '/backend/masters/dropdowns', '/backend/resin/batches', '/backend/press/batches', '/backend/stock']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })
})
