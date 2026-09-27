import * as React from 'react'
import { sendEmail } from '@open-mercato/shared/lib/email/send'
import type { OrderContext } from '../../dermat_orders/lib/server'
import { currentUserName } from '../../dermat_orders/lib/server'
import { loadCompany } from '../../dermat_accounts/lib/documents'
import type { PurchaseOrder } from '../data/entities'
import { PoEmail } from './PoEmailTemplate'
import { PurchaseError, poView } from './service'

export function emailConfigured(): boolean {
  const disabled = ['1', 'true', 'yes'].includes(String(process.env.OM_DISABLE_EMAIL_DELIVERY ?? '').toLowerCase())
  const from = process.env.NOTIFICATIONS_EMAIL_FROM || process.env.EMAIL_FROM || process.env.ADMIN_EMAIL
  return Boolean(process.env.RESEND_API_KEY && from && !disabled)
}

export async function emailPo(ctx: OrderContext, po: PurchaseOrder, input: { to: string[]; cc: string[]; message: string | null }) {
  if (po.status !== 'approved' && po.status !== 'partly_received') throw new PurchaseError('Only an approved PO can be sent to the vendor', 409)
  if (!emailConfigured()) throw new PurchaseError('Email is not set up yet. Add RESEND_API_KEY and EMAIL_FROM to the server settings, then try again.', 409)
  const view = await poView(ctx, po)
  const company = await loadCompany(ctx)
  const companyView = { name: company?.name ?? 'Dermat India', gstin: company?.gstin ?? null, address: company?.address ?? null, phone: company?.phone ?? null, email: company?.email ?? null }
  const react = React.createElement(PoEmail, {
    company: companyView,
    po: { code: view.code, poDate: view.poDate, expectedDate: view.expectedDate, vendorName: view.vendorName, vendorGstin: view.vendorGstin, terms: view.terms, notes: view.notes, subtotal: view.subtotal, gst: view.gst, total: view.total },
    lines: view.lines.map((line) => ({ code: line.code, title: line.title, quantity: line.quantity, unit: line.unit, rate: line.rate, gstPercent: line.gstPercent, amount: line.amount })),
    message: input.message,
  })
  try {
    for (const address of [...new Set([...input.to, ...input.cc])]) {
      await sendEmail({ to: address, subject: `Purchase order ${view.code} from ${companyView.name}`, react, ...(company?.email ? { replyTo: company.email } : {}) })
    }
  } catch (error) {
    throw new PurchaseError(`The email could not be sent: ${error instanceof Error ? error.message : 'unknown error'}`, 502)
  }
  const byName = await currentUserName(ctx)
  po.history = [...(po.history ?? []), { action: 'emailed', by: byName, at: new Date().toISOString(), note: `To ${[...input.to, ...input.cc].join(', ')}` }]
  po.updatedAt = new Date()
  await ctx.em.flush()
  return view
}
