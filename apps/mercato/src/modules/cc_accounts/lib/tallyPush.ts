import { logPushOnDocuments } from './tallyLog'
import type { OrderContext } from '../../cc_orders/lib/server'
import { CompanyProfile, TallyPush, type TallyPushAttempt, type TallyPushDocument, type TallyPushStatus, type TallySettings } from '../data/entities'
import { DEFAULT_LEDGERS, remoteIdOf, tallyData, tallyXml, type TallyKind, type TallyLedgers, type TallyVoucher } from './tally'
import { AccountsError } from './service'
import { bridgeAlive, callTally, companiesRequest, ledgersRequest, parseCompanies, parseLedgers, parseVouchers, readFromTally, vouchersRequest, type TallyAnswer, type TallyLedger } from './tallyClient'

export function settingsView(profile: CompanyProfile | null): TallySettings & { ledgers: TallyLedgers; mode: 'direct' | 'bridge' } {
  const saved = profile?.tallySettings ?? null
  return {
    url: saved?.url ?? null,
    company: saved?.company ?? null,
    ledgers: { ...DEFAULT_LEDGERS, ...(saved?.ledgers ?? {}) },
    mode: saved?.mode ?? 'direct',
    bridgeTokenHash: saved?.bridgeTokenHash ?? null,
    bridgeSeenAt: saved?.bridgeSeenAt ?? null,
    bridgeTallyUrl: saved?.bridgeTallyUrl ?? null,
  }
}

export function connectionLabel(settings: TallySettings): string {
  return settings.mode === 'bridge' ? `Bridge${settings.bridgeTallyUrl ? ` → ${settings.bridgeTallyUrl}` : ''}` : (settings.url ?? '—')
}

export function assertConnection(settings: TallySettings): void {
  if (settings.mode === 'bridge') {
    if (!settings.bridgeTokenHash) throw new AccountsError('Make a bridge key and start the Tally bridge on the accounts PC first')
    return
  }
  if (!settings.url) throw new AccountsError('Set the Tally address first (Tally settings on this page)')
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function missingLedgers(vouchers: TallyVoucher[], tallyLedgers: TallyLedger[], includeParties: boolean): string[] {
  const names = new Set(tallyLedgers.map((ledger) => ledger.name.trim().toLowerCase()))
  const wanted = new Set<string>()
  for (const voucher of vouchers) {
    for (const entry of voucher.entries) {
      if (!includeParties && same(entry.ledger, voucher.party)) continue
      wanted.add(entry.ledger)
    }
  }
  return [...wanted].filter((name) => !names.has(name.trim().toLowerCase())).sort()
}

export function pruneExistingLedgers(xml: string, tallyLedgers: TallyLedger[]): string {
  const names = new Set(tallyLedgers.map((ledger) => ledger.name.trim().toLowerCase()))
  return xml.replace(/<TALLYMESSAGE[^>]*><LEDGER NAME="([^"]*)"[\s\S]*?<\/TALLYMESSAGE>\n?/g, (block, name: string) => {
    const plain = name.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    return names.has(plain.trim().toLowerCase()) ? '' : block
  })
}

export function cleanTallyUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) throw new AccountsError('Tally address must start with http:// or https://')
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new AccountsError('Tally address is not valid, e.g. http://192.168.1.20:9000')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AccountsError('Tally address must start with http:// or https://')
  return url.toString().replace(/\/$/, '')
}

function voucherKey(voucher: Pick<TallyVoucher, 'type' | 'number'>): string {
  return `${voucher.type}:${voucher.number}`
}

function documentOf(voucher: TallyVoucher): TallyPushDocument {
  const partyEntry = voucher.entries.find((entry) => entry.ledger === voucher.party)
  return {
    key: voucherKey(voucher),
    type: voucher.type,
    number: voucher.number,
    date: voucher.date,
    reference: voucher.reference,
    party: voucher.party,
    amount: Math.round(Math.abs(partyEntry?.amount ?? 0) * 100) / 100,
    recordId: voucher.recordId ?? null,
  }
}

