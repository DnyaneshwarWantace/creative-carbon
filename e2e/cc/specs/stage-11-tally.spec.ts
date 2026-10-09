import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const YEAR = 2001 + (stamp % 7)
const DAY = `${YEAR}-${String(1 + (stamp % 12)).padStart(2, '0')}-${String(1 + (stamp % 27)).padStart(2, '0')}`
const COMPANY = 'CCCPL E2E'
const BASE_LEDGERS = ['Sales @ GST', 'Export Sales', 'Purchase @ GST', 'Output CGST', 'Output SGST', 'Output IGST', 'Input CGST', 'Input SGST', 'Input IGST', 'Bank Account', 'Round Off', 'Cash']

type Mode = 'ok' | 'refuse' | 'partial'
type MockVoucher = { remoteId: string; type: string; number: string; date: string; party: string; amount: number }
type Push = { id: string; code: string; status: 'sent' | 'partial' | 'failed'; voucherCount: number; partyCount: number; documents: Array<{ number: string; type: string; recordId: string | null }>; attempts: Array<{ status: string; error: string | null; created: number; altered: number }>; lastAttempt: { error: string | null; lineErrors: string[] } | null; requestXml?: string; error?: string }
type Settings = { mode: 'direct' | 'bridge'; url: string | null; company: string | null; ledgers: Record<string, string> }

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function unesc(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function tallyMock() {
  const state = { mode: 'ok' as Mode, ledgers: new Set(BASE_LEDGERS), vouchers: new Map<string, MockVoucher>(), imports: [] as string[] }
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/xml' })
      if (body.includes('<TALLYREQUEST>Export</TALLYREQUEST>')) {
        const company = body.match(/<SVCURRENTCOMPANY>([^<]*)<\/SVCURRENTCOMPANY>/)?.[1]
        if (company && unesc(company) !== COMPANY) return res.end(`<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>0</STATUS></HEADER><BODY><DATA><LINEERROR>Could not find Company '${company}'</LINEERROR></DATA></BODY></ENVELOPE>`)
        const wrap = (inner: string) => `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DESC></DESC><DATA><COLLECTION>${inner}</COLLECTION></DATA></BODY></ENVELOPE>`
        if (body.includes('<ID>CCCPLCompanies</ID>')) return res.end(wrap(`<COMPANY NAME="${COMPANY}"><NAME>${COMPANY}</NAME></COMPANY>`))
        if (body.includes('<ID>CCCPLLedgers</ID>')) return res.end(wrap([...state.ledgers].map((name) => `<LEDGER NAME="${esc(name)}" RESERVEDNAME=""><PARENT TYPE="String">Sundry Debtors</PARENT></LEDGER>`).join('')))
        if (body.includes('<ID>CCCPLVouchers</ID>')) {
          return res.end(wrap([...state.vouchers.values()].map((v) => `<VOUCHER REMOTEID="${esc(v.remoteId)}" VCHTYPE="${v.type}"><DATE TYPE="Date">${v.date.replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(v.number)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(v.party)}</PARTYLEDGERNAME><AMOUNT>${v.amount.toFixed(2)}</AMOUNT><ISCANCELLED>No</ISCANCELLED></VOUCHER>`).join('')))
        }
        return res.end(wrap(''))
      }
      state.imports.push(body)
      const errors: string[] = []
      let created = 0
      let altered = 0
      for (const match of body.matchAll(/<LEDGER NAME="([^"]*)"/g)) {
        const name = unesc(match[1])
        if (state.ledgers.has(name)) errors.push(`Ledger '${name}' already exists`)
        else {
          state.ledgers.add(name)
          created += 1
        }
      }
      const vouchers = [...body.matchAll(/<VOUCHER REMOTEID="([^"]*)" VCHTYPE="([^"]*)"[\s\S]*?<DATE>(\d{8})<\/DATE>[\s\S]*?<VOUCHERNUMBER>([^<]*)<\/VOUCHERNUMBER>[\s\S]*?<PARTYLEDGERNAME>([^<]*)<\/PARTYLEDGERNAME>([\s\S]*?)<\/VOUCHER>/g)]
      vouchers.forEach((match, index) => {
        if (state.mode === 'refuse' || (state.mode === 'partial' && index === vouchers.length - 1)) {
          errors.push(state.mode === 'refuse' ? "Ledger 'Sales @ GST' does not exist!" : 'Voucher date is outside the financial year')
          return
        }
        const party = unesc(match[5])
        const partyEntry = [...match[6].matchAll(/<LEDGERNAME>([^<]*)<\/LEDGERNAME><ISDEEMEDPOSITIVE>[^<]*<\/ISDEEMEDPOSITIVE><AMOUNT>([^<]*)<\/AMOUNT>/g)].find((entry) => unesc(entry[1]) === party)
        const d = match[3]
        const voucher = { remoteId: unesc(match[1]), type: match[2], number: unesc(match[4]), date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, party, amount: Math.abs(Number(partyEntry?.[2] ?? 0)) }
        if (state.vouchers.has(voucher.remoteId)) altered += 1
        else created += 1
        state.vouchers.set(voucher.remoteId, voucher)
      })
      res.end(`<RESPONSE>${errors.map((error) => `<LINEERROR>${error}</LINEERROR>`).join('')}<CREATED>${created}</CREATED><ALTERED>${altered}</ALTERED><DELETED>0</DELETED><LASTVCHID>0</LASTVCHID><ERRORS>${errors.length}</ERRORS></RESPONSE>`)
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

test.describe.serial('Stage 11 · Tally: two-way, logged, never twice, direct or through the bridge', () => {
  const mock = tallyMock()
  let mockUrl: string
  let before: Settings
  let orderId: string
  let lineId: string
  let first: { id: string; code: string }
  let failedId: string
  const party = `E2E11 Tally ${stamp}`

  test.beforeAll(async () => {
    mockUrl = await listen(mock.server)
  })

  test.afterAll(async ({ request }) => {
    mock.server.close()
    if (before) await request.put('/api/cc_accounts/tally/settings', { data: { mode: before.mode, url: before.url, company: before.company, ledgers: before.ledgers } })
  })

  test('fixtures: an order with a rate, invoiced on a far-past day', async ({ request }) => {
    before = (await (await request.get('/api/cc_accounts/tally/settings')).json()) as Settings
    const customer = await request.post('/api/customers/companies', { data: { displayName: party, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
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

  test('settings: the address is checked, ledger names and company saved for everyone', async ({ request }) => {
    expect((await request.put('/api/cc_accounts/tally/settings', { data: { url: 'ftp://tally' } })).status()).toBe(400)
    const down = await freePort()
    const saved = await request.put('/api/cc_accounts/tally/settings', { data: { mode: 'direct', url: down.replace('http://', ''), company: COMPANY, ledgers: Object.fromEntries(Object.keys(before.ledgers).map((key) => [key, ''])) } })
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
    expect(failed.lastAttempt?.error).toMatch(/Could not reach Tally/)
    failedId = failed.id
  })

  test('connection test reads the companies and ledgers from Tally', async ({ request }) => {
    await request.put('/api/cc_accounts/tally/settings', { data: { url: mockUrl } })
    const ok = (await (await request.post('/api/cc_accounts/tally/connection')).json()) as { ok: boolean; companies: string[]; ledgers: string[]; missing: string[] }
    expect(ok.ok).toBe(true)
    expect(ok.companies).toContain(COMPANY)
    expect(ok.ledgers).toContain('Sales @ GST')
    expect(ok.missing).toEqual([])
    await request.put('/api/cc_accounts/tally/settings', { data: { company: 'Some Other Co' } })
    const wrong = (await (await request.post('/api/cc_accounts/tally/connection')).json()) as { ok: boolean; error: string }
    expect(wrong.ok).toBe(false)
    expect(wrong.error).toMatch(/not open in Tally/)
    await request.put('/api/cc_accounts/tally/settings', { data: { company: COMPANY } })
  })

  test('a ledger that is not in Tally stops the send before anything goes', async ({ request }) => {
    await request.put('/api/cc_accounts/tally/settings', { data: { ledgers: { sales: 'Sales Local 18%' } } })
    const stopped = await push(request)
    expect(stopped.status()).toBe(400)
    expect(((await stopped.json()) as { error: string }).error).toMatch(/not in Tally.*Sales Local 18%/)
    await request.put('/api/cc_accounts/tally/settings', { data: { ledgers: { sales: 'Sales @ GST' } } })
  })

  test('retry: sent once, the party ledger is created, the voucher carries the ERP id', async ({ request }) => {
    const response = await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: failedId } })
    expect(response.ok(), await response.text()).toBeTruthy()
    const sent = (await response.json()) as Push
    expect(sent.status).toBe('sent')
    expect(sent.attempts.map((attempt) => attempt.status)).toEqual(['failed', 'sent'])
    expect(mock.state.ledgers.has(party)).toBe(true)
    const voucher = [...mock.state.vouchers.values()].find((entry) => entry.number === first.code)
    expect(voucher?.remoteId).toBe(`CCCPL-Sales-${first.code}`)
    expect((await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: failedId } })).status()).toBe(409)
  })

  test('never twice: the same entries are skipped and the preview marks them as in Tally', async ({ request }) => {
    const twice = await push(request)
    expect(twice.status()).toBe(409)
    expect(((await twice.json()) as { error: string }).error).toMatch(/already in Tally/)
    const preview = (await (await request.get(`/api/cc_accounts/tally?from=${DAY}&to=${DAY}&kinds=sales&format=summary`)).json()) as { inTally: Record<string, string>; newCount: number }
    expect(Object.keys(preview.inTally)).toContain(`Sales:${first.code}`)
    expect(preview.newCount).toBe(0)
  })

  test('Tally refuses: logged with Tally’s own words; the existing party ledger is not sent again', async ({ request }) => {
    const second = await invoice(request, orderId, lineId, 10)
    mock.state.mode = 'refuse'
    const refused = (await (await push(request)).json()) as Push
    expect(refused.status).toBe('failed')
    expect(refused.partyCount).toBe(0)
    expect(refused.documents.map((doc) => doc.number)).toEqual([second.code])
    expect(refused.lastAttempt?.lineErrors[0]).toMatch(/does not exist/)
    mock.state.mode = 'ok'
    const retried = (await (await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: refused.id } })).json()) as Push
    expect(retried.status).toBe('sent')
  })

  test('Tally takes part of a push: retry updates instead of copying', async ({ request }) => {
    const third = await invoice(request, orderId, lineId, 5)
    const fourth = await invoice(request, orderId, lineId, 5)
    mock.state.mode = 'partial'
    const partial = (await (await push(request)).json()) as Push
    expect(partial.status).toBe('partial')
    expect(partial.documents.map((doc) => doc.number).sort()).toEqual([third.code, fourth.code].sort())
    mock.state.mode = 'ok'
    const retried = (await (await request.post('/api/cc_accounts/tally/pushes/retry', { data: { id: partial.id } })).json()) as Push
    expect(retried.status).toBe('sent')
    expect(retried.attempts.at(-1)?.altered).toBe(1)
    expect([...mock.state.vouchers.values()].filter((entry) => entry.number === third.code)).toHaveLength(1)
  })

  test('check against Tally: matched, amount differs, only in Tally', async ({ request }) => {
    const firstVoucher = [...mock.state.vouchers.values()].find((entry) => entry.number === first.code)!
    mock.state.vouchers.set(firstVoucher.remoteId, { ...firstVoucher, amount: firstVoucher.amount + 500 })
    mock.state.vouchers.set('typed-in-tally', { remoteId: 'typed-in-tally', type: 'Sales', number: `MANUAL-${stamp}`, date: DAY, party, amount: 1000 })
    const response = await request.get(`/api/cc_accounts/tally/check?from=${DAY}&to=${DAY}&kinds=sales`)
    expect(response.ok(), await response.text()).toBeTruthy()
    const check = (await response.json()) as { rows: Array<{ number: string; status: string }> }
    const status = (number: string) => check.rows.find((row) => row.number === number)?.status
    expect(status(first.code)).toBe('amount_differs')
    expect(status(`MANUAL-${stamp}`)).toBe('only_in_tally')
    expect(check.rows.filter((row) => row.status === 'matched').length).toBeGreaterThanOrEqual(3)
  })

  test('bridge: an unknown key is refused; with a key, requests go through the bridge to Tally', async ({ request }) => {
    expect((await request.get('/api/cc_accounts/tally/bridge', { headers: { authorization: 'Bearer tb_notarealkeynotarealkey123' } })).status()).toBe(401)
    const key = ((await (await request.post('/api/cc_accounts/tally/bridge/key')).json()) as { key: string }).key
    expect(key).toMatch(/^tb_/)
    await request.put('/api/cc_accounts/tally/settings', { data: { mode: 'bridge' } })
    const auth = { authorization: `Bearer ${key}` }
    expect((await (await request.get(`/api/cc_accounts/tally/bridge?tally=${encodeURIComponent(mockUrl)}`, { headers: auth })).json()).job).toBeNull()
    const testing = request.post('/api/cc_accounts/tally/connection')
    let handled = 0
    const deadline = Date.now() + 20000
    while (handled < 2 && Date.now() < deadline) {
      const { job } = (await (await request.get('/api/cc_accounts/tally/bridge', { headers: auth })).json()) as { job: { id: string; xml: string } | null }
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        continue
      }
      const answer = await fetch(mockUrl, { method: 'POST', body: job.xml })
      await request.post('/api/cc_accounts/tally/bridge', { headers: auth, data: { id: job.id, httpStatus: answer.status, responseText: await answer.text() } })
      handled += 1
    }
    const result = (await (await testing).json()) as { ok: boolean; via: string; companies: string[] }
    expect(result.ok).toBe(true)
    expect(result.via).toBe('bridge')
    expect(result.companies).toContain(COMPANY)
    const settings = (await (await request.get('/api/cc_accounts/tally/settings')).json()) as { bridgeAlive: boolean; bridgeTallyUrl: string }
    expect(settings.bridgeAlive).toBe(true)
    expect(settings.bridgeTallyUrl).toBe(mockUrl)
  })

  test('the push log, detail page and Tally page open', async ({ request }) => {
    const detail = (await (await request.get(`/api/cc_accounts/tally/pushes?id=${failedId}`)).json()) as Push
    expect(detail.requestXml).toContain('REMOTEID="CCCPL-Sales-')
    for (const path of ['/backend/accounts/tally', `/backend/accounts/tally/${failedId}`]) {
      expect((await request.get(path)).status(), path).toBe(200)
    }
  })
})
