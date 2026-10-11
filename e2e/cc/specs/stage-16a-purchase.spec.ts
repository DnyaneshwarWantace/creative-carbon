import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Po = { id: string; status: string; revision: number; revisions: Array<{ revision: number }>; shortClosedAt: string | null; updatedAt: string; lines: Array<{ id: string; productId: string; quantity: number; receivedQty: number }>; error?: string }
type Grn = { id: string; status: string; updatedAt: string; lines: Array<{ id: string; lotId: string | null; lotNumber: string; quantity: number; qcStatus: string }>; error?: string }
type Item = { action: string; reason: string | null; changes: Array<{ field: string; label: string; from: unknown; to: unknown }> }

async function po(request: APIRequestContext, id: string): Promise<Po> {
  return (await request.get(`/api/cc_purchase/orders?id=${id}`)).json()
}

async function grn(request: APIRequestContext, id: string): Promise<Grn> {
  return (await request.get(`/api/cc_purchase/grns?id=${id}`)).json()
}

async function poAct(request: APIRequestContext, path: string, id: string, body: Record<string, unknown> = {}) {
  return request.post(`/api/cc_purchase/orders/${path}`, { data: { id, ...body }, headers: { [LOCK]: (await po(request, id)).updatedAt } })
}

async function grnFix(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  return request.post('/api/cc_purchase/grns/correct', { data: { id, ...body }, headers: { [LOCK]: (await grn(request, id)).updatedAt } })
}

async function activity(request: APIRequestContext, type: string, id: string): Promise<Item[]> {
  return ((await (await request.get(`/api/cc_audit/activity?type=${type}&id=${id}`)).json()) as { items: Item[] }).items
}

async function vendorVersion(request: APIRequestContext, id: string): Promise<string> {
  return ((await (await request.get(`/api/cc_vendors/vendors?id=${id}`)).json()) as { items: Array<{ updated_at: string }> }).items[0].updated_at
}

