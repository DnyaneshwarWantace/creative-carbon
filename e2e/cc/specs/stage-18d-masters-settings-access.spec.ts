import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()

type Activity = { action: string; reason: string | null; changes: Array<{ field: string; label: string; from: unknown; to: unknown }> | null }
type SettingsChange = { id: string; key: string; status: string; updatedAt: string; changes: Array<{ field: string; from: unknown; to: unknown }>; blockedBy?: string[] }
type AccessChange = { id: string; action: string; reason: string | null; undoneAt: string | null; changes: Array<{ field: string; to: unknown }> }

async function activity(request: APIRequestContext, type: string, id: string): Promise<Activity[]> {
  return ((await (await request.get(`/api/cc_audit/activity?type=${type}&id=${id}`)).json()) as { items: Activity[] }).items
}

async function listOptions(request: APIRequestContext, key: string) {
  const items = ((await (await request.get(`/api/cc_lists/lists?key=${key}`)).json()) as { items: Array<{ options: Array<{ value: string; active: boolean }>; updatedAt: string | null }> }).items
  return items[0]
}

async function saveOptions(request: APIRequestContext, key: string, options: Array<{ value: string; active: boolean }>) {
  const current = await listOptions(request, key)
  return request.put('/api/cc_lists/lists', { data: { key, options }, headers: current.updatedAt ? { [LOCK]: current.updatedAt } : {} })
}

async function changes(request: APIRequestContext, area: string): Promise<SettingsChange[]> {
  return ((await (await request.get(`/api/cc_audit/settings-changes?area=${area}`)).json()) as { items: SettingsChange[] }).items
}

async function undoChange(request: APIRequestContext, id: string, reason?: string) {
  const one = (await (await request.get(`/api/cc_audit/settings-changes?id=${id}`)).json()) as SettingsChange
  return request.post('/api/cc_audit/settings-changes', { data: { id, ...(reason ? { reason } : {}) }, headers: { [LOCK]: one.updatedAt } })
}

