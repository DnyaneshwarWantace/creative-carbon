import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const YEAR = 2001 + (stamp % 7)
const DAY = `${YEAR}-${String(1 + (stamp % 12)).padStart(2, '0')}-${String(1 + (stamp % 27)).padStart(2, '0')}`

type Mode = 'ok' | 'refuse' | 'partial'
type Push = { id: string; code: string; status: 'sent' | 'partial' | 'failed'; voucherCount: number; documents: Array<{ number: string; type: string; recordId: string | null }>; attempts: Array<{ status: string; error: string | null; created: number }>; lastAttempt: { error: string | null; lineErrors: string[] } | null; requestXml?: string; error?: string }
type Settings = { url: string | null; company: string | null; ledgers: Record<string, string> }

function tallyMock() {
  const state = { mode: 'ok' as Mode, bodies: [] as string[] }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      state.bodies.push(body)
      const vouchers = (body.match(/<VOUCHER /g) ?? []).length
      res.writeHead(200, { 'content-type': 'text/xml' })
      if (state.mode === 'ok') res.end(`<RESPONSE><CREATED>${vouchers}</CREATED><ALTERED>0</ALTERED><DELETED>0</DELETED><LASTVCHID>1</LASTVCHID><ERRORS>0</ERRORS></RESPONSE>`)
      else if (state.mode === 'refuse') res.end(`<RESPONSE><LINEERROR>Ledger 'Sales @ GST' does not exist!</LINEERROR><CREATED>0</CREATED><ALTERED>0</ALTERED><ERRORS>${vouchers}</ERRORS></RESPONSE>`)
      else res.end(`<RESPONSE><LINEERROR>Voucher date is outside the financial year</LINEERROR><CREATED>${vouchers - 1}</CREATED><ALTERED>0</ALTERED><ERRORS>1</ERRORS></RESPONSE>`)
    })
  })
  return { state, server }
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function freePort(): Promise<string> {
  const probe = http.createServer()
  const url = await listen(probe)
  await new Promise((resolve) => probe.close(resolve))
  return url
}

async function invoice(request: APIRequestContext, orderId: string, lineId: string, quantity: number): Promise<{ id: string; code: string }> {
  const created = await request.post('/api/cc_accounts/invoices', { data: { orderId, invoiceDate: DAY, lines: [{ orderLineId: lineId, quantity }] } })
  expect(created.status(), await created.text()).toBe(201)
  const body = (await created.json()) as { id: string; code: string; updatedAt?: string }
  const issued = await request.post('/api/cc_accounts/invoices/action', { data: { id: body.id, action: 'issue' }, headers: body.updatedAt ? { [LOCK]: body.updatedAt } : {} })
  expect(issued.ok(), await issued.text()).toBeTruthy()
  return body
}

async function push(request: APIRequestContext, data: Record<string, unknown> = {}) {
  return request.post('/api/cc_accounts/tally/pushes', { data: { from: DAY, to: DAY, kinds: ['sales'], masters: true, ...data } })
}

