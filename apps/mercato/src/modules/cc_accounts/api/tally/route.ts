import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { tallyQuerySchema } from '../../data/validators'
import { DEFAULT_LEDGERS, TALLY_KINDS, tallyCsv, tallyData, tallyXml, type TallyKind, type TallyLedgers } from '../../lib/tally'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = tallyQuerySchema.safeParse(params)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Pick a date range' }, { status: 400 })
  const query = parsed.data
  if (query.from > query.to) return NextResponse.json({ error: 'The start date is after the end date' }, { status: 400 })
  const kinds = (query.kinds ? query.kinds.split(',') : TALLY_KINDS).filter((kind): kind is TallyKind => (TALLY_KINDS as string[]).includes(kind))
  if (!kinds.length) return NextResponse.json({ error: 'Pick at least one kind of entry' }, { status: 400 })
  const ledgers: TallyLedgers = { ...DEFAULT_LEDGERS }
  for (const key of Object.keys(DEFAULT_LEDGERS) as Array<keyof TallyLedgers>) {
    const value = params[`ledger_${key}`]?.trim()
    if (value) ledgers[key] = value.slice(0, 120)
  }
  const data = await tallyData(ctx, { from: query.from, to: query.to }, kinds, ledgers)
  const counts: Record<string, number> = {}
  const amounts: Record<string, number> = {}
  for (const voucher of data.vouchers) {
    counts[voucher.type] = (counts[voucher.type] ?? 0) + 1
    const partyEntry = voucher.entries.find((entry) => entry.ledger === voucher.party)
    amounts[voucher.type] = Math.round(((amounts[voucher.type] ?? 0) + Math.abs(partyEntry?.amount ?? 0)) * 100) / 100
  }
  const unbalanced = data.vouchers.filter((voucher) => Math.abs(voucher.entries.reduce((sum, entry) => sum + entry.amount, 0)) > 0.01).map((voucher) => voucher.number)
  const base = { counts, amounts, parties: data.parties.length, vouchers: data.vouchers.length, unbalanced, ledgers }
  if (query.format === 'summary') return NextResponse.json({ ...base, preview: data.vouchers.slice(0, 50) })
  const fileName = `tally-${query.from}-to-${query.to}.${query.format}`
  const content = query.format === 'xml' ? tallyXml(data, query.masters !== 'false') : tallyCsv(data)
  return NextResponse.json({ ...base, fileName, content })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Export sales, credit notes, receipts, purchases and vendor payments for Tally (XML import or CSV day book)',
  methods: {
    GET: { summary: 'Tally export for a date range', tags: ['Creative Carbon Accounts'], query: tallyQuerySchema, responses: [{ status: 200, description: 'Export', schema: z.object({ vouchers: z.number(), content: z.string().optional() }).passthrough() }] },
  },
}

export { GET }