test.describe.serial('Phase F · item, die and machine change logs; settings change log with undo; access change log', () => {
  let mouldId: string

  test('an item change is logged old → new; the unit and active switch are refused while stock is on hand', async ({ request }) => {
    const found = ((await (await request.get('/api/cc_products/search?kinds=chemical&q=Methanol')).json()) as { items: Array<{ id: string; title: string }> }).items.find((item) => item.title === 'Methanol')!
    const lot = await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId: found.id, direction: 'in', quantity: 3, newLot: { lotNumber: `E2E18D-${stamp}` }, reason: 'Opening stock', note: 'e2e18d' } })
    expect(lot.ok(), await lot.text()).toBeTruthy()
    const lotId = ((await (await request.get(`/api/cc_store/adjustments?id=${((await lot.json()) as { id: string }).id}`)).json()) as { lotId: string }).lotId
    const product = ((await (await request.get(`/api/catalog/products?id=${found.id}&pageSize=1`)).json()) as { items: Array<{ description: string | null; default_unit: string; updated_at: string }> }).items[0]
    const unitRefused = await request.put('/api/catalog/products', { data: { id: found.id, defaultUnit: product.default_unit === 'kg' ? 'nos' : 'kg' }, headers: { 'x-cc-reason': 'e2e' } })
    expect(unitRefused.status(), await unitRefused.text()).toBe(409)
    const inactive = await request.post('/api/cc_products/active', { data: { id: found.id, active: false, reason: 'Not bought any more' }, headers: { [LOCK]: product.updated_at } })
    expect(inactive.status()).toBe(409)
    expect(((await inactive.json()) as { error: string }).error).toMatch(/in stock/)
    const note = `e2e18 note ${stamp}`
    const edited = await request.put('/api/catalog/products', { data: { id: found.id, organizationId: process.env.CC_ORG, description: note } })
    expect(edited.ok(), await edited.text()).toBeTruthy()
    const log = await activity(request, 'product', found.id)
    expect(log.find((item) => item.action === 'changed')?.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'description', to: note })]))
    expect((await request.put('/api/catalog/products', { data: { id: found.id, organizationId: process.env.CC_ORG, description: product.description ?? '' } })).ok()).toBeTruthy()
    expect((await request.post('/api/cc_store/stock/adjust', { data: { place: 'wh_a', productId: found.id, direction: 'out', quantity: 3, lotId, reason: 'Physical count difference', note: 'e2e18d cleanup' } })).ok()).toBeTruthy()
  })

  test('a die is created, changed and retired with a reason; a used die cannot be deleted', async ({ request }) => {
    const created = await request.post('/api/cc_production/masters', { data: { type: 'moulds', values: { dieNo: `E2E18-M-${stamp}`, mouldType: 'die', description: 'Bush' } } })
    expect(created.status(), await created.text()).toBe(201)
    let row = (await created.json()) as { id: string; updatedAt: string }
    mouldId = row.id
    row = (await (await request.put('/api/cc_production/masters', { data: { type: 'moulds', id: mouldId, values: { description: 'Bush, 40 mm' } }, headers: { [LOCK]: row.updatedAt } })).json()) as typeof row
    expect((await request.put('/api/cc_production/masters', { data: { type: 'moulds', id: mouldId, values: { isActive: false } }, headers: { [LOCK]: row.updatedAt } })).status()).toBe(400)
    const retired = await request.put('/api/cc_production/masters', { data: { type: 'moulds', id: mouldId, values: { isActive: false }, reason: 'Die cracked' }, headers: { [LOCK]: row.updatedAt } })
    expect(retired.ok(), await retired.text()).toBeTruthy()
    const log = await activity(request, 'die', mouldId)
    expect(log.map((item) => item.action)).toEqual(expect.arrayContaining(['created', 'changed', 'retired']))
    expect(log.find((item) => item.action === 'changed')?.changes).toEqual([expect.objectContaining({ field: 'description', from: 'Bush', to: 'Bush, 40 mm' })])
    expect(log.find((item) => item.action === 'retired')?.reason).toBe('Die cracked')
    const reactor = (await (await request.post('/api/cc_production/masters', { data: { type: 'reactors', values: { code: `E2E18-R-${stamp}` } } })).json()) as { id: string; updatedAt: string }
    const setup = (await (await request.get('/api/cc_production/resin/setup')).json()) as { chemicals: Array<{ id: string; title: string }> }
    const batch = (await (await request.post('/api/cc_production/resin/batches', { data: { batchDate: '2999-01-01', reactorId: reactor.id, grade: 'PFC', materials: [{ productId: setup.chemicals.find((entry) => entry.title === 'Phenol')!.id, kg: 10 }] } })).json()) as { id: string; updatedAt: string }
    const refused = await request.delete(`/api/cc_production/masters?type=reactors&id=${reactor.id}`, { headers: { [LOCK]: reactor.updatedAt } })
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: string }).error).toMatch(/resin batches/)
    expect((await request.post('/api/cc_production/resin/batches/action', { data: { id: batch.id, action: 'delete' }, headers: { [LOCK]: batch.updatedAt } })).ok()).toBeTruthy()
    expect((await request.delete(`/api/cc_production/masters?type=reactors&id=${reactor.id}`, { headers: { [LOCK]: reactor.updatedAt } })).ok()).toBeTruthy()
    const current = ((await (await request.get('/api/cc_production/masters?type=moulds')).json()) as { items: Array<{ id: string; updatedAt: string }> }).items.find((item) => item.id === mouldId)!
    expect((await request.delete(`/api/cc_production/masters?type=moulds&id=${mouldId}`, { headers: { [LOCK]: current.updatedAt } })).ok()).toBeTruthy()
  })

  test('settings changes are logged; an undo is refused when changed again since, needs a reason and restores the old value', async ({ request }) => {
    const original = (await listOptions(request, 'operators')).options
    const extra = { value: `E2E18 op ${stamp}`, active: true }
    expect((await saveOptions(request, 'operators', [...original, extra])).ok()).toBeTruthy()
    const first = (await changes(request, 'list')).find((item) => item.key === 'operators')!
    expect(first.changes.some((change) => change.to === extra.value)).toBeTruthy()
    expect((await saveOptions(request, 'operators', [...original, { ...extra, active: false }])).ok()).toBeTruthy()
    const second = (await changes(request, 'list')).find((item) => item.key === 'operators')!
    expect(second.id).not.toBe(first.id)
    const blocked = await undoChange(request, first.id, 'Typed by mistake')
    expect(blocked.status()).toBe(409)
    expect(((await blocked.json()) as { error: string }).error).toMatch(/Changed again since/)
    expect((await undoChange(request, second.id)).status()).toBe(400)
    const undoSecond = await undoChange(request, second.id, 'Should stay active')
    expect(undoSecond.ok(), await undoSecond.text()).toBeTruthy()
    expect((await undoChange(request, first.id, 'Typed by mistake')).ok()).toBeTruthy()
    expect((await listOptions(request, 'operators')).options.map((option) => option.value)).toEqual(original.map((option) => option.value))
    expect((await undoChange(request, first.id, 'Again')).status()).toBe(409)

    const series = (await (await request.get('/api/cc_accounts/number-series')).json()) as { items: Array<{ key: string; prefix: string; suffix: string | null; pad: number; startAt: number }>; updatedAt: string }
    const dn = series.items.find((item) => item.key === 'DN')!
    const items = series.items.map((item) => ({ key: item.key, prefix: item.prefix, suffix: item.suffix, pad: item.pad, startAt: item.startAt }))
    const changed = await request.put('/api/cc_accounts/number-series', { data: { items: items.map((item) => (item.key === 'DN' ? { ...item, prefix: `E2E${stamp % 1000}/` } : item)) }, headers: { [LOCK]: series.updatedAt } })
    expect(changed.ok(), await changed.text()).toBeTruthy()
    const logged = (await changes(request, 'series')).find((item) => item.key === 'DN')!
    expect(logged.changes).toEqual([expect.objectContaining({ field: 'prefix', from: dn.prefix })])
    expect((await undoChange(request, logged.id, 'Wrong prefix')).ok()).toBeTruthy()
    const after = (await (await request.get('/api/cc_accounts/number-series')).json()) as { items: Array<{ key: string; prefix: string }> }
    expect(after.items.find((item) => item.key === 'DN')?.prefix).toBe(dn.prefix)
  })

  test('access changes are logged with the person who made them; a rights change is undone with a reason', async ({ request }) => {
    const role = await request.post('/api/auth/roles', { data: { name: `E2E18 role ${stamp}` } })
    expect(role.ok(), await role.text()).toBeTruthy()
    const roleId = ((await role.json()) as { id: string }).id
    const log = (body: Record<string, unknown>) => request.post('/api/cc_departments/access-log', { data: { subjectType: 'role', subjectId: roleId, ...body } })
    expect((await log({ phase: 'before' })).ok()).toBeTruthy()
    expect((await request.put('/api/auth/roles/acl', { data: { roleId, features: ['cc_store.view', 'cc_store.adjust'] } })).ok()).toBeTruthy()
    const granted = ((await (await log({ phase: 'after' })).json()) as { change: AccessChange }).change
    expect(granted.action).toBe('right_granted')
    expect(granted.changes.map((change) => change.field).sort()).toEqual(['feature:cc_store.adjust', 'feature:cc_store.view'])
    const audit = await activity(request, 'access_role', roleId)
    expect(audit[0].action).toBe('right_granted')

    expect((await log({ phase: 'before' })).ok()).toBeTruthy()
    expect((await request.put('/api/auth/roles/acl', { data: { roleId, features: [] } })).ok()).toBeTruthy()
    expect((await log({ phase: 'after', undoOf: granted.id })).status()).toBe(400)
    const undone = ((await (await log({ phase: 'after', undoOf: granted.id, reason: 'Granted to the wrong department' })).json()) as { change: AccessChange }).change
    expect(undone).toMatchObject({ action: 'undone', reason: 'Granted to the wrong department' })
    const items = ((await (await request.get(`/api/cc_departments/access-log?subjectType=role&subjectId=${roleId}`)).json()) as { items: AccessChange[] }).items
    expect(items.find((item) => item.id === granted.id)?.undoneAt).toBeTruthy()

    const email = `e2e18-${stamp}@example.com`
    const person = await request.post('/api/auth/users', { data: { email, name: `E2E18 Person ${stamp}`, password: 'Access!Test9pass', organizationId: process.env.CC_ORG, roles: [`E2E18 role ${stamp}`] } })
    expect(person.status(), await person.text()).toBeLessThan(300)
    const userId = ((await person.json()) as { id: string }).id
    expect((await request.put('/api/auth/users', { data: { id: userId, roles: ['Store & despatch'] } })).ok()).toBeTruthy()
    expect((await request.delete(`/api/auth/users?id=${userId}`)).ok()).toBeTruthy()
    const personLog = ((await (await request.get(`/api/cc_departments/access-log?subjectType=user&subjectId=${userId}`)).json()) as { items: AccessChange[] }).items.map((item) => item.action)
    expect(personLog).toEqual(expect.arrayContaining(['person_added', 'department_changed', 'person_removed']))
    expect((await request.delete(`/api/auth/roles?id=${roleId}`)).ok()).toBeTruthy()
  })

  test('the pages open', async ({ request }) => {
    for (const path of ['/backend/settings/changes', '/backend/masters/access']) expect((await request.get(path)).status(), path).toBe(200)
  })
})
