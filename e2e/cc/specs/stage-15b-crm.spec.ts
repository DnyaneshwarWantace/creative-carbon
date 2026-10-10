import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const shift = (days: number) => new Date(Date.now() + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10)

type Enquiry = { id: string; stage: string; ownerName: string | null; nextActionOn: string | null; orderId: string | null; updatedAt: string; followUps?: Array<{ id: string; dueOn: string; status: string; ownerName: string | null }> }
type FollowUp = { id: string; status: string; dueOn: string; outcome: string | null; ownerName: string | null; canUndo: boolean; updatedAt: string; nextId?: string | null; error?: string }
type Quote = { id: string; status: string; revision: number; revisions: Array<{ revision: number; status: string; reason: string }>; convertedOrderId: string | null; updatedAt: string; lines: Array<{ productId: string; quantity: number; rate: number | null }>; error?: string }
type Item = { action: string; kind: string; reason: string | null; summary: string | null; changes: Array<{ field: string; label: string; from: unknown; to: unknown }> }

async function enquiry(request: APIRequestContext, id: string): Promise<Enquiry> {
  return (await request.get(`/api/cc_crm/enquiries?id=${id}`)).json()
}

async function enquiryAct(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  return request.post('/api/cc_crm/enquiries/action', { data: { id, ...body }, headers: { [LOCK]: (await enquiry(request, id)).updatedAt } })
}

async function followUp(request: APIRequestContext, id: string): Promise<FollowUp> {
  return (await request.get(`/api/cc_crm/follow-ups?id=${id}`)).json()
}

async function followAct(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  return request.post('/api/cc_crm/follow-ups/action', { data: { id, ...body }, headers: { [LOCK]: (await followUp(request, id)).updatedAt } })
}

async function quote(request: APIRequestContext, id: string): Promise<Quote> {
  return (await request.get(`/api/cc_crm/quotations?id=${id}`)).json()
}

async function quoteAct(request: APIRequestContext, id: string, body: Record<string, unknown>) {
  return request.post('/api/cc_crm/quotations/action', { data: { id, ...body }, headers: { [LOCK]: (await quote(request, id)).updatedAt } })
}

async function activity(request: APIRequestContext, type: string, id: string, kind?: string): Promise<Item[]> {
  return ((await (await request.get(`/api/cc_audit/activity?type=${type}&id=${id}${kind ? `&kind=${kind}` : ''}`)).json()) as { items: Item[] }).items
}

