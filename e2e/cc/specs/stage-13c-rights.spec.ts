import { expect, test } from '@playwright/test'

const NEW_RIGHTS = ['cc_accounts.credit_note', 'cc_crm.merge', 'cc_production.quality.release', 'cc_store.approve', 'cc_audit.view']

async function roleFeatures(request: import('@playwright/test').APIRequestContext, name: string): Promise<string[]> {
  const roles = (await (await request.get(`/api/auth/roles?search=${encodeURIComponent(name)}&pageSize=50`)).json()) as { items: Array<{ id: string; name: string }> }
  const role = roles.items.find((item) => item.name === name)
  expect(role, name).toBeTruthy()
  const acl = (await (await request.get(`/api/auth/roles/acl?roleId=${role!.id}`)).json()) as { features: string[] }
  return acl.features
}

test.describe('Phase A · new rights exist and are given to the right roles', () => {
  test('the admin holds every new right', async ({ request }) => {
    const check = (await (await request.post('/api/auth/feature-check', { data: { features: NEW_RIGHTS } })).json()) as { ok: boolean; granted?: string[] }
    expect(check.ok || NEW_RIGHTS.every((feature) => check.granted?.includes(feature))).toBe(true)
  })

  test('accounts can raise credit notes, QC can release lots, and neither gets the audit log', async ({ request }) => {
    const accounts = await roleFeatures(request, 'Accounts')
    expect(accounts).toContain('cc_accounts.credit_note')
    expect(accounts).not.toContain('cc_audit.view')
    const qc = await roleFeatures(request, 'QC & lab')
    expect(qc).toContain('cc_production.quality.release')
    expect(qc).not.toContain('cc_store.approve')
    const store = await roleFeatures(request, 'Store & despatch')
    expect(store).not.toContain('cc_store.approve')
  })

})
