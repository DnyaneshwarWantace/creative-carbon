import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { vendorBillActionSchema } from '../../../data/validators'
import { actOnBill, billView, findBill } from '../../../lib/payables'
import { logCorrection, recordActivity } from '../../../../cc_audit/lib/activity'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = vendorBillActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid action' }, { status: 400 })
  try {
    const bill = await findBill(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_accounts.vendor_bill', resourceId: bill.id, current: bill.updatedAt, request: req })
    const result = await runGuarded(ctx, req, bill.id, parsed.data as Record<string, unknown>, async () => {
      const outcome = await actOnBill(ctx, bill, parsed.data)
      const why = parsed.data.note?.trim() ?? ''
      if (parsed.data.action === 'void_payment' && outcome.voided) await logCorrection(ctx, { recordType: 'vendor_bill', recordId: bill.id, action: 'payment_voided', summary: `Payment of ₹${outcome.voided.amount.toLocaleString('en-IN')} voided; the balance is back`, reason: why })
      if (parsed.data.action === 'cancel') await logCorrection(ctx, { recordType: 'vendor_bill', recordId: bill.id, action: 'cancelled', summary: 'Vendor bill cancelled', reason: why })
      if (parsed.data.action === 'debit_note' && outcome.note) {
        const note = outcome.note
        await logCorrection(ctx, { recordType: 'vendor_bill', recordId: bill.id, action: 'debit_note', summary: `Debit note ${note.code} for ₹${Number(note.total).toLocaleString('en-IN')}; the balance is reduced`, reason: why, links: [{ type: 'debit_note', id: note.id, label: note.code }] })
        recordActivity(ctx.em, ctx, { recordType: 'debit_note', recordId: note.id, action: 'created', kind: 'change', summary: `Debit note against bill ${bill.billNo} (${bill.code}) for ₹${Number(note.total).toLocaleString('en-IN')}`, reason: why, links: [{ type: 'vendor_bill', id: bill.id, label: bill.code }], actorUserId: ctx.userId ?? null, actorName: await currentUserName(ctx) })
        await ctx.em.flush()
      }
      return { ...billView(bill), ...(outcome.note ? { debitNoteId: outcome.note.id, debitNoteCode: outcome.note.code } : {}) }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Pay, void a payment, raise a debit note on, or cancel a vendor bill',
  methods: {
    POST: { summary: 'pay (full or part); void_payment (reason, not after Tally); debit_note (amount + reason, reduces the balance); cancel an unpaid bill', tags: ['Creative Carbon Accounts'], requestBody: { schema: vendorBillActionSchema }, responses: [{ status: 200, description: 'Bill', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { POST }
