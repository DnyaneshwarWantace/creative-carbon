import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'
import { AUTH_FILE } from '../playwright.config'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const BASE = process.env.CC_BASE_URL ?? 'http://localhost:3010'
const USERS_FILE = path.resolve(process.cwd(), '..', 'cc-demo-users.txt')
const stamp = Date.now()
const tag = String(stamp).slice(-5)

function day(offset: number): string {
  return new Date(Date.now() + 5.5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

type Person = { key: string; name: string; email: string; role: string }
const PEOPLE: Person[] = [
  { key: 'sales', name: 'Priya Sharma', email: 'priya.sales@creativecarbon.demo', role: 'Sales (CRM)' },
  { key: 'accounts', name: 'Anita Desai', email: 'anita.accounts@creativecarbon.demo', role: 'Accounts' },
  { key: 'purchase', name: 'Rajesh Mehta', email: 'rajesh.purchase@creativecarbon.demo', role: 'Purchase' },
  { key: 'store', name: 'Ramesh Chauhan', email: 'ramesh.store@creativecarbon.demo', role: 'Store & despatch' },
  { key: 'resin', name: 'Suresh Patel', email: 'suresh.resin@creativecarbon.demo', role: 'Resin plant' },
  { key: 'coating', name: 'Mahesh Rathod', email: 'mahesh.coating@creativecarbon.demo', role: 'Coating' },
  { key: 'press', name: 'Vikram Solanki', email: 'vikram.press@creativecarbon.demo', role: 'Press & moulding' },
  { key: 'qc', name: 'Neha Joshi', email: 'neha.qc@creativecarbon.demo', role: 'QC & lab' },
  { key: 'owner', name: 'Kiran Shah', email: 'kiran.owner@creativecarbon.demo', role: 'Management' },
]

const contexts = new Map<string, APIRequestContext>()
const gaps: string[] = []
const journal: string[] = []

function note(line: string) {
  journal.push(line)
  console.log(`  · ${line}`)
}

async function readJson<T>(response: APIResponse): Promise<T> {
  const text = await response.text()
  return (text ? JSON.parse(text) : {}) as T
}

let admin: APIRequestContext

async function send(who: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: Record<string, unknown>, lockFrom?: string): Promise<APIResponse> {
  const run = async (request: APIRequestContext) => {
    const headers: Record<string, string> = {}
    if (lockFrom) {
      const current = await readJson<{ updatedAt?: string | null }>(await request.get(lockFrom))
      if (current.updatedAt) headers[LOCK] = current.updatedAt
    }
    return method === 'GET' ? request.get(url) : method === 'POST' ? request.post(url, { data: body, headers }) : request.put(url, { data: body, headers })
  }
  const person = contexts.get(who)
  if (person) {
    const response = await run(person)
    if (response.status() !== 403) return response
    gaps.push(`${PEOPLE.find((entry) => entry.key === who)?.role ?? who} could not ${method} ${url.split('?')[0]}: ${(await response.text()).slice(0, 160)}`)
  }
  return run(admin)
}

async function ok<T>(who: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: Record<string, unknown>, lockFrom?: string): Promise<T> {
  const response = await send(who, method, url, body, lockFrom)
  expect(response.ok(), `${who} ${method} ${url}: ${response.status()} ${await response.text()}`).toBeTruthy()
  return readJson<T>(response)
}

test.describe.serial('Demo · one order from the vendor to the customer, done by the people who do it', () => {
  let password: string
  let customerId: string
  let vendorId: string
  let enquiryId: string
  let quoteId: string
  let orderId: string
  let orderNo: string
  let lineId: string
  let piId: string
  let poId: string
  let grnId: string
  let invoiceId: string
  let fgLotId: string
  const lots: Record<string, string> = {}
  const ids: Record<string, string> = {}

  test.beforeAll(async ({ playwright }) => {
    admin = await playwright.request.newContext({ baseURL: BASE, storageState: AUTH_FILE })
  })

  test.afterAll(async () => {
    for (const context of contexts.values()) await context.dispose()
    await admin.dispose()
    console.log('\n=== What was made ===')
    for (const line of journal) console.log(`  ${line}`)
    if (gaps.length) {
      console.log('\n=== Steps a department role could not do (done as admin instead) ===')
      for (const gap of [...new Set(gaps)]) console.log(`  ! ${gap}`)
    } else console.log('\nEvery step was done by its own department.')
  })

  test('the people: one demo user per department', async ({ playwright }) => {
    const request = admin
    const saved = fs.existsSync(USERS_FILE) ? fs.readFileSync(USERS_FILE, 'utf8') : ''
    password = saved.match(/^Password: (.+)$/m)?.[1]?.trim() ?? `Demo!${randomBytes(6).toString('hex')}9`
    for (const person of PEOPLE) {
      const created = await request.post('/api/auth/users', { data: { email: person.email, name: person.name, password, organizationId: process.env.CC_ORG, roles: [person.role] } })
      if (!created.ok() && created.status() !== 409 && !/exist|in use/i.test(await created.text())) throw new Error(`[internal] could not create ${person.email}: ${await created.text()}`)
      const context = await playwright.request.newContext({ baseURL: BASE })
      let login = await context.post('/api/auth/login', { data: { email: person.email, password } })
      for (let attempt = 0; login.status() === 429 && attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20_000))
        login = await context.post('/api/auth/login', { data: { email: person.email, password } })
      }
      expect(login.status(), `${person.email} cannot sign in: ${await login.text()}`).toBeLessThan(400)
      contexts.set(person.key, context)
    }
    const lines = ['Creative Carbon demo users (local only; do not commit)', `Password: ${password}`, '', ...PEOPLE.map((person) => `${person.role.padEnd(18)} ${person.name.padEnd(16)} ${person.email}`), '']
    fs.writeFileSync(USERS_FILE, lines.join('\n'), { mode: 0o600 })
    note(`${PEOPLE.length} demo users ready (sign-in details in ${USERS_FILE})`)
  })

  test('masters: a customer and a vendor', async () => {
    const customer = await ok<{ id: string }>('sales', 'POST', '/api/customers/companies', { displayName: `Shree Ganesh Switchgear (Demo ${tag})`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT })
    customerId = customer.id
    const vendor = await ok<{ id: string }>('purchase', 'POST', '/api/cc_vendors/vendors', { name: `Navkar Resins & Fabrics (Demo ${tag})`, contactPhone: '9825012345', organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT })
    vendorId = vendor.id
    note(`Customer Shree Ganesh Switchgear (Demo ${tag}) and vendor Navkar Resins & Fabrics (Demo ${tag})`)
  })

  test('sell, part 1: enquiry → follow-up → quotation sent and accepted → order', async () => {
    const products = (await ok<{ items: Array<{ id: string; title: string }> }>('sales', 'GET', '/api/cc_products/search?kinds=laminate&q=Fabric%2010x10')).items
    ids.product = products.find((item) => item.title === 'Fabric 10x10 Sheet')!.id
    const enquiry = await ok<{ id: string; enquiryNo?: string }>('sales', 'POST', '/api/cc_crm/enquiries', { source: 'IndiaMART', receivedAt: `${day(-14)}T05:30:00.000Z`, customerId, contactName: 'Mr Jignesh Patel', contactPhone: '9898012345', subject: '12 mm Fabric 10x10 sheets, 200 kg', nextActionOn: day(-13), nextActionNote: 'Call back with rates' })
    enquiryId = enquiry.id
    const followUps = (await ok<{ items: Array<{ id: string; status: string }> }>('sales', 'GET', `/api/cc_crm/follow-ups?enquiryId=${enquiryId}`)).items.filter((item) => item.status === 'planned' || item.status === 'open')
    if (followUps[0]) await ok('sales', 'POST', '/api/cc_crm/follow-ups/action', { id: followUps[0].id, action: 'done', outcome: 'Spoke to Mr Patel: needs 200 kg by month end, IS 2036' }, `/api/cc_crm/follow-ups?id=${followUps[0].id}`)
    const quote = await ok<{ id: string; quoteNo: string }>('sales', 'POST', '/api/cc_crm/quotations', { orderDate: day(-12), validUntil: day(3), enquiryId, customerId, lines: [{ productId: ids.product, quantity: 200, rate: 310, gstPercent: 18, specs: { material: { form: 'Sheet', thickness: '12' } } }] })
    quoteId = quote.id
    await ok('sales', 'POST', '/api/cc_crm/quotations/action', { id: quoteId, action: 'sent', sentTo: 'Mr Jignesh Patel', channel: 'email' }, `/api/cc_crm/quotations?id=${quoteId}`)
    await ok('sales', 'POST', '/api/cc_crm/quotations/action', { id: quoteId, action: 'accepted' }, `/api/cc_crm/quotations?id=${quoteId}`)
    const converted = await ok<{ order: { id: string; orderNo: string } }>('sales', 'POST', '/api/cc_crm/quotations/action', { id: quoteId, action: 'convert', orderDate: day(-11) }, `/api/cc_crm/quotations?id=${quoteId}`)
    orderId = converted.order.id
    orderNo = converted.order.orderNo
    lineId = (await ok<{ lines: Array<{ id: string }> }>('sales', 'GET', `/api/cc_orders/orders?id=${orderId}`)).lines[0].id
    note(`Enquiry → quotation ${quote.quoteNo} (sent, accepted) → order ${orderNo}: 200 kg 12 mm Fabric 10x10 sheet at ₹310/kg + 18% GST`)
  })

  test('sell, part 2: proforma sent, 30% advance received', async () => {
    const pi = await ok<{ id: string; code: string }>('accounts', 'POST', '/api/cc_accounts/proformas', { orderId, piDate: day(-11) })
    piId = pi.id
    await ok('accounts', 'POST', '/api/cc_accounts/proformas/action', { id: piId, action: 'send', sentTo: 'Mr Jignesh Patel', channel: 'email' }, `/api/cc_accounts/proformas?id=${piId}`)
    const total = 200 * 310 * 1.18
    const advance = Math.round(total * 0.3)
    await ok('accounts', 'POST', '/api/cc_accounts/payments', { orderId, kind: 'advance', amount: advance, paidOn: day(-10), mode: 'NEFT', reference: `UTR-DEMO-${tag}-A` })
    const order = await ok<{ stages: Array<{ key: string; status: string }> }>('accounts', 'GET', `/api/cc_orders/orders?id=${orderId}`)
    if (order.stages.find((stage) => stage.key === 'advance')?.status !== 'done') {
      for (const stepKey of ['pi_sent', 'advance_received']) await send('accounts', 'POST', '/api/cc_orders/orders/stage', { orderId, stageKey: 'advance', action: 'step', stepKey, done: true }, `/api/cc_orders/orders?id=${orderId}`)
      await ok('accounts', 'POST', '/api/cc_orders/orders/stage', { orderId, stageKey: 'advance', action: 'complete', data: { pi_number: pi.code, advance_percent: 30, advance_amount: advance, received_on: day(-10), payment_ref: `UTR-DEMO-${tag}-A` } }, `/api/cc_orders/orders?id=${orderId}`)
    }
    note(`Proforma ${pi.code} sent; advance ₹${advance.toLocaleString('en-IN')} received`)
  })

  test('buy: indent → PO approved → goods received (GRN) → QC passed → vendor bill → paid', async () => {
    const chemicals = (await ok<{ chemicals: Array<{ id: string; title: string }>; reactors: Array<{ id: string }> }>('resin', 'GET', '/api/cc_production/resin/setup'))
    ids.phenol = chemicals.chemicals.find((entry) => entry.title === 'Phenol')!.id
    ids.formaldehyde = chemicals.chemicals.find((entry) => entry.title === 'Formaldehyde')!.id
    ids.reactor = chemicals.reactors[0].id
    const coating = await ok<{ cloths: Array<{ id: string; title: string }>; dryers: Array<{ id: string; code: string }> }>('coating', 'GET', '/api/cc_production/coating/setup')
    ids.cloth = coating.cloths.find((cloth) => cloth.title === '10x10')!.id
    const wanted = [
      { productId: ids.phenol, quantity: 200, rate: 112 },
      { productId: ids.formaldehyde, quantity: 200, rate: 38 },
      { productId: ids.cloth, quantity: 250, rate: 265 },
    ]
    const indent = await ok<{ id: string; code?: string }>('purchase', 'POST', '/api/cc_purchase/indents', { source: 'department', department: 'Resin plant', lines: wanted.map(({ productId, quantity }) => ({ productId, quantity })) })
    await ok('purchase', 'POST', '/api/cc_purchase/indents/action', { id: indent.id, action: 'approve' }, `/api/cc_purchase/indents?id=${indent.id}`)
    const po = await ok<{ id: string; code: string }>('purchase', 'POST', '/api/cc_purchase/orders', { vendorId, poDate: day(-10), submit: true, lines: wanted.map((line) => ({ ...line, gstPercent: 18 })), indentIds: [indent.id] })
    poId = po.id
    await ok('owner', 'POST', '/api/cc_purchase/orders/approve', { id: poId }, `/api/cc_purchase/orders?id=${poId}`)
    const poLines = (await ok<{ lines: Array<{ id: string; productId: string }> }>('store', 'GET', `/api/cc_purchase/orders?id=${poId}`)).lines
    const lotNo = (name: string) => `DEMO-${name}-${tag}`
    const grn = await ok<{ id: string; code: string }>('store', 'POST', '/api/cc_purchase/grns', {
      poId,
      grnDate: day(-8),
      invoiceNo: `NRF/${tag}`,
      invoiceDate: day(-8),
      vehicleNo: 'GJ 01 CX 4421',
      lines: wanted.map((line) => ({ poLineId: poLines.find((entry) => entry.productId === line.productId)!.id, quantity: line.quantity, lotNumber: lotNo(line.productId === ids.phenol ? 'PH' : line.productId === ids.formaldehyde ? 'FO' : 'CL') })),
    })
    grnId = grn.id
    const received = await ok<{ lines: Array<{ id: string; productId: string; lotId: string | null }> }>('qc', 'GET', `/api/cc_purchase/grns?id=${grnId}`)
    for (const line of received.lines) {
      await ok('qc', 'POST', '/api/cc_purchase/grns/decide', { id: grnId, lineId: line.id, decision: 'passed' }, `/api/cc_purchase/grns?id=${grnId}`)
      lots[line.productId] = line.lotId!
    }
    const taxable = wanted.reduce((sum, line) => sum + line.quantity * line.rate, 0)
    const bill = await ok<{ id: string; code?: string }>('accounts', 'POST', '/api/cc_accounts/vendor-bills', { vendorId, billNo: `NRF/${tag}`, billDate: day(-8), dueDate: day(22), grnIds: [grnId], taxable, gst: Math.round(taxable * 0.18) })
    await ok('accounts', 'POST', '/api/cc_accounts/vendor-bills/action', { id: bill.id, action: 'pay', amount: Math.round(taxable * 1.18), paidOn: day(-2), reference: `UTR-DEMO-${tag}-V` }, `/api/cc_accounts/vendor-bills?id=${bill.id}`)
    note(`Indent → PO ${po.code} (approved) → GRN ${grn.code} (200 kg phenol, 200 kg formaldehyde, 250 kg 10x10 cloth; QC passed) → vendor bill paid ₹${Math.round(taxable * 1.18).toLocaleString('en-IN')}`)
  })

  test('make, part 1: resin batch from the received chemicals', async () => {
    const batch = await ok<{ id: string; batchNo: string }>('resin', 'POST', '/api/cc_production/resin/batches', { batchDate: day(-7), reactorId: ids.reactor, grade: 'PFC', materials: [{ productId: ids.phenol, kg: 200, lotId: lots[ids.phenol] }, { productId: ids.formaldehyde, kg: 200, lotId: lots[ids.formaldehyde] }], tests: { ph: 8.2, gelTimeSec: 95, viscositySec: 22, solidPct: 52 }, yieldKg: 300, notes: 'Demo batch for the switchgear order' })
    await ok('resin', 'POST', '/api/cc_production/resin/batches/action', { id: batch.id, action: 'sign', who: 'chemist' }, `/api/cc_production/resin/batches?id=${batch.id}`).catch(() => null)
    await ok('resin', 'POST', '/api/cc_production/resin/batches/action', { id: batch.id, action: 'post' }, `/api/cc_production/resin/batches?id=${batch.id}`)
    ids.resin = batch.id
    note(`Resin batch ${batch.batchNo}: 400 kg chemicals in, 300 kg PFC resin into the tank`)
  })

  test('make, part 2: coating day sheet turns cloth and resin into B-stage', async () => {
    const coating = await ok<{ dryers: Array<{ id: string; code: string }> }>('coating', 'GET', '/api/cc_production/coating/setup')
    const date = day(-6)
    const existing = (await ok<{ items: Array<{ dryerId: string }> }>('coating', 'GET', `/api/cc_production/coating/sheets?date=${date}`)).items
    const dryer = coating.dryers.find((entry) => entry.code.startsWith('Dryer') && !existing.some((item) => item.dryerId === entry.id))!
    const sheet = await ok<{ id: string }>('coating', 'POST', '/api/cc_production/coating/sheets', { sheetDate: date, dryerId: dryer.id, rows: [{ sn: 1, clothProductId: ids.cloth, rawKg: 230, coatedNos: 92, rcPct: 45 }], notes: 'Demo: switchgear order' })
    await ok('coating', 'POST', '/api/cc_production/coating/sheets/action', { id: sheet.id, action: 'post' }, `/api/cc_production/coating/sheets?id=${sheet.id}`)
    ids.sheet = sheet.id
    note(`${dryer.code} sheet on ${date}: 230 kg cloth coated, B-stage lot on the board`)
  })

  test('make, part 3: press batch of 12 mm sheets, cut to 8x4, thickness checked, FG inspection', async () => {
    const press = (await ok<{ presses: Array<{ id: string; number: number; usage?: string }> }>('press', 'GET', `/api/cc_production/press/setup?date=${day(-5)}`)).presses.find((entry) => entry.number === 22) ?? (await ok<{ presses: Array<{ id: string; number: number }> }>('press', 'GET', `/api/cc_production/press/setup?date=${day(-5)}`)).presses[0]
    const batch = await ok<{ id: string; batchNo: string }>('press', 'POST', '/api/cc_production/press/batches', {
      batchDate: day(-5),
      pressId: press.id,
      daylights: [
        { no: 1, sheets: [{ thicknessMm: 12, count: 2, weightKg: 55, grade: '10x10' }] },
        { no: 2, sheets: [{ thicknessMm: 12, count: 2, weightKg: 55, grade: '10x10' }] },
      ],
      remark: 'Demo: switchgear order',
    })
    await ok('press', 'POST', '/api/cc_production/press/batches/action', { id: batch.id, action: 'post' }, `/api/cc_production/press/batches?id=${batch.id}`)
    const floor = (await ok<{ floorLots: Array<{ lotId: string; lotNumber: string }> }>('qc', 'GET', '/api/cc_production/finishing/setup')).floorLots
    const pressed = floor.find((lot) => lot.lotNumber === `${batch.batchNo} 12mm 10x10`)!
    const cut = await ok<{ id: string; outputLotNumber: string }>('press', 'POST', '/api/cc_production/cutting', { entryDate: day(-4), lotId: pressed.lotId, cutSize: '8x4', sheets: [{ no: 1, weightKg: 51 }, { no: 2, weightKg: 51.2 }, { no: 3, weightKg: 50.8 }, { no: 4, weightKg: 51 }] })
    const trimmed = (await ok<{ floorLots: Array<{ lotId: string; lotNumber: string }> }>('qc', 'GET', '/api/cc_production/finishing/setup')).floorLots.find((lot) => lot.lotNumber === cut.outputLotNumber)!
    await ok('qc', 'POST', '/api/cc_production/thickness', { inspectDate: day(-4), lotId: trimmed.lotId, minusMm: 0.3, plusMm: 0.8, readings: [12.1, 12.2, 12.3, 12.1, 12.4, 12.2, 12.1, 12.3, 12.2, 12.2, 12.1, 12.3] })
    const report = await ok<{ id: string; rows: Array<{ outputLotId: string | null; outputLotNumber: string | null }> }>('qc', 'POST', '/api/cc_production/fg-inspection', { reportDate: day(-3), inspector: 'Neha Joshi', rows: [{ sourceLotId: trimmed.lotId, sheetSize: '8x4', qtyNos: 4, disposition: 'allocation', customerId, customerName: `Shree Ganesh Switchgear (Demo ${tag})` }] })
    const posted = await ok<{ rows: Array<{ outputLotId: string | null; outputLotNumber: string | null; passKg: number | null }> }>('qc', 'POST', '/api/cc_production/fg-inspection/action', { id: report.id, action: 'post' }, `/api/cc_production/fg-inspection?id=${report.id}`)
    fgLotId = posted.rows[0].outputLotId!
    note(`Press batch ${batch.batchNo} (4 × 12 mm) → cut to 8x4 → thickness passed → FG lot ${posted.rows[0].outputLotNumber} (${posted.rows[0].passKg} kg) set aside for the customer`)
  })

  test('quality: the lab test for the order passes', async () => {
    const lab = await ok<{ id: string }>('qc', 'POST', '/api/cc_production/lab', { testDate: day(-3), orderId, itemTitle: 'Fabric 10x10 Sheet', lotRefs: 'FG lot of the demo order', testType: 'Electrical', standard: 'IS 2036', result: 'pass', reportNo: `LR-DEMO-${tag}`, testedBy: 'Neha Joshi', notes: 'Electric strength 12.5 kV/mm' })
    ids.lab = lab.id
    note(`Lab test LR-DEMO-${tag} (IS 2036, electrical) passed for order ${orderNo}`)
  })

  test('sell, part 3: stock allocated, QC, packed, invoiced, despatched, paid in full', async () => {
    const stage = (who: string, body: Record<string, unknown>) => send(who, 'POST', '/api/cc_orders/orders/stage', { orderId, ...body }, `/api/cc_orders/orders?id=${orderId}`)
    const status = async (key: string) => (await ok<{ stages: Array<{ key: string; status: string }> }>('owner', 'GET', `/api/cc_orders/orders?id=${orderId}`)).stages.find((entry) => entry.key === key)?.status
    await ok('store', 'POST', '/api/cc_orders/orders/fulfilment', { action: 'allocate', orderId, lineId, lotId: fgLotId, qty: 200 })
    await stage('store', { stageKey: 'allocation', action: 'step', stepKey: 'ready', done: true })
    if ((await status('allocation')) !== 'done') expect((await stage('store', { stageKey: 'allocation', action: 'complete', data: { allocation_status: 'All from stock' } })).ok()).toBeTruthy()
    await send('qc', 'POST', '/api/cc_orders/orders/fulfilment', { action: 'qc_sync', orderId })
    if ((await status('qc')) !== 'done') {
      const qc = await stage('qc', { stageKey: 'qc', action: 'complete' })
      expect(qc.ok(), await qc.text()).toBeTruthy()
    }
    await ok('store', 'POST', '/api/cc_orders/orders/fulfilment', { action: 'pack', orderId, lineId, weights: [50, 50, 50, 50] })
    await ok('store', 'POST', '/api/cc_orders/orders/fulfilment', { action: 'packed', orderId })
    if ((await status('packing')) !== 'done') {
      const packed = await stage('store', { stageKey: 'packing', action: 'complete', data: { pack_type: 'Wooden pallet', packages: 1, gross_kg: 212, net_kg: 200 } })
      if (!packed.ok()) expect((await stage('store', { stageKey: 'packing', action: 'complete', data: { pack_type: 'Pallet (export)', packages: 1, gross_kg: 212, net_kg: 200 } })).ok()).toBeTruthy()
    }
    const invoice = await ok<{ id: string; code: string }>('accounts', 'POST', '/api/cc_accounts/invoices', { orderId, invoiceDate: day(-1), lines: [{ orderLineId: lineId, quantity: 200 }] })
    invoiceId = invoice.id
    const issued = await ok<{ code: string }>('accounts', 'POST', '/api/cc_accounts/invoices/action', { id: invoiceId, action: 'issue' }, `/api/cc_accounts/invoices?id=${invoiceId}`)
    if ((await status('invoice')) !== 'done') {
      for (const stepKey of ['invoice', 'packing_list']) await stage('accounts', { stageKey: 'invoice', action: 'step', stepKey, done: true })
      expect((await stage('accounts', { stageKey: 'invoice', action: 'complete', data: { invoice_number: issued.code, invoice_date: day(-1) } })).ok()).toBeTruthy()
    }
    for (const stepKey of ['loaded', 'dispatched']) await stage('store', { stageKey: 'dispatch', action: 'step', stepKey, done: true })
    const pdf = (title: string) => Buffer.from(`%PDF-1.4\n% ${title}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`)
    for (const [docKey, title] of [['lr_copy', `LR-DEMO-${tag}`], ['eway_bill', `EWB-DEMO-${tag}`]]) {
      const uploader = contexts.get('store') ?? admin
      const uploaded = await uploader.post('/api/attachments', { multipart: { entityId: 'cc_orders:order_stage', recordId: `${orderId}:dispatch:${docKey}`, file: { name: `${title}.pdf`, mimeType: 'application/pdf', buffer: pdf(title) } } })
      if (!uploaded.ok()) {
        gaps.push(`Store could not upload the ${docKey}: ${uploaded.status()}`)
        await admin.post('/api/attachments', { multipart: { entityId: 'cc_orders:order_stage', recordId: `${orderId}:dispatch:${docKey}`, file: { name: `${title}.pdf`, mimeType: 'application/pdf', buffer: pdf(title) } } })
      }
    }
    const sent = await stage('store', { stageKey: 'dispatch', action: 'complete', data: { dispatch_date: day(-1), transporter: 'VRL Logistics', vehicle_no: 'GJ 07 AB 2266', lr_number: `LR-DEMO-${tag}`, eway_bill_no: `EWB${tag}0001`, dispatch_override: 'Balance on delivery (demo)' } })
    expect(sent.ok(), await sent.text()).toBeTruthy()
    const total = 200 * 310 * 1.18
    const advance = Math.round(total * 0.3)
    await ok('accounts', 'POST', '/api/cc_accounts/payments', { orderId, kind: 'balance', amount: Math.round(total) - advance, paidOn: day(0), mode: 'RTGS', reference: `UTR-DEMO-${tag}-B`, invoiceId })
    note(`Allocated 200 kg, QC done, packed 4 sheets, invoice ${issued.code}, despatched by VRL Logistics (LR-DEMO-${tag}), balance ₹${(Math.round(total) - advance).toLocaleString('en-IN')} received`)
    note(`Open the order: /backend/orders/${orderId}`)
  })
})
