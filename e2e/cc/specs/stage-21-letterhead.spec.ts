import { expect, test } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

type Company = Record<string, unknown> & { updatedAt: string; letterhead: Record<string, string | boolean> }

test.describe.serial('Phase H · company letterhead and number formats from the client papers', () => {
  test('the logo and ISO badges are served for the prints', async ({ request }) => {
    for (const path of ['/ccpl-logo.png', '/ccpl-iso-badges.png']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      expect(response.headers()['content-type']).toContain('image/png')
    }
  })

  test('company details carry the letterhead lines', async ({ request }) => {
    const company = (await (await request.get('/api/cc_accounts/company')).json()) as Company
    expect(company.letterhead).toMatchObject({ logoUrl: expect.any(String), badgesUrl: expect.any(String), showBadges: expect.any(Boolean) })
    for (const key of ['cin', 'udyam', 'stateName', 'stateCode', 'worksAddress', 'declaration', 'jurisdiction', 'directors', 'labPeople', 'certifications', 'sisterConcern', 'bankLabel']) expect(company.letterhead, key).toHaveProperty(key)
  })

  test('letterhead lines and images save, are logged, and an unsafe image is refused', async ({ request }) => {
    const before = (await (await request.get('/api/cc_accounts/company')).json()) as Company
    const body = { ...before, letterhead: { ...before.letterhead, stateCode: '24', udyam: 'GJ-01-0035034 (Micro) E2E', signatureUrl: TINY_PNG } }
    const saved = await request.put('/api/cc_accounts/company', { data: body, headers: { [LOCK]: before.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const after = (await saved.json()) as Company
    expect(after.letterhead.udyam).toBe('GJ-01-0035034 (Micro) E2E')
    expect(after.letterhead.signatureUrl).toBe(TINY_PNG)
    const bad = await request.put('/api/cc_accounts/company', { data: { ...after, letterhead: { ...after.letterhead, logoUrl: 'javascript:alert(1)' } }, headers: { [LOCK]: after.updatedAt } })
    expect(bad.status()).toBe(400)
    const changes = ((await (await request.get('/api/cc_audit/settings-changes?area=company')).json()) as { items: Array<{ id: string; changes: Array<{ field: string; to: unknown }> }> }).items
    const logged = changes.find((change) => change.changes.some((entry) => entry.field === 'letterhead.udyam' && entry.to === 'GJ-01-0035034 (Micro) E2E'))
    expect(logged).toBeTruthy()
    const undone = await request.post('/api/cc_audit/settings-changes', { data: { id: logged!.id, reason: 'E2E puts the letterhead back' } })
    expect(undone.ok(), await undone.text()).toBeTruthy()
    const back = (await (await request.get('/api/cc_accounts/company')).json()) as Company
    expect(back.letterhead.udyam).toBe(before.letterhead.udyam)
    expect(back.letterhead.signatureUrl).toBe(before.letterhead.signatureUrl)
  })

  test('quotation, proforma, invoice and purchase order numbers follow the client formats', async ({ request }) => {
    const series = ((await (await request.get('/api/cc_accounts/number-series')).json()) as { items: Array<{ key: string; next: string }> }).items
    const next = Object.fromEntries(series.map((entry) => [entry.key, entry.next]))
    expect(next.QT).toMatch(/^CCPL\/\d{4}-\d{4}\/MS\/\d{3}$/)
    expect(next.PI).toMatch(/^\d{3,}$/)
    expect(next.INV).toMatch(/^\d{3,}$/)
    expect(next.PO).toMatch(/^CCCPL\/A\/\d{3}\/\d{4}-\d{2}$/)
  })

  test('the company page opens', async ({ request }) => {
    expect((await request.get('/backend/accounts/company')).status()).toBe(200)
  })
})
