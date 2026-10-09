import type { OrderContext } from '../../cc_orders/lib/server'
import { CompanyProfile, TallyPush, type TallyPushAttempt, type TallyPushDocument, type TallyPushStatus, type TallySettings } from '../data/entities'
import { DEFAULT_LEDGERS, tallyData, tallyXml, type TallyKind, type TallyLedgers, type TallyVoucher } from './tally'
import { AccountsError } from './service'

const TIMEOUT_MS = 15000
const RESPONSE_LIMIT = 20000

export function settingsView(profile: CompanyProfile | null): TallySettings & { ledgers: TallyLedgers } {
  const saved = profile?.tallySettings ?? null
  return {
    url: saved?.url ?? null,
    company: saved?.company ?? null,
    ledgers: { ...DEFAULT_LEDGERS, ...(saved?.ledgers ?? {}) },
  }
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
      where p.tenant_id = ? and p.organization_id = ? and p.status in ('sent', 'partial')`,
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

export async function sendToTally(url: string, body: string, by: string | null): Promise<{ attempt: TallyPushAttempt; responseText: string | null }> {
  const at = new Date().toISOString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8' }, body, signal: controller.signal })
    const text = (await response.text()).slice(0, RESPONSE_LIMIT)
    const created = count(text, 'CREATED')
    const altered = count(text, 'ALTERED')
    const errors = count(text, 'ERRORS') + count(text, 'EXCEPTIONS')
    const problems = lineErrors(text)
    const recognised = /<RESPONSE|<ENVELOPE|<CREATED>/i.test(text)
    let status: TallyPushStatus = 'sent'
    let error: string | null = null
    if (!response.ok) {
      status = 'failed'
      error = `Tally answered ${response.status}`
    } else if (!recognised) {
      status = 'failed'
      error = 'The answer did not come from Tally (check the address and that Tally is open with the gateway on)'
    } else if (errors || problems.length) {
      status = created + altered > 0 ? 'partial' : 'failed'
      error = problems[0] ?? `${errors} entr${errors === 1 ? 'y was' : 'ies were'} refused by Tally`
    }
    return { attempt: { at, by, status, httpStatus: response.status, created, altered, errors: Math.max(errors, problems.length), lineErrors: problems, error }, responseText: text }
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError'
    const message = aborted ? `Tally did not answer within ${TIMEOUT_MS / 1000} seconds` : `Could not reach Tally at ${url} (is Tally open with the gateway on?)`
    return { attempt: { at, by, status: 'failed', httpStatus: null, created: 0, altered: 0, errors: 0, lineErrors: [], error: message }, responseText: null }
  } finally {
    clearTimeout(timer)
  }
}

export async function pushRange(
  ctx: OrderContext,
  input: { from: string; to: string; kinds: TallyKind[]; masters: boolean; again: string[] },
  by: string | null,
): Promise<TallyPush> {
  const profile = await ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  const settings = settingsView(profile)
  if (!settings.url) throw new AccountsError('Set the Tally address first (Tally settings on this page)')
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
  const requestXml = tallyXml({ companyName: settings.company || data.companyName, vouchers, parties }, input.masters)
  const sent = await sendToTally(settings.url, requestXml, by)
  const push = ctx.em.create(TallyPush, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextPushCode(ctx),
    rangeFrom: input.from,
    rangeTo: input.to,
    kinds: input.kinds,
    withMasters: input.masters,
    tallyUrl: settings.url,
    tallyCompany: settings.company || data.companyName,
    documents: vouchers.map(documentOf),
    partyCount: input.masters ? parties.length : 0,
    requestXml,
    responseText: sent.responseText,
    status: sent.attempt.status,
    attempts: [sent.attempt],
    pushedByName: by,
  })
  await ctx.em.persist(push).flush()
  return push
}

export async function retryPush(ctx: OrderContext, push: TallyPush, by: string | null): Promise<TallyPush> {
  if (push.status === 'sent') throw new AccountsError('This push already went through', 409)
  if (push.attempts.some((attempt) => attempt.created + attempt.altered > 0)) {
    throw new AccountsError('Tally already took part of this push, so sending it again would double those entries. Fix the refused ones in Tally, or start a new push and tick only those entries.', 409)
  }
  const already = await pushedKeys(ctx)
  already.forEach((code, key) => {
    if (code === push.code) already.delete(key)
  })
  const clash = push.documents.filter((doc) => already.has(doc.key))
  if (clash.length) throw new AccountsError(`Some of these entries were sent since in another push (${[...new Set(clash.map((doc) => already.get(doc.key)))].join(', ')}). Start a new push instead.`, 409)
  const profile = await ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  const url = settingsView(profile).url ?? push.tallyUrl
  const sent = await sendToTally(url, push.requestXml, by)
  push.tallyUrl = url
  push.status = sent.attempt.status
  push.responseText = sent.responseText
  push.attempts = [...push.attempts, sent.attempt]
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
