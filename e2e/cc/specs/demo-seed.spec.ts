import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'
import { AUTH_FILE } from '../playwright.config'
import { samplePdf } from '../tools/samplePdf'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const BASE = process.env.CC_BASE_URL ?? 'http://localhost:3010'
const USERS_FILE = path.resolve(process.cwd(), '..', 'cc-demo-users.txt')

function sheetSpecs(title: string, thickness: number | string, qty: number) {
  const [grade, weave] = title.split(' ')
  return {
    material: { form: 'Sheet', grade, weave, sheet_size: title.startsWith('Graphite') || title.startsWith('Fabric 6x6') ? '4x4' : '8x4', thickness_mm: String(thickness), pieces: String(Math.max(1, Math.round(qty / 50))) },
    packing: { pack_type: 'PP wrap + LDP stitch (local)', marking: 'Grade, thickness and lot no. on each sheet', test_standard: 'IS 2036', remarks: 'Edges trimmed square; no delamination' },
  }
}

function day(offset: number): string {
  return new Date(Date.now() + 5.5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

const PEOPLE: Record<string, string> = {
  sales: 'priya.sales@creativecarbon.demo',
  accounts: 'anita.accounts@creativecarbon.demo',
  purchase: 'rajesh.purchase@creativecarbon.demo',
  store: 'ramesh.store@creativecarbon.demo',
  resin: 'suresh.resin@creativecarbon.demo',
  coating: 'mahesh.coating@creativecarbon.demo',
  press: 'vikram.press@creativecarbon.demo',
  qc: 'neha.qc@creativecarbon.demo',
  owner: 'kiran.owner@creativecarbon.demo',
}

const CUSTOMERS = [
  { name: 'Kanpur Electro Insulation Pvt Ltd', city: 'Kanpur' },
  { name: 'Shakti Switchgear Industries', city: 'Vadodara' },
  { name: 'Narmada Transformers Pvt Ltd', city: 'Bharuch' },
  { name: 'Sai Electricals & Controls', city: 'Pune' },
  { name: 'Deccan Motor Works', city: 'Hyderabad' },
  { name: 'Ambika Panel Builders', city: 'Ahmedabad' },
  { name: 'Coastal Power Equipments', city: 'Chennai' },
  { name: 'Himalaya Insulators', city: 'Dehradun' },
  { name: 'Gulf Electro Trading LLC', city: 'Dubai' },
  { name: 'Ruby Rotating Machines', city: 'Coimbatore' },
]
const VENDORS = ['Siddhi Petrochem', 'Mahalaxmi Textile Mills', 'Om Sai Chemicals', 'Rajhans Cotton Waste Traders', 'Balaji Packaging']

const contexts = new Map<string, APIRequestContext>()
const journal: string[] = []
const problems: string[] = []
let admin: APIRequestContext

function note(line: string) {
  journal.push(line)
  console.log(`  · ${line}`)
}

async function json<T>(response: APIResponse): Promise<T> {
  const text = await response.text()
  return (text ? JSON.parse(text) : {}) as T
}

async function send(who: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: Record<string, unknown>, lockFrom?: string): Promise<APIResponse> {
  const run = async (request: APIRequestContext) => {
    const headers: Record<string, string> = {}
    if (lockFrom) {
      const current = await json<{ updatedAt?: string | null }>(await request.get(lockFrom))
      if (current.updatedAt) headers[LOCK] = current.updatedAt
    }
    return method === 'GET' ? request.get(url) : method === 'POST' ? request.post(url, { data: body, headers }) : request.put(url, { data: body, headers })
  }
  const person = contexts.get(who)
  if (person) {
    const response = await run(person)
    if (response.status() !== 403) return response
  }
  return run(admin)
}

async function ok<T>(who: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: Record<string, unknown>, lockFrom?: string): Promise<T> {
  const response = await send(who, method, url, body, lockFrom)
  expect(response.ok(), `${who} ${method} ${url}: ${response.status()} ${await response.text()}`).toBeTruthy()
  return json<T>(response)
}

async function soft(label: string, who: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: Record<string, unknown>, lockFrom?: string): Promise<boolean> {
  const response = await send(who, method, url, body, lockFrom)
  if (!response.ok()) problems.push(`${label}: ${response.status()} ${(await response.text()).slice(0, 200)}`)
  return response.ok()
}

test.describe.serial('Demo data · a month of activity across CRM, orders, purchase, plant, stock and accounts', () => {
  const product: Record<string, string> = {}
  const customer: Record<string, string> = {}
  const vendor: Record<string, string> = {}
  const fgLots: Array<{ lotId: string; productTitle: string; thickness: number; kg: number; used: number }> = []

  test.beforeAll(async ({ playwright }) => {
    admin = await playwright.request.newContext({ baseURL: BASE, storageState: AUTH_FILE })
    const saved = fs.existsSync(USERS_FILE) ? fs.readFileSync(USERS_FILE, 'utf8') : ''
    const password = saved.match(/^Password: (.+)$/m)?.[1]?.trim()
    if (!password) return
    for (const [key, email] of Object.entries(PEOPLE)) {
      const context = await playwright.request.newContext({ baseURL: BASE })
      let login = await context.post('/api/auth/login', { data: { email, password } })
      for (let attempt = 0; login.status() === 429 && attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20_000))
        login = await context.post('/api/auth/login', { data: { email, password } })
      }
      if (login.ok()) contexts.set(key, context)
      else await context.dispose()
    }
  })

  test.afterAll(async () => {
    for (const context of contexts.values()) await context.dispose()
    await admin.dispose()
    console.log('\n=== Demo data loaded ===')
    for (const line of journal) console.log(`  ${line}`)
    if (problems.length) {
      console.log('\n=== Steps that did not go through ===')
      for (const line of problems) console.log(`  ! ${line}`)
    }
  })

  let already = false
  test.beforeEach(() => {
    test.skip(already, 'demo data is already loaded (opening lot OPN-PH-01 exists)')
  })

  test('not loaded twice', async () => {
    const stock = await json<{ items: Array<{ lots: Array<{ lotNumber: string | null }> }> }>(await admin.get('/api/cc_store/stock?place=wh_a'))
    already = stock.items.some((item) => item.lots.some((lot) => lot.lotNumber === 'OPN-PH-01'))
    fs.mkdirSync(path.join(__dirname, '..', '.results-demo'), { recursive: true })
  })

  test('items used by the demo', async () => {
    for (const kind of ['laminate', 'moulded', 'chemical', 'reinforcement', 'chindi', 'bought_in']) {
      const items = (await ok<{ items: Array<{ id: string; title: string }> }>('owner', 'GET', `/api/cc_products/search?kinds=${kind}&limit=100`)).items
      for (const item of items) product[item.title] = item.id
    }
    expect(product['Fabric 10x10 Sheet']).toBeTruthy()
  })

  test('opening stock: raw material, cloth and finished sheets on the cutover day', async () => {
    const asOn = day(-35)
    const raw = [
      ['Warehouse A', 'Phenol', 'OPN-PH-01', 4000],
      ['Warehouse A', 'Formaldehyde', 'OPN-FO-01', 4500],
      ['Warehouse A', 'Methanol', 'OPN-ME-01', 600],
      ['Warehouse A', 'DBP', 'OPN-DBP-01', 400],
      ['Warehouse A', 'Oleic Acid', 'OPN-OL-01', 250],
      ['Warehouse A', 'Caustic Soda Flakes', 'OPN-CS-01', 200],
      ['Warehouse A', '10x10', 'OPN-CL-1010', 2600],
      ['Warehouse A', '6x6', 'OPN-CL-66', 900],
      ['Warehouse A', 'G 10x10', 'OPN-CL-G1010', 700],
      ['Warehouse B', 'Cotton chindi', 'OPN-CH-01', 800],
      ['Warehouse B', 'Wooden pallet', 'OPN-PAL-01', 40],
      ['Warehouse B', 'PP wrap', 'OPN-PP-01', 60],
    ] as const
    const finished = [
      ['Fabric 10x10 Sheet', 12, '8x4', 6, 330],
      ['Fabric 10x10 Sheet', 12, '8x4', 6, 328],
      ['Fabric 10x10 Sheet', 25, '8x4', 4, 435],
      ['F2F3 10x10 Sheet', 10, '8x4', 8, 360],
      ['Fabric 6x6 Sheet', 6, '4x4', 12, 210],
      ['Graphite 10x10 Sheet', 16, '4x4', 5, 240],
      ['Paper 6x6 Sheet', 3, '8x4', 20, 190],
    ] as const
    const rows: Array<Record<string, string>> = raw.map(([store, item, lot, qty]) => ({ 'Stock as on': asOn, Store: store, 'Item (name or code)': item, 'Lot / batch no.': lot, Quantity: String(qty), 'QC status': 'Approved' }))
    finished.forEach(([item, thickness, size, pieces, kg], index) => rows.push({ 'Stock as on': asOn, Store: 'FG store', 'Item (name or code)': item, 'Lot / batch no.': `OPN-FG-${String(index + 1).padStart(2, '0')}`, Quantity: String(kg), 'Thickness (mm)': String(thickness), Size: size, 'Pieces (nos)': String(pieces), 'QC status': 'Approved', 'Made / received on': day(-40) }))
    const report = await ok<{ created: number; failed: number; errors: Array<{ row: number; error: string }> }>('store', 'POST', '/api/cc_production/upload', { register: 'opening_stock', dryRun: false, rows })
    for (const error of report.errors) problems.push(`Opening stock row ${error.row}: ${error.error}`)
    const fg = (await ok<{ items: Array<{ lotId: string; lotNumber: string; title: string; thicknessMm: number | null; free: number; place: string }> }>('store', 'GET', '/api/cc_production/finishing/lots')).items
    for (const lot of fg.filter((entry) => entry.place === 'fg' && entry.lotNumber.startsWith('OPN-FG-'))) {
      fgLots.push({ lotId: lot.lotId, productTitle: lot.title, thickness: lot.thicknessMm ?? 0, kg: lot.free, used: 0 })
      await soft(`Thickness check ${lot.lotNumber}`, 'qc', 'POST', '/api/cc_production/thickness', { inspectDate: day(-34), lotId: lot.lotId, readings: Array(12).fill((lot.thicknessMm ?? 10) + 0.1), result: 'pass', notes: 'Opening stock re-check' })
    }
    note(`Opening stock on ${asOn}: ${report.created} lots (chemicals, cloth, chindi, packing, ${fgLots.length} finished sheet lots)`)
  })

  test('customers and vendors', async () => {
    for (const entry of CUSTOMERS) {
      const created = await ok<{ id: string }>('sales', 'POST', '/api/customers/companies', { displayName: entry.name, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT })
      customer[entry.name] = created.id
    }
    for (const name of VENDORS) {
      const created = await ok<{ id: string }>('purchase', 'POST', '/api/cc_vendors/vendors', { name, contactPhone: `98250${String(10000 + Object.keys(vendor).length * 1111).slice(0, 5)}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT })
      vendor[name] = created.id
    }
    note(`${CUSTOMERS.length} customers and ${VENDORS.length} vendors`)
  })

  test('CRM: enquiries at every stage, follow-ups due today and overdue, quotations, and orders from them', async () => {
    type Plan = { who: string; item: string; thickness: number; qty: number; rate: number; ago: number; fate: 'new' | 'quoted' | 'negotiating' | 'lost' | 'won'; source: string }
    const names = Object.keys(customer)
    const plans: Plan[] = [
      { who: names[0], item: 'Fabric 10x10 Sheet', thickness: 12, qty: 300, rate: 305, ago: 32, fate: 'won', source: 'IndiaMART' },
      { who: names[1], item: 'F2F3 10x10 Sheet', thickness: 10, qty: 200, rate: 340, ago: 30, fate: 'won', source: 'Existing customer' },
      { who: names[2], item: 'Fabric 10x10 Sheet', thickness: 25, qty: 400, rate: 298, ago: 27, fate: 'won', source: 'Referral' },
      { who: names[3], item: 'Fabric 6x6 Sheet', thickness: 6, qty: 150, rate: 335, ago: 25, fate: 'won', source: 'Website' },
      { who: names[4], item: 'Graphite 10x10 Sheet', thickness: 16, qty: 200, rate: 420, ago: 22, fate: 'won', source: 'IndiaMART' },
      { who: names[5], item: 'Fabric 10x10 Sheet', thickness: 12, qty: 250, rate: 310, ago: 19, fate: 'won', source: 'Existing customer' },
      { who: names[6], item: 'Paper 6x6 Sheet', thickness: 3, qty: 150, rate: 260, ago: 16, fate: 'won', source: 'Trade fair' },
      { who: names[7], item: 'Fabric 10x10 Sheet', thickness: 20, qty: 500, rate: 300, ago: 14, fate: 'won', source: 'Referral' },
      { who: names[8], item: 'Fabric 10x10 Sheet', thickness: 12, qty: 1000, rate: 298, ago: 12, fate: 'negotiating', source: 'Email' },
      { who: names[9], item: 'F2F3 10x10 Sheet', thickness: 8, qty: 180, rate: 345, ago: 10, fate: 'negotiating', source: 'IndiaMART' },
      { who: names[2], item: 'Graphite 10x10 Sheet', thickness: 10, qty: 120, rate: 430, ago: 9, fate: 'quoted', source: 'Existing customer' },
      { who: names[4], item: 'Fabric 6x6 Sheet', thickness: 4, qty: 90, rate: 340, ago: 8, fate: 'quoted', source: 'Phone' },
      { who: names[1], item: 'Fabric 10x10 Sheet', thickness: 30, qty: 600, rate: 296, ago: 20, fate: 'lost', source: 'IndiaMART' },
      { who: names[6], item: 'Paper 6x6 Sheet', thickness: 2, qty: 80, rate: 270, ago: 18, fate: 'lost', source: 'Website' },
      { who: names[3], item: 'Fabric 10x10 Sheet', thickness: 12, qty: 200, rate: 0, ago: 3, fate: 'new', source: 'IndiaMART' },
      { who: names[5], item: 'F2F3 10x10 Sheet', thickness: 6, qty: 100, rate: 0, ago: 2, fate: 'new', source: 'Phone' },
      { who: names[7], item: 'Graphite 10x10 Sheet', thickness: 20, qty: 75, rate: 0, ago: 1, fate: 'new', source: 'Website' },
      { who: names[0], item: 'Fabric 6x6 Sheet', thickness: 3, qty: 60, rate: 0, ago: 6, fate: 'new', source: 'Email' },
    ]
    const counts: Record<string, number> = {}
    const won: Array<{ orderId: string; plan: Plan }> = []
    for (const plan of plans) {
      const customerId = customer[plan.who]
      const nextOn = plan.fate === 'new' ? day(plan.ago === 6 ? -2 : 0) : day(-plan.ago + 2)
      const enquiry = await ok<{ id: string }>('sales', 'POST', '/api/cc_crm/enquiries', { source: plan.source, receivedAt: `${day(-plan.ago)}T05:30:00.000Z`, customerId, contactName: 'Purchase manager', subject: `${plan.item}, ${plan.thickness} mm, ${plan.qty} ${plan.item.includes('Moulded') ? 'nos' : 'kg'}`, nextActionOn: nextOn, nextActionNote: plan.fate === 'new' ? 'Call back with rates' : 'Chase the quotation' })
      counts[plan.fate] = (counts[plan.fate] ?? 0) + 1
      if (plan.fate === 'new') continue
      if (plan.fate === 'lost') {
        await soft('Lost enquiry', 'sales', 'POST', '/api/cc_crm/enquiries/action', { id: enquiry.id, action: 'stage', stage: 'lost', lostReason: 'Price too high' }, `/api/cc_crm/enquiries?id=${enquiry.id}`)
        continue
      }
      const quote = await ok<{ id: string }>('sales', 'POST', '/api/cc_crm/quotations', { orderDate: day(-plan.ago + 1), validUntil: day(-plan.ago + 16), enquiryId: enquiry.id, customerId, lines: [{ productId: product[plan.item], quantity: plan.qty, rate: plan.rate, gstPercent: 18, specs: sheetSpecs(plan.item, plan.thickness, plan.qty) }] })
      if (plan.fate === 'quoted') continue
      await ok('sales', 'POST', '/api/cc_crm/quotations/action', { id: quote.id, action: 'sent', sentTo: 'Purchase manager', channel: 'email' }, `/api/cc_crm/quotations?id=${quote.id}`)
      if (plan.fate === 'negotiating') continue
      await ok('sales', 'POST', '/api/cc_crm/quotations/action', { id: quote.id, action: 'accepted' }, `/api/cc_crm/quotations?id=${quote.id}`)
      const converted = await ok<{ order: { id: string } }>('sales', 'POST', '/api/cc_crm/quotations/action', { id: quote.id, action: 'convert', orderDate: day(-plan.ago + 3) }, `/api/cc_crm/quotations?id=${quote.id}`)
      won.push({ orderId: converted.order.id, plan })
    }
    note(`Enquiries: ${Object.entries(counts).map(([fate, count]) => `${count} ${fate}`).join(', ')}; ${won.length} became orders`)
    fs.writeFileSync(path.join(__dirname, '..', '.results-demo', 'won.json'), JSON.stringify(won))
  })

  test('orders moved along: proforma and advance, allocation, QC, packing, invoice, despatch, payment', async () => {
    const won = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.results-demo', 'won.json'), 'utf8')) as Array<{ orderId: string; plan: { item: string; thickness: number; qty: number; rate: number; ago: number } }>
    const levels = ['paid', 'paid', 'despatched', 'despatched', 'invoiced', 'packed', 'advance', 'proforma']
    const reached: Record<string, number> = {}
    for (const [index, entry] of won.entries()) {
      const level = levels[index] ?? 'proforma'
      const { orderId, plan } = entry
      const start = -plan.ago + 3
      const lock = `/api/cc_orders/orders?id=${orderId}`
      const stage = (who: string, body: Record<string, unknown>) => send(who, 'POST', '/api/cc_orders/orders/stage', { orderId, ...body }, lock)
      const status = async (key: string) => (await ok<{ stages: Array<{ key: string; status: string }> }>('owner', 'GET', lock)).stages.find((item) => item.key === key)?.status
      const order = await ok<{ orderNo: string; lines: Array<{ id: string }>; totals?: { total?: number } }>('owner', 'GET', lock)
      const lineId = order.lines[0].id
      const total = Math.round(plan.qty * plan.rate * 1.18)
      const pi = await ok<{ id: string; code: string }>('accounts', 'POST', '/api/cc_accounts/proformas', { orderId, piDate: day(start) })
      await soft(`Send ${pi.code}`, 'accounts', 'POST', '/api/cc_accounts/proformas/action', { id: pi.id, action: 'send', sentTo: 'Purchase manager', channel: 'email' }, `/api/cc_accounts/proformas?id=${pi.id}`)
      reached[level] = (reached[level] ?? 0) + 1
      if (level === 'proforma') continue
      const advance = Math.round(total * 0.3)
      await ok('accounts', 'POST', '/api/cc_accounts/payments', { orderId, kind: 'advance', amount: advance, paidOn: day(start + 1), mode: 'NEFT', reference: `UTR${orderId.slice(0, 6).toUpperCase()}A` })
      if ((await status('advance')) !== 'done') {
        for (const stepKey of ['pi_sent', 'advance_received']) await stage('accounts', { stageKey: 'advance', action: 'step', stepKey, done: true })
        await soft(`Advance stage ${order.orderNo}`, 'accounts', 'POST', '/api/cc_orders/orders/stage', { orderId, stageKey: 'advance', action: 'complete', data: { pi_number: pi.code, advance_percent: 30, advance_amount: advance, received_on: day(start + 1) } }, lock)
      }
      if (level === 'advance') continue
      const lot = fgLots.find((candidate) => candidate.productTitle === plan.item && candidate.thickness === plan.thickness && candidate.kg - candidate.used >= plan.qty)
      if (!lot) {
        await stage('store', { stageKey: 'allocation', action: 'complete', data: { allocation_status: 'To be made' } })
        problems.push(`${order.orderNo}: no finished lot of ${plan.item} ${plan.thickness} mm with ${plan.qty} kg free; left at allocation (to be made)`)
        continue
      }
      await ok('store', 'POST', '/api/cc_orders/orders/fulfilment', { action: 'allocate', orderId, lineId, lotId: lot.lotId, qty: plan.qty })
      lot.used += plan.qty
      await stage('store', { stageKey: 'allocation', action: 'step', stepKey: 'ready', done: true })
      if ((await status('allocation')) !== 'done') await stage('store', { stageKey: 'allocation', action: 'complete', data: { allocation_status: 'All from stock' } })
      await soft(`Lab test ${order.orderNo}`, 'qc', 'POST', '/api/cc_production/lab', { testDate: day(start + 2), orderId, itemTitle: plan.item, testType: 'Electrical', standard: 'IS 2036', result: 'pass', reportNo: `LR/${order.orderNo.split('/').pop()}`, testedBy: 'Neha Joshi' })
      await send('qc', 'POST', '/api/cc_orders/orders/fulfilment', { action: 'qc_sync', orderId })
      for (const stepKey of ['thickness', 'fg_inspection', 'tests']) await stage('qc', { stageKey: 'qc', action: 'step', stepKey, done: true })
      if ((await status('qc')) !== 'done') await soft(`QC ${order.orderNo}`, 'qc', 'POST', '/api/cc_orders/orders/stage', { orderId, stageKey: 'qc', action: 'complete' }, lock)
      const pieces = Math.max(1, Math.round(plan.qty / 50))
      const weights = Array.from({ length: pieces }, (_, position) => (position === pieces - 1 ? plan.qty - 50 * (pieces - 1) : 50))
      await soft(`Pack ${order.orderNo}`, 'store', 'POST', '/api/cc_orders/orders/fulfilment', { action: 'pack', orderId, lineId, weights })
      await soft(`Packed ${order.orderNo}`, 'store', 'POST', '/api/cc_orders/orders/fulfilment', { action: 'packed', orderId })
      if ((await status('packing')) !== 'done') await soft(`Packing stage ${order.orderNo}`, 'store', 'POST', '/api/cc_orders/orders/stage', { orderId, stageKey: 'packing', action: 'complete', data: { pack_type: 'Wooden pallet', packages: Math.ceil(pieces / 6), gross_kg: plan.qty + 12, net_kg: plan.qty } }, lock)
      if (level === 'packed') continue
      const invoice = await ok<{ id: string }>('accounts', 'POST', '/api/cc_accounts/invoices', { orderId, invoiceDate: day(start + 4), lines: [{ orderLineId: lineId, quantity: plan.qty }] })
      const issued = await ok<{ code: string }>('accounts', 'POST', '/api/cc_accounts/invoices/action', { id: invoice.id, action: 'issue' }, `/api/cc_accounts/invoices?id=${invoice.id}`)
      if ((await status('invoice')) !== 'done') {
        for (const stepKey of ['invoice', 'packing_list']) await stage('accounts', { stageKey: 'invoice', action: 'step', stepKey, done: true })
        await soft(`Invoice stage ${order.orderNo}`, 'accounts', 'POST', '/api/cc_orders/orders/stage', { orderId, stageKey: 'invoice', action: 'complete', data: { invoice_number: issued.code, invoice_date: day(start + 4) } }, lock)
      }
      if (level === 'invoiced') continue
      for (const [docKey, title] of [['lr_copy', `LR-${issued.code.split('/').pop()}`], ['eway_bill', `EWB-${issued.code.split('/').pop()}`]]) {
        const uploader = contexts.get('store') ?? admin
        await uploader.post('/api/attachments', { multipart: { entityId: 'cc_orders:order_stage', recordId: `${orderId}:dispatch:${docKey}`, file: { name: `${title}.pdf`, mimeType: 'application/pdf', buffer: samplePdf(title) } } })
      }
      for (const stepKey of ['loaded', 'dispatched']) await stage('store', { stageKey: 'dispatch', action: 'step', stepKey, done: true })
      const transporters = ['VRL Logistics', 'Gati Ltd', 'TCI Freight', 'Shree Maruti Courier']
      await soft(`Despatch ${order.orderNo}`, 'store', 'POST', '/api/cc_orders/orders/stage', { orderId, stageKey: 'dispatch', action: 'complete', data: { dispatch_date: day(start + 5), transporter: transporters[index % transporters.length], vehicle_no: `GJ 0${(index % 9) + 1} AB ${1200 + index * 37}`, lr_number: `LR${4400 + index}`, eway_bill_no: `EWB72${index}0019`, dispatch_override: 'Balance on 30 days credit' } }, lock)
      if (level === 'despatched') continue
      await ok('accounts', 'POST', '/api/cc_accounts/payments', { orderId, kind: 'balance', amount: total - advance, paidOn: day(Math.min(start + 12, 0)), mode: 'RTGS', reference: `UTR${orderId.slice(0, 6).toUpperCase()}B`, invoiceId: invoice.id })
    }
    note(`Orders: ${Object.entries(reached).map(([level, count]) => `${count} at ${level}`).join(', ')}`)
  })

  test('two direct orders: a moulded-parts order waiting for production and one on hold', async () => {
    const moulded = Object.keys(product).find((title) => title.startsWith('Moulded bush D-101')) ?? Object.keys(product).find((title) => title.startsWith('Moulded'))!
    const first = await ok<{ id: string; orderNo: string }>('sales', 'POST', '/api/cc_orders/orders', { orderDate: day(-4), deliveryDate: day(10), customerId: customer['Ruby Rotating Machines'], lines: [{ productId: product[moulded], quantity: 2000, rate: 14.5, gstPercent: 18, specs: { material: { form: 'Moulded part', die_no: 'D-101', pieces: '2000' }, packing: { pack_type: 'PP wrap + LDP stitch (local)', marking: 'Die no. and lot no. on every carton', test_standard: 'Customer spec', remarks: 'Deburr all edges' } } }] })
    const second = await ok<{ id: string; orderNo: string }>('sales', 'POST', '/api/cc_orders/orders', { orderDate: day(-2), deliveryDate: day(15), customerId: customer['Coastal Power Equipments'], lines: [{ productId: product['Fabric 10x10 Sheet'], quantity: 350, rate: 302, gstPercent: 18, specs: sheetSpecs('Fabric 10x10 Sheet', 40, 350) }] })
    await soft('Hold order', 'sales', 'POST', '/api/cc_orders/orders/hold', { id: second.id, action: 'hold', reason: 'Customer revising drawing; confirm thickness before advance' }, `/api/cc_orders/orders?id=${second.id}`)
    note(`Direct orders ${first.orderNo} (2000 moulded parts, die D-101) and ${second.orderNo} (on hold)`)
  })

  test('purchase: indents, POs at each step, a GRN waiting for QC, vendor bills paid and unpaid', async () => {
    const lines = (entries: Array<[string, number, number]>) => entries.map(([title, quantity, rate]) => ({ productId: product[title], quantity, rate, gstPercent: 18 }))
    const make = async (vendorName: string, poDate: number, items: Array<[string, number, number]>, submit: boolean) => ok<{ id: string; code: string }>('purchase', 'POST', '/api/cc_purchase/orders', { vendorId: vendor[vendorName], poDate: day(poDate), expectedDate: day(poDate + 7), submit, lines: lines(items) })
    const indent = await ok<{ id: string }>('purchase', 'POST', '/api/cc_purchase/indents', { source: 'department', department: 'Resin plant', lines: [{ productId: product['Phenol'], quantity: 2000 }, { productId: product['Formaldehyde'], quantity: 2500 }] })
    await soft('Approve indent', 'purchase', 'POST', '/api/cc_purchase/indents/action', { id: indent.id, action: 'approve' }, `/api/cc_purchase/indents?id=${indent.id}`)
    await ok('purchase', 'POST', '/api/cc_purchase/indents', { source: 'low_stock', department: 'Store', lines: [{ productId: product['DBP'], quantity: 300 }, { productId: product['Oleic Acid'], quantity: 200 }] })
    const draft = await make('Balaji Packaging', -1, [['Wooden pallet', 50, 850], ['PP wrap', 40, 320]], false)
    const waiting = await make('Om Sai Chemicals', -3, [['DBP', 300, 165], ['Oleic Acid', 200, 142]], true)
    const approved = await make('Siddhi Petrochem', -6, [['Phenol', 2000, 108], ['Formaldehyde', 2500, 36]], true)
    await ok('owner', 'POST', '/api/cc_purchase/orders/approve', { id: approved.id }, `/api/cc_purchase/orders?id=${approved.id}`)
    const cloth = await make('Mahalaxmi Textile Mills', -15, [['10x10', 1500, 262], ['6x6', 600, 248]], true)
    await ok('owner', 'POST', '/api/cc_purchase/orders/approve', { id: cloth.id }, `/api/cc_purchase/orders?id=${cloth.id}`)
    const clothLines = (await ok<{ lines: Array<{ id: string; productId: string }> }>('store', 'GET', `/api/cc_purchase/orders?id=${cloth.id}`)).lines
    const grnFull = await ok<{ id: string; code: string }>('store', 'POST', '/api/cc_purchase/grns', { poId: cloth.id, grnDate: day(-9), invoiceNo: 'MTM/2627/1184', invoiceDate: day(-10), vehicleNo: 'GJ 05 BT 7781', lines: clothLines.map((line) => ({ poLineId: line.id, quantity: line.productId === product['10x10'] ? 1500 : 600, lotNumber: `MTM-${line.productId === product['10x10'] ? '1010' : '66'}-1184` })) })
    for (const line of (await ok<{ lines: Array<{ id: string }> }>('qc', 'GET', `/api/cc_purchase/grns?id=${grnFull.id}`)).lines) await soft('GRN QC', 'qc', 'POST', '/api/cc_purchase/grns/decide', { id: grnFull.id, lineId: line.id, decision: 'passed' }, `/api/cc_purchase/grns?id=${grnFull.id}`)
    const clothBill = await ok<{ id: string }>('accounts', 'POST', '/api/cc_accounts/vendor-bills', { vendorId: vendor['Mahalaxmi Textile Mills'], billNo: 'MTM/2627/1184', billDate: day(-10), dueDate: day(20), grnIds: [grnFull.id], taxable: 1500 * 262 + 600 * 248, gst: Math.round((1500 * 262 + 600 * 248) * 0.18) })
    await soft('Part payment', 'accounts', 'POST', '/api/cc_accounts/vendor-bills/action', { id: clothBill.id, action: 'pay', amount: 300000, paidOn: day(-3), reference: 'UTR-MTM-1' }, `/api/cc_accounts/vendor-bills?id=${clothBill.id}`)
    const chemLines = (await ok<{ lines: Array<{ id: string; productId: string }> }>('store', 'GET', `/api/cc_purchase/orders?id=${approved.id}`)).lines
    const grnPart = await ok<{ id: string; code: string }>('store', 'POST', '/api/cc_purchase/grns', { poId: approved.id, grnDate: day(-1), invoiceNo: 'SP/2627/552', invoiceDate: day(-2), vehicleNo: 'GJ 06 TT 2290', lines: [{ poLineId: chemLines.find((line) => line.productId === product['Phenol'])!.id, quantity: 1000, lotNumber: 'SP-PH-552' }] })
    note(`Purchase: 2 indents; POs ${draft.code} (draft), ${waiting.code} (waiting approval), ${approved.code} (approved, half received), ${cloth.code} (received); GRN ${grnFull.code} passed and part paid, GRN ${grnPart.code} waiting for QC`)
  })

  test('plant: ten days of resin, coating and press; cutting, thickness and FG inspection on the older batches', async () => {
    const resinSetup = await ok<{ reactors: Array<{ id: string; code: string }> }>('resin', 'GET', '/api/cc_production/resin/setup')
    const coatingSetup = await ok<{ dryers: Array<{ id: string; code: string }> }>('coating', 'GET', '/api/cc_production/coating/setup')
    const dryers = coatingSetup.dryers.filter((dryer) => dryer.code.startsWith('Dryer'))
    let resinBatches = 0
    let sheets = 0
    let pressBatches = 0
    let fgReports = 0
    const thicknesses = [12, 10, 25, 16, 6, 20, 12, 8, 30, 12]
    for (let offset = -12; offset <= -1; offset += 1) {
      const index = offset + 12
      const batch = await send('resin', 'POST', '/api/cc_production/resin/batches', { batchDate: day(offset), reactorId: resinSetup.reactors[index % resinSetup.reactors.length].id, grade: 'PFC', materials: [{ productId: product['Phenol'], kg: 260 }, { productId: product['Formaldehyde'], kg: 300 }], tests: { ph: 8 + (index % 5) / 10, gelTimeSec: 90 + index, viscositySec: 20 + (index % 4), solidPct: 51 + (index % 3) }, yieldKg: 420 + (index % 4) * 5 })
      if (batch.ok()) {
        const created = await json<{ id: string }>(batch)
        if (await soft(`Resin post ${day(offset)}`, 'resin', 'POST', '/api/cc_production/resin/batches/action', { id: created.id, action: 'post' }, `/api/cc_production/resin/batches?id=${created.id}`)) resinBatches += 1
      } else problems.push(`Resin batch ${day(offset)}: ${(await batch.text()).slice(0, 160)}`)
      const existing = (await ok<{ items: Array<{ dryerId: string }> }>('coating', 'GET', `/api/cc_production/coating/sheets?date=${day(offset)}`)).items
      const dryer = dryers.find((candidate, position) => position === index % dryers.length && !existing.some((item) => item.dryerId === candidate.id)) ?? dryers.find((candidate) => !existing.some((item) => item.dryerId === candidate.id))
      if (dryer) {
        const sheet = await send('coating', 'POST', '/api/cc_production/coating/sheets', { sheetDate: day(offset), dryerId: dryer.id, rows: [{ sn: 1, clothProductId: product['10x10'], rawKg: 240, coatedNos: 96, rcPct: 44 + (index % 3) }] })
        if (sheet.ok()) {
          const created = await json<{ id: string }>(sheet)
          if (await soft(`Coating post ${day(offset)}`, 'coating', 'POST', '/api/cc_production/coating/sheets/action', { id: created.id, action: 'post' }, `/api/cc_production/coating/sheets?id=${created.id}`)) sheets += 1
        } else problems.push(`Coating sheet ${day(offset)}: ${(await sheet.text()).slice(0, 160)}`)
      }
      if (offset < -11) continue
      const presses = (await ok<{ presses: Array<{ id: string; number: number }> }>('press', 'GET', `/api/cc_production/press/setup?date=${day(offset)}`)).presses
      const press = presses[index % presses.length]
      const thickness = thicknesses[index % thicknesses.length]
      const perSheet = Math.round(thickness * 4.6)
      const created = await send('press', 'POST', '/api/cc_production/press/batches', { batchDate: day(offset), pressId: press.id, daylights: [{ no: 1, sheets: [{ thicknessMm: thickness, count: 2, weightKg: perSheet, grade: '10x10' }] }, { no: 2, sheets: [{ thicknessMm: thickness, count: 2, weightKg: perSheet, grade: '10x10' }] }], remark: 'Regular production' })
      if (!created.ok()) {
        problems.push(`Press batch ${day(offset)}: ${(await created.text()).slice(0, 200)}`)
        continue
      }
      const pressed = await json<{ id: string; batchNo: string }>(created)
      if (!(await soft(`Press post ${pressed.batchNo}`, 'press', 'POST', '/api/cc_production/press/batches/action', { id: pressed.id, action: 'post' }, `/api/cc_production/press/batches?id=${pressed.id}`))) continue
      pressBatches += 1
      if (offset > -5) continue
      const floor = (await ok<{ floorLots: Array<{ lotId: string; lotNumber: string }> }>('press', 'GET', '/api/cc_production/finishing/setup')).floorLots
      const lot = floor.find((entry) => entry.lotNumber === `${pressed.batchNo} ${thickness}mm 10x10`)
      if (!lot) continue
      const cut = await send('press', 'POST', '/api/cc_production/cutting', { entryDate: day(offset + 1), lotId: lot.lotId, cutSize: '8x4', sheets: [1, 2, 3, 4].map((no) => ({ no, weightKg: Math.round(perSheet * 0.925 * 10) / 10 })) })
      if (!cut.ok()) {
        problems.push(`Cutting ${pressed.batchNo}: ${(await cut.text()).slice(0, 160)}`)
        continue
      }
      const cutRow = await json<{ outputLotNumber: string }>(cut)
      const trimmed = (await ok<{ floorLots: Array<{ lotId: string; lotNumber: string }> }>('qc', 'GET', '/api/cc_production/finishing/setup')).floorLots.find((entry) => entry.lotNumber === cutRow.outputLotNumber)
      if (!trimmed) continue
      await soft(`Thickness ${pressed.batchNo}`, 'qc', 'POST', '/api/cc_production/thickness', { inspectDate: day(offset + 1), lotId: trimmed.lotId, minusMm: 0.3, plusMm: 0.8, readings: Array.from({ length: 12 }, (_, position) => Math.round((thickness + 0.1 + (position % 3) / 10) * 100) / 100) })
      const report = await send('qc', 'POST', '/api/cc_production/fg-inspection', { reportDate: day(offset + 2), inspector: 'Neha Joshi', rows: [{ sourceLotId: trimmed.lotId, sheetSize: '8x4', qtyNos: 4, disposition: 'stock' }] })
      if (report.ok()) {
        const draft = await json<{ id: string }>(report)
        if (await soft(`FG post ${pressed.batchNo}`, 'qc', 'POST', '/api/cc_production/fg-inspection/action', { id: draft.id, action: 'post' }, `/api/cc_production/fg-inspection?id=${draft.id}`)) fgReports += 1
      } else problems.push(`FG report ${pressed.batchNo}: ${(await report.text()).slice(0, 160)}`)
    }
    note(`Plant: ${resinBatches} resin batches, ${sheets} coating sheets, ${pressBatches} press batches, ${fgReports} FG inspections (newer pressed lots still on the floor)`)
  })

  test('moulding: three days of both shifts on the moulding presses, posted and signed', async () => {
    const setup = await ok<{ presses: Array<{ id: string; number: number }>; operators: string[] }>('press', 'GET', '/api/cc_production/moulding/setup')
    const plan = [
      { die: 'D-101', weight: 0.12, shots: 60, cavities: 4 },
      { die: 'D-102', weight: 0.045, shots: 70, cavities: 6 },
      { die: 'D-103', weight: 0.21, shots: 55, cavities: 2 },
      { die: 'D-105', weight: 0.09, shots: 50, cavities: 3 },
    ]
    let posted = 0
    for (const offset of [-3, -2, -1]) {
      for (const shift of [1, 2]) {
        const entries = plan.map((entry, index) => {
          const press = setup.presses[(index * 3 + shift) % setup.presses.length]
          const pieces = (entry.shots - index * 5 + offset) * entry.cavities
          return { pressId: press.id, dieNo: entry.die, articleWeightKg: String(entry.weight), productionNos: String(pieces), chindiKg: String(Math.round(pieces * entry.weight * 0.7 * 1000) / 1000), operatorName: setup.operators[(index + shift) % setup.operators.length], startTime: shift === 1 ? '08:00' : '20:00', dieHeatTime: shift === 1 ? '07:20' : '19:20' }
        }).filter((entry, position, list) => list.findIndex((other) => other.pressId === entry.pressId) === position)
        const saved = await send('press', 'PUT', '/api/cc_production/moulding', { entryDate: day(offset), shift, entries })
        if (!saved.ok()) {
          problems.push(`Moulding ${day(offset)} shift ${shift}: ${(await saved.text()).slice(0, 200)}`)
          continue
        }
        const block = (await json<{ shifts: Array<{ shift: number; version: string }> }>(saved)).shifts.find((entry) => entry.shift === shift)
        const posting = await (contexts.get('press') ?? admin).post('/api/cc_production/moulding/action', { data: { entryDate: day(offset), shift, action: 'post' }, headers: block?.version ? { [LOCK]: block.version } : {} })
        if (posting.ok()) posted += 1
        else problems.push(`Moulding post ${day(offset)} shift ${shift}: ${(await posting.text()).slice(0, 200)}`)
      }
    }
    note(`Moulding: ${posted} shifts posted on dies D-101, D-102, D-103 and D-105`)
  })

  test('test certificates: one issued, one still a draft', async () => {
    const templates = (await ok<{ items: Array<{ id: string; grade: string; isActive: boolean }> }>('qc', 'GET', '/api/cc_production/tc/templates')).items.filter((entry) => entry.isActive)
    if (!templates.length) {
      problems.push('No test certificate template to start from')
      return
    }
    const names = Object.keys(customer)
    for (const [index, issue] of [[0, true], [1, false]] as const) {
      const created = await send('qc', 'POST', '/api/cc_production/tc', { templateId: templates[index % templates.length].id, certDate: day(-2 + index), customerId: customer[names[index + 2]], thicknessMm: index ? 6 : 10, traceability: `DEMO/PB/${index + 1}` })
      if (!created.ok()) {
        problems.push(`Test certificate: ${(await created.text()).slice(0, 200)}`)
        continue
      }
      const cert = await json<{ id: string; updatedAt: string; rows: Array<{ key: string; check: { kind: string; value?: number; nominal?: string } }> }>(created)
      const observed: Record<string, string> = {}
      for (const row of cert.rows) {
        if (row.check.kind === 'min') observed[row.key] = String(Math.round(((row.check.value ?? 0) * 1.15 + 1) * 100) / 100)
        else if (row.check.kind === 'max') observed[row.key] = String(Math.round((row.check.value ?? 0) * 0.6 * 100) / 100)
        else if (row.check.kind === 'range') observed[row.key] = index ? '5.9 to 6.1' : '9.8 to 10.2'
        else observed[row.key] = 'OK'
      }
      const filled = await send('qc', 'PUT', '/api/cc_production/tc', { id: cert.id, observed, testedBy: 'Neha Joshi (Lab)', verifiedBy: 'Kiran Shah (Director)' }, `/api/cc_production/tc?id=${cert.id}`)
      if (!filled.ok()) problems.push(`Test certificate fill: ${(await filled.text()).slice(0, 200)}`)
      if (issue && filled.ok()) await soft('Issue test certificate', 'qc', 'POST', '/api/cc_production/tc/issue', { id: cert.id }, `/api/cc_production/tc?id=${cert.id}`)
    }
    note('Test certificates: one issued, one draft')
  })

  test('plan for today and tomorrow, and a damaged sheet written off', async () => {
    for (const date of [day(0), day(1)]) {
      await soft(`Plan ${date}`, 'owner', 'PUT', '/api/cc_production/plan', { planDate: date, notes: 'Push 12 mm for Kanpur and Narmada', lines: [{ area: 'resin', resource: '', plannedQty: 450, unit: 'kg' }, { area: 'coating', resource: 'Dryer 1', plannedQty: 600, unit: 'kg' }, { area: 'press', resource: '22', plannedQty: 900, unit: 'kg' }, { area: 'press', resource: '23', plannedQty: 700, unit: 'kg' }] }, `/api/cc_production/plan?date=${date}`)
    }
    const fg = (await ok<{ items: Array<{ lotId: string; lotNumber: string; free: number; place: string }> }>('store', 'GET', '/api/cc_production/finishing/lots')).items.find((lot) => lot.place === 'fg' && lot.lotNumber === 'OPN-FG-07' && lot.free > 20)
    if (fg) await soft('Damage', 'store', 'POST', '/api/cc_production/damage', { entryDate: day(-5), lotId: fg.lotId, kg: 12, reason: 'Edge chipped while loading' })
    note('Production plan for today and tomorrow; one damage write-off')
  })
})
