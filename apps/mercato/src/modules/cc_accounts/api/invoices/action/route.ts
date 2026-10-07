import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { TaxInvoice } from '../../../data/entities'
import { invoiceActionSchema } from '../../../data/validators'
import { createCreditNote, findInvoice, invoiceView, issueInvoice } from '../../../lib/invoices'
import { AccountsError } from '../../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = invoiceActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
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
        if (doc.status === 'cancelled') throw new AccountsError('Already cancelled', 409)
        if (!parsed.data.reason?.trim()) throw new AccountsError('Write why it is cancelled')
        const notes = await em.count(TaxInvoice, { againstId: doc.id, status: { $ne: 'cancelled' }, deletedAt: null })
        if (notes) throw new AccountsError('This invoice has credit notes; cancel those first', 409)
        doc.status = 'cancelled'
        doc.cancelReason = parsed.data.reason.trim()
        doc.history = [...(doc.history ?? []), { action: 'cancelled', by: byName, at: new Date().toISOString(), note: doc.cancelReason }]
        doc.updatedAt = new Date()
        await em.flush()
        return doc
      })
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
