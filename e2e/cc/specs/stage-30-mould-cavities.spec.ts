import { expect, test } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const DIE = `E2E30-${stamp}`
const DATE = `${2100 + (stamp % 800)}-03-09`

test.describe.serial('Moulds with cavities: pieces per shot on the moulding entry', () => {
  let mouldId: string
  let updatedAt: string

  test('a mould keeps its cavity count and the die lookup gives it', async ({ request }) => {
    const created = await request.post('/api/cc_production/masters', { data: { type: 'moulds', values: { dieNo: DIE, mouldType: 'die', description: 'Tube mould', cavities: 6 } } })
    expect(created.ok(), await created.text()).toBeTruthy()
    const row = (await created.json()) as { id: string; updatedAt: string; cavities: number }
    mouldId = row.id
    updatedAt = row.updatedAt
    expect(row.cavities).toBe(6)
    const lookup = (await (await request.get(`/api/cc_production/moulding/dies?lookup=${DIE}`)).json()) as { items: Array<{ found: boolean; cavities: number | null }> }
    expect(lookup.items[0]).toEqual(expect.objectContaining({ found: true, cavities: 6 }))
  })

  test('on the machine card, shots × 6 fill the pieces and an odd count is flagged', async ({ page }) => {
    await page.goto(`/backend/moulding?date=${DATE}&shift=1`)
    await expect(page.getByText('Add a machine that ran this shift')).toBeVisible({ timeout: 60_000 })
    await page.getByRole('radio', { name: 'Machine cards' }).click()
    await page.getByRole('button', { name: '5', exact: true }).click()
    const card = page.locator('article').filter({ hasText: 'Machine 5' })
    await card.getByLabel('Die No.').fill(DIE)
    await card.getByLabel('Die No.').blur()
    await expect(card.getByText('6 cavities: one shot makes 6 pieces.')).toBeVisible({ timeout: 30_000 })
    await card.getByLabel('Shots').fill('3')
    await expect(card.getByLabel('Shift Prod.')).toHaveValue('18')
    await card.getByLabel('Shift Prod.').fill('17')
    await expect(card.getByText(/Not a whole number of shots of 6/)).toBeVisible()
  })

  test('cleanup: the test mould is retired', async ({ request }) => {
    const retired = await request.put('/api/cc_production/masters', { data: { type: 'moulds', id: mouldId, values: { isActive: false }, reason: 'E2E cleanup' }, headers: { [LOCK]: updatedAt } })
    expect(retired.ok(), await retired.text()).toBeTruthy()
  })
})
