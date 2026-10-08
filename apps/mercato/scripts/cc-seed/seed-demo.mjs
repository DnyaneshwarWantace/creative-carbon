const base = process.env.CC_BASE_URL ?? 'http://localhost:3010'
const email = process.env.CC_ADMIN_EMAIL ?? 'admin@creativecarbon.local'
const password = process.env.CC_ADMIN_PASSWORD
if (!password) {
  console.error('Set CC_ADMIN_PASSWORD (and CC_BASE_URL if the app is not on http://localhost:3010)')
  process.exit(1)
}
const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
if (!login.ok) {
  console.error('Login failed', login.status)
  process.exit(1)
}
const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')

async function call(path, method = 'GET', body, updatedAt) {
  const response = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json', ...(updatedAt ? { [LOCK]: updatedAt } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const json = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${json?.error ?? JSON.stringify(json).slice(0, 200)}`)
  return json
}

const step = (label) => console.log(`\n▸ ${label}`)
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

step('Opening stock (lots DEMO-…)')
const resinSetup = await call('/api/cc_production/resin/setup')
const coatingSetup = await call('/api/cc_production/coating/setup')
const mouldingSetup = await call('/api/cc_production/moulding/setup')
const chem = (title) => resinSetup.chemicals.find((entry) => entry.title === title).id
const cloth = (title) => coatingSetup.cloths.find((entry) => entry.title === title).id
const opening = [
  [chem('Phenol'), 2600, 'DEMO-PHENOL'],
  [chem('Formaldehyde'), 3600, 'DEMO-FORMALDEHYDE'],
  [chem('Cardinol'), 320, 'DEMO-CARDINOL'],
  [chem('Liquid Ammonia'), 100, 'DEMO-NH3'],
  [chem('Caustic Soda Flakes'), 30, 'DEMO-CAUSTIC'],
  [chem('Methanol'), 300, 'DEMO-METHANOL'],
  [chem('DBP'), 80, 'DEMO-DBP'],
  [cloth('10x10'), 3300, 'DEMO-10x10'],
  [cloth('6x6'), 450, 'DEMO-6x6'],
  [cloth('G 6x6'), 100, 'DEMO-G6x6'],
  [cloth('G 10x10'), 150, 'DEMO-G10x10'],
  [cloth('Washing F2 1500'), 300, 'DEMO-F2-1500'],
  [mouldingSetup.chindi[0].id, 200, 'DEMO-CHINDI'],
]
const whA = await call('/api/cc_store/stock?place=wh_a')
const haveLot = new Set(whA.items.flatMap((item) => item.lots.map((lot) => lot.lotNumber)))
for (const [productId, quantity, lotNumber] of opening) {
  if (haveLot.has(lotNumber)) continue
  await call('/api/cc_store/stock/adjust', 'POST', { place: 'wh_a', productId, direction: 'in', quantity, newLot: { lotNumber }, reason: 'Opening stock', note: 'Demo data' })
  console.log(`  ${lotNumber}: ${quantity}`)
}

async function resinBatch(batchNo, batchDate, materials, extra) {
  const existing = await call(`/api/cc_production/resin/batches?search=${encodeURIComponent(batchNo)}`)
  if (existing.items.some((item) => item.batchNo === batchNo)) return console.log(`  ${batchNo} already there`)
  const reactor = resinSetup.reactors.find((entry) => entry.code === 'CCCPL-VES-2') ?? resinSetup.reactors[0]
  const draft = await call('/api/cc_production/resin/batches', 'POST', { batchDate, batchNo, reactorId: reactor.id, grade: 'PFC', materials: materials.map(([title, kg]) => ({ productId: chem(title), kg })), ...extra })
  const posted = await call('/api/cc_production/resin/batches/action', 'POST', { id: draft.id, action: 'post' }, draft.updatedAt)
  console.log(`  ${posted.batchNo}: ${posted.totalInputKg} kg in → ${posted.yieldKg} kg resin (${posted.yieldPct}%)`)
}

