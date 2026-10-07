import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const base = process.env.CC_BASE_URL ?? 'http://localhost:3010'
const email = process.env.CC_ADMIN_EMAIL ?? 'admin@creativecarbon.local'
const password = process.env.CC_ADMIN_PASSWORD
if (!password) {
  console.error('Set CC_ADMIN_PASSWORD (and CC_BASE_URL if the app is not on http://localhost:3010)')
  process.exit(1)
}

const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
if (!login.ok) {
  console.error('Login failed', login.status)
  process.exit(1)
}
const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ')
const headers = { cookie, 'content-type': 'application/json' }

const here = path.dirname(fileURLToPath(import.meta.url))
const items = JSON.parse(await readFile(path.join(here, 'items.json'), 'utf8'))

for (const [kind, rows] of Object.entries(items)) {
  const existing = await fetch(`${base}/api/cc_products/search?kinds=${kind}&limit=100`, { headers }).then((response) => response.json())
  const names = new Set((existing.items ?? []).map((item) => String(item.title).toLowerCase()))
  const missing = rows.filter((row) => !names.has(row.name.toLowerCase()))
  if (!missing.length) {
    console.log(`${kind}: all ${rows.length} already there`)
    continue
  }
  const response = await fetch(`${base}/api/cc_products/import`, { method: 'POST', headers, body: JSON.stringify({ kind, updateExisting: false, rows: missing }) })
  const body = await response.json()
  const counts = {}
  for (const result of body.results ?? []) counts[result.status] = (counts[result.status] ?? 0) + 1
  console.log(`${kind}: ${JSON.stringify(counts)}`, response.ok ? '' : JSON.stringify(body).slice(0, 300))
  for (const failed of (body.results ?? []).filter((result) => result.status === 'failed')) console.log('  failed:', failed.name, failed.message)
}