export async function pushedKeys(ctx: OrderContext): Promise<Map<string, string>> {
  const rows = await ctx.em.getConnection().execute<Array<{ code: string; key: string }>>(
    `select p.code, d->>'key' as key from cc_tally_pushes p, jsonb_array_elements(p.documents) d
      where p.tenant_id = ? and p.organization_id = ? and p.status in ('sent', 'partial', 'manual')`,
    [ctx.tenantId, ctx.organizationId],
  )
  return new Map(rows.map((row) => [row.key, row.code]))
}

async function nextPushCode(ctx: OrderContext): Promise<string> {
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(substring(code from 4)::int) as max from cc_tally_pushes where tenant_id = ? and organization_id = ? and code ~ '^TP-[0-9]+$'`,
    [ctx.tenantId, ctx.organizationId],
  )
  return `TP-${String(Number(row?.max ?? 0) + 1).padStart(4, '0')}`
}

function count(text: string, tag: string): number {
  const match = text.match(new RegExp(`<${tag}>\\s*(\\d+)\\s*</${tag}>`, 'i'))
  return match ? Number(match[1]) : 0
}

function lineErrors(text: string): string[] {
  return [...text.matchAll(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/gi)].map((match) => match[1].trim()).filter(Boolean).slice(0, 50)
}

function attemptFrom(answer: TallyAnswer, by: string | null): TallyPushAttempt {
  const at = new Date().toISOString()
  const text = answer.text ?? ''
  if (!answer.text) return { at, by, status: 'failed', httpStatus: answer.httpStatus, created: 0, altered: 0, errors: 0, lineErrors: [], error: answer.error ?? 'Tally sent nothing back' }
  const created = count(text, 'CREATED')
  const altered = count(text, 'ALTERED')
  const errors = count(text, 'ERRORS') + count(text, 'EXCEPTIONS')
  const problems = lineErrors(text)
  const recognised = /<RESPONSE|<ENVELOPE|<CREATED>/i.test(text)
  let status: TallyPushStatus = 'sent'
  let error: string | null = null
  if (!answer.ok) {
    status = 'failed'
    error = answer.error ?? `Tally answered ${answer.httpStatus}`
  } else if (!recognised) {
    status = 'failed'
    error = 'The answer did not come from Tally (check the address and that Tally is open with the gateway on)'
  } else if (errors || problems.length) {
    status = created + altered > 0 ? 'partial' : 'failed'
    error = problems[0] ?? `${errors} entr${errors === 1 ? 'y was' : 'ies were'} refused by Tally`
  }
  return { at, by, status, httpStatus: answer.httpStatus, created, altered, errors: Math.max(errors, problems.length), lineErrors: problems, error }
}

function failedAttempt(error: string, by: string | null): TallyPushAttempt {
  return { at: new Date().toISOString(), by, status: 'failed', httpStatus: null, created: 0, altered: 0, errors: 0, lineErrors: [], error }
}

async function loadSettings(ctx: OrderContext) {
  const profile = await ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  return settingsView(profile)
}

export async function tallyLedgers(ctx: OrderContext, settings: TallySettings): Promise<{ data: TallyLedger[] | null; error: string | null }> {
  const result = await readFromTally(ctx, settings, ledgersRequest(settings.company), 'ledgers', parseLedgers)
  return { data: result.data, error: result.error }
}

export async function pushRange(
  ctx: OrderContext,
  input: { from: string; to: string; kinds: TallyKind[]; masters: boolean; again: string[] },
  by: string | null,
): Promise<TallyPush> {
  const settings = await loadSettings(ctx)
  assertConnection(settings)
  const data = await tallyData(ctx, { from: input.from, to: input.to }, input.kinds, settings.ledgers)
  const already = await pushedKeys(ctx)
  const again = new Set(input.again)
  const vouchers = data.vouchers.filter((voucher) => !already.has(voucherKey(voucher)) || again.has(voucherKey(voucher)))
  if (!vouchers.length) {
    throw new AccountsError(data.vouchers.length ? `All ${data.vouchers.length} entries in these dates are already in Tally` : 'Nothing to send for these dates', 409)
  }
  const unbalanced = vouchers.filter((voucher) => Math.abs(voucher.entries.reduce((sum, entry) => sum + entry.amount, 0)) > 0.01)
  if (unbalanced.length) throw new AccountsError(`These entries do not balance, fix them before sending: ${unbalanced.map((voucher) => voucher.number).join(', ')}`)
  const usedParties = new Set(vouchers.map((voucher) => voucher.party))
  const parties = data.parties.filter((party) => usedParties.has(party.name))
  const companyName = settings.company || data.companyName
  let requestXml = tallyXml({ companyName, vouchers, parties }, input.masters)
  const inTally = await tallyLedgers(ctx, settings)
  let attempt: TallyPushAttempt
  let responseText: string | null = null
  if (!inTally.data) {
    attempt = failedAttempt(inTally.error ?? 'Could not read the ledgers from Tally', by)
  } else {
    const missing = missingLedgers(vouchers, inTally.data, !input.masters)
    if (missing.length) throw new AccountsError(`These ledgers are not in Tally${companyName ? ` (${companyName})` : ''}: ${missing.join(', ')}. Create them in Tally, or correct the ledger names in the Tally settings.`)
    requestXml = pruneExistingLedgers(requestXml, inTally.data)
    const answer = await callTally(ctx, settings, requestXml, 'push')
    attempt = attemptFrom(answer, by)
    responseText = answer.text
  }
  const push = ctx.em.create(TallyPush, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextPushCode(ctx),
    rangeFrom: input.from,
    rangeTo: input.to,
    kinds: input.kinds,
    withMasters: input.masters,
    tallyUrl: connectionLabel(settings),
    tallyCompany: companyName,
    documents: vouchers.map(documentOf),
    partyCount: input.masters ? (requestXml.match(/<LEDGER NAME=/g) ?? []).length : 0,
    requestXml,
    responseText: responseText ? responseText.slice(0, 20000) : null,
    status: attempt.status,
    attempts: [attempt],
    pushedByName: by,
  })
  ctx.em.persist(push)
  await ctx.em.flush()
  logPushOnDocuments(ctx, push, attempt, false)
  await ctx.em.flush()
  return push
}

export async function retryPush(ctx: OrderContext, push: TallyPush, by: string | null): Promise<TallyPush> {
  if (push.status === 'sent') throw new AccountsError('This push already went through', 409)
  if (push.status === 'manual') throw new AccountsError('This push is marked as entered in Tally by hand', 409)
  const already = await pushedKeys(ctx)
  already.forEach((code, key) => {
    if (code === push.code) already.delete(key)
  })
  const clash = push.documents.filter((doc) => already.has(doc.key))
  if (clash.length) throw new AccountsError(`Some of these entries were sent since in another push (${[...new Set(clash.map((doc) => already.get(doc.key)))].join(', ')}). Start a new push instead.`, 409)
  const settings = await loadSettings(ctx)
  assertConnection(settings)
  const inTally = await tallyLedgers(ctx, settings)
  let attempt: TallyPushAttempt
  if (!inTally.data) {
    attempt = failedAttempt(inTally.error ?? 'Could not read the ledgers from Tally', by)
  } else {
    push.requestXml = pruneExistingLedgers(push.requestXml, inTally.data)
    const answer = await callTally(ctx, settings, push.requestXml, 'push')
    attempt = attemptFrom(answer, by)
    push.responseText = answer.text ? answer.text.slice(0, 20000) : null
  }
  push.tallyUrl = connectionLabel(settings)
  push.status = attempt.status
  push.attempts = [...push.attempts, attempt]
  await ctx.em.flush()
  logPushOnDocuments(ctx, push, attempt, true)
  await ctx.em.flush()
  return push
}

export async function markPushManual(ctx: OrderContext, push: TallyPush, reason: string, by: string | null): Promise<TallyPush> {
  if (push.status === 'sent') throw new AccountsError('This push already went through', 409)
  if (push.status === 'manual') throw new AccountsError('Already marked as entered by hand', 409)
  const attempt: TallyPushAttempt = { at: new Date().toISOString(), by, status: 'manual', httpStatus: null, created: 0, altered: 0, errors: 0, lineErrors: [], error: reason }
  push.status = 'manual'
  push.attempts = [...push.attempts, attempt]
  await ctx.em.flush()
  const { recordActivity } = await import('../../cc_audit/lib/activity')
  const { TALLY_RECORD_TYPE } = await import('./tallyLog')
  recordActivity(ctx.em, ctx, { recordType: 'tally_push', recordId: push.id, action: 'marked_manual', kind: 'correction', summary: 'Marked as entered in Tally by hand; it will not be sent again', reason, actorUserId: ctx.userId ?? null, actorName: by })
  for (const doc of push.documents) {
    const recordType = TALLY_RECORD_TYPE[doc.type]
    if (!doc.recordId || !recordType) continue
    recordActivity(ctx.em, ctx, { recordType, recordId: doc.recordId, action: 'tally_manual', kind: 'system', summary: `Entered in Tally by hand (${push.code}, ${doc.type} ${doc.number})`, reason, links: [{ type: 'tally_push', id: push.id, label: push.code }], actorUserId: ctx.userId ?? null, actorName: by })
  }
  await ctx.em.flush()
  return push
}

export function pushView(push: TallyPush, withXml = false) {
  const last = push.attempts[push.attempts.length - 1] ?? null
  return {
    id: push.id,
    code: push.code,
    rangeFrom: push.rangeFrom,
    rangeTo: push.rangeTo,
    kinds: push.kinds,
    withMasters: push.withMasters,
    tallyUrl: push.tallyUrl,
    tallyCompany: push.tallyCompany ?? null,
    status: push.status,
    documents: push.documents,
    voucherCount: push.documents.length,
    partyCount: push.partyCount,
    amount: Math.round(push.documents.reduce((sum, doc) => sum + doc.amount, 0) * 100) / 100,
    attempts: push.attempts,
    lastAttempt: last,
    pushedByName: push.pushedByName ?? null,
    createdAt: push.createdAt.toISOString(),
    updatedAt: push.updatedAt.toISOString(),
    ...(withXml ? { requestXml: push.requestXml, responseText: push.responseText ?? null } : {}),
  }
}

export async function findPush(ctx: OrderContext, id: string): Promise<TallyPush> {
  const push = await ctx.em.findOne(TallyPush, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!push) throw new AccountsError('Tally push not found', 404)
  return push
}

export function publicSettings(profile: CompanyProfile | null) {
  const settings = settingsView(profile)
  return {
    mode: settings.mode,
    url: settings.url,
    company: settings.company,
    ledgers: settings.ledgers,
    bridgeKeySet: Boolean(settings.bridgeTokenHash),
    bridgeSeenAt: settings.bridgeSeenAt ?? null,
    bridgeAlive: bridgeAlive(settings),
    bridgeTallyUrl: settings.bridgeTallyUrl ?? null,
    hasCompany: Boolean(profile),
    defaults: DEFAULT_LEDGERS,
  }
}


export async function testConnection(ctx: OrderContext) {
  const result = await runConnectionTest(ctx)
  await ctx.em.getConnection().execute(
    `update cc_company_profiles set tally_settings = coalesce(tally_settings, '{}'::jsonb) || ?::jsonb where tenant_id = ? and organization_id = ?`,
    [JSON.stringify({ lastTestOk: result.ok, lastTestAt: new Date().toISOString() }), ctx.tenantId, ctx.organizationId],
  )
  return result
}

async function runConnectionTest(ctx: OrderContext) {
  const settings = await loadSettings(ctx)
  assertConnection(settings)
  const companies = await readFromTally(ctx, settings, companiesRequest(), 'companies', parseCompanies)
  if (!companies.data) return { ok: false, via: companies.via, error: companies.error, companies: [] as string[], companyFound: false, ledgers: [] as string[], missing: [] as string[] }
  const names = companies.data.map((company) => company.name)
  const companyFound = settings.company ? names.some((name) => same(name, settings.company ?? '')) : names.length > 0
  if (settings.company && !companyFound) {
    return { ok: false, via: companies.via, error: `Company "${settings.company}" is not open in Tally. Open it in Tally, or pick one of: ${names.join(', ') || 'none loaded'}`, companies: names, companyFound, ledgers: [], missing: [] }
  }
  const ledgers = await tallyLedgers(ctx, settings)
  if (!ledgers.data) return { ok: false, via: companies.via, error: ledgers.error, companies: names, companyFound, ledgers: [], missing: [] }
  const have = new Set(ledgers.data.map((ledger) => ledger.name.trim().toLowerCase()))
  const missing = [...new Set(Object.values(settings.ledgers))].filter((name) => !have.has(name.trim().toLowerCase())).sort()
  return { ok: true, via: companies.via, error: null, companies: names, companyFound, ledgers: ledgers.data.map((ledger) => ledger.name).sort((a, b) => a.localeCompare(b)).slice(0, 3000), missing }
}

export type CheckRow = { key: string; date: string; type: string; number: string; party: string; erpAmount: number | null; tallyAmount: number | null; status: 'matched' | 'amount_differs' | 'not_in_tally' | 'only_in_tally' | 'cancelled_in_tally'; recordId: string | null; pushCode: string | null }

export async function checkAgainstTally(ctx: OrderContext, range: { from: string; to: string }, kinds: TallyKind[]) {
  const settings = await loadSettings(ctx)
  assertConnection(settings)
  const [data, pushed, fromTally] = await Promise.all([
    tallyData(ctx, range, kinds, settings.ledgers),
    pushedKeys(ctx),
    readFromTally(ctx, settings, vouchersRequest(settings.company, range.from, range.to), 'vouchers', parseVouchers),
  ])
  if (!fromTally.data) throw new AccountsError(fromTally.error ?? 'Could not read the vouchers from Tally', 502)
  const wantedTypes = new Set<string>(data.vouchers.map((voucher) => voucher.type))
  const kindTypes: Record<string, string> = { sales: 'Sales', credit_notes: 'Credit Note', receipts: 'Receipt', purchases: 'Purchase', payments: 'Payment' }
  for (const kind of kinds) wantedTypes.add(kindTypes[kind])
  const tallyRows = fromTally.data.filter((row) => row.date >= range.from && row.date <= range.to && wantedTypes.has(row.type))
  const byRemote = new Map(tallyRows.filter((row) => row.remoteId).map((row) => [row.remoteId!, row]))
  const byNumber = new Map(tallyRows.map((row) => [`${row.type}:${row.number}`, row]))
  const used = new Set<typeof tallyRows[number]>()
  const rows: CheckRow[] = []
  for (const voucher of data.vouchers) {
    const key = voucherKey(voucher)
    const match = byRemote.get(remoteIdOf(voucher)) ?? byNumber.get(key) ?? null
    const erpAmount = documentOf(voucher).amount
    if (match) used.add(match)
    const status: CheckRow['status'] = !match ? 'not_in_tally' : match.cancelled ? 'cancelled_in_tally' : Math.abs(match.amount - erpAmount) > 1 ? 'amount_differs' : 'matched'
    rows.push({ key, date: voucher.date, type: voucher.type, number: voucher.number, party: voucher.party, erpAmount, tallyAmount: match ? match.amount : null, status, recordId: voucher.recordId ?? null, pushCode: pushed.get(key) ?? null })
  }
  for (const row of tallyRows) {
    if (used.has(row)) continue
    rows.push({ key: `tally:${row.type}:${row.number}:${row.date}`, date: row.date, type: row.type, number: row.number, party: row.party ?? '', erpAmount: null, tallyAmount: row.amount, status: 'only_in_tally', recordId: null, pushCode: null })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.number.localeCompare(b.number))
  const counts = rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {})
  return { via: fromTally.via, counts, rows }
}