step('Resin batch CCCPL/110726/06 (from the batch report photo)')
await resinBatch(
  'CCCPL/110726/06',
  '2026-07-11',
  [['Phenol', 1000], ['Formaldehyde', 1700], ['Cardinol', 150], ['Liquid Ammonia', 40], ['Caustic Soda Flakes', 6.5], ['Methanol', 75]],
  {
    process: { steps: { check_ph_heat: { done: true }, stir_1: { done: true }, cool_change: { done: true }, stir_2: { done: true } }, startHeating: { tempC: 53, time: '9:10' }, stopHeating: { tempC: 86, time: '9:35' }, reactionStart: { tempC: 98, time: '9:53' }, reactionComplete: { tempC: 99, time: '10:31' }, gelChecked: true, vacuumStart: '10:31', coolingDuration: '4:00' },
    tests: { viscositySec: 560, gelTimeSec: 39, solidPct: 79 },
    yieldKg: 1600,
  },
)
step('Resin batch CCCPL/300926/01 (resin for the October coating)')
await resinBatch('CCCPL/300926/01', '2026-09-30', [['Phenol', 1150], ['Formaldehyde', 1800], ['Cardinol', 150], ['Liquid Ammonia', 45], ['Caustic Soda Flakes', 8], ['Methanol', 90]], { yieldKg: 1850 })

const dryer = (code) => coatingSetup.dryers.find((entry) => entry.code === code).id
async function coatingSheet(sheetDate, dryerCode, rows, slots) {
  const existing = await call(`/api/cc_production/coating/sheets?date=${sheetDate}`)
  if (existing.items.some((item) => item.dryerId === dryer(dryerCode))) return console.log(`  ${dryerCode} ${sheetDate} already there`)
  const draft = await call('/api/cc_production/coating/sheets', 'POST', { sheetDate, dryerId: dryer(dryerCode), rows, slots })
  const posted = await call('/api/cc_production/coating/sheets/action', 'POST', { id: draft.id, action: 'post' }, draft.updatedAt)
  console.log(`  ${dryerCode} ${sheetDate}: ${posted.figures.rawTotal} kg raw, ${posted.figures.nosTotal} nos, ${posted.figures.outputTotal} kg out → ${posted.rows.map((row) => row.bstageLotNumber).join(', ')}`)
}

step('Dryer sheets of 3 July (from the photo)')
await coatingSheet(
  '2026-07-03',
  'Dryer 2',
  [
    { sn: 1, clothProductId: cloth('10x10'), gsm: 300, kushan: 1070, treatedWeight: 1960, rawKg: 347, balanceRawKg: 0, coatedNos: 325, rcPct: 45, vcPct: 3.3 },
    { sn: 2, clothProductId: cloth('10x10'), gsm: 300, kushan: 980, treatedWeight: 1790, rawKg: 151, balanceRawKg: 0, coatedNos: 160, rcPct: 45, vcPct: 3.1 },
    { sn: 3, clothProductId: cloth('6x6'), gsm: 400, kushan: 1240, treatedWeight: 2260, rawKg: 298, balanceRawKg: 0, coatedNos: 235, rcPct: 45, vcPct: 3.4 },
    { sn: 4, clothProductId: cloth('G 6x6'), gsm: 280, kushan: 980, treatedWeight: 1760, rawKg: 65, balanceRawKg: 0, coatedNos: 66, rcPct: 44, vcPct: 3.2 },
  ],
  [
    { time: '8.00', outputKg: 637 },
    { time: '10.00', outputKg: 286.4 },
    { time: '12.00', outputKg: 531.1 },
    { time: '14.00', dbpKg: 16, outputKg: 116.16 },
    { time: '16.00' },
    { time: '18.00' },
    { time: '20.00' },
    { time: '22.00' },
  ],
)
await coatingSheet(
  '2026-07-03',
  'Dryer 3',
  [
    { sn: 6, clothProductId: cloth('10x10'), gsm: 300, kushan: 1070, treatedWeight: 1916, rawKg: 140, balanceRawKg: 0, coatedNos: 126, rcPct: 44, vcPct: 3.1 },
    { sn: 7, clothProductId: cloth('10x10'), gsm: 300, kushan: 1070, treatedWeight: 1926, rawKg: 343, balanceRawKg: 0, coatedNos: 317, rcPct: 44, vcPct: 3.2 },
    { sn: 8, clothProductId: cloth('10x10'), gsm: 300, kushan: 1020, treatedWeight: 1961, rawKg: 341, balanceRawKg: 0, coatedNos: 314, rcPct: 45, vcPct: 3.3 },
    { sn: 9, clothProductId: cloth('G 10x10'), gsm: 280, kushan: 920, treatedWeight: 1686, rawKg: 109, balanceRawKg: 0, coatedNos: 118, rcPct: 45, vcPct: 2.5 },
  ],
  [
    { time: '16.00', outputKg: 241.416 },
    { time: '18.00', outputKg: 610.542 },
    { time: '20.00', outputKg: 615.754 },
    { time: '22.00', dbpKg: 15, outputKg: 198.948 },
  ],
)
step('Dryer 1 sheet of 1 October (B-stage for the 2 October press batches)')
await coatingSheet('2026-10-01', 'Dryer 1', [
  { sn: 1, clothProductId: cloth('10x10'), gsm: 300, rawKg: 1800, coatedNos: 720, rcPct: 45, vcPct: 3.2 },
  { sn: 2, clothProductId: cloth('Washing F2 1500'), rawKg: 230, coatedNos: 400, rcPct: 45, vcPct: 3.0 },
  { sn: 3, clothProductId: cloth('6x6'), gsm: 400, rawKg: 100, coatedNos: 40, rcPct: 45, vcPct: 3.3 },
])

