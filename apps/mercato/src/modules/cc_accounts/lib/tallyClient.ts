import { createHash, randomBytes } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { TallyJob, type TallySettings } from '../data/entities'

const TIMEOUT_MS = 15000
const BRIDGE_WAIT_MS = 25000
const BRIDGE_ALIVE_MS = 60000
const RESPONSE_LIMIT = 2_000_000

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

export type TallyAnswer = { ok: boolean; httpStatus: number | null; text: string | null; error: string | null; via: 'direct' | 'bridge' }

export function xmlEscape(value: string | null | undefined): string {
  return (value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function xmlUnescape(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function decodeTallyBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  if (bytes.length >= 4 && bytes[0] === 0x3c && bytes[1] === 0x00) return new TextDecoder('utf-16le').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

export function hashBridgeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newBridgeToken(): string {
  return `tb_${randomBytes(24).toString('base64url')}`
}

export function bridgeAlive(settings: Pick<TallySettings, 'bridgeSeenAt'>): boolean {
  return Boolean(settings.bridgeSeenAt && Date.now() - new Date(settings.bridgeSeenAt).getTime() < BRIDGE_ALIVE_MS)
}

async function direct(url: string, body: string): Promise<TallyAnswer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8' }, body, signal: controller.signal })
    const text = decodeTallyBytes(new Uint8Array(await response.arrayBuffer())).slice(0, RESPONSE_LIMIT)
    return { ok: response.ok, httpStatus: response.status, text, error: response.ok ? null : `Tally answered ${response.status}`, via: 'direct' }
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError'
    return { ok: false, httpStatus: null, text: null, error: aborted ? `Tally did not answer within ${TIMEOUT_MS / 1000} seconds` : `Could not reach Tally at ${url} (is Tally open with the gateway on?)`, via: 'direct' }
  } finally {
    clearTimeout(timer)
  }
}

async function viaBridge(ctx: Scope, body: string, purpose: string, settings: TallySettings): Promise<TallyAnswer> {
  if (!bridgeAlive(settings)) return { ok: false, httpStatus: null, text: null, error: 'The Tally bridge on the accounts PC is not running (not seen in the last minute). Start it, then try again.', via: 'bridge' }
  const job = ctx.em.create(TallyJob, { organizationId: ctx.organizationId, tenantId: ctx.tenantId, purpose, requestXml: body, status: 'queued' })
  await ctx.em.persist(job).flush()
  const started = Date.now()
  while (Date.now() - started < BRIDGE_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 700))
    const [row] = await ctx.em.getConnection().execute<Array<{ status: string; response_text: string | null; http_status: number | null; error: string | null }>>(
      'select status, response_text, http_status, error from cc_tally_jobs where id = ?',
      [job.id],
    )
    if (row?.status === 'done' || row?.status === 'failed') {
      return { ok: row.status === 'done' && (row.http_status ?? 200) < 400, httpStatus: row.http_status, text: row.response_text, error: row.error, via: 'bridge' }
    }
  }
  await ctx.em.getConnection().execute(`update cc_tally_jobs set status = 'failed', error = 'Timed out waiting for the bridge', updated_at = now() where id = ? and status in ('queued', 'taken')`, [job.id])
  return { ok: false, httpStatus: null, text: null, error: 'The Tally bridge did not finish within 25 seconds. Check the bridge window on the accounts PC.', via: 'bridge' }
}

export async function callTally(ctx: Scope, settings: TallySettings, body: string, purpose: string): Promise<TallyAnswer> {
  if (settings.mode === 'bridge') return viaBridge(ctx, body, purpose, settings)
  if (!settings.url) return { ok: false, httpStatus: null, text: null, error: 'Set the Tally address first', via: 'direct' }
  return direct(settings.url, body)
}

