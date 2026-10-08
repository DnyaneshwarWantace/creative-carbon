import { expect, test } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const stamp = Date.now()

type LabTest = { id: string; testPoint: string; customerId: string | null; customerName: string | null; orderId: string | null; orderNo: string | null; testedBy: string | null; reportNo: string | null; result: string; updatedAt: string; reports: Array<{ id: string; fileName: string; mimeType: string }>; history: Array<{ action: string }> }

test.describe.serial('Lab test reports: upload, download, order link, automatic QC assignment', () => {
  let customerId: string
  let productId: string
  let orderId: string
  let labId: string

  test('fixtures: a customer and an order', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E Lab Customer ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(customer.ok(), await customer.text()).toBeTruthy()
    customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const created = await request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId, quantity: 100, specs: { packing: { test_standard: 'NEMA' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    orderId = ((await created.json()) as { id: string }).id
  })

  test('a routine incoming test needs no customer and no order', async ({ request }) => {
    const nothing = await request.post('/api/cc_production/lab', { data: { testDate: today, testType: 'Mechanical' } })
    expect(nothing.status()).toBe(400)
    const routine = await request.post('/api/cc_production/lab', { data: { testPoint: 'incoming', testDate: today, testType: 'Mechanical', lotRefs: `RM-E2E-${stamp}`, itemTitle: 'Phenol', result: 'pass' } })
    expect(routine.status(), await routine.text()).toBe(201)
    const saved = (await routine.json()) as LabTest
    expect(saved).toEqual(expect.objectContaining({ testPoint: 'incoming', customerId: null, customerName: null, orderId: null }))
    expect(saved.testedBy).toBeTruthy()
    const incoming = ((await (await request.get(`/api/cc_production/lab?testPoint=incoming&search=RM-E2E-${stamp}`)).json()) as { items: LabTest[] }).items
    expect(incoming.map((item) => item.id)).toContain(saved.id)
  })

  test('a test for an order takes the customer and order number from the order', async ({ request }) => {
    const created = await request.post('/api/cc_production/lab', { data: { testDate: today, testType: 'Electrical', standard: 'NEMA', orderId, itemTitle: 'Fabric 10x10 Sheet', reportNo: `LR-${stamp}`, testedBy: 'Lab in-charge', result: 'pending' } })
    expect(created.status(), await created.text()).toBe(201)
    const saved = (await created.json()) as LabTest
    labId = saved.id
    expect(saved.customerId).toBe(customerId)
    expect(saved.orderNo).toMatch(/^CCCPL\/SO\//)
    expect(saved).toEqual(expect.objectContaining({ testedBy: 'Lab in-charge', reportNo: `LR-${stamp}` }))
    const forOrder = ((await (await request.get(`/api/cc_production/lab?orderId=${orderId}`)).json()) as { items: LabTest[] }).items
    expect(forOrder.map((item) => item.id)).toEqual([labId])
    const qc = (await (await request.get(`/api/cc_orders/orders/fulfilment?id=${orderId}`)).json()) as { qc: { labTests: Array<{ id: string; result: string }> } }
    expect(qc.qc.labTests).toEqual([expect.objectContaining({ id: labId, result: 'pending' })])
  })

  test('the actual report file uploads, lists on the test and downloads', async ({ request }) => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
    const uploaded = await request.post('/api/attachments', { multipart: { entityId: 'cc_production:lab_test', recordId: labId, file: { name: `report-${stamp}.pdf`, mimeType: 'application/pdf', buffer: pdf } } })
    expect(uploaded.ok(), await uploaded.text()).toBeTruthy()
    const detail = (await (await request.get(`/api/cc_production/lab?id=${labId}`)).json()) as LabTest
    expect(detail.reports).toEqual([expect.objectContaining({ fileName: `report-${stamp}.pdf`, mimeType: 'application/pdf' })])
    const listed = ((await (await request.get(`/api/cc_production/lab?search=LR-${stamp}`)).json()) as { items: LabTest[] }).items
    expect(listed[0].reports.length).toBe(1)
    const download = await request.get(`/api/attachments/file/${detail.reports[0].id}?download=1`)
    expect(download.ok()).toBeTruthy()
    expect(download.headers()['content-disposition']).toContain('attachment')
    expect((await download.body()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  test('the result changes with history; copy previous works on item alone', async ({ request }) => {
    const current = (await (await request.get(`/api/cc_production/lab?id=${labId}`)).json()) as LabTest
    const passed = await request.put('/api/cc_production/lab', { data: { id: labId, testDate: today, testType: 'Electrical', standard: 'NEMA', orderId, itemTitle: 'Fabric 10x10 Sheet', reportNo: `LR-${stamp}`, testedBy: 'Lab in-charge', result: 'pass' }, headers: { [LOCK]: current.updatedAt } })
    expect(passed.ok(), await passed.text()).toBeTruthy()
    const after = (await (await request.get(`/api/cc_production/lab?id=${labId}`)).json()) as LabTest
    expect(after.history.map((entry) => entry.action)).toContain('result pass')
    const stale = await request.put('/api/cc_production/lab', { data: { id: labId, testDate: today, testType: 'Electrical', orderId, result: 'fail' }, headers: { [LOCK]: current.updatedAt } })
    expect(stale.status()).toBe(409)
    const copied = (await (await request.get(`/api/cc_production/lab?last=true&itemTitle=${encodeURIComponent('Fabric 10x10 Sheet')}`)).json()) as { item: { testType: string } | null }
    expect(copied.item).toBeTruthy()
  })

  test('a stage set to a default person is assigned automatically when it opens', async ({ request }) => {
    const people = ((await (await request.get('/api/cc_orders/people')).json()) as { items: Array<{ id: string; name: string }> }).items
    expect(people.length).toBeGreaterThan(0)
    const settings = (await (await request.get('/api/cc_orders/stage-settings')).json()) as { overrides: Array<{ stageKey: string; updatedAt: string }> }
    expect(settings.overrides.find((entry) => entry.stageKey === 'advance'), 'the advance stage already has owner settings; this test would overwrite them').toBeFalsy()
    const set = await request.put('/api/cc_orders/stage-settings', { data: { stageKey: 'advance', defaultUserId: people[0].id } })
    expect(set.ok(), await set.text()).toBeTruthy()
    try {
      const created = await request.post('/api/cc_orders/orders', { data: { orderDate: today, customerId, lines: [{ productId, quantity: 10 }] } })
      expect(created.status(), await created.text()).toBe(201)
      const id = ((await created.json()) as { id: string }).id
      const order = (await (await request.get(`/api/cc_orders/orders?id=${id}`)).json()) as { stages: Array<{ key: string; status: string; responsibleUserId: string | null; responsibleName: string | null }>; events: Array<{ action: string; note: string | null }> }
      const advance = order.stages.find((stage) => stage.key === 'advance')!
      expect(advance).toEqual(expect.objectContaining({ status: 'open', responsibleUserId: people[0].id }))
      expect(order.events.some((event) => event.action === 'assigned' && event.note?.includes('automatic'))).toBeTruthy()
      await request.post('/api/cc_orders/orders/cancel', { data: { id, reason: 'E2E cleanup' } })
    } finally {
      const now = (await (await request.get('/api/cc_orders/stage-settings')).json()) as { overrides: Array<{ stageKey: string; updatedAt: string }> }
      const row = now.overrides.find((entry) => entry.stageKey === 'advance')
      if (row) await request.delete('/api/cc_orders/stage-settings?stageKey=advance', { headers: { [LOCK]: row.updatedAt } })
    }
  })

  test('cleanup: cancel the order', async ({ request }) => {
    const cancelled = await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'E2E cleanup' } })
    expect(cancelled.ok() || cancelled.status() === 409).toBeTruthy()
  })

  test('the lab pages open', async ({ request }) => {
    for (const path of ['/backend/quality/lab', '/backend/quality/lab/new', `/backend/quality/lab/${labId}`, `/backend/quality/lab/${labId}/edit`, `/backend/quality/lab/new?orderId=${orderId}`]) {
      const page = await request.get(path)
      expect(page.status(), path).toBe(200)
    }
  })
})