step('Press batches F/01–F/04 of 2 October (daily production batch report)')
const pressSetup = await call('/api/cc_production/press/setup?date=2026-10-02')
const press = pressSetup.presses.find((entry) => entry.number === 22) ?? pressSetup.presses[0]
const existingPress = await call('/api/cc_production/press/batches?month=2026-10')
const dl = (no, ...sheets) => ({ no, sheets })
const pressBatches = [
  [dl(1, { thicknessMm: 1.5, count: 10, weightKg: 6.4, weightMinKg: 6.2, grade: 'F2F3' }), dl(2, { thicknessMm: 15, count: 4, weightKg: 69.6, grade: '10x10' }), dl(3, { thicknessMm: 25, count: 4, weightKg: 118.05, grade: '10x10' })],
  [dl(1, { thicknessMm: 1.5, count: 10, weightKg: 6.4, weightMinKg: 6.2, grade: 'F2F3' }), dl(2, { thicknessMm: 25, count: 8, weightKg: 118.1, grade: '10x10' })],
  [
    dl(1, { thicknessMm: 25, weightKg: 117.6, grade: '10x10' }),
    dl(2, { thicknessMm: 25, weightKg: 118.2, grade: '10x10' }),
    dl(3, { thicknessMm: 1.5, count: 10, weightKg: 6.4, weightMinKg: 6.2, grade: 'F2F3' }),
    dl(4, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.2, grade: '10x10' }),
    dl(5, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.3, grade: '10x10' }),
    dl(6, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 45.8, grade: '10x10' }),
    dl(7, { thicknessMm: 15, weightKg: 69.7, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.4, grade: '10x10' }),
    dl(8, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.5, grade: '10x10' }),
    dl(9, { thicknessMm: 15, weightKg: 69.8, grade: '10x10' }, { thicknessMm: 10, weightKg: 46.6, grade: '10x10' }),
  ],
  [dl(1, { thicknessMm: 1.5, count: 10, weightKg: 6.4, weightMinKg: 6.2, grade: 'F2F3' }), dl(2, { thicknessMm: 27, weightKg: 125, grade: 'F2F3' }), dl(3, { thicknessMm: 15, count: 6, weightKg: 69.6, grade: '10x10' }), dl(4, { thicknessMm: 35, weightKg: 170.1, grade: '6x6' })],
]
if (existingPress.items.length) console.log(`  ${existingPress.items.length} October batches already there (${existingPress.items.map((item) => item.batchNo).join(', ')})`)
else {
  for (const daylights of pressBatches) {
    const draft = await call('/api/cc_production/press/batches', 'POST', { batchDate: '2026-10-02', pressId: press.id, daylights, checkedBy: 'Floor supervisor' })
    const posted = await call('/api/cc_production/press/batches/action', 'POST', { id: draft.id, action: 'post' }, draft.updatedAt)
    console.log(`  ${posted.batchNo}: ${posted.figures.paperLines.join(', ')} → ${posted.figures.totalKg.toFixed(3)} kg`)
  }
}

