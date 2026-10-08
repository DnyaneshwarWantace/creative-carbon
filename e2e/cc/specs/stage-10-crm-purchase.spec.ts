import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const shift = (days: number) => new Date(Date.now() + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10)
const stamp = Date.now()
const grade = `E2E${stamp}`

type Enquiry = { id: string; enquiryNo: string; stage: string; overdue: boolean; customerId: string | null; partyName: string | null; nextActionOn: string | null; lostReason: string | null; orderId: string | null; updatedAt: string; history: Array<{ action: string; note: string | null }>; quotations?: Array<{ id: string; quoteNo: string; status: string; orderNo: string | null }>; error?: string }
type Quotation = { id: string; quoteNo: string; status: string; validUntil: string | null; currency: string; market: string; incoterm: string | null; enquiryId: string | null; convertedOrderId: string | null; convertedOrderNo: string | null; updatedAt: string; totals: { taxable: number; total: number }; lines: Array<{ productId: string; quantity: number; rate: number | null; specs: Record<string, Record<string, string>> }>; error?: string }
type Suggestion = { productId: string; title: string; reorderPoint: number; onHand: number; onOrder: number; onIndent: number; below: boolean; stockBelow: boolean; suggested: number }

async function enquiry(request: APIRequestContext, id: string): Promise<Enquiry> {
  return (await request.get(`/api/cc_crm/enquiries?id=${id}`)).json()
}

async function quotation(request: APIRequestContext, id: string): Promise<Quotation> {
  return (await request.get(`/api/cc_crm/quotations?id=${id}`)).json()
}

async function enquiryAct(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  const current = await enquiry(request, id)
  return request.post('/api/cc_crm/enquiries/action', { data: { id, ...body }, headers: { [LOCK]: current.updatedAt } })
}

async function quoteAct(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  const current = await quotation(request, id)
  return request.post('/api/cc_crm/quotations/action', { data: { id, ...body }, headers: { [LOCK]: current.updatedAt } })
}