test.describe.serial('Stage 11 · Tally push, logged, retried, never twice', () => {
  const mock = tallyMock()
  let mockUrl: string
  let before: Settings
  let orderId: string
  let lineId: string
  let first: { id: string; code: string }
  let failedId: string

  test.beforeAll(async () => {
    mockUrl = await listen(mock.server)
  })

  test.afterAll(async ({ request }) => {
    mock.server.close()
    if (before) await request.put('/api/cc_accounts/tally/settings', { data: { url: before.url, company: before.company } })
  })

  test('fixtures: an order with a rate, invoiced on a far-past day', async ({ request }) => {
    before = (await (await request.get('/api/cc_accounts/tally/settings')).json()) as Settings
    const customer = await request.post('/api/customers/companies', { data: { displayName: `E2E11 Tally ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(customer.ok(), await customer.text()).toBeTruthy()
    const customerId = ((await customer.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).json()) as { items: Array<{ id: string; title: string }> }).items
    const productId = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const created = await request.post('/api/cc_orders/orders', { data: { orderDate: DAY, customerId, lines: [{ productId, quantity: 30, rate: 310, gstPercent: 18, specs: { material: { form: 'Sheet', grade: 'Fabric', weave: '10x10', sheet_size: '8x4', thickness_mm: '10' } } }] } })
    expect(created.status(), await created.text()).toBe(201)
    orderId = ((await created.json()) as { id: string }).id
    const order = (await (await request.get(`/api/cc_orders/orders?id=${orderId}`)).json()) as { lines: Array<{ id: string }> }
    lineId = order.lines[0].id
    first = await invoice(request, orderId, lineId, 10)
  })

  test('settings: the Tally address is checked and saved for everyone', async ({ request }) => {
    const bad = await request.put('/api/cc_accounts/tally/settings', { data: { url: 'ftp://tally' } })
    expect(bad.status()).toBe(400)
    const down = await freePort()
    const saved = await request.put('/api/cc_accounts/tally/settings', { data: { url: down.replace('http://', ''), company: 'CCCPL E2E' } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    expect(((await saved.json()) as Settings).url).toBe(down)
  })

  test('Tally not reachable: the push is logged as not sent with the reason', async ({ request }) => {
    const response = await push(request)
    expect(response.status(), await response.text()).toBe(201)
    const failed = (await response.json()) as Push
    expect(failed.status).toBe('failed')
    expect(failed.code).toMatch(/^TP-\d{4}$/)
    expect(failed.documents.map((doc) => doc.number)).toEqual([first.code])
    expect(failed.documents[0].recordId).toBe(first.id)
    expect(failed.lastAttempt?.error).toMatch(/Could not reach Tally/)
    failedId = failed.id
  })

  test('retry after Tally is back: sent, and Tally got the voucher and the party ledger', async ({ request }) => {
    await request.put('/api/cc_accounts/tally/settings', { data: { url: mockUrl } })
    const response = await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: failedId } })
    expect(response.ok(), await response.text()).toBeTruthy()
    const sent = (await response.json()) as Push
    expect(sent.status).toBe('sent')
    expect(sent.attempts.map((attempt) => attempt.status)).toEqual(['failed', 'sent'])
    const body = mock.state.bodies.at(-1) ?? ''
    expect(body).toContain(`<VOUCHERNUMBER>${first.code}</VOUCHERNUMBER>`)
    expect(body).toContain(`E2E11 Tally ${stamp}`)
    expect(body).toContain('<SVCURRENTCOMPANY>CCCPL E2E</SVCURRENTCOMPANY>')
    const again = await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: failedId } })
    expect(again.status()).toBe(409)
  })

  test('the same entries are never sent twice; the preview marks them as in Tally', async ({ request }) => {
    const twice = await push(request)
    expect(twice.status()).toBe(409)
    expect(((await twice.json()) as { error: string }).error).toMatch(/already in Tally/)
    const preview = (await (await request.get(`/api/cc_accounts/tally?from=${DAY}&to=${DAY}&kinds=sales&format=summary`)).json()) as { inTally: Record<string, string>; newCount: number }
    expect(Object.keys(preview.inTally)).toContain(`Sales:${first.code}`)
    expect(preview.newCount).toBe(0)
  })

  test('Tally refuses: logged with Tally’s own words, nothing marked as sent, retry works', async ({ request }) => {
    const second = await invoice(request, orderId, lineId, 10)
    mock.state.mode = 'refuse'
    const refused = (await (await push(request)).json()) as Push
    expect(refused.status).toBe('failed')
    expect(refused.documents.map((doc) => doc.number)).toEqual([second.code])
    expect(refused.lastAttempt?.lineErrors[0]).toMatch(/does not exist/)
    mock.state.mode = 'ok'
    const retried = (await (await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: refused.id } })).json()) as Push
    expect(retried.status).toBe('sent')
  })

  test('Tally takes part of a push: marked partly sent and cannot be resent as a whole', async ({ request }) => {
    const third = await invoice(request, orderId, lineId, 5)
    const fourth = await invoice(request, orderId, lineId, 5)
    mock.state.mode = 'partial'
    const partial = (await (await push(request)).json()) as Push
    expect(partial.status).toBe('partial')
    expect(partial.documents.map((doc) => doc.number).sort()).toEqual([third.code, fourth.code].sort())
    const retry = await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: partial.id } })
    expect(retry.status()).toBe(409)
    expect(((await retry.json()) as { error: string }).error).toMatch(/double/)
    mock.state.mode = 'ok'
    const onlyOne = (await (await push(request, { again: [`Sales:${fourth.code}`] })).json()) as Push
    expect(onlyOne.status).toBe('sent')
    expect(onlyOne.documents.map((doc) => doc.number)).toEqual([fourth.code])
  })

  test('the push log and detail page open', async ({ request }) => {
    const list = (await (await request.get('/api/cc_accounts/tally/pushes?pageSize=5')).json()) as { items: Push[] }
    expect(list.items.length).toBeGreaterThan(0)
    const detail = (await (await request.get(`/api/cc_accounts/tally/pushes?id=${failedId}`)).json()) as Push
    expect(detail.requestXml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>')
    for (const path of ['/backend/accounts/tally', `/backend/accounts/tally/${failedId}`]) {
      expect((await request.get(path)).status(), path).toBe(200)
    }
  })
})