step('F/03 cut, thickness checked and FG inspected')
const finishing = await call('/api/cc_production/finishing/setup')
const lot25 = finishing.floorLots.find((lot) => lot.lotNumber === 'F/03/10/2026 25mm 10x10')
const lot10 = finishing.floorLots.find((lot) => lot.lotNumber === 'F/03/10/2026 10mm 10x10')
if (!lot25) console.log('  F/03 25 mm lot already cut or inspected')
else {
  const cut = await call('/api/cc_production/cutting', 'POST', { entryDate: '2026-10-03', lotId: lot25.lotId, cutSize: '8x4', sheets: [{ no: 1, weightKg: 108.6 }, { no: 2, weightKg: 108.9 }] })
  console.log(`  cut: ${cut.trimmedKg} kg trimmed, trim ${cut.trimKg} kg (${cut.trimPct}%) → ${cut.outputLotNumber}`)
  const cutLot = (await call('/api/cc_production/finishing/setup')).floorLots.find((lot) => lot.lotNumber === cut.outputLotNumber)
  const check = await call('/api/cc_production/thickness', 'POST', { inspectDate: '2026-10-03', lotId: cutLot.lotId, daylight: 'D1', minusMm: 0.5, plusMm: 1.2, readings: [25.6, 26.1, 25.7, 25.6, 26.0, 25.8, 25.5, 25.6, 25.5, 25.5, 25.6, 25.6] })
  console.log(`  thickness ${cutLot.lotNumber}: ${check.result}`)
  const rows = [{ sourceLotId: cutLot.lotId, sheetSize: '8x4', qtyNos: 2, disposition: 'allocation', customerName: 'BHEL' }]
  if (lot10) rows.push({ sourceLotId: lot10.lotId, sheetSize: '8x4', qtyNos: 6, disposition: 'export' })
  const report = await call('/api/cc_production/fg-inspection', 'POST', { reportDate: '2026-10-03', inspector: 'QC', rows })
  const posted = await call('/api/cc_production/fg-inspection/action', 'POST', { id: report.id, action: 'post' }, report.updatedAt)
  console.log(`  FG inspection: ${posted.totals.pieces} pieces, ${posted.totals.kg} kg into the FG store`)
}

step('Moulded products register, 13 June, 1st shift (from the photo)')
const day = await call('/api/cc_production/moulding?date=2026-06-13')
if (day.shifts[0].entries.length) console.log('  already there')
else {
  const machine = (number) => mouldingSetup.presses.find((entry) => entry.number === number).id
  const columns = [
    [1, '500', 15, 1.6, 7, 'Anjani', 8, { chindiKg: 2 }],
    [2, '1155', 22, 15.3, 3, 'Anjani', 1, {}],
    [3, '1140RL', 40, 5.3, 8, 'Anil', 32, { dieHeatTime: '(34mm)' }],
    [4, '1138', 400, 6.3, 7, 'Nagendra', null, {}],
    [10, '16x11x1000', 10000, 0.6, 36, null, null, {}],
    [11, '1221', 50, 0.9, 17, 'Rajesh', null, {}],
    [12, '1142', 100, 0.65, 17, 'Rajesh', 80, {}],
    [15, '520', 100, 2.1, 10, 'Anil', 75, { dieHeatTime: '(27mm)' }],
    [19, '1206', 100, 2.25, 12, 'Anjani', 8, {}],
    [20, '1401RA', 100, 5.2, 7, 'Nagendra', 7, { dieHeatTime: '(29mm)' }],
  ]
  const entries = columns.map(([number, dieNo, orderQty, articleWeightKg, productionNos, operatorName, priorMade, extra]) => ({ pressId: machine(number), dieNo, orderQty, articleWeightKg, productionNos, operatorName, priorMade, ...extra }))
  const saved = await call('/api/cc_production/moulding', 'PUT', { entryDate: '2026-06-13', shift: 1, entries })
  const posted = await call('/api/cc_production/moulding/action', 'POST', { entryDate: '2026-06-13', shift: 1, action: 'post' }, saved.shifts[0].version)
  console.log(`  ${posted.shifts[0].grandTotal} pieces, ${posted.shifts[0].weightTotal} kg; die 1142: ${posted.shifts[0].entries.find((entry) => entry.dieNo === '1142').total} of 100`)
}

step(`Production plan for today (${today})`)
const plan = await call(`/api/cc_production/plan?date=${today}`)
if (plan.lines.length) console.log('  already written')
else {
  await call('/api/cc_production/plan', 'PUT', {
    planDate: today,
    notes: 'Demo plan',
    lines: [
      { area: 'resin', resource: 'VES-2', item: 'PFC', plannedQty: 1600, unit: 'kg' },
      { area: 'coating', resource: 'Dryer 2', item: '10x10', plannedQty: 1500, unit: 'kg' },
      { area: 'press', resource: '22', item: '10x10', plannedQty: 1000, unit: 'kg' },
      { area: 'moulding', resource: '12', item: '1142', plannedQty: 30, unit: 'nos' },
    ],
  })
  console.log('  written')
}

console.log('\nDemo data ready. Open /backend/owner on a phone, then /backend/resin/batches, /backend/coating?date=2026-07-03, /backend/bstage, /backend/press/daily-report?date=2026-10-02, /backend/quality/fg-inspection and /backend/stock.')
