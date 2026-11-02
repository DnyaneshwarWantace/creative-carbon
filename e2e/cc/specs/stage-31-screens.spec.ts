import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const FAR = `${3000 + (Math.floor(stamp / 1000) % 5000)}-0${1 + (stamp % 9)}-1${stamp % 9}`
const MODULES = path.resolve(__dirname, '../../../apps/mercato/src/modules')

function staticRoutes(): string[] {
  const routes = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'page.meta.ts' && !full.includes('[')) {
        const after = full.split(`${path.sep}backend`)[1]
        if (after !== undefined) routes.add(`/backend${path.dirname(after).replace(/\\/g, '/')}`.replace(/\/\.$/, '').replace(/\/$/, '') || '/backend')
      }
    }
  }
  for (const module of fs.readdirSync(MODULES)) {
    if (!module.startsWith('cc_')) continue
    const backend = path.join(MODULES, module, 'backend')
    if (fs.existsSync(backend)) walk(backend)
  }
  return [...routes].sort()
}

async function firstId(request: APIRequestContext, url: string): Promise<string | null> {
  const response = await request.get(url)
  if (!response.ok()) return null
  const body = (await response.json()) as { items?: Array<{ id: string }> }
  return body.items?.[0]?.id ?? null
}

async function detailRoutes(request: APIRequestContext): Promise<string[]> {
  const pairs: Array<[string, string]> = [
    ['/api/cc_orders/orders?pageSize=1', '/backend/orders/'],
    ['/api/cc_crm/enquiries?pageSize=1', '/backend/crm/enquiries/'],
    ['/api/cc_crm/quotations?pageSize=1', '/backend/crm/quotations/'],
    ['/api/cc_purchase/orders?pageSize=1', '/backend/purchase/orders/'],
    ['/api/cc_purchase/grns?pageSize=1', '/backend/purchase/grns/'],
    ['/api/cc_production/resin/batches', '/backend/resin/batches/'],
    ['/api/cc_production/press/batches', '/backend/press/batches/'],
    ['/api/cc_production/lab', '/backend/quality/lab/'],
    ['/api/cc_production/tc', '/backend/quality/tc/'],
    ['/api/cc_accounts/invoices?pageSize=1', '/backend/accounts/invoices/'],
    ['/api/cc_accounts/proformas?pageSize=1', '/backend/accounts/proformas/'],
  ]
  const routes: string[] = []
  for (const [api, page] of pairs) {
    const id = await firstId(request, api)
    if (id) routes.push(`${page}${id}`)
  }
  return routes
}

async function openAndCheck(page: Page, route: string): Promise<string[]> {
  const problems: string[] = []
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/ERR_NETWORK_IO_SUSPENDED|favicon|ERR_ABORTED|net::ERR_FAILED|WebSocket is already in CLOSING/i.test(text)) return
    problems.push(`console: ${text.replace(/\s+/g, ' ').slice(0, 160)}`)
  }
  const onPageError = (error: Error) => problems.push(`page error: ${error.message.slice(0, 160)}`)
  const onResponse = (response: { url(): string; status(): number }) => {
    if (response.url().includes('/api/') && response.status() >= 500) problems.push(`${response.status()} ${response.url().split('/api/')[1]?.slice(0, 80)}`)
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('response', onResponse)
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => undefined)
    await page.waitForTimeout(800)
    if (page.url().includes('/login')) problems.push('sent to the login page')
    const text = await page.locator('body').innerText().catch(() => '')
    const shown = text.match(/Could not (load|save)[^\n]{0,80}|Something went wrong[^\n]{0,60}|Application error[^\n]{0,60}/i)
    if (shown) problems.push(`shows "${shown[0]}"`)
  } finally {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('response', onResponse)
  }
  return problems
}