test.describe.serial('Phase D · vendor, indent, PO amend / short-close, GRN corrections', () => {
  let vendorId: string
  let productId: string
  let indentId: string
  let poId: string
  let grnId: string
  let secondGrnId: string
  let lotId: string

  test('fixtures: a vendor and an indent; indent quantities change with a reason until approved', async ({ request }) => {
    const vendor = await request.post('/api/cc_vendors/vendors', { data: { name: `E2E16 Supplier ${stamp}`, contactPhone: '9822077777', organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(vendor.status(), await vendor.text()).toBe(201)
    vendorId = ((await vendor.json()) as { id: string }).id
    const items = ((await (await request.get('/api/cc_products/search?kinds=chemical&q=Methanol')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = items.find((item) => item.title === 'Methanol')!.id
    const indent = await request.post('/api/cc_purchase/indents', { data: { source: 'department', department: 'Resin plant', lines: [{ productId, quantity: 100 }] } })
    expect(indent.status(), await indent.text()).toBe(201)
    indentId = ((await indent.json()) as { id: string }).id
    const current = async () => ((await (await request.get(`/api/cc_purchase/indents?id=${indentId}`)).json()) as { updatedAt: string })
    expect((await request.post('/api/cc_purchase/indents/action', { data: { id: indentId, action: 'edit', lines: [{ productId, quantity: 120 }] }, headers: { [LOCK]: (await current()).updatedAt } })).status()).toBe(400)
    const edited = await request.post('/api/cc_purchase/indents/action', { data: { id: indentId, action: 'edit', lines: [{ productId, quantity: 120 }], note: 'Two batches next week' }, headers: { [LOCK]: (await current()).updatedAt } })
    expect(edited.ok(), await edited.text()).toBeTruthy()
    expect((await activity(request, 'indent', indentId)).find((item) => item.action === 'edited')?.changes).toEqual([{ field: `line:${productId}`, label: 'Methanol qty', from: 100, to: 120 }])
    expect((await request.post('/api/cc_purchase/indents/action', { data: { id: indentId, action: 'approve' }, headers: { [LOCK]: (await current()).updatedAt } })).ok()).toBeTruthy()
    const late = await request.post('/api/cc_purchase/indents/action', { data: { id: indentId, action: 'edit', lines: [{ productId, quantity: 150 }], note: 'More needed' }, headers: { [LOCK]: (await current()).updatedAt } })
    expect(late.status()).toBe(409)
  })

  test('an approved PO is amended into revision 2 with the old one kept; the vendor cannot go inactive meanwhile', async ({ request }) => {
    const created = await request.post('/api/cc_purchase/orders', { data: { vendorId, poDate: today, submit: true, lines: [{ productId, quantity: 120, rate: 40, gstPercent: 18 }], indentIds: [indentId] } })
    expect(created.status(), await created.text()).toBe(201)
    poId = ((await created.json()) as { id: string }).id
    expect((await poAct(request, 'approve', poId)).ok()).toBeTruthy()
    const off = await request.put('/api/cc_vendors/vendors', { data: { id: vendorId, isActive: false, reason: 'Stopped supplying' }, headers: { [LOCK]: await vendorVersion(request, vendorId) } })
    expect(off.status()).toBe(409)
    expect((await poAct(request, 'amend', poId)).status()).toBe(400)
    const amended = await poAct(request, 'amend', poId, { note: 'Vendor gave a better rate' })
    expect(amended.ok(), await amended.text()).toBeTruthy()
    let current = await po(request, poId)
    expect(current).toMatchObject({ revision: 2, status: 'draft' })
    expect(current.revisions.map((rev) => rev.revision)).toEqual([1])
    const saved = await request.put('/api/cc_purchase/orders', { data: { id: poId, vendorId, poDate: today, lines: [{ productId, quantity: 120, rate: 38, gstPercent: 18 }], submit: true }, headers: { [LOCK]: current.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    expect((await activity(request, 'po', poId)).find((item) => item.action === 'edited')?.changes).toEqual([expect.objectContaining({ label: 'Methanol rate', from: 40, to: 38 })])
    expect((await poAct(request, 'approve', poId)).ok()).toBeTruthy()
    current = await po(request, poId)
    expect(current.status).toBe('approved')
  })

  test('a GRN quantity is corrected with a counter-entry; QC can be undone within 24 hours', async ({ request }) => {
    const line = (await po(request, poId)).lines[0]
    const received = await request.post('/api/cc_purchase/grns', { data: { poId, grnDate: today, invoiceNo: `E2E16-${stamp}`, lines: [{ poLineId: line.id, quantity: 100, lotNumber: `E2E16A-${stamp}` }] } })
    expect(received.status(), await received.text()).toBe(201)
    grnId = ((await received.json()) as { id: string }).id
    let current = await grn(request, grnId)
    lotId = current.lines[0].lotId!
    expect((await grnFix(request, grnId, { action: 'quantity', lineId: current.lines[0].id, quantity: 90 })).status()).toBe(400)
    const fixed = await grnFix(request, grnId, { action: 'quantity', lineId: current.lines[0].id, quantity: 90, reason: 'Weighbridge slip shows 90 kg' })
    expect(fixed.ok(), await fixed.text()).toBeTruthy()
    expect((await po(request, poId)).lines[0].received).toBe(90)
    expect((await activity(request, 'grn', grnId)).find((item) => item.action === 'qty_corrected')?.changes).toEqual([expect.objectContaining({ from: 100, to: 90 })])
    current = await grn(request, grnId)
    expect((await request.post('/api/cc_purchase/grns/decide', { data: { id: grnId, lineId: current.lines[0].id, decision: 'passed' }, headers: { [LOCK]: current.updatedAt } })).ok()).toBeTruthy()
    const undone = await grnFix(request, grnId, { action: 'undo_qc', lineId: current.lines[0].id, reason: 'COA was for another batch' })
    expect(undone.ok(), await undone.text()).toBeTruthy()
    expect(((await undone.json()) as Grn).lines[0].qcStatus).toBe('pending')
    current = await grn(request, grnId)
    expect((await request.post('/api/cc_purchase/grns/decide', { data: { id: grnId, lineId: current.lines[0].id, decision: 'passed' }, headers: { [LOCK]: current.updatedAt } })).ok()).toBeTruthy()
  })

  test('once the lot is used, the quantity cannot be corrected and the GRN cannot be cancelled', async ({ request }) => {
    const out = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'out', quantity: 5, lotId, reason: 'Physical count difference', note: 'e2e: use the lot' } })
    expect(out.ok(), await out.text()).toBeTruthy()
    const current = await grn(request, grnId)
    const blocked = await grnFix(request, grnId, { action: 'quantity', lineId: current.lines[0].id, quantity: 95, reason: 'Recount' })
    expect(blocked.status()).toBe(409)
    expect(((await blocked.json()) as { error: string }).error).toMatch(/already used/)
    expect((await grnFix(request, grnId, { action: 'cancel', reason: 'Wrong vendor' })).status()).toBe(409)
  })

  test('a GRN cancelled before use takes its lot back out with a linked counter-entry', async ({ request }) => {
    const line = (await po(request, poId)).lines[0]
    const received = await request.post('/api/cc_purchase/grns', { data: { poId, grnDate: today, lines: [{ poLineId: line.id, quantity: 10, lotNumber: `E2E16B-${stamp}` }] } })
    expect(received.status(), await received.text()).toBe(201)
    secondGrnId = ((await received.json()) as { id: string }).id
    const second = await grn(request, secondGrnId)
    const cancelled = await grnFix(request, secondGrnId, { action: 'cancel', reason: 'Entered twice by mistake' })
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
    expect(((await cancelled.json()) as Grn).status).toBe('cancelled')
    expect((await po(request, poId)).lines[0].received).toBe(90)
    const ledger = (await (await request.get(`/api/cc_store/stock/ledger?lotId=${second.lines[0].lotId}&pageSize=50`)).json()) as { items: Array<{ id: string; quantity: number; reverses: string | null; reversedBy: string | null }> }
    const counter = ledger.items.find((row) => row.reverses)!
    expect(counter.quantity).toBe(-10)
    expect(ledger.items.find((row) => row.id === counter.reverses)?.reversedBy).toBe(counter.id)
  })

  test('short-close drops the pending quantity; then the vendor can be set inactive with a reason', async ({ request }) => {
    expect((await poAct(request, 'short-close', poId)).status()).toBe(400)
    const closed = await poAct(request, 'short-close', poId, { note: 'Vendor cannot send the rest this month' })
    expect(closed.ok(), await closed.text()).toBeTruthy()
    const current = (await closed.json()) as Po
    expect(current.status).toBe('received')
    expect(current.shortClosedAt).not.toBeNull()
    expect(current.lines[0].quantity).toBe(90)
    expect((await request.put('/api/cc_vendors/vendors', { data: { id: vendorId, isActive: false }, headers: { [LOCK]: await vendorVersion(request, vendorId) } })).status()).toBe(400)
    const off = await request.put('/api/cc_vendors/vendors', { data: { id: vendorId, isActive: false, reason: 'Stopped supplying' }, headers: { [LOCK]: await vendorVersion(request, vendorId) } })
    expect(off.ok(), await off.text()).toBeTruthy()
    expect((await activity(request, 'vendor', vendorId)).find((item) => item.action === 'deactivated')?.reason).toBe('Stopped supplying')
    const refused = await request.post('/api/cc_purchase/orders', { data: { vendorId, poDate: today, lines: [{ productId, quantity: 1, rate: 40, gstPercent: 18 }] } })
    expect(refused.status()).toBe(409)
  })

  test('cleanup: the test stock goes out', async ({ request }) => {
    const out = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId, direction: 'out', quantity: 85, lotId, reason: 'Physical count difference', note: 'e2e phase D cleanup' } })
    expect(out.ok(), await out.text()).toBeTruthy()
  })
})
