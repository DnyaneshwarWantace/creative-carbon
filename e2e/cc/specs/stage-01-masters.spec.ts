import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'

type Row = Record<string, unknown> & { id: string; updatedAt: string }

async function masters(request: APIRequestContext, type: string): Promise<Row[]> {
  const response = await request.get(`/api/cc_production/masters?type=${type}`)
  expect(response.ok(), `${type} list`).toBeTruthy()
  return ((await response.json()) as { items: Row[] }).items
}

async function search(request: APIRequestContext, query: string) {
  const response = await request.get(`/api/cc_products/search?${query}`)
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { items: Array<{ id: string; title: string; kind: string; unit: string | null }> }).items
}

test.describe('Stage 1 · masters', () => {
  test('the eight laminate item types replace the Dermat types', async ({ request }) => {
    const response = await request.get('/api/catalog/categories?pageSize=100')
    expect(response.ok()).toBeTruthy()
    const names = ((await response.json()) as { items: Array<{ name: string }> }).items.map((item) => item.name)
    for (const name of ['Chemicals', 'Reinforcement', 'Chindi', 'Resin', 'B-stage', 'Sheets, Tubes & Rods', 'Moulded Parts', 'Bought-in & Consumables', 'Paper', 'Cloth', 'Sheet', 'Tube', 'Rod']) {
      expect(names, name).toContain(name)
    }
    for (const gone of ['Raw Material', 'Packing Material', 'Bulk', 'Serum', 'Bottles', 'Actives']) {
      expect(names, `${gone} removed`).not.toContain(gone)
    }
  })

  test('seeded items are there with the right type and unit', async ({ request }) => {
    const chemicals = await search(request, 'kinds=chemical&limit=100')
    expect(chemicals.map((item) => item.title)).toEqual(expect.arrayContaining(['Phenol', 'Formaldehyde', 'Cardinol', 'Liquid Ammonia', 'Methanol', 'DBP']))
    expect(chemicals.every((item) => item.unit === 'kg')).toBeTruthy()
    const reinforcement = await search(request, 'kinds=reinforcement&limit=100')
    expect(reinforcement.length).toBeGreaterThanOrEqual(29)
    expect(reinforcement.map((item) => item.title)).toEqual(expect.arrayContaining(['ISCON 110', 'G.K. Padding 210', '10x10', '16x16x54']))
    const resin = await search(request, 'kinds=resin&limit=20')
    expect(resin.map((item) => item.title)).toEqual(expect.arrayContaining(['P.F. Resin PFC', 'P.F. Resin PFA', 'P.F. Resin PFAC', 'P.F. Resin E-GLASS']))
    const laminates = await search(request, 'kinds=laminate&limit=50')
    expect(laminates.map((item) => item.title)).toEqual(expect.arrayContaining(['F2F3 10x10 Sheet', 'Graphite 10x10 Sheet', 'Tube 6x6']))
  })

  test('a new item keeps its type fields (moulded part counted in pieces)', async ({ request }) => {
    const name = `E2E bush ${Date.now()}`
    const created = await request.post('/api/cc_products/import', {
      data: { kind: 'moulded', updateExisting: false, rows: [{ name, fields: { die_no: '1155', article_weight_kg: '1.600' } }] },
    })
    expect(created.ok()).toBeTruthy()
    const [found] = await search(request, `kinds=moulded&q=${encodeURIComponent(name)}`)
    expect(found?.kind).toBe('moulded')
    expect(found?.unit).toBe('nos')
    const product = await request.get(`/api/catalog/products?id=${found.id}&pageSize=1`)
    const row = ((await product.json()) as { items: Array<Record<string, unknown>> }).items[0]
    expect(String(row.cf_die_no ?? (row.customFields as Record<string, unknown> | undefined)?.die_no)).toBe('1155')
    const removed = await request.delete(`/api/catalog/products?id=${found.id}`)
    expect(removed.status()).toBeLessThan(400)
  })

  test('the five Creative Carbon stores exist and the old ones are gone', async ({ request }) => {
    for (const place of ['wh_a', 'wh_b', 'tank', 'floor', 'fg']) {
      const response = await request.get(`/api/cc_store/stock?place=${place}`)
      expect(response.status(), place).toBe(200)
    }
    for (const place of ['rm', 'pm', 'production']) {
      const response = await request.get(`/api/cc_store/stock?place=${place}`)
      expect(response.status(), `${place} rejected`).toBe(400)
    }
  })

  test('plant masters are seeded from the registers', async ({ request }) => {
    const reactors = await masters(request, 'reactors')
    expect(reactors.map((row) => row.code)).toEqual(expect.arrayContaining(['CCCPL-VES-1', 'CCCPL-VES-2']))
    const dryers = await masters(request, 'dryers')
    expect(dryers.map((row) => row.code)).toEqual(expect.arrayContaining(['Dryer 1', 'Dryer 2', 'Dryer 3', 'Mixer oven']))
    const presses = await masters(request, 'presses')
    expect(presses).toHaveLength(25)
    expect(presses.filter((row) => row.pressType === 'big').map((row) => row.number)).toEqual([21, 22, 23, 24])
    const tolerances = await masters(request, 'tolerances')
    const t25 = tolerances.find((row) => row.thicknessMm === 25)
    expect(t25?.minKg).toBe(117.6)
    expect(t25?.maxKg).toBe(118.2)
    expect(tolerances.find((row) => row.thicknessMm === 15)?.maxKg).toBe(69.8)
    expect(tolerances.find((row) => row.thicknessMm === 10)?.minKg).toBe(45.8)
    const moulds = await masters(request, 'moulds')
    expect(moulds.map((row) => row.dieNo)).toEqual(expect.arrayContaining(['1155', '4306L', '1140RL', '16x11x1000']))
  })

  test('a master row can be added, changed with an edit lock, and removed', async ({ request }) => {
    const code = `E2E-VES-${Date.now()}`
    const created = await request.post('/api/cc_production/masters', { data: { type: 'reactors', values: { code, capacityKg: '6000' } } })
    expect(created.status()).toBe(201)
    const row = (await created.json()) as Row
    expect(row.capacityKg).toBe(6000)

    const duplicate = await request.post('/api/cc_production/masters', { data: { type: 'reactors', values: { code: code.toLowerCase() } } })
    expect(duplicate.status()).toBe(409)

    const updated = await request.put('/api/cc_production/masters', { data: { type: 'reactors', id: row.id, values: { capacityKg: '6500.5' } }, headers: { [LOCK]: row.updatedAt } })
    expect(updated.ok()).toBeTruthy()
    const after = (await updated.json()) as Row
    expect(after.capacityKg).toBe(6500.5)

    const stale = await request.put('/api/cc_production/masters', { data: { type: 'reactors', id: row.id, values: { capacityKg: '1' } }, headers: { [LOCK]: row.updatedAt } })
    expect(stale.status()).toBe(409)

    const removed = await request.delete(`/api/cc_production/masters?type=reactors&id=${row.id}`, { headers: { [LOCK]: after.updatedAt } })
    expect(removed.ok()).toBeTruthy()
    expect((await masters(request, 'reactors')).some((entry) => entry.id === row.id)).toBeFalsy()
  })

  test('required fields and tolerance numbers are checked', async ({ request }) => {
    const missing = await request.post('/api/cc_production/masters', { data: { type: 'tolerances', values: { thicknessMm: '12.7' } } })
    expect(missing.status()).toBe(400)
    expect(((await missing.json()) as { error: string }).error).toMatch(/Min kg/)
  })

  test('the mould list imports from a sheet: check first, then import, then re-import updates', async ({ request }) => {
    const stamp = Date.now()
    const rows = [
      { 'Die No.': `E2E-${stamp}-A`, Type: 'Die', Description: 'Bush', 'Thickness (mm)': '34' },
      { 'Die No.': `E2E-${stamp}-B`, Type: 'Plate', Size: '8x4', Finish: 'Mirror' },
      { 'Die No.': `E2E-${stamp}-C`, Customer: 'Nobody Of This Name Pvt Ltd' },
      { 'Die No.': `E2E-${stamp}-A`, Type: 'Die' },
    ]
    const check = await request.post('/api/cc_production/masters/import', { data: { type: 'moulds', dryRun: true, rows } })
    expect(check.ok()).toBeTruthy()
    const report = (await check.json()) as { created: number; failed: number; errors: Array<{ row: number; error: string }> }
    expect(report.created).toBe(2)
    expect(report.failed).toBe(2)
    expect(report.errors.map((entry) => entry.error).join(' ')).toMatch(/not in the customer list/)
    expect(report.errors.map((entry) => entry.error).join(' ')).toMatch(/appears twice/)
    expect((await masters(request, 'moulds')).some((row) => String(row.dieNo).startsWith(`E2E-${stamp}`))).toBeFalsy()

    const real = await request.post('/api/cc_production/masters/import', { data: { type: 'moulds', dryRun: false, rows: rows.slice(0, 2) } })
    expect(((await real.json()) as { created: number }).created).toBe(2)
    const again = await request.post('/api/cc_production/masters/import', { data: { type: 'moulds', dryRun: false, rows: [{ 'Die No.': `E2E-${stamp}-A`, Type: 'Die', Description: 'Bush revised' }] } })
    expect(((await again.json()) as { updated: number }).updated).toBe(1)

    const imported = (await masters(request, 'moulds')).filter((row) => String(row.dieNo).startsWith(`E2E-${stamp}`))
    expect(imported).toHaveLength(2)
    const plate = imported.find((row) => row.dieNo === `E2E-${stamp}-B`)
    expect(plate?.mouldType).toBe('plate')
    expect(plate?.finish).toBe('mirror')
    expect(imported.find((row) => row.dieNo === `E2E-${stamp}-A`)?.description).toBe('Bush revised')
    for (const row of imported) {
      await request.delete(`/api/cc_production/masters?type=moulds&id=${row.id}`, { headers: { [LOCK]: row.updatedAt } })
    }
  })

  test('price lists keep small and big size rates', async ({ request }) => {
    const created = await request.post('/api/cc_production/masters', { data: { type: 'prices', values: { sizeClass: 'big', grade: `E2E-F2F3-${Date.now()}`, thicknessFrom: '10', thicknessTo: '25', ratePerKg: '245.50', currency: 'INR' } } })
    expect(created.status()).toBe(201)
    const row = (await created.json()) as Row
    expect(row.ratePerKg).toBe(245.5)
    await request.delete(`/api/cc_production/masters?type=prices&id=${row.id}`, { headers: { [LOCK]: row.updatedAt } })
  })

  test('Creative Carbon departments are set up with their own logins', async ({ request }) => {
    const response = await request.get('/api/cc_departments/departments?pageSize=100')
    expect(response.ok()).toBeTruthy()
    const names = ((await response.json()) as { items: Array<{ name: string; role_id?: string | null }> }).items.map((item) => item.name)
    expect(names).toEqual(expect.arrayContaining(['Management', 'Floor supervisor', 'Resin plant', 'Coating', 'Press & moulding', 'Store & despatch', 'QC & lab', 'Data entry', 'Accounts', 'Sales', 'Purchase']))
  })

  test('dropdown lists carry the recording findings', async ({ request }) => {
    const { items } = (await (await request.get('/api/cc_lists/lists')).json()) as { items: Array<{ key: string; options: Array<{ value: string }> }> }
    const values = (key: string) => items.find((list) => list.key === key)?.options.map((option) => option.value) ?? []
    expect(values('resin_grades')).toEqual(['PFC', 'PFA', 'PFAC', 'E-GLASS'])
    expect(values('sheet_sizes')).toContain('4x4')
    expect(values('test_standards')).toContain('British Standard')
    expect(values('vendor_categories')).toContain('Job work')
  })

  test('masters pages open', async ({ request }) => {
    for (const path of ['/backend/masters/plant', '/backend/masters/moulds', '/backend/masters/tolerance', '/backend/masters/prices', '/backend/products?tab=chemicals', '/backend/products?tab=laminates', '/backend/products/new/reinforcement', '/backend/store/stock?place=tank']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      expect((await response.text()).toLowerCase().includes('dermat'), `${path} mentions Dermat`).toBe(false)
    }
  })

  test('connection to Stage 0: an order can pick a laminate item', async ({ request }) => {
    const found = await search(request, 'q=F2F3&limit=10')
    expect(found.some((item) => item.kind === 'laminate')).toBeTruthy()
  })
})
