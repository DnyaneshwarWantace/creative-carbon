import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const YEAR = 1990 + (stamp % 7)
const DAY = `${YEAR}-${String(1 + (stamp % 12)).padStart(2, '0')}-${String(1 + (stamp % 27)).padStart(2, '0')}`

type Pi = { id: string; status: string; revision: number; revisions: Array<{ revision: number; reason: string; totals: { total: number } }>; totals: { total: number }; updatedAt: string; error?: string }
type Invoice = { id: string; code: string; status: string; kind: string; transporter: string | null; updatedAt: string; error?: string }
type Bill = { id: string; code: string; total: number; paid: number; debited: number; balance: number; status: string; payments: Array<{ id: string; amount: number; voidedAt?: string | null }>; debitNotes?: Array<{ id: string; code: string; status: string }>; debitNoteId?: string; updatedAt: string; error?: string }
type Settings = { mode: 'direct' | 'bridge'; url: string | null; company: string | null; ledgers: Record<string, string> }

async function freePort(): Promise<string> {
  const probe = http.createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const url = `127.0.0.1:${(probe.address() as AddressInfo).port}`
  await new Promise((resolve) => probe.close(resolve))
  return url
}

async function pi(request: APIRequestContext, id: string): Promise<Pi> {
  return (await request.get(`/api/cc_accounts/proformas?id=${id}`)).json()
}

async function bill(request: APIRequestContext, id: string): Promise<Bill> {
  return (await request.get(`/api/cc_accounts/vendor-bills?id=${id}`)).json()
}

async function activity(request: APIRequestContext, type: string, id: string, kind?: string) {
  return ((await (await request.get(`/api/cc_audit/activity?type=${type}&id=${id}${kind ? `&kind=${kind}` : ''}`)).json()) as { items: Array<{ action: string; reason: string | null; summary: string | null; changes: Array<{ field: string; from: unknown; to: unknown }> }> }).items
}

