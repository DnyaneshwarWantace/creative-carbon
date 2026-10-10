import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { invoiceActionSchema } from '../../../data/validators'
import { cancelInvoice, createCreditNote, findInvoice, invoiceView, issueInvoice } from '../../../lib/invoices'
import { AccountsError } from '../../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'
import { logCorrection, recordActivity } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = invoiceActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid action' }, { status: 400 })
  if (parsed.data.action === 'credit_note' && !(await hasFeatures(ctx, ['cc_accounts.credit_note']))) return NextResponse.json({ error: 'Raising a credit note needs the credit note right' }, { status: 403 })
  try {
    const first = await findInvoice(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_accounts.invoice', resourceId: first.id, current: first.updatedAt, request: req })
    return await runGuarded(ctx, req, first.id, parsed.data, async () => {
      const byName = await currentUserName(ctx)
      const result = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const doc = await findInvoice(txCtx, parsed.data.id)
        if (parsed.data.action === 'issue') {
          await issueInvoice(txCtx, doc, byName)
          doc.updatedAt = new Date()
          await em.flush()
          return doc
        }
        if (parsed.data.action === 'credit_note') {
          if (!parsed.data.reason?.trim()) throw new AccountsError('Write why the credit note is made')
          const note = await createCreditNote(txCtx, doc, { lines: parsed.data.lines ?? [], reason: parsed.data.reason.trim() }, byName)
          doc.history = [...(doc.history ?? []), { action: 'credited', by: byName, at: new Date().toISOString(), note: `${note.code}: ${parsed.data.reason.trim()}` }]
          doc.updatedAt = new Date()
          await em.flush()
          return note
        }
        if (!parsed.data.reason?.trim()) throw new AccountsError('Write why it is cancelled')
        await cancelInvoice(txCtx, doc, parsed.data.reason.trim(), byName)
        await em.flush()
        return doc
      })
      if (parsed.data.action === 'cancel') await logCorrection(ctx, { recordType: 'invoice', recordId: parsed.data.id, action: 'cancelled', summary: result.kind === 'credit_note' ? `Credit note cancelled; the dues it reduced are back${result.againstCode ? ` on ${result.againstCode}` : ''}` : 'Invoice cancelled; the order is back at the invoice stage', reason: parsed.data.reason ?? '', links: result.againstId ? [{ type: 'invoice', id: result.againstId, label: result.againstCode ?? null }] : [] })
      if (parsed.data.action === 'credit_note') {
        await logCorrection(ctx, { recordType: 'invoice', recordId: parsed.data.id, action: 'credit_note', summary: `Credit note ${result.code} made for ₹${result.totals.payable.toLocaleString('en-IN')}; dues reduced`, reason: parsed.data.reason ?? '', links: [{ type: 'credit_note', id: result.id, label: result.code }] })
        recordActivity(ctx.em, ctx, { recordType: 'invoice', recordId: result.id, action: 'created', kind: 'change', summary: `Credit note against ${result.againstCode ?? 'invoice'} for ₹${result.totals.payable.toLocaleString('en-IN')}`, reason: parsed.data.reason ?? null, links: result.againstId ? [{ type: 'invoice', id: result.againstId, label: result.againstCode ?? null }] : [], actorUserId: ctx.userId ?? null, actorName: byName })
        await ctx.em.flush()
      }
      return NextResponse.json(invoiceView(result))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Issue, cancel or credit an invoice',
  methods: {
    POST: {
      summary: 'issue: fills the order Billing stage; cancel: needs a reason; credit_note: lines and reason, returns the new credit note',
      tags: ['Creative Carbon Accounts'],
      requestBody: { schema: invoiceActionSchema },
      responses: [{ status: 200, description: 'Updated invoice or new credit note', schema: z.object({ id: z.string() }).passthrough() }],
    },
  },
}

export { POST }
