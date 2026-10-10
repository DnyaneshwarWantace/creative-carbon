import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
const shift = (days: number) => new Date(Date.now() + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10)
const GRADE = `E2EG${stamp % 100000}`

type Item = { action: string; kind: string; reason: string | null; summary: string | null; changes: Array<{ field: string; label: string; from: unknown; to: unknown }> }
type Member = { id: string; name: string | null; email: string; isSelf: boolean; crmRole: string | null }

async function activity(request: APIRequestContext, type: string, id: string): Promise<Item[]> {
  return ((await (await request.get(`/api/cc_audit/activity?type=${type}&id=${id}`)).json()) as { items: Item[] }).items
}

test.describe.serial('Phase C · salesperson page with hand-over, price list rate history', () => {
  const salesName = `E2E15 Sales ${stamp}`
  let salesId: string
  let meName: string
  let enquiryId: string
  let followUpId: string
  let rateId: string
  let quoteId: string

  test('a salesperson page shows their open work; a role change is logged', async ({ request }) => {
    const added = await request.post('/api/cc_crm/team', { data: { name: salesName, email: `e2e-sales-${stamp}@example.com`, password: 'Sales!Test9pass', crmRole: 'sales' } })
    expect(added.status(), await added.text()).toBe(201)
    const team = ((await added.json()) as { items: Member[] }).items
    salesId = team.find((member) => member.name === salesName)!.id
    const me = team.find((member) => member.isSelf)!
    meName = me.name ?? me.email
    const created = await request.post('/api/cc_crm/enquiries', { data: { source: 'Phone', receivedAt: new Date().toISOString(), companyName: `E2E15 Prospect ${stamp}`, subject: 'FR4 sheets', ownerName: salesName, nextActionOn: shift(1) } })
    expect(created.status(), await created.text()).toBe(201)
    enquiryId = ((await created.json()) as { id: string }).id
    const view = (await (await request.get(`/api/cc_crm/team/member?id=${salesId}`)).json()) as { name: string; stats: { openEnquiries: number; followUpsDue: number }; enquiries: Array<{ id: string }>; followUps: Array<{ id: string }> }
    expect(view).toMatchObject({ name: salesName, stats: { openEnquiries: 1, followUpsDue: 1 } })
    expect(view.enquiries.map((row) => row.id)).toEqual([enquiryId])
    followUpId = view.followUps[0].id
    const promoted = await request.put('/api/cc_crm/team', { data: { id: salesId, action: 'role', crmRole: 'manager' } })
    expect(promoted.ok(), await promoted.text()).toBeTruthy()
    expect((await activity(request, 'sales_person', salesId)).find((item) => item.action === 'role_changed')?.changes).toEqual([{ field: 'crmRole', label: 'CRM role', from: 'Sales', to: 'CRM manager' }])
    expect((await request.get(`/backend/crm/team/${salesId}`)).status()).toBe(200)
  })

  test('hand over moves their open enquiries and follow-ups, with the reason on both people', async ({ request }) => {
    expect((await request.post('/api/cc_crm/team/member', { data: { id: salesId, action: 'hand_over', toName: meName } })).status()).toBe(400)
    const handed = await request.post('/api/cc_crm/team/member', { data: { id: salesId, action: 'hand_over', toName: meName, reason: 'Leaving the company' } })
    expect(handed.ok(), await handed.text()).toBeTruthy()
    expect(((await handed.json()) as { moved: { enquiries: number; followUps: number } }).moved).toMatchObject({ enquiries: 1, followUps: 1 })
    expect(((await (await request.get(`/api/cc_crm/enquiries?id=${enquiryId}`)).json()) as { ownerName: string }).ownerName).toBe(meName)
    expect(((await (await request.get(`/api/cc_crm/follow-ups?id=${followUpId}`)).json()) as { ownerName: string }).ownerName).toBe(meName)
    expect((await activity(request, 'sales_person', salesId)).find((item) => item.action === 'handed_over')?.reason).toBe('Leaving the company')
    expect((await activity(request, 'enquiry', enquiryId)).find((item) => item.action === 'reassigned')?.changes).toEqual([{ field: 'ownerName', label: 'Owner', from: salesName, to: meName }])
  })

  test('a price list rate change needs a reason; the old rate and the quotations that used it stay visible', async ({ request }) => {
    const created = await request.post('/api/cc_production/masters', { data: { type: 'prices', values: { sizeClass: 'small', grade: GRADE, thicknessFrom: 1, thicknessTo: 50, ratePerKg: 300, currency: 'INR' } } })
    expect(created.status(), await created.text()).toBe(201)
    const row = (await created.json()) as { id: string; updatedAt: string }
    rateId = row.id
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E15 Rate Buyer ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const quote = await request.post('/api/cc_crm/quotations', { data: { orderDate: today, validUntil: shift(10), customerId, lines: [{ productId, quantity: 50, rate: 300, gstPercent: 18, specs: { material: { form: 'Sheet', grade: GRADE, thickness_mm: '10' } } }] } })
    expect(quote.status(), await quote.text()).toBe(201)
    quoteId = ((await quote.json()) as { id: string }).id
    const bare = await request.put('/api/cc_production/masters', { data: { type: 'prices', id: rateId, values: { ratePerKg: 320 } }, headers: { [LOCK]: row.updatedAt } })
    expect(bare.status()).toBe(400)
    expect(((await bare.json()) as { error: string }).error).toMatch(/Write why/)
    const changed = await request.put('/api/cc_production/masters', { data: { type: 'prices', id: rateId, values: { ratePerKg: 320 }, reason: 'Resin cost went up 6%' }, headers: { [LOCK]: row.updatedAt } })
    expect(changed.ok(), await changed.text()).toBeTruthy()
    const log = await activity(request, 'price_rate', rateId)
    expect(log.map((item) => item.action)).toEqual(['changed', 'created'])
    expect(log[0]).toMatchObject({ reason: 'Resin cost went up 6%', changes: [{ field: 'ratePerKg', label: 'Rate per kg', from: 300, to: 320, money: true }] })
    const history = (await (await request.get(`/api/cc_production/masters/rate?id=${rateId}`)).json()) as { ratePerKg: number; quotations: Array<{ id: string; rate: number }> }
    expect(history.ratePerKg).toBe(320)
    expect(history.quotations).toEqual([expect.objectContaining({ id: quoteId, rate: 300 })])
  })

  test('cleanup', async ({ request }) => {
    const rows = ((await (await request.get('/api/cc_production/masters?type=prices')).json()) as { items: Array<{ id: string; updatedAt: string }> }).items
    const row = rows.find((entry) => entry.id === rateId)
    if (row) await request.delete(`/api/cc_production/masters?type=prices&id=${rateId}`, { headers: { [LOCK]: row.updatedAt } })
    expect((await request.delete(`/api/auth/users?id=${salesId}`)).ok()).toBeTruthy()
  })
})
