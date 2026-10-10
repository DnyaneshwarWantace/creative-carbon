import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { DebitNote, TaxInvoice } from '../../data/entities'
import { billView, cancelDebitNote, debitNoteView, findDebitNote } from '../../lib/payables'
import { accountsErrorResponse, runGuarded } from '../../lib/server'
import { logCorrection } from '../../../cc_audit/lib/activity'
import { requireReasonFor, reasonIssue } from '../../../cc_audit/lib/reason'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

const querySchema = z.object({ id: z.string().uuid() })
const actionSchema = z.object({ id: z.string().uuid(), action: z.literal('cancel'), reason: z.string().trim().max(500).optional() }).superRefine(requireReasonFor(['cancel']))

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the note' }, { status: 400 })
  const scope = { id: parsed.data.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
  const credit = await ctx.em.findOne(TaxInvoice, { ...scope, kind: 'credit_note' })
  if (credit) return NextResponse.json({ kind: 'credit', id: credit.id })
  const debit = await ctx.em.findOne(DebitNote, scope)
  if (debit) return NextResponse.json({ kind: 'debit', id: debit.id, note: debitNoteView(debit) })
  return NextResponse.json({ error: 'Note not found' }, { status: 404 })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid action' }, { status: 400 })
  try {
    const note = await findDebitNote(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_accounts.debit_note', resourceId: note.id, current: note.updatedAt, request: req })
    const result = await runGuarded(ctx, req, note.id, parsed.data as Record<string, unknown>, async () => {
      const reason = parsed.data.reason!.trim()
      const bill = await cancelDebitNote(ctx, note, reason)
      await logCorrection(ctx, { recordType: 'debit_note', recordId: note.id, action: 'cancelled', summary: `Debit note cancelled; ₹${Number(note.total).toLocaleString('en-IN')} is back on bill ${bill.code}`, reason, links: [{ type: 'vendor_bill', id: bill.id, label: bill.code }] })
      return { kind: 'debit', id: note.id, note: debitNoteView(note), bill: billView(bill) }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Credit and debit notes',
  methods: {
    GET: { summary: 'Which kind a note id is (credit note on a sales invoice, or debit note on a vendor bill), with the debit note', tags: ['Creative Carbon Accounts'], query: querySchema, responses: [{ status: 200, description: 'Note', schema: z.object({ kind: z.enum(['credit', 'debit']), id: z.string() }).passthrough() }], errors: [{ status: 404, description: 'Not found' }] },
    POST: { summary: 'Cancel a debit note (reason, not after it is in Tally); the bill balance comes back', tags: ['Creative Carbon Accounts'], requestBody: { schema: actionSchema }, responses: [{ status: 200, description: 'Cancelled', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Already cancelled or in Tally' }] },
  },
}

export { GET, POST }