test.describe.serial('Phase B · proforma revise, invoice corrections, credit and debit notes, Tally locks', () => {
  let before: Settings
  let orderId: string
  let lineId: string
  let piId: string
  let invoiceId: string
  let creditId: string
  let paymentId: string
  let vendorId: string
  let billId: string
  let debitId: string

  test.afterAll(async ({ request }) => {
    if (before) await request.put('/api/cc_accounts/tally/settings', { data: { mode: before.mode, url: before.url, company: before.company, ledgers: before.ledgers } })
  })

  test('fixtures: an order with a proforma', async ({ request }) => {
    before = (await (await request.get('/api/cc_accounts/tally/settings')).json()) as Settings
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E14 Accounts ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const created = await request.post('/api/cc_orders/orders', { data: { orderDate: DAY, customerId, lines: [{ productId, quantity: 20, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    orderId = ((await created.json()) as { id: string }).id
    lineId = ((await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { lines: Array<{ id: string }> }).lines[0].id
    const made = await request.post('/api/cc_accounts/proformas', { data: { orderId, piDate: DAY } })
    expect(made.ok(), await made.text()).toBeTruthy()
    piId = ((await made.json()) as { id: string }).id
    let current = await pi(request, piId)
    const sent = await request.post('/api/cc_accounts/proformas/action', { data: { id: piId, action: 'send', sentTo: 'Mr Shah', channel: 'email' }, headers: { [LOCK]: current.updatedAt } })
    expect(sent.ok(), await sent.text()).toBeTruthy()
    current = await pi(request, piId)
    expect(current.status).toBe('sent')
  })

  test('a sent proforma is revised with a reason; the earlier revision is kept', async ({ request }) => {
    let current = await pi(request, piId)
    expect((await request.post('/api/cc_accounts/proformas/action', { data: { id: piId, action: 'revise' }, headers: { [LOCK]: current.updatedAt } })).status()).toBe(400)
    const refresh = await request.put('/api/cc_accounts/proformas', { data: { id: piId, refreshLines: true }, headers: { [LOCK]: current.updatedAt } })
    expect(refresh.status()).toBe(409)
    const revised = await request.post('/api/cc_accounts/proformas/action', { data: { id: piId, action: 'revise', reason: 'Customer asked for 45% advance', advancePercent: 45 }, headers: { [LOCK]: current.updatedAt } })
    expect(revised.ok(), await revised.text()).toBeTruthy()
    current = (await revised.json()) as Pi
    expect(current).toMatchObject({ revision: 2, status: 'draft' })
    expect(current.revisions).toEqual([expect.objectContaining({ revision: 1, reason: 'Customer asked for 45% advance' })])
    const log = await activity(request, 'proforma', piId)
    expect(log.find((item) => item.action === 'revised')?.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'advancePercent', to: 45 })]))
  })

  test('once an advance is in, the proforma cannot be revised or cancelled; the advance shows on its timeline', async ({ request }) => {
    const paid = await request.post('/api/cc_accounts/payments', { data: { orderId, kind: 'advance', amount: 2000, paidOn: DAY, reference: `E2E14A-${stamp}` } })
    expect(paid.ok(), await paid.text()).toBeTruthy()
    const current = await pi(request, piId)
    expect((await request.post('/api/cc_accounts/proformas/action', { data: { id: piId, action: 'revise', reason: 'try again' }, headers: { [LOCK]: current.updatedAt } })).status()).toBe(409)
    const cancel = await request.post('/api/cc_accounts/proformas/action', { data: { id: piId, action: 'cancel', reason: 'try to cancel' }, headers: { [LOCK]: current.updatedAt } })
    expect(cancel.status()).toBe(409)
    expect(((await cancel.json()) as { error: string }).error).toMatch(/Refund or void/)
    expect((await activity(request, 'proforma', piId, 'stage')).map((item) => item.action)).toContain('advance_received')
  })

  test('an issued invoice: details corrected with a reason; a payment on it blocks cancelling', async ({ request }) => {
    const created = await request.post('/api/cc_accounts/invoices', { data: { orderId, invoiceDate: DAY, lines: [{ orderLineId: lineId, quantity: 20 }] } })
    expect(created.status(), await created.text()).toBe(201)
    invoiceId = ((await created.json()) as Invoice).id
    let doc = (await (await request.get(`/api/cc_accounts/invoices?id=${invoiceId}`)).json()) as Invoice
    const issued = await request.post('/api/cc_accounts/invoices/action', { data: { id: invoiceId, action: 'issue' }, headers: { [LOCK]: doc.updatedAt } })
    expect(issued.ok(), await issued.text()).toBeTruthy()
    doc = (await issued.json()) as Invoice
    const filled = await request.put('/api/cc_accounts/invoices', { data: { id: invoiceId, transporter: 'Gati' }, headers: { [LOCK]: doc.updatedAt } })
    expect(filled.ok(), await filled.text()).toBeTruthy()
    doc = (await filled.json()) as Invoice
    expect((await request.put('/api/cc_accounts/invoices', { data: { id: invoiceId, transporter: 'VRL Logistics' }, headers: { [LOCK]: doc.updatedAt } })).status()).toBe(400)
    const fixed = await request.put('/api/cc_accounts/invoices', { data: { id: invoiceId, transporter: 'VRL Logistics', reason: 'Transporter changed at loading' }, headers: { [LOCK]: doc.updatedAt } })
    expect(fixed.ok(), await fixed.text()).toBeTruthy()
    doc = (await fixed.json()) as Invoice
    expect(doc.transporter).toBe('VRL Logistics')
    const corrected = (await activity(request, 'invoice', invoiceId, 'correction')).find((item) => item.action === 'details_corrected')!
    expect(corrected.changes).toEqual([{ field: 'transporter', label: 'Transporter', from: 'Gati', to: 'VRL Logistics' }])
    const paid = await request.post('/api/cc_accounts/payments', { data: { orderId, kind: 'balance', amount: 1000, paidOn: DAY, reference: `E2E14B-${stamp}`, invoiceId } })
    expect(paid.ok(), await paid.text()).toBeTruthy()
    const list = (await (await request.get(`/api/cc_accounts/payments?orderId=${orderId}`)).json()) as { items: Array<{ id: string; reference: string | null }> }
    paymentId = list.items.find((item) => item.reference === `E2E14B-${stamp}`)!.id
    expect((await activity(request, 'invoice', invoiceId, 'stage')).map((item) => item.action)).toContain('payment_applied')
    const cancel = await request.post('/api/cc_accounts/invoices/action', { data: { id: invoiceId, action: 'cancel', reason: 'Wrong rate' }, headers: { [LOCK]: doc.updatedAt } })
    expect(cancel.status()).toBe(409)
    expect(((await cancel.json()) as { error: string }).error).toMatch(/payment is applied/)
  })

  test('a credit note reduces the invoice, opens on the notes page and can be cancelled with a reason', async ({ request }) => {
    const doc = (await (await request.get(`/api/cc_accounts/invoices?id=${invoiceId}`)).json()) as Invoice
    const credited = await request.post('/api/cc_accounts/invoices/action', { data: { id: invoiceId, action: 'credit_note', reason: '2 sheets chipped', lines: [{ orderLineId: lineId, quantity: 2 }] }, headers: { [LOCK]: doc.updatedAt } })
    expect(credited.ok(), await credited.text()).toBeTruthy()
    creditId = ((await credited.json()) as Invoice).id
    expect(((await (await request.get(`/api/cc_accounts/notes?id=${creditId}`)).json()) as { kind: string }).kind).toBe('credit')
    expect((await activity(request, 'invoice', invoiceId, 'correction')).find((item) => item.action === 'credit_note')?.reason).toBe('2 sheets chipped')
    expect((await request.get(`/backend/accounts/notes/${creditId}`)).status()).toBe(200)
    const note = (await (await request.get(`/api/cc_accounts/invoices?id=${creditId}`)).json()) as Invoice
    expect(note).toMatchObject({ kind: 'credit_note', status: 'issued' })
    const cancelled = await request.post('/api/cc_accounts/invoices/action', { data: { id: creditId, action: 'cancel', reason: 'Customer kept the sheets' }, headers: { [LOCK]: note.updatedAt } })
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy()
  })

  test('vendor bill: a payment voided with a reason, a debit note that reduces the balance, then cancelled', async ({ request }) => {
    const vendor = await request.post('/api/cc_vendors/vendors', { data: { name: `E2E14 Supplier ${stamp}`, contactPhone: '9822055555', organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(vendor.status(), await vendor.text()).toBe(201)
    vendorId = ((await vendor.json()) as { id: string }).id
    const made = await request.post('/api/cc_accounts/vendor-bills', { data: { vendorId, billNo: `B-${stamp}`, billDate: DAY, taxable: 10000, gst: 1800 } })
    expect(made.ok(), await made.text()).toBeTruthy()
    billId = ((await made.json()) as Bill).id
    let current = await bill(request, billId)
    const paid = await request.post('/api/cc_accounts/vendor-bills/action', { data: { id: billId, action: 'pay', amount: 5000, paidOn: DAY, reference: `UTR${stamp}` }, headers: { [LOCK]: current.updatedAt } })
    expect(paid.ok(), await paid.text()).toBeTruthy()
    current = await bill(request, billId)
    expect(current.balance).toBe(6800)
    const paymentRow = current.payments[0]
    expect((await request.post('/api/cc_accounts/vendor-bills/action', { data: { id: billId, action: 'void_payment', paymentId: paymentRow.id }, headers: { [LOCK]: current.updatedAt } })).status()).toBe(400)
    const voided = await request.post('/api/cc_accounts/vendor-bills/action', { data: { id: billId, action: 'void_payment', paymentId: paymentRow.id, note: 'Cheque bounced' }, headers: { [LOCK]: current.updatedAt } })
    expect(voided.ok(), await voided.text()).toBeTruthy()
    current = (await voided.json()) as Bill
    expect(current).toMatchObject({ paid: 0, balance: 11800, status: 'open' })
    const debited = await request.post('/api/cc_accounts/vendor-bills/action', { data: { id: billId, action: 'debit_note', taxable: 1000, gst: 180, noteDate: DAY, note: '50 kg short supplied' }, headers: { [LOCK]: current.updatedAt } })
    expect(debited.ok(), await debited.text()).toBeTruthy()
    current = (await debited.json()) as Bill
    expect(current).toMatchObject({ debited: 1180, balance: 10620 })
    debitId = current.debitNoteId!
    const lookup = (await (await request.get(`/api/cc_accounts/notes?id=${debitId}`)).json()) as { kind: string; note: { code: string; total: number } }
    expect(lookup).toMatchObject({ kind: 'debit', note: { total: 1180 } })
    expect(lookup.note.code).toMatch(/DN/)
    const corrections = await activity(request, 'vendor_bill', billId, 'correction')
    expect(corrections.map((item) => item.action).sort()).toEqual(['debit_note', 'payment_voided'])
  })

  test('once in Tally (marked as entered by hand), payments and notes can no longer be voided or cancelled', async ({ request }) => {
    expect((await request.put('/api/cc_accounts/tally/settings', { data: { mode: 'direct', url: await freePort() } })).ok()).toBeTruthy()
    const pushed = await request.post('/api/cc_accounts/tally/pushes', { data: { from: DAY, to: DAY, kinds: ['receipts', 'purchases'], masters: false } })
    expect(pushed.status(), await pushed.text()).toBe(201)
    const push = (await pushed.json()) as { id: string; status: string; documents: Array<{ type: string; recordId: string | null }> }
    expect(push.status).toBe('failed')
    expect(push.documents.map((doc) => doc.type).sort()).toEqual(['Debit Note', 'Purchase', 'Receipt', 'Receipt'])
    expect((await request.post('/api/cc_accounts/tally/pushes/manual', { data: { id: push.id } })).status()).toBe(400)
    const manual = await request.post('/api/cc_accounts/tally/pushes/manual', { data: { id: push.id, reason: 'Accountant typed them in Tally' } })
    expect(manual.ok(), await manual.text()).toBeTruthy()
    expect(((await manual.json()) as { status: string }).status).toBe('manual')
    expect((await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: push.id } })).status()).toBe(409)
    const payment = (await (await request.get(`/api/cc_accounts/payments?orderId=${orderId}`)).json()) as { items: Array<{ id: string; updatedAt: string }> }
    const row = payment.items.find((item) => item.id === paymentId)!
    const voidPayment = await request.post('/api/cc_accounts/payments/void', { data: { id: paymentId, reason: 'try to void' }, headers: { [LOCK]: row.updatedAt } })
    expect(voidPayment.status()).toBe(409)
    expect(((await voidPayment.json()) as { error: string }).error).toMatch(/Tally/)
    const note = (await (await request.get(`/api/cc_accounts/notes?id=${debitId}`)).json()) as { note: { updatedAt: string } }
    const cancelNote = await request.post('/api/cc_accounts/notes', { data: { id: debitId, action: 'cancel', reason: 'try to cancel' }, headers: { [LOCK]: note.note.updatedAt } })
    expect(cancelNote.status()).toBe(409)
    expect((await activity(request, 'vendor_bill', billId)).map((item) => item.action)).toContain('tally_manual')
    expect((await activity(request, 'tally_push', push.id, 'correction')).find((item) => item.action === 'marked_manual')?.reason).toBe('Accountant typed them in Tally')
  })

  test('cleanup', async ({ request }) => {
    const current = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { updatedAt: string }
    await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'e2e cleanup' }, headers: { [LOCK]: current.updatedAt } })
    expect((await request.delete(`/api/cc_vendors/vendors?id=${vendorId}`)).status()).toBeLessThan(500)
  })
})
