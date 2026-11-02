const base = process.env.CC_BASE_URL ?? 'http://localhost:3010'
const email = process.env.CC_ADMIN_EMAIL
const password = process.env.CC_ADMIN_PASSWORD
if (!email || !password) {
  console.error('Set CC_ADMIN_EMAIL and CC_ADMIN_PASSWORD (and CC_BASE_URL if the app is not on http://localhost:3010)')
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
  const text = await response.text()
  const json = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${json?.error ?? text.slice(0, 200)}`)
  return json
}

const step = (label) => console.log(`\n▸ ${label}`)

const skip = new Set((process.env.CC_DEMO_SKIP ?? '').split(',').map((entry) => entry.trim()).filter(Boolean))

if (skip.has('company')) console.log('\n▸ company: skipped (CC_DEMO_SKIP)')
else {
  step('Company details: a made-up letterhead')
  await call('/api/cc_accounts/company', 'PUT', {
    name: 'Sample Composites Pvt. Ltd.',
    legalName: 'Sample Composites Private Limited',
    gstin: '24AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    address: 'Plot 12, Demo Industrial Estate, Sample Road, Ahmedabad 380000, Gujarat',
    phone: '+91 90000 00001',
    email: 'office@sample-composites.example',
    website: 'www.sample-composites.example',
    bankName: 'Sample Bank',
    bankBranch: 'Demo Branch',
    bankAccount: '000000000000',
    bankIfsc: 'SMPL0000001',
    signatory: 'Authorised Signatory',
    piValidityDays: 15,
    grnOverPercent: 2,
    letterhead: { stateName: 'Gujarat', stateCode: '24', jurisdiction: 'Ahmedabad', declaration: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.' },
  })
  console.log('  saved')
}

if (skip.has('operators')) console.log('\n▸ operators: skipped (CC_DEMO_SKIP)')
else {
  step('Operators: made-up names')
  await call('/api/cc_lists/lists', 'PUT', { key: 'operators', options: ['Ramesh K.', 'Sunil P.', 'Imran S.', 'Deepak V.', 'Arjun M.', 'Kishore T.'].map((value) => ({ value, active: true })) })
  console.log('  6 operators')
}

step('Moulds: made-up dies with cavities')
const dies = [
  { dieNo: 'D-101', description: 'Bush 40 OD', cavities: 4, heatUpMinutes: 40 },
  { dieNo: 'D-102', description: 'Spacer 25 x 10', cavities: 6, heatUpMinutes: 35 },
  { dieNo: 'D-103', description: 'Washer 60 OD', cavities: 2, heatUpMinutes: 45 },
  { dieNo: 'D-104', description: 'Terminal block', cavities: 1, heatUpMinutes: 50 },
  { dieNo: 'D-105', description: 'Cable cleat', cavities: 3, heatUpMinutes: 40 },
  { dieNo: 'D-106', description: 'Insulating sleeve', cavities: 8, heatUpMinutes: 30 },
]
for (const die of dies) {
  try {
    await call('/api/cc_production/masters', 'POST', { type: 'moulds', values: { mouldType: 'die', ...die } })
    console.log(`  ${die.dieNo} · ${die.cavities} cavities`)
  } catch (error) {
    console.log(`  ${die.dieNo}: ${error.message}`)
  }
}

step('Moulded parts for those dies')
const parts = [
  { name: 'Moulded bush D-101', fields: { die_no: 'D-101', article_weight_kg: '0.120' } },
  { name: 'Moulded spacer D-102', fields: { die_no: 'D-102', article_weight_kg: '0.045' } },
  { name: 'Moulded washer D-103', fields: { die_no: 'D-103', article_weight_kg: '0.210' } },
  { name: 'Moulded terminal block D-104', fields: { die_no: 'D-104', article_weight_kg: '0.650' } },
  { name: 'Moulded cable cleat D-105', fields: { die_no: 'D-105', article_weight_kg: '0.090' } },
  { name: 'Moulded sleeve D-106', fields: { die_no: 'D-106', article_weight_kg: '0.030' } },
]
const existing = await call('/api/cc_products/search?kinds=moulded&limit=100')
const have = new Set((existing.items ?? []).map((item) => String(item.title).toLowerCase()))
const missing = parts.filter((part) => !have.has(part.name.toLowerCase()))
if (missing.length) {
  const imported = await call('/api/cc_products/import', 'POST', { kind: 'moulded', updateExisting: false, rows: missing })
  console.log(`  ${(imported.results ?? []).filter((row) => row.status === 'created').length} created`)
} else console.log('  already there')

step('Recipes: standard material per batch, B-stage, sheet and moulded part (made-up figures)')
const kinds = ['chemical', 'reinforcement', 'chindi', 'resin', 'bstage', 'laminate', 'moulded']
const byTitle = new Map()
for (const kind of kinds) {
  const found = await call(`/api/cc_products/search?kinds=${kind}&limit=100`)
  for (const item of found.items ?? []) byTitle.set(String(item.title).toLowerCase(), item.id)
}
const id = (title) => byTitle.get(title.toLowerCase()) ?? (title.startsWith('B-stage') ? [...byTitle.entries()].find(([name]) => name.startsWith(title.toLowerCase().replace('b-stage for ', 'b-stage ')))?.[1] : undefined)
const recipes = [
  { level: 'resin', name: 'P.F. Resin PFC', output: 'P.F. Resin PFC', outputQty: 100, lines: [['Phenol', 60], ['Formaldehyde', 70], ['Caustic Soda Flakes', 1.5], ['Methanol', 8]] },
  { level: 'coating', name: '10x10', output: 'B-stage for 10x10', outputQty: 100, lines: [['10x10', 55], ['P.F. Resin PFC', 45]] },
  { level: 'coating', name: '6x6', output: 'B-stage for 6x6', outputQty: 100, lines: [['6x6', 52], ['P.F. Resin PFC', 48]] },
  { level: 'laminate', name: 'Fabric 10x10 Sheet', output: 'Fabric 10x10 Sheet', outputQty: 1, lines: [['B-stage for 10x10', 56]] },
  { level: 'laminate', name: 'F2F3 10x10 Sheet', output: 'F2F3 10x10 Sheet', outputQty: 1, lines: [['B-stage for 10x10', 50]] },
  { level: 'moulded', name: 'Moulded bush D-101', dieNo: 'D-101', output: 'Moulded bush D-101', outputQty: 100, lines: [['Cotton chindi', 9], ['B-stage for 10x10', 3]] },
]
const existingRecipes = new Set(((await call('/api/cc_production/recipes')).items ?? []).map((recipe) => `${recipe.level}:${String(recipe.name).toLowerCase()}`))
for (const recipe of recipes) {
  if (existingRecipes.has(`${recipe.level}:${recipe.name.toLowerCase()}`)) {
    console.log(`  ${recipe.name}: already there`)
    continue
  }
  const lines = recipe.lines.filter(([title]) => id(title)).map(([title, kg]) => ({ productId: id(title), kg, tolerancePct: 3 }))
  if (!lines.length) {
    console.log(`  ${recipe.name}: items missing, skipped`)
    continue
  }
  try {
    await call('/api/cc_production/recipes', 'POST', { level: recipe.level, name: recipe.name, outputProductId: id(recipe.output) ?? null, dieNo: recipe.dieNo ?? null, outputQty: recipe.outputQty, lines, notes: 'Demo standard; replace with the plant figures.' })
    console.log(`  ${recipe.name} · ${lines.length} materials per ${recipe.outputQty}`)
  } catch (error) {
    console.log(`  ${recipe.name}: ${error.message}`)
  }
}

if (skip.has('logins')) console.log('\n▸ logins: skipped (CC_DEMO_SKIP)')
else {
  step('Default framework logins removed')
  const users = await call('/api/auth/users?pageSize=100')
  for (const user of users.items ?? []) {
    if (String(user.email ?? '').endsWith('@acme.com')) {
      try {
        await call(`/api/auth/users?id=${user.id}`, 'DELETE')
        console.log(`  removed ${user.email}`)
      } catch (error) {
        console.log(`  kept ${user.email}: ${error.message.replace(/^.*→ \d+ /, '')}`)
      }
    }
  }
}

console.log('\nDone. Next: load the demo (npx playwright test -c e2e/cc/demo.config.ts).')