test.describe.serial('Phase C · enquiries, follow-ups and quotation revisions', () => {
  let customerId: string
  let productId: string
  let enquiryId: string
  let firstFollowUp: string
  let secondFollowUp: string
  let quoteId: string
  let orderId: string

  test('an enquiry with a next date gets its own follow-up record; edits log old → new', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E15 CRM ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const created = await request.post('/api/cc_crm/enquiries', { data: { source: 'IndiaMART', receivedAt: new Date().toISOString(), customerId, contactName: 'Mr Patel', subject: 'G10 sheets 6 mm', nextActionOn: shift(2), nextActionNote: 'Send rates' } })
    expect(created.status(), await created.text()).toBe(201)
    enquiryId = ((await created.json()) as { id: string }).id
    const detail = await enquiry(request, enquiryId)
    expect(detail.followUps).toHaveLength(1)
    expect(detail.nextActionOn).toBe(shift(2))
    firstFollowUp = detail.followUps![0].id
    const saved = await request.put('/api/cc_crm/enquiries', { data: { id: enquiryId, source: 'IndiaMART', receivedAt: new Date().toISOString(), customerId, contactName: 'Mr Patel', subject: 'G10 sheets 8 mm', ownerName: detail.ownerName, nextActionOn: shift(2) }, headers: { [LOCK]: detail.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const edit = (await activity(request, 'enquiry', enquiryId)).find((item) => item.action === 'edited')!
    expect(edit.changes).toEqual([{ field: 'subject', label: 'Subject', from: 'G10 sheets 6 mm', to: 'G10 sheets 8 mm' }])
    expect((await enquiry(request, enquiryId)).followUps).toHaveLength(1)
  })

  test('a follow-up is moved with a reason, done with an outcome and the next one planned', async ({ request }) => {
    expect((await followAct(request, firstFollowUp, { action: 'reschedule', dueOn: shift(3) })).status()).toBe(400)
    const moved = await followAct(request, firstFollowUp, { action: 'reschedule', dueOn: shift(3), reason: 'Customer travelling' })
    expect(moved.ok(), await moved.text()).toBeTruthy()
    expect((await enquiry(request, enquiryId)).nextActionOn).toBe(shift(3))
    const log = await activity(request, 'follow_up', firstFollowUp)
    expect(log.find((item) => item.action === 'rescheduled')).toMatchObject({ reason: 'Customer travelling', changes: [{ field: 'dueOn', label: 'Due date', from: shift(2), to: shift(3) }] })
    expect((await followAct(request, firstFollowUp, { action: 'done', outcome: 'ok' })).status()).toBe(400)
    const done = await followAct(request, firstFollowUp, { action: 'done', outcome: 'Rates sent; wants a sample', next: { dueOn: shift(7), kind: 'sample', note: 'Courier 2 sheets' } })
    expect(done.ok(), await done.text()).toBeTruthy()
    const result = (await done.json()) as FollowUp
    expect(result.status).toBe('done')
    secondFollowUp = result.nextId!
    expect((await enquiry(request, enquiryId)).nextActionOn).toBe(shift(7))
    expect((await activity(request, 'enquiry', enquiryId, 'stage')).map((item) => item.action)).toEqual(expect.arrayContaining(['follow_up_planned', 'follow_up_done']))
  })

  test('undo of a follow-up done by mistake: refused once a newer one exists, allowed otherwise', async ({ request }) => {
    const refused = await followAct(request, firstFollowUp, { action: 'undo', reason: 'Clicked by mistake' })
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/newer follow-up/)
    expect((await followAct(request, secondFollowUp, { action: 'done', outcome: 'Sample couriered' })).ok()).toBeTruthy()
    const undone = await followAct(request, secondFollowUp, { action: 'undo', reason: 'Courier did not pick up' })
    expect(undone.ok(), await undone.text()).toBeTruthy()
    expect(((await undone.json()) as FollowUp).status).toBe('planned')
    expect((await activity(request, 'follow_up', secondFollowUp, 'correction')).find((item) => item.action === 'undone')?.reason).toBe('Courier did not pick up')
  })

  test('hand over moves the owner and the open follow-ups; lost closes them; reopen brings it back', async ({ request }) => {
    const people = ((await (await request.get('/api/cc_audit/people')).json()) as { items: Array<{ name: string }> }).items
    const before = await enquiry(request, enquiryId)
    const target = people.find((person) => person.name !== before.ownerName)!.name
    expect((await enquiryAct(request, enquiryId, { action: 'reassign', ownerName: target })).status()).toBe(400)
    const handed = await enquiryAct(request, enquiryId, { action: 'reassign', ownerName: target, reason: 'Ravi is on leave' })
    expect(handed.ok(), await handed.text()).toBeTruthy()
    expect((await followUp(request, secondFollowUp)).ownerName).toBe(target)
    expect((await activity(request, 'enquiry', enquiryId)).find((item) => item.action === 'reassigned')?.changes).toEqual([{ field: 'ownerName', label: 'Owner', from: before.ownerName, to: target }])
    expect((await enquiryAct(request, enquiryId, { action: 'stage', stage: 'lost', lostReason: 'Price too high' })).ok()).toBeTruthy()
    expect((await followUp(request, secondFollowUp)).status).toBe('skipped')
    const reopened = await enquiryAct(request, enquiryId, { action: 'reopen', reason: 'Customer came back after a month' })
    expect(reopened.ok(), await reopened.text()).toBeTruthy()
    expect(((await reopened.json()) as Enquiry).stage).toBe('negotiating')
  })

  test('a sent quotation cannot be edited; revise keeps revision 1 and logs the line changes', async ({ request }) => {
    const created = await request.post('/api/cc_crm/quotations', { data: { orderDate: today, validUntil: shift(15), enquiryId, customerId, lines: [{ productId, quantity: 100, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    quoteId = ((await created.json()) as { id: string }).id
    expect((await quoteAct(request, quoteId, { action: 'sent', sentTo: 'Mr Patel', channel: 'email' })).ok()).toBeTruthy()
    const body = { id: quoteId, orderDate: today, validUntil: shift(15), enquiryId, customerId, lines: [{ productId, quantity: 120, rate: 290, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] }
    const blocked = await request.put('/api/cc_crm/quotations', { data: body, headers: { [LOCK]: (await quote(request, quoteId)).updatedAt } })
    expect(blocked.status()).toBe(409)
    expect((await quoteAct(request, quoteId, { action: 'revise' })).status()).toBe(400)
    const revised = await quoteAct(request, quoteId, { action: 'revise', note: 'Customer wants 120 sheets at a better rate' })
    expect(revised.ok(), await revised.text()).toBeTruthy()
    let current = await quote(request, quoteId)
    expect(current).toMatchObject({ revision: 2, status: 'draft' })
    expect(current.revisions).toEqual([expect.objectContaining({ revision: 1, status: 'sent', reason: 'Customer wants 120 sheets at a better rate' })])
    const saved = await request.put('/api/cc_crm/quotations', { data: body, headers: { [LOCK]: current.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const edit = (await activity(request, 'quotation', quoteId)).find((item) => item.action === 'edited')!
    expect(edit.changes).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Fabric 10x10 Sheet qty', from: 100, to: 120 }), expect.objectContaining({ label: 'Fabric 10x10 Sheet rate', from: 300, to: 290 })]))
    const old = (await (await request.get(`/api/cc_crm/quotations?id=${quoteId}&revision=1`)).json()) as Quote
    expect(old.lines[0]).toMatchObject({ quantity: 100, rate: 300 })
    current = await quote(request, quoteId)
    expect(current.lines[0]).toMatchObject({ quantity: 120, rate: 290 })
  })

  test('convert, then undo the conversion: the order is cancelled and the quotation back to accepted; refused after advance', async ({ request }) => {
    expect((await quoteAct(request, quoteId, { action: 'sent' })).ok()).toBeTruthy()
    const converted = await quoteAct(request, quoteId, { action: 'convert', orderDate: today })
    expect(converted.ok(), await converted.text()).toBeTruthy()
    orderId = ((await converted.json()) as { order: { id: string } }).order.id
    expect((await enquiry(request, enquiryId)).stage).toBe('won')
    const undone = await quoteAct(request, quoteId, { action: 'undo_convert', note: 'Booked against the wrong customer site' })
    expect(undone.ok(), await undone.text()).toBeTruthy()
    expect((await quote(request, quoteId)).status).toBe('accepted')
    expect(((await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { status: string }).status).toBe('cancelled')
    expect((await enquiry(request, enquiryId)).stage).toBe('negotiating')
    const again = await quoteAct(request, quoteId, { action: 'convert', orderDate: today })
    orderId = ((await again.json()) as { order: { id: string } }).order.id
    const paid = await request.post('/api/cc_accounts/payments', { data: { orderId, kind: 'advance', amount: 5000, paidOn: today, reference: `E2E15C-${stamp}` } })
    expect(paid.ok(), await paid.text()).toBeTruthy()
    const refused = await quoteAct(request, quoteId, { action: 'undo_convert', note: 'Try again' })
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/advance/)
    const undoWon = await enquiryAct(request, enquiryId, { action: 'undo_won', reason: 'Try to undo' })
    expect(undoWon.status()).toBe(409)
  })

  test('withdraw needs a reason and is refused once accepted', async ({ request }) => {
    const created = await request.post('/api/cc_crm/quotations', { data: { orderDate: today, validUntil: shift(15), customerId, lines: [{ productId, quantity: 10, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
    const id = ((await created.json()) as { id: string }).id
    expect((await quoteAct(request, id, { action: 'withdraw' })).status()).toBe(400)
    const withdrawn = await quoteAct(request, id, { action: 'withdraw', note: 'Rates changed; new quote follows' })
    expect(withdrawn.ok(), await withdrawn.text()).toBeTruthy()
    expect((await quote(request, id)).status).toBe('withdrawn')
    const other = await request.post('/api/cc_crm/quotations', { data: { orderDate: today, validUntil: shift(15), customerId, lines: [{ productId, quantity: 10, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet' } } }] } })
    const otherId = ((await other.json()) as { id: string }).id
    expect((await quoteAct(request, otherId, { action: 'accepted' })).ok()).toBeTruthy()
    expect((await quoteAct(request, otherId, { action: 'withdraw', note: 'too late' })).status()).toBe(409)
  })

  test('cleanup', async ({ request }) => {
    const list = (await (await request.get(`/api/cc_accounts/payments?orderId=${orderId}`)).json()) as { items: Array<{ id: string; updatedAt: string }> }
    for (const payment of list.items) await request.post('/api/cc_accounts/payments/void', { data: { id: payment.id, reason: 'e2e cleanup' }, headers: { [LOCK]: payment.updatedAt } })
    const current = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { updatedAt: string }
    await request.post('/api/cc_orders/orders/cancel', { data: { id: orderId, reason: 'e2e cleanup' }, headers: { [LOCK]: current.updatedAt } })
  })
})
