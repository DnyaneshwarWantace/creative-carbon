import { expect, test, type APIRequestContext } from '@playwright/test'

const BASE = process.env.CC_BASE_URL ?? 'http://localhost:3010'
const stamp = Date.now()
const PASSWORD = 'Crm!Test9pass'
const crmEmail = `e2e-crm-${stamp}@example.com`
const erpEmail = `e2e-erp-${stamp}@example.com`

type Member = { id: string; email: string; crmRole: string | null; crmAccess: boolean; erpAccess: boolean; crmOnly: boolean; isSelf: boolean; superAdmin: boolean }

async function loginAs(playwright: { request: { newContext: (options: { baseURL: string }) => Promise<APIRequestContext> } }, email: string, password: string) {
  const context = await playwright.request.newContext({ baseURL: BASE })
  const response = await context.post('/api/auth/login', { data: { email, password } })
  expect(response.status(), await response.text()).toBeLessThan(400)
  return context
}

async function location(context: APIRequestContext, path: string) {
  const response = await context.get(path, { maxRedirects: 0 })
  return { status: response.status(), location: response.headers()['location'] ?? null }
}

test.describe.serial('CRM and ERP access: separate sides, one login', () => {
  let crmUserId: string
  let erpUserId: string
  let managerId: string
  const managerEmail = `e2e-crm-mgr-${stamp}@example.com`

  test('a CRM manager adds a CRM-only sales user from the CRM team page', async ({ request }) => {
    const team = await request.get('/api/cc_crm/team')
    expect(team.ok(), await team.text()).toBeTruthy()
    const weak = await request.post('/api/cc_crm/team', { data: { name: 'Weak', email: `weak-${stamp}@example.com`, password: 'short', crmRole: 'sales' } })
    expect(weak.status()).toBe(400)
    const added = await request.post('/api/cc_crm/team', { data: { name: `E2E Sales ${stamp}`, email: crmEmail, password: PASSWORD, crmRole: 'sales' } })
    expect(added.status(), await added.text()).toBe(201)
    const member = ((await added.json()) as { items: Member[] }).items.find((entry) => entry.email === crmEmail)!
    expect(member).toEqual(expect.objectContaining({ crmRole: 'sales', crmAccess: true, erpAccess: false, crmOnly: true }))
    crmUserId = member.id
    const duplicate = await request.post('/api/cc_crm/team', { data: { name: 'Again', email: crmEmail, password: PASSWORD, crmRole: 'sales' } })
    expect(duplicate.status()).toBe(409)
  })

  test('the CRM-only user works in the CRM and is kept out of the ERP (pages, menus, data)', async ({ playwright }) => {
    const sales = await loginAs(playwright, crmEmail, PASSWORD)
    expect((await sales.get('/backend/crm')).status()).toBe(200)
    for (const path of ['/backend/orders', '/backend/stock', '/backend/quality/lab', '/backend/purchase/indents']) {
      const result = await location(sales, path)
      expect(result.status, path).toBeGreaterThanOrEqual(300)
      expect(result.location, path).toContain('/backend/crm')
    }
    const entry = await location(sales, '/crm')
    expect(entry.location).toContain('/backend/crm')
    const nav = (await (await sales.get('/api/cc_departments/nav?workspace=erp')).json()) as { groups: Array<{ name: string; items: Array<{ href: string }> }> }
    const hrefs = nav.groups.flatMap((group) => group.items.map((item) => item.href))
    expect(hrefs.length).toBeGreaterThan(0)
    expect(hrefs.every((href) => href.startsWith('/backend/crm') || href.startsWith('/backend/customers') || href.startsWith('/backend/orders/new') || href.startsWith('/backend/work/sales') || href.startsWith('/backend/masters/prices'))).toBeTruthy()
    expect((await sales.get('/api/cc_crm/enquiries')).status()).toBe(200)
    expect((await sales.get('/api/cc_production/lab')).status()).toBe(403)
    expect((await sales.get('/api/cc_crm/team')).status()).toBe(403)
    const notAllowed = await sales.post('/api/cc_crm/team', { data: { name: 'Sneaky', email: `sneaky-${stamp}@example.com`, password: PASSWORD, crmRole: 'manager' } })
    expect(notAllowed.status()).toBe(403)
    await sales.dispose()
  })

  test('an ERP-only user is kept out of the CRM', async ({ request, playwright }) => {
    const created = await request.post('/api/auth/users', { data: { email: erpEmail, name: `E2E Accounts ${stamp}`, password: PASSWORD, organizationId: process.env.CC_ORG, roles: ['Accounts'] } })
    expect(created.ok(), await created.text()).toBeTruthy()
    erpUserId = ((await created.json()) as { id: string }).id
    const accounts = await loginAs(playwright, erpEmail, PASSWORD)
    const crm = await location(accounts, '/backend/crm')
    expect(crm.status).toBeGreaterThanOrEqual(300)
    expect(crm.location).not.toContain('/backend/crm')
    const nav = (await (await accounts.get('/api/cc_departments/nav?workspace=crm')).json()) as { groups: Array<{ items: Array<{ href: string }> }> }
    expect(nav.groups.flatMap((group) => group.items.map((item) => item.href)).some((href) => href.startsWith('/backend/crm'))).toBeFalsy()
    expect((await accounts.get('/api/cc_crm/enquiries')).status()).toBe(403)
    await accounts.dispose()
  })

  test('the team page cannot reach ERP users’ passwords, and nobody removes their own manager role', async ({ request }) => {
    const team = ((await (await request.get('/api/cc_crm/team')).json()) as { items: Member[] }).items
    const erpUser = team.find((member) => member.id === erpUserId)!
    expect(erpUser).toEqual(expect.objectContaining({ erpAccess: true, crmOnly: false, crmRole: null }))
    const blocked = await request.put('/api/cc_crm/team', { data: { action: 'password', id: erpUserId, password: 'Other!Pass9word' } })
    expect(blocked.status()).toBe(403)
    const reset = await request.put('/api/cc_crm/team', { data: { action: 'password', id: crmUserId, password: 'Next!Pass9word' } })
    expect(reset.ok(), await reset.text()).toBeTruthy()
    const promoted = await request.put('/api/cc_crm/team', { data: { action: 'role', id: erpUserId, crmRole: 'sales' } })
    expect(promoted.ok(), await promoted.text()).toBeTruthy()
    const both = ((await promoted.json()) as { items: Member[] }).items.find((member) => member.id === erpUserId)!
    expect(both).toEqual(expect.objectContaining({ crmAccess: true, erpAccess: true }))
    const self = team.find((member) => member.isSelf)
    if (self && !self.superAdmin && self.crmRole === 'manager') {
      const selfRemove = await request.put('/api/cc_crm/team', { data: { action: 'role', id: self.id, crmRole: null } })
      expect(selfRemove.status()).toBe(409)
    }
    const stripped = await request.put('/api/cc_crm/team', { data: { action: 'role', id: crmUserId, crmRole: null } })
    expect(stripped.status()).toBe(409)
  })

  test('a user with both sides opens either without logging in again', async ({ playwright }) => {
    const both = await loginAs(playwright, erpEmail, PASSWORD)
    expect((await both.get('/backend/crm')).status()).toBe(200)
    expect((await both.get('/backend/orders')).status()).toBe(200)
    await both.dispose()
  })

  test('a CRM manager edits CRM dropdown lists only; sales cannot edit lists; the CRM sidebar has its sections', async ({ request, playwright }) => {
    const added = await request.post('/api/cc_crm/team', { data: { name: `E2E Manager ${stamp}`, email: managerEmail, password: PASSWORD, crmRole: 'manager' } })
    expect(added.status(), await added.text()).toBe(201)
    managerId = ((await added.json()) as { items: Member[] }).items.find((entry) => entry.email === managerEmail)!.id
    const manager = await loginAs(playwright, managerEmail, PASSWORD)
    const lists = ((await (await manager.get('/api/cc_lists/lists')).json()) as { items: Array<{ key: string; options: Array<{ value: string; active: boolean }> }> }).items
    const sources = lists.find((list) => list.key === 'enquiry_sources')!
    const changed = await manager.put('/api/cc_lists/lists', { data: { key: 'enquiry_sources', options: [...sources.options, { value: `Trade fair ${stamp}`, active: true }] } })
    expect(changed.ok(), await changed.text()).toBeTruthy()
    const packs = lists.find((list) => list.key === 'pack_types')!
    const erpList = await manager.put('/api/cc_lists/lists', { data: { key: 'pack_types', options: packs.options } })
    expect(erpList.status()).toBe(403)
    expect((await manager.get('/backend/crm/lists')).status()).toBe(200)
    expect((await manager.get('/backend/crm/team')).status()).toBe(200)
    const nav = (await (await manager.get('/api/cc_departments/nav?workspace=crm')).json()) as { groups: Array<{ name: string; items: Array<{ title: string }> }> }
    expect(nav.groups.map((group) => group.name)).toEqual(['Overview', 'Sales pipeline', 'Customers & orders', 'CRM settings'])
    expect(nav.groups.find((group) => group.name === 'CRM settings')!.items.map((item) => item.title)).toEqual(expect.arrayContaining(['Dropdown lists', 'Team & access']))
    await manager.dispose()
    const sales = await loginAs(playwright, crmEmail, 'Next!Pass9word')
    const salesEdit = await sales.put('/api/cc_lists/lists', { data: { key: 'enquiry_sources', options: sources.options } })
    expect(salesEdit.status()).toBe(403)
    expect(await (await sales.get('/backend/crm/lists')).text()).toContain('Access Denied')
    const salesNav = (await (await sales.get('/api/cc_departments/nav?workspace=crm')).json()) as { groups: Array<{ items: Array<{ href: string }> }> }
    expect(salesNav.groups.flatMap((group) => group.items.map((item) => item.href)).some((href) => href === '/backend/crm/lists' || href === '/backend/crm/team')).toBeFalsy()
    await sales.dispose()
    const reset = await request.put('/api/cc_lists/lists', { data: { key: 'enquiry_sources', reset: true } })
    expect(reset.ok(), await reset.text()).toBeTruthy()
  })

  test('cleanup: remove the test logins', async ({ request }) => {
    for (const id of [crmUserId, erpUserId, managerId].filter(Boolean)) {
      const removed = await request.delete(`/api/auth/users?id=${id}`)
      expect(removed.ok(), await removed.text()).toBeTruthy()
    }
  })
})
