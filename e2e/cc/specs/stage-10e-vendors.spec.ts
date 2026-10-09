import { expect, test } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function gstin(stateCode: string, salt: number): string {
  const letters = Array.from({ length: 5 }, (_, index) => CHARS[10 + (((stamp + salt) >> (index * 3)) % 26)]).join('')
  const digits = String((stamp + salt) % 10000).padStart(4, '0')
  const body = `${stateCode}${letters}${digits}V1Z`
  let sum = 0
  for (let index = 0; index < 14; index += 1) {
    const product = CHARS.indexOf(body[index]) * (index % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return body + CHARS[(36 - (sum % 36)) % 36]
}

const GST = gstin('27', 7)
const NAME = `E2E Resins Supply ${stamp}`
const scope = () => ({ organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT })

function base(overrides: Record<string, unknown> = {}) {
  return {
    ...scope(),
    name: NAME,
    gstNumber: GST,
    category: 'rm_supplier',
    contactPerson: 'Mr Kulkarni',
    contactPhone: '98220 12345',
    contactEmail: `Sales-${stamp}@Example.com`,
    address: 'Plot 4, MIDC Bhosari, Pune 411026',
    paymentTerms: '30 days credit',
    ...overrides,
  }
}

type Row = { id: string; name: string; code: string | null; gst_number: string | null; contact_phone: string | null; contact_email: string | null; updated_at: string }

test.describe.serial('Vendors: strict save', () => {
  let vendorId: string
  let otherId: string

  test('bad GSTIN, phone and email are refused field by field; nothing is saved', async ({ request }) => {
    const wrongCheck = GST.slice(0, 14) + (GST[14] === 'A' ? 'B' : 'A')
    const bad = await request.post('/api/cc_vendors/vendors', { data: base({ gstNumber: wrongCheck, contactPhone: '12345', contactEmail: 'not-an-email' }) })
    expect(bad.status()).toBe(400)
    const body = (await bad.json()) as { fieldErrors: Record<string, string> }
    expect(Object.keys(body.fieldErrors)).toEqual(expect.arrayContaining(['gstNumber', 'contactPhone', 'contactEmail']))
    const noAddress = await request.post('/api/cc_vendors/vendors', { data: base({ address: '' }) })
    expect(noAddress.status()).toBe(400)
    expect(((await noAddress.json()) as { fieldErrors: Record<string, string> }).fieldErrors.address).toBeTruthy()
    const list = (await (await request.get(`/api/cc_vendors/vendors?search=${encodeURIComponent(NAME)}`)).json()) as { items: Row[] }
    expect(list.items).toHaveLength(0)
  })

  test('a valid vendor saves with +91 phone, lower-case email and a vendor code', async ({ request }) => {
    const created = await request.post('/api/cc_vendors/vendors', { data: base() })
    expect(created.status(), await created.text()).toBe(201)
    vendorId = ((await created.json()) as { id: string }).id
    const row = ((await (await request.get(`/api/cc_vendors/vendors?id=${vendorId}`)).json()) as { items: Row[] }).items[0]
    expect(row.contact_phone).toBe('+919822012345')
    expect(row.contact_email).toBe(`sales-${stamp}@example.com`)
    expect(row.code).toMatch(/^VEN\d{3,}$/)
    expect(row.gst_number).toBe(GST)
  })

  test('the same name, GSTIN or code on another vendor is refused', async ({ request }) => {
    const sameName = await request.post('/api/cc_vendors/vendors', { data: base({ name: NAME.toUpperCase(), gstNumber: '', address: '' }) })
    expect(sameName.status()).toBe(409)
    expect(((await sameName.json()) as { fieldErrors: Record<string, string> }).fieldErrors.name).toBeTruthy()
    const sameGst = await request.post('/api/cc_vendors/vendors', { data: base({ name: `${NAME} Two` }) })
    expect(sameGst.status()).toBe(409)
    expect(((await sameGst.json()) as { fieldErrors: Record<string, string> }).fieldErrors.gstNumber).toMatch(/already has/)
    const other = await request.post('/api/cc_vendors/vendors', { data: base({ name: `${NAME} Two`, gstNumber: gstin('24', 11), code: `E2E${String(stamp).slice(-6)}` }) })
    expect(other.status(), await other.text()).toBe(201)
    otherId = ((await other.json()) as { id: string }).id
    const first = ((await (await request.get(`/api/cc_vendors/vendors?id=${vendorId}`)).json()) as { items: Row[] }).items[0]
    const takeCode = await request.put('/api/cc_vendors/vendors', { data: { id: otherId, code: first.code } })
    expect(takeCode.status()).toBe(409)
  })

  test('editing checks the same rules and refuses a stale save', async ({ request }) => {
    const before = ((await (await request.get(`/api/cc_vendors/vendors?id=${vendorId}`)).json()) as { items: Row[] }).items[0]
    const badPhone = await request.put('/api/cc_vendors/vendors', { data: { id: vendorId, contactPhone: '000' }, headers: { [LOCK]: before.updated_at } })
    expect(badPhone.status()).toBe(400)
    const saved = await request.put('/api/cc_vendors/vendors', { data: { id: vendorId, contactPhone: '+91 98220 99999' }, headers: { [LOCK]: before.updated_at } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const after = ((await (await request.get(`/api/cc_vendors/vendors?id=${vendorId}`)).json()) as { items: Row[] }).items[0]
    expect(after.contact_phone).toBe('+919822099999')
    expect(after.code).toBe(before.code)
    const stale = await request.put('/api/cc_vendors/vendors', { data: { id: vendorId, contactPerson: 'Someone else' }, headers: { [LOCK]: before.updated_at } })
    expect(stale.status()).toBe(409)
  })

  test('cleanup', async ({ request }) => {
    for (const id of [vendorId, otherId]) if (id) expect((await request.delete(`/api/cc_vendors/vendors?id=${id}`)).ok()).toBeTruthy()
  })
})