test.describe.serial('Stage 10 · enquiries, quotations, purchase', () => {
  let customerId: string
  let productId: string
  let enquiryId: string
  let quoteId: string
  const rateIds: string[] = []

  test('fixtures: a customer, a finished item and price-list rates for a test grade', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E10 Insulators ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(customer.ok(), await customer.text()).toBeTruthy()
    customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    for (const [sizeClass, rate] of [
      ['small', '312.50'],
      ['big', '298.00'],
    ]) {
      const created = await request.post('/api/cc_production/masters', { data: { type: 'prices', values: { sizeClass, grade, thicknessFrom: '10', thicknessTo: '20', ratePerKg: rate, currency: 'INR' } } })
      expect(created.ok(), await created.text()).toBeTruthy()
      rateIds.push(((await created.json()) as { id: string }).id)
    }
  })

  test('the dropdown master has enquiry sources and lost reasons; QT and ENQ series exist', async ({ request }) => {
    const lists = ((await (await request.get('/api/cc_lists/lists')).json()) as { items: Array<{ key: string; options: Array<{ value: string }> }> }).items
    expect(lists.find((list) => list.key === 'enquiry_sources')?.options.map((option) => option.value)).toEqual(expect.arrayContaining(['IndiaMART', 'WhatsApp', 'Email', 'Phone', 'Walk-in', 'Referral']))
    expect(lists.find((list) => list.key === 'lost_reasons')?.options.length).toBeGreaterThan(0)
    const series = await (await request.get('/api/cc_accounts/number-series')).text()
    expect(series).toContain('CCCPL/QT/')
    expect(series).toContain('CCCPL/ENQ/')
  })

  test('an IndiaMART enquiry from a new party is logged with a follow-up, then needs a party', async ({ request }) => {
    const missing = await request.post('/api/cc_crm/enquiries', { data: { source: 'IndiaMART', receivedAt: new Date().toISOString(), subject: 'Sheets' } })
    expect(missing.status()).toBe(400)
    const created = await request.post('/api/cc_crm/enquiries', {
      data: { source: 'IndiaMART', receivedAt: new Date().toISOString(), companyName: `Prospect ${stamp}`, contactName: 'Mr Shah', phone: '+91 98250 00000', subject: `${grade} 12 mm sheets, 500 kg`, nextActionOn: shift(-2), nextActionNote: 'Send rates' },
    })
    expect(created.status(), await created.text()).toBe(201)
    const logged = (await created.json()) as Enquiry
    enquiryId = logged.id
    expect(logged.enquiryNo).toMatch(/^CCCPL\/ENQ\/\d{4}\/\d{4}$/)
    expect(logged.stage).toBe('new')
    expect(logged.overdue).toBe(true)
    expect(logged.partyName).toBe(`Prospect ${stamp}`)
  })

  test('the overdue follow-up shows in the overdue list and on the owner overview', async ({ request }) => {
    const overdue = (await (await request.get('/api/cc_crm/enquiries?stage=overdue')).json()) as { items: Enquiry[]; overdue: number }
    expect(overdue.items.map((item) => item.id)).toContain(enquiryId)
    expect(overdue.overdue).toBeGreaterThan(0)
    const owner = (await (await request.get(`/api/cc_production/owner?date=${today}`)).json()) as { followUps: Array<{ id: string }> }
    expect(owner.followUps.map((item) => item.id)).toContain(enquiryId)
  })

  test('a follow-up date clears the overdue flag; a note is kept in the history', async ({ request }) => {
    const set = await enquiryAct(request, enquiryId, { action: 'follow_up', nextActionOn: shift(1), nextActionNote: 'Call after rates' })
    expect(set.ok(), await set.text()).toBeTruthy()
    const noted = await enquiryAct(request, enquiryId, { action: 'note', note: 'Wants test certificate IS 2036' })
    expect(noted.ok(), await noted.text()).toBeTruthy()
    const after = await enquiry(request, enquiryId)
    expect(after.overdue).toBe(false)
    expect(after.history.map((item) => item.action)).toEqual(expect.arrayContaining(['created', 'follow_up', 'note']))
  })

  test('the price list suggests a rate for the grade and thickness', async ({ request }) => {
    const rates = ((await (await request.get(`/api/cc_crm/rates?grade=${grade}&thickness=12&currency=INR`)).json()) as { items: Array<{ sizeClass: string; ratePerKg: number }> }).items
    expect(rates.map((rate) => [rate.sizeClass, rate.ratePerKg]).sort()).toEqual([
      ['big', 298],
      ['small', 312.5],
    ])
    const outside = ((await (await request.get(`/api/cc_crm/rates?grade=${grade}&thickness=25`)).json()) as { items: unknown[] }).items
    expect(outside).toHaveLength(0)
  })

  test('a quotation is made from the enquiry with order-style lines; the enquiry becomes quoted and gets the customer', async ({ request }) => {
    const created = await request.post('/api/cc_crm/quotations', {
      data: {
        orderDate: today,
        validUntil: shift(30),
        enquiryId,
        customerId,
        market: 'export',
        incoterm: 'CIF',
        portOfLoading: 'Mundra',
        country: 'Kenya',
        currency: 'USD',
        paymentRemarks: '30% advance',
        lines: [{ productId, quantity: 500, rate: 3.75, gstPercent: 0, specs: { material: { form: 'Sheet', grade, weave: '10x10', sheet_size: '8x4', thickness_mm: '12' }, packing: { test_standard: 'IS 2036' } } }],
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    const made = (await created.json()) as { id: string; quoteNo: string }
    quoteId = made.id
    expect(made.quoteNo).toMatch(/^CCCPL\/QT\/\d{4}\/\d{4}$/)
    const quote = await quotation(request, quoteId)
    expect(quote).toEqual(expect.objectContaining({ status: 'draft', currency: 'USD', market: 'export', incoterm: 'CIF', validUntil: shift(30), enquiryId }))
    expect(quote.totals.taxable).toBe(1875)
    expect(quote.lines[0].specs.material.grade).toBe(grade)
    const linked = await enquiry(request, enquiryId)
    expect(linked.stage).toBe('quoted')
    expect(linked.customerId).toBe(customerId)
    expect(linked.quotations?.map((item) => item.id)).toContain(quoteId)
  })

  test('the quotation can be edited until converted; a stale save is refused', async ({ request }) => {
    const before = await quotation(request, quoteId)
    const body = { id: quoteId, orderDate: today, validUntil: shift(15), enquiryId, customerId, market: 'export', incoterm: 'CIF', portOfLoading: 'Mundra', country: 'Kenya', currency: 'USD', lines: [{ productId, quantity: 600, rate: 3.7, gstPercent: 0, specs: { material: { grade, thickness_mm: '12' } } }] }
    const saved = await request.put('/api/cc_crm/quotations', { data: body, headers: { [LOCK]: before.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const stale = await request.put('/api/cc_crm/quotations', { data: body, headers: { [LOCK]: before.updatedAt } })
    expect(stale.status()).toBe(409)
    const after = await quotation(request, quoteId)
    expect(after.lines[0].quantity).toBe(600)
    expect(after.totals.taxable).toBe(2220)
    const bad = await request.put('/api/cc_crm/quotations', { data: { ...body, validUntil: shift(-5) }, headers: { [LOCK]: after.updatedAt } })
    expect(bad.status()).toBe(400)
  })

  test('marking it sent moves the enquiry to negotiating; it appears in the open list', async ({ request }) => {
    const sent = await quoteAct(request, quoteId, { action: 'sent' })
    expect(sent.ok(), await sent.text()).toBeTruthy()
    expect((await quotation(request, quoteId)).status).toBe('sent')
    expect((await enquiry(request, enquiryId)).stage).toBe('negotiating')
    const open = ((await (await request.get('/api/cc_crm/quotations?status=open')).json()) as { items: Array<{ id: string; customerName: string; enquiryNo: string | null }> }).items
    const row = open.find((item) => item.id === quoteId)
    expect(row?.customerName).toBe(`E2E10 Insulators ${stamp}`)
    expect(row?.enquiryNo).toBeTruthy()
  })

  test('convert to order carries lines, specs and export terms; the enquiry is won', async ({ request }) => {
    const converted = await quoteAct(request, quoteId, { action: 'convert', orderDate: today, customerPoRef: `PO-${stamp}` })
    expect(converted.ok(), await converted.text()).toBeTruthy()
    const result = (await converted.json()) as { order: { id: string; orderNo: string } }
    expect(result.order.orderNo).toMatch(/^CCCPL\/SO\//)
    const order = (await (await request.get(`/api/cc_orders/orders?id=${result.order.id}`)).json()) as { customerId: string; customerPoRef: string; market: string; incoterm: string; currency: string; portOfLoading: string; lines: Array<{ productId: string; quantity: number; rate: number; specs: Record<string, Record<string, string>> }>; events: Array<{ note: string | null }> }
    expect(order).toEqual(expect.objectContaining({ customerId, customerPoRef: `PO-${stamp}`, market: 'export', incoterm: 'CIF', currency: 'USD', portOfLoading: 'Mundra' }))
    expect(order.lines[0]).toEqual(expect.objectContaining({ productId, quantity: 600, rate: 3.7 }))
    expect(order.lines[0].specs.material.grade).toBe(grade)
    expect(order.events.some((event) => event.note?.includes('From quotation'))).toBeTruthy()
    const quote = await quotation(request, quoteId)
    expect(quote).toEqual(expect.objectContaining({ status: 'converted', convertedOrderId: result.order.id, convertedOrderNo: result.order.orderNo }))
    const won = await enquiry(request, enquiryId)
    expect(won).toEqual(expect.objectContaining({ stage: 'won', orderId: result.order.id, nextActionOn: null }))
    const again = await quoteAct(request, quoteId, { action: 'convert' })
    expect(again.status()).toBe(409)
    const edit = await request.put('/api/cc_crm/quotations', { data: { id: quoteId, orderDate: today, customerId, lines: [{ productId, quantity: 1 }] }, headers: { [LOCK]: quote.updatedAt } })
    expect(edit.status()).toBe(409)
    const cancelled = await request.post('/api/cc_orders/orders/cancel', { data: { id: result.order.id, reason: 'E2E cleanup' } })
    expect(cancelled.ok() || cancelled.status() === 409, await cancelled.text()).toBeTruthy()
  })

  test('a lost enquiry needs a reason and leaves the open list', async ({ request }) => {
    const created = await request.post('/api/cc_crm/enquiries', { data: { source: 'WhatsApp', receivedAt: new Date().toISOString(), customerId, subject: 'Tubes 40 mm' } })
    expect(created.status(), await created.text()).toBe(201)
    const id = ((await created.json()) as Enquiry).id
    const noReason = await enquiryAct(request, id, { action: 'stage', stage: 'lost' })
    expect(noReason.status()).toBe(400)
    const lost = await enquiryAct(request, id, { action: 'stage', stage: 'lost', lostReason: 'Price too high' })
    expect(lost.ok(), await lost.text()).toBeTruthy()
    expect((await enquiry(request, id)).lostReason).toBe('Price too high')
    const open = ((await (await request.get('/api/cc_crm/enquiries?stage=open')).json()) as { items: Enquiry[] }).items
    expect(open.map((item) => item.id)).not.toContain(id)
    const lostList = ((await (await request.get('/api/cc_crm/enquiries?stage=lost')).json()) as { items: Enquiry[] }).items
    expect(lostList.map((item) => item.id)).toContain(id)
  })

  test('reorder level: an item below it is suggested, an indent from it counts as on order, owner sees it', async ({ request }) => {
    const items = ((await (await request.get('/api/cc_products/search?kinds=chemical&q=DBP')).json()) as { items: Array<{ id: string; title: string }> }).items
    const dbp = items.find((item) => item.title === 'DBP')!
    const profiles = ((await (await request.get(`/api/wms/inventory-profiles?catalogProductId=${dbp.id}&pageSize=1`)).json()) as { items: Array<Record<string, unknown>> }).items
    expect(profiles.length).toBe(1)
    const profile = profiles[0]
    const original = Number(profile.reorder_point ?? profile.reorderPoint ?? 0)
    const updatedAt = String(profile.updated_at ?? profile.updatedAt)
    const level = 9_000_000
    const set = await request.put('/api/wms/inventory-profiles', { data: { id: profile.id, reorderPoint: level, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT }, headers: { [LOCK]: updatedAt } })
    expect(set.ok(), await set.text()).toBeTruthy()
    let indentId: string | null = null
    try {
      const listed = ((await (await request.get('/api/cc_purchase/reorder')).json()) as { items: Suggestion[]; below: number }).items
      const row = listed.find((item) => item.productId === dbp.id)!
      expect(row).toEqual(expect.objectContaining({ reorderPoint: level, below: true, stockBelow: true }))
      expect(row.suggested).toBe(Math.ceil(level - (row.onHand + row.onOrder + row.onIndent)))
      const indent = await request.post('/api/cc_purchase/indents', { data: { source: 'low_stock', department: 'Store', lines: [{ productId: dbp.id, quantity: row.suggested }] } })
      expect(indent.status(), await indent.text()).toBe(201)
      indentId = ((await indent.json()) as { id: string }).id
      const after = ((await (await request.get('/api/cc_purchase/reorder')).json()) as { items: Suggestion[] }).items.find((item) => item.productId === dbp.id)!
      expect(after.onIndent).toBeGreaterThanOrEqual(row.suggested)
      expect(after.below).toBe(false)
      expect(after.suggested).toBe(0)
      const owner = (await (await request.get(`/api/cc_production/owner?date=${today}`)).json()) as { breakdowns: { belowReorder: Array<{ productId: string }> } }
      expect(owner.breakdowns.belowReorder.map((item) => item.productId)).toContain(dbp.id)
    } finally {
      if (indentId) await request.post('/api/cc_purchase/indents/action', { data: { id: indentId, action: 'cancel', note: 'E2E cleanup' } })
      const current = ((await (await request.get(`/api/wms/inventory-profiles?catalogProductId=${dbp.id}&pageSize=1`)).json()) as { items: Array<Record<string, unknown>> }).items[0]
      await request.put('/api/wms/inventory-profiles', { data: { id: current.id, reorderPoint: original, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT }, headers: { [LOCK]: String(current.updated_at ?? current.updatedAt) } })
    }
  })

  test('a GRN without PO records the vehicle / container number and it is searchable', async ({ request }) => {
    const vendor = await request.post('/api/cc_vendors/vendors', { data: { name: `E2E10 Chemicals ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(vendor.ok(), await vendor.text()).toBeTruthy()
    const vendorId = ((await vendor.json()) as { id: string }).id
    const items = ((await (await request.get('/api/cc_products/search?kinds=chemical&q=Methanol')).json()) as { items: Array<{ id: string; title: string }> }).items
    const methanol = items.find((item) => item.title === 'Methanol')!
    const container = `MSKU${String(stamp).slice(-7)}`
    const grn = await request.post('/api/cc_purchase/grns', {
      data: { vendorId, grnDate: today, invoiceNo: `E2E10-${stamp}`, vehicleNo: container, reason: 'E2E container load', lines: [{ productId: methanol.id, quantity: 1.5, rate: 0, lotNumber: `E2E10-${stamp}` }] },
    })
    expect(grn.status(), await grn.text()).toBe(201)
    const id = ((await grn.json()) as { id: string }).id
    const detail = (await (await request.get(`/api/cc_purchase/grns?id=${id}`)).json()) as { vehicleNo: string | null }
    expect(detail.vehicleNo).toBe(container)
    const found = ((await (await request.get(`/api/cc_purchase/grns?view=all&search=${container}`)).json()) as { items: Array<{ id: string; vehicleNo: string | null }> }).items
    expect(found.map((item) => item.id)).toContain(id)
  })

  test('cleanup: remove the test price-list rates', async ({ request }) => {
    const rows = ((await (await request.get('/api/cc_production/masters?type=prices')).json()) as { items: Array<{ id: string; updatedAt: string }> }).items
    for (const id of rateIds) {
      const row = rows.find((entry) => entry.id === id)
      if (row) await request.delete(`/api/cc_production/masters?type=prices&id=${id}`, { headers: { [LOCK]: row.updatedAt } })
    }
  })
})