test.describe('Every screen, in a real browser', () => {
  test('every page in the menus and the main record pages open without an error', async ({ page, request }) => {
    test.setTimeout(1_200_000)
    const routes = [...staticRoutes(), ...(await detailRoutes(request))]
    expect(routes.length).toBeGreaterThan(70)
    const failures: string[] = []
    for (const route of routes) {
      const problems = await openAndCheck(page, route)
      if (problems.length) failures.push(`${route}: ${[...new Set(problems)].join(' | ')}`)
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})

test.describe.serial('Typing into the screens the way people will', () => {
  test('CRM: log an enquiry on the form and land on its page', async ({ page }) => {
    const company = `UI Enquiry Co ${stamp}`
    await page.goto('/backend/crm/enquiries/new')
    await page.getByRole('combobox', { name: 'Source' }).click()
    await page.getByRole('option').nth(1).click()
    await page.getByLabel('Company (new party)').fill(company)
    await page.getByLabel('Asked for').fill('Fabric 10x10 sheets 12 mm, 300 kg')
    await page.getByRole('button', { name: 'Save enquiry' }).click()
    await expect(page).toHaveURL(/\/backend\/crm\/enquiries\/[0-9a-f-]{36}$/, { timeout: 60_000 })
    await expect(page.getByText(company).first()).toBeVisible({ timeout: 30_000 })
  })

  test('Resin: a batch typed on the form saves as a draft', async ({ page }) => {
    await page.goto('/backend/resin/batches/new')
    await page.getByLabel('Phenol kg').fill('120')
    await page.getByLabel('Formaldehyde kg').fill('140')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page).toHaveURL(/\/backend\/resin\/batches\/[0-9a-f-]{36}/, { timeout: 60_000 })
    await expect(page.getByText(/not posted|draft/i).first()).toBeVisible({ timeout: 30_000 })
  })

  test('Coating: a roll added on the dryer card saves on the sheet', async ({ page, request }) => {
    await page.goto(`/backend/coating?date=${FAR}`)
    await page.getByRole('radio', { name: 'Roll cards' }).click()
    await page.getByRole('button', { name: 'Add a roll' }).click()
    const roll = page.locator('article').filter({ hasText: 'Roll 1' })
    await roll.getByRole('combobox', { name: '1 cloth' }).click()
    await page.getByRole('option').nth(1).click()
    await roll.getByLabel('1 rawKg').fill('100')
    await roll.getByLabel('1 coatedNos').fill('40')
    await roll.getByLabel('1 RC').fill('45')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved.').first()).toBeVisible({ timeout: 30_000 })
    const list = (await (await request.get(`/api/cc_production/coating/sheets?date=${FAR}`)).json()) as { items: Array<{ id: string; updatedAt?: string }> }
    expect(list.items.length).toBeGreaterThan(0)
    for (const sheet of list.items) {
      const view = (await (await request.get(`/api/cc_production/coating/sheets?id=${sheet.id}`)).json()) as { updatedAt: string }
      await request.post('/api/cc_production/coating/sheets/action', { data: { id: sheet.id, action: 'delete' }, headers: { [LOCK]: view.updatedAt } })
    }
  })

  test('Moulding: a machine card with a die and pieces saves for the shift', async ({ page, request }) => {
    const moulds = (await (await request.get('/api/cc_production/masters?type=moulds&pageSize=5')).json()) as { items: Array<{ dieNo: string; isActive?: boolean }> }
    const die = moulds.items.find((mould) => mould.isActive !== false)?.dieNo
    test.skip(!die, 'no mould in the masters')
    await page.goto(`/backend/moulding?date=${FAR}&shift=1`)
    await page.getByRole('radio', { name: 'Machine cards' }).click()
    await page.getByRole('button', { name: '7', exact: true }).click()
    const card = page.locator('article').filter({ hasText: 'Machine 7' })
    await card.getByLabel('Die No.').fill(die!)
    await card.getByLabel('Die No.').blur()
    await card.getByLabel('Weight of Article').fill('0.5')
    await card.getByLabel('Shift Prod.').fill('12')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved.').first()).toBeVisible({ timeout: 30_000 })
    const day = (await (await request.get(`/api/cc_production/moulding?date=${FAR}`)).json()) as { shifts: Array<{ shift: number; version: string; entries: Array<{ pressNumber: number; productionNos: number }> }> }
    const shift = day.shifts.find((entry) => entry.shift === 1)!
    expect(shift.entries.find((entry) => entry.pressNumber === 7)?.productionNos).toBe(12)
    await request.put('/api/cc_production/moulding', { data: { entryDate: FAR, shift: 1, entries: [] }, headers: { [LOCK]: shift.version } })
  })
})