function exportEnvelope(id: string, company: string | null, staticVars: string, tdl: string): string {
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${id}</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>${company ? `<SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY>` : ''}${staticVars}</STATICVARIABLES><TDL><TDLMESSAGE>${tdl}</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`
}

export function companiesRequest(): string {
  return exportEnvelope('CCCPLCompanies', null, '', '<COLLECTION NAME="CCCPLCompanies" ISMODIFY="No"><TYPE>Company</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>StartingFrom</NATIVEMETHOD><NATIVEMETHOD>BooksFrom</NATIVEMETHOD></COLLECTION>')
}

export function ledgersRequest(company: string | null): string {
  return exportEnvelope('CCCPLLedgers', company, '', '<COLLECTION NAME="CCCPLLedgers" ISMODIFY="No"><TYPE>Ledger</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>Parent</NATIVEMETHOD><NATIVEMETHOD>PartyGSTIN</NATIVEMETHOD><NATIVEMETHOD>LedStateName</NATIVEMETHOD></COLLECTION>')
}

function tallyDate(iso: string): string {
  return iso.replace(/-/g, '')
}

export function vouchersRequest(company: string | null, from: string, to: string): string {
  const vars = `<SVFROMDATE TYPE="Date">${tallyDate(from)}</SVFROMDATE><SVTODATE TYPE="Date">${tallyDate(to)}</SVTODATE>`
  const tdl = `<COLLECTION NAME="CCCPLVouchers" ISMODIFY="No"><TYPE>Voucher</TYPE><NATIVEMETHOD>Date</NATIVEMETHOD><NATIVEMETHOD>VoucherTypeName</NATIVEMETHOD><NATIVEMETHOD>VoucherNumber</NATIVEMETHOD><NATIVEMETHOD>PartyLedgerName</NATIVEMETHOD><NATIVEMETHOD>Reference</NATIVEMETHOD><NATIVEMETHOD>Narration</NATIVEMETHOD><NATIVEMETHOD>Amount</NATIVEMETHOD><NATIVEMETHOD>RemoteID</NATIVEMETHOD><NATIVEMETHOD>IsCancelled</NATIVEMETHOD><FILTER>CCCPLInRange</FILTER></COLLECTION><SYSTEM TYPE="Formulae" NAME="CCCPLInRange">$Date &gt;= $$Date:"${from.split('-').reverse().join('-')}" AND $Date &lt;= $$Date:"${to.split('-').reverse().join('-')}"</SYSTEM>`
  return exportEnvelope('CCCPLVouchers', company, vars, tdl)
}

function tagText(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  return match ? xmlUnescape(match[1].trim()) : null
}

function blocks(xml: string, tag: string): Array<{ attrs: string; body: string }> {
  return [...xml.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi'))].map((match) => ({ attrs: match[1] ?? '', body: match[2] }))
}

function attr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'))
  return match ? xmlUnescape(match[1]) : null
}

export function tallyStatusError(xml: string): string | null {
  const status = tagText(xml, 'STATUS')
  if (status === '0' || /<LINEERROR>/i.test(xml)) return tagText(xml, 'LINEERROR') ?? tagText(xml, 'DATA') ?? 'Tally refused the request'
  return null
}

function looksLikeTally(xml: string): boolean {
  return /<ENVELOPE|<RESPONSE|<COLLECTION/i.test(xml)
}

export function parseCompanies(xml: string): Array<{ name: string; booksFrom: string | null }> {
  return blocks(xml, 'COMPANY')
    .map((block) => ({ name: attr(block.attrs, 'NAME') ?? tagText(block.body, 'NAME') ?? '', booksFrom: tagText(block.body, 'BOOKSFROM') }))
    .filter((entry) => entry.name)
}

export type TallyLedger = { name: string; parent: string | null; gstin: string | null; state: string | null }

export function parseLedgers(xml: string): TallyLedger[] {
  return blocks(xml, 'LEDGER')
    .map((block) => ({ name: attr(block.attrs, 'NAME') ?? tagText(block.body, 'NAME') ?? '', parent: tagText(block.body, 'PARENT'), gstin: tagText(block.body, 'PARTYGSTIN'), state: tagText(block.body, 'LEDSTATENAME') }))
    .filter((entry) => entry.name)
}

export type TallyVoucherRow = { date: string; type: string; number: string; party: string | null; reference: string | null; amount: number; remoteId: string | null; cancelled: boolean }

function isoFromTally(value: string | null): string {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : ''
}

export function parseVouchers(xml: string): TallyVoucherRow[] {
  return blocks(xml, 'VOUCHER').map((block) => ({
    date: isoFromTally(tagText(block.body, 'DATE')),
    type: tagText(block.body, 'VOUCHERTYPENAME') ?? attr(block.attrs, 'VCHTYPE') ?? '',
    number: tagText(block.body, 'VOUCHERNUMBER') ?? '',
    party: tagText(block.body, 'PARTYLEDGERNAME'),
    reference: tagText(block.body, 'REFERENCE'),
    amount: Math.round(Math.abs(Number((tagText(block.body, 'AMOUNT') ?? '0').replace(/[^0-9.-]/g, '')) || 0) * 100) / 100,
    remoteId: tagText(block.body, 'REMOTEID') ?? attr(block.attrs, 'REMOTEID'),
    cancelled: /^yes$/i.test(tagText(block.body, 'ISCANCELLED') ?? ''),
  }))
}

export async function readFromTally<T>(ctx: Scope, settings: TallySettings, body: string, purpose: string, parse: (xml: string) => T): Promise<{ data: T | null; error: string | null; via: 'direct' | 'bridge' }> {
  const answer = await callTally(ctx, settings, body, purpose)
  if (!answer.ok || !answer.text) return { data: null, error: answer.error ?? 'Tally sent nothing back', via: answer.via }
  if (!looksLikeTally(answer.text)) return { data: null, error: 'The answer did not come from Tally (check the address and that Tally is open with the gateway on)', via: answer.via }
  const refused = tallyStatusError(answer.text)
  if (refused) return { data: null, error: refused, via: answer.via }
  return { data: parse(answer.text), error: null, via: answer.via }
}
