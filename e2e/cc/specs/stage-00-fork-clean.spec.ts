import { expect, test } from '@playwright/test'

const KEPT_PAGES = [
  '/backend/overview',
  '/backend/my-work',
  '/backend/orders',
  '/backend/orders/new',
  '/backend/products',
  '/backend/store/stock',
  '/backend/store/ledger',
  '/backend/purchase/orders',
  '/backend/purchase/grns',
  '/backend/accounts/dues',
  '/backend/accounts/number-series',
  '/backend/masters/dropdowns',
  '/backend/masters/access',
  '/backend/masters/stages',
  '/backend/work/advance',
  '/backend/work/allocation',
  '/backend/work/qc',
  '/backend/work/packing',
  '/backend/work/invoice',
  '/backend/work/dispatch',
]

const REMOVED_PAGES = [
  '/backend/boms',
  '/backend/qc/checks',
  '/backend/qc/rules',
  '/backend/planning',
  '/backend/rnd/requests',
  '/backend/store/requests',
  '/backend/production/board',
  '/backend/work/manufacturing',
  '/backend/work/artwork',
  '/backend/artwork/board',
]

const REMOVED_APIS = ['/api/cc_boms/boms', '/api/dermat_boms/boms', '/api/dermat_quality/checks', '/api/cc_planning/plans', '/api/cc_store/requests', '/api/dermat_rnd/requests']

const ORDER_STAGES = ['advance', 'allocation', 'qc', 'packing', 'invoice', 'dispatch']

test.describe('Stage 0 · fork and clean', () => {
  test('every kept page opens under the Creative Carbon name with no Dermat text', async ({ request }) => {
    for (const path of KEPT_PAGES) {
      const response = await request.get(path)
      expect(response.status(), `${path} status`).toBe(200)
      const html = (await response.text()).toLowerCase()
      expect(html.includes('dermat'), `${path} mentions Dermat`).toBe(false)
      expect(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '', `${path} title`).toContain('creative carbon')
    }
  })

  test('the login page carries the Creative Carbon brand', async ({ request }) => {
    const html = (await (await request.get('/login')).text()).toLowerCase()
    expect(html).toContain('creative carbon')
    expect(html.includes('dermat')).toBe(false)
  })

  test('removed Dermat pages are gone', async ({ request }) => {
    for (const path of REMOVED_PAGES) {
      const response = await request.get(path)
      expect(response.status(), `${path} should be removed`).toBe(404)
    }
  })

  test('removed Dermat APIs are gone', async ({ request }) => {
    for (const path of REMOVED_APIS) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(404)
    }
  })

  test('orders run on the seven laminate stages', async ({ request }) => {
    const response = await request.get('/api/cc_orders/stage-settings')
    expect(response.ok()).toBeTruthy()
    const body = (await response.json()) as { stages: Array<{ key: string; label: string }> }
    expect(body.stages.map((stage) => stage.key)).toEqual(ORDER_STAGES)
    expect(body.stages.map((stage) => stage.label)).toEqual(['Advance / LC', 'Stock allocation', 'QC & test report', 'Packing & weighment', 'Invoice & documents', 'Despatch'])
  })

  test('dropdown lists hold laminate plant values, not cosmetics', async ({ request }) => {
    const response = await request.get('/api/cc_lists/lists')
    expect(response.ok()).toBeTruthy()
    const { items } = (await response.json()) as { items: Array<{ key: string; options: Array<{ value: string }> }> }
    const values = (key: string) => items.find((list) => list.key === key)?.options.map((option) => option.value) ?? []
    expect(values('laminate_grades')).toContain('F2F3')
    expect(values('weaves')).toEqual(expect.arrayContaining(['10x10', '6x6']))
    expect(values('sheet_sizes')).toEqual(expect.arrayContaining(['8x4', '6x6', '1906x1250']))
    expect(values('ports')).toEqual(expect.arrayContaining(['Mundra', 'Kandla', 'Nhava Sheva']))
    expect(values('test_standards')).toEqual(expect.arrayContaining(['IS 2036', 'NEMA', 'IEC']))
    for (const gone of ['tube_shape', 'designer_statuses', 'rnd_product_types', 'bulk_source']) {
      expect(items.some((list) => list.key === gone), `${gone} list removed`).toBeFalsy()
    }
  })

  test('number series use the CCCPL prefix', async ({ request }) => {
    const response = await request.get('/api/cc_accounts/number-series')
    expect(response.ok()).toBeTruthy()
    const text = JSON.stringify(await response.json())
    expect(text).toContain('CCCPL/SO/')
    expect(text).not.toMatch(/DER\/|DI\//)
  })
})
