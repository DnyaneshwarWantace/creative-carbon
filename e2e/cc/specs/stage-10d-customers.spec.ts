import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function gstin(stateCode: string): string {
  const letters = Array.from({ length: 5 }, (_, index) => CHARS[10 + ((stamp >> (index * 3)) % 26)]).join('')
  const digits = String(stamp % 10000).padStart(4, '0')
  const body = `${stateCode}${letters}${digits}F1Z`
  let sum = 0
  for (let index = 0; index < 14; index += 1) {
    const product = CHARS.indexOf(body[index]) * (index % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return body + CHARS[(36 - (sum % 36)) % 36]
}

const GST = gstin('24')
const NAME = `E2E Laminates ${stamp}`

function base(overrides: Record<string, unknown> = {}) {
  return {
    category: 'business',
    name: NAME,
    legalName: `${NAME} Pvt Ltd`,
    gstType: 'registered',
    gstin: GST,
    phone: '98250 12345',
    email: `buyer-${stamp}@example.com`,
    paymentTerms: '30_days',
    billing: { street: 'Plot 12, GIDC', district: 'Ahmedabad', state: 'Gujarat', pin: '382445', country: 'India' },
    shipping: null,
    contacts: [{ name: 'Mr Patel', phone: '9825011111', email: `patel-${stamp}@example.com` }],
    ...overrides,
  }
}

async function company(request: APIRequestContext, id: string) {
  return ((await (await request.get(`/api/customers/companies?id=${id}&pageSize=1`)).json()) as { items: Array<Record<string, unknown>> }).items[0]
}

test.describe.serial('Customers: one strict save', () => {
  let customerId: string

  test('bad GSTIN, wrong state, bad PIN and phone are refused field by field, nothing is saved', async ({ request }) => {
    const wrongCheck = GST.slice(0, 14) + (GST[14] === 'A' ? 'B' : 'A')
    const bad = await request.post('/api/cc_customers/customers', { data: base({ gstin: wrongCheck, phone: '12345', billing: { street: 'X', state: 'Maharashtra', pin: '0123', country: 'India' } }) })
    expect(bad.status()).toBe(400)
    const body = (await bad.json()) as { fields: Record<string, string> }
    expect(Object.keys(body.fields)).toEqual(expect.arrayContaining(['gstin', 'phone', 'billing.pin']))
    const wrongState = await request.post('/api/cc_customers/customers', { data: base({ billing: { street: 'X', state: 'Maharashtra', pin: '400001', country: 'India' } }) })
    expect(wrongState.status()).toBe(400)
    expect(((await wrongState.json()) as { fields: Record<string, string> }).fields['billing.state']).toMatch(/Gujarat/)
    const noGst = await request.post('/api/cc_customers/customers', { data: base({ gstin: '' }) })
    expect(((await noGst.json()) as { fields: Record<string, string> }).fields.gstin).toBeTruthy()
    const check = await request.post('/api/cc_customers/customers', { data: { ...base(), checkOnly: true } })
    expect(check.ok(), await check.text()).toBeTruthy()
  })

  test('a valid customer saves in one go with address, contact, +91 phone and a customer number', async ({ request }) => {
    const created = await request.post('/api/cc_customers/customers', { data: base() })
    expect(created.status(), await created.text()).toBe(201)
    const result = (await created.json()) as { id: string; customerNo: string }
    customerId = result.id
    expect(result.customerNo).toMatch(/^CTR\d{3,}$/)
    const row = await company(request, customerId)
    expect(row.primary_phone ?? row.primaryPhone).toBe('+919825012345')
    const addresses = ((await (await request.get(`/api/customers/addresses?entityId=${customerId}&pageSize=20`)).json()) as { items: Array<Record<string, unknown>> }).items
    expect(addresses.map((entry) => entry.purpose)).toEqual(['billing'])
    const contacts = ((await (await request.get(`/api/customers/contacts?entityId=${customerId}&pageSize=20`)).json()) as { items: Array<Record<string, unknown>> }).items
    expect(contacts.map((entry) => entry.name)).toEqual(['Mr Patel'])
  })

  test('the same GSTIN or name on another customer is refused', async ({ request }) => {
    const sameGst = await request.post('/api/cc_customers/customers', { data: base({ name: `${NAME} Two` }) })
    expect(sameGst.status()).toBe(409)
    expect(((await sameGst.json()) as { fields: Record<string, string> }).fields.gstin).toMatch(/already has this GSTIN/)
    const sameName = await request.post('/api/cc_customers/customers', { data: base({ name: NAME.toUpperCase(), gstType: 'unregistered', gstin: '' }) })
    expect(sameName.status()).toBe(409)
    expect(((await sameName.json()) as { fields: Record<string, string> }).fields.name).toBeTruthy()
  })

  test('editing adds a shipping address and a contact, removes the old contact, and refuses a stale save', async ({ request }) => {
    const before = await company(request, customerId)
    const version = String(before.updated_at ?? before.updatedAt)
    const contacts = ((await (await request.get(`/api/customers/contacts?entityId=${customerId}&pageSize=20`)).json()) as { items: Array<{ id: string; name: string }> }).items
    const edit = base({ id: customerId, shipping: { street: 'Godown 4, Sanand', district: 'Ahmedabad', state: 'Gujarat', pin: '382110', country: 'India' }, contacts: [{ name: 'Ms Shah', phone: '+91 98250 22222', email: '' }] })
    const saved = await request.put('/api/cc_customers/customers', { data: edit, headers: { [LOCK]: version } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const addresses = ((await (await request.get(`/api/customers/addresses?entityId=${customerId}&pageSize=20`)).json()) as { items: Array<{ purpose: string }> }).items
    expect(addresses.map((entry) => entry.purpose).sort()).toEqual(['billing', 'shipping'])
    const after = ((await (await request.get(`/api/customers/contacts?entityId=${customerId}&pageSize=20`)).json()) as { items: Array<{ id: string; name: string }> }).items
    expect(after.map((entry) => entry.name)).toEqual(['Ms Shah'])
    expect(after.some((entry) => entry.id === contacts[0].id)).toBeFalsy()
    const stale = await request.put('/api/cc_customers/customers', { data: edit, headers: { [LOCK]: version } })
    expect(stale.status()).toBe(409)
    const removeShipping = await request.put('/api/cc_customers/customers', { data: base({ id: customerId, shipping: null, contacts: [{ name: 'Ms Shah' }] }) })
    expect(removeShipping.ok(), await removeShipping.text()).toBeTruthy()
    const left = ((await (await request.get(`/api/customers/addresses?entityId=${customerId}&pageSize=20`)).json()) as { items: Array<{ purpose: string }> }).items
    expect(left.map((entry) => entry.purpose)).toEqual(['billing'])
  })

  test('an overseas customer needs a country and no GSTIN', async ({ request }) => {
    const wrong = await request.post('/api/cc_customers/customers', { data: base({ name: `E2E Overseas ${stamp}`, gstType: 'overseas', gstin: '', billing: { street: 'Jebel Ali', state: '', pin: '', country: 'India' } }) })
    expect(((await wrong.json()) as { fields: Record<string, string> }).fields['billing.country']).toBeTruthy()
    const ok = await request.post('/api/cc_customers/customers', { data: base({ name: `E2E Overseas ${stamp}`, gstType: 'overseas', gstin: '', phone: '+971 4 123 4567', billing: { street: 'Jebel Ali Free Zone', state: 'Dubai', pin: '', country: 'UAE' }, contacts: [] }) })
    expect(ok.status(), await ok.text()).toBe(201)
    const id = ((await ok.json()) as { id: string }).id
    expect((await request.delete(`/api/customers/companies?id=${id}`)).ok()).toBeTruthy()
  })

  test('cleanup', async ({ request }) => {
    if (customerId) expect((await request.delete(`/api/customers/companies?id=${customerId}`)).ok()).toBeTruthy()
  })
})
