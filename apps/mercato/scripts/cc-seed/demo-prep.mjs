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

step('Operators: made-up names')
await call('/api/cc_lists/lists', 'PUT', { key: 'operators', options: ['Ramesh K.', 'Sunil P.', 'Imran S.', 'Deepak V.', 'Arjun M.', 'Kishore T.'].map((value) => ({ value, active: true })) })
console.log('  6 operators')

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

console.log('\nDone. Next: load the demo (npx playwright test -c e2e/cc/demo.config.ts).')
