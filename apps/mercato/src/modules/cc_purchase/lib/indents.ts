import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { currentUserName, loadProducts, type OrderContext } from '../../cc_orders/lib/server'
import { PurchaseIndent, type PurchaseOrder } from '../data/entities'
import type { IndentInput } from '../data/validators'
import { PurchaseError, nextCode } from './service'
import { PURCHASED_KINDS, type ProductKind } from '../../cc_products/lib/kinds'

const logger = createLogger('cc_purchase')

function stamp(indent: PurchaseIndent, action: string, by: string | null, note: string | null) {
  indent.history = [...(indent.history ?? []), { action, by, at: new Date().toISOString(), note }]
}

export async function notifyApprovers(ctx: OrderContext, input: { type: string; title: string; body: string; href: string; sourceId: string }) {
  try {
    const service = resolveNotificationService(ctx.container as unknown as { resolve: (name: string) => unknown })
    await service.createForFeature(
      { type: input.type, requiredFeature: 'cc_purchase.approve', title: input.title, body: input.body, severity: 'info', sourceModule: 'cc_purchase', sourceEntityType: 'cc_purchase:document', sourceEntityId: input.sourceId, linkHref: input.href },
      { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    )
  } catch (error) {
    logger.error('Failed to notify approvers', { err: error })
  }
}

export async function findIndent(ctx: OrderContext, id: string): Promise<PurchaseIndent> {
  const indent = await ctx.em.findOne(PurchaseIndent, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!indent) throw new PurchaseError('Indent not found', 404)
  return indent
}

export async function createIndent(ctx: OrderContext, input: IndentInput): Promise<PurchaseIndent> {
  const products = await loadProducts(ctx, input.lines.map((line) => line.productId))
  const missing = input.lines.filter((line) => !products.has(line.productId))
  if (missing.length) throw new PurchaseError('A material on this indent was not found')
  const wrongKind = input.lines.filter((line) => !PURCHASED_KINDS.has((products.get(line.productId)?.kind ?? '') as ProductKind))
  if (wrongKind.length) throw new PurchaseError(`Only raw or packing material can be indented: ${wrongKind.map((line) => products.get(line.productId)?.title).join(', ')}`)
  const byName = await currentUserName(ctx)
  const indent = ctx.em.create(PurchaseIndent, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextCode(ctx, 'cc_purchase_indents', 'IND'),
    source: input.source,
    department: input.department ?? null,
    neededBy: input.neededBy ?? null,
    notes: input.notes ?? null,
    orderRefs: input.orderRefs,
    lines: input.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unit: products.get(line.productId)?.unit ?? null, note: line.note ?? null })),
    requestedByName: byName,
    history: [{ action: 'submitted', by: byName, at: new Date().toISOString(), note: null }],
  })
  ctx.em.persist(indent)
  await ctx.em.flush()
  await notifyApprovers(ctx, {
    type: 'cc_purchase.indent.submitted',
    title: `Indent ${indent.code} needs approval`,
    body: `${input.lines.length} material(s)${input.department ? ` for ${input.department}` : ''}${byName ? ` · raised by ${byName}` : ''}`,
    href: `/backend/purchase/indents?id=${indent.id}`,
    sourceId: indent.id,
  })
  return indent
}

export async function actOnIndent(ctx: OrderContext, indent: PurchaseIndent, action: 'approve' | 'reject' | 'cancel', note: string | null) {
  const byName = await currentUserName(ctx)
  if (action === 'approve') {
    if (indent.status !== 'submitted') throw new PurchaseError('Only a submitted indent can be approved', 409)
    indent.status = 'approved'
    indent.approvedByName = byName
    indent.approvedAt = new Date()
    indent.decisionNote = note
  } else if (action === 'reject') {
    if (indent.status !== 'submitted') throw new PurchaseError('Only a submitted indent can be rejected', 409)
    if (!note) throw new PurchaseError('Write why the indent is rejected')
    indent.status = 'rejected'
    indent.decisionNote = note
  } else {
    if (indent.status === 'ordered') throw new PurchaseError('A PO was already raised from this indent. Cancel the PO instead.', 409)
    if (indent.status === 'cancelled' || indent.status === 'rejected') throw new PurchaseError('This indent is already closed', 409)
    indent.status = 'cancelled'
    indent.decisionNote = note
  }
  stamp(indent, action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled', byName, note)
  indent.updatedAt = new Date()
  await ctx.em.flush()
}

export async function linkIndentsToPo(ctx: OrderContext, indentIds: string[], po: PurchaseOrder) {
  if (!indentIds.length) return
  const byName = await currentUserName(ctx)
  const indents = await ctx.em.find(PurchaseIndent, { id: { $in: indentIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  for (const indent of indents) {
    if (indent.status !== 'approved' && indent.status !== 'ordered') throw new PurchaseError(`Indent ${indent.code} is not approved yet`, 409)
    indent.status = 'ordered'
    indent.poRefs = [...(indent.poRefs ?? []).filter((ref) => ref.poId !== po.id), { poId: po.id, code: po.code }]
    stamp(indent, 'ordered', byName, `PO ${po.code}`)
  }
  await ctx.em.flush()
}

export async function indentViews(ctx: OrderContext, indents: PurchaseIndent[]) {
  const products = await loadProducts(ctx, indents.flatMap((indent) => indent.lines.map((line) => line.productId)))
  return indents.map((indent) => ({
    id: indent.id,
    code: indent.code,
    status: indent.status,
    source: indent.source,
    department: indent.department ?? null,
    neededBy: indent.neededBy ?? null,
    notes: indent.notes ?? null,
    orderRefs: indent.orderRefs ?? [],
    requestedByName: indent.requestedByName ?? null,
    approvedByName: indent.approvedByName ?? null,
    approvedAt: indent.approvedAt ? indent.approvedAt.toISOString() : null,
    decisionNote: indent.decisionNote ?? null,
    poRefs: indent.poRefs ?? [],
    history: indent.history ?? [],
    createdAt: indent.createdAt.toISOString(),
    updatedAt: indent.updatedAt.toISOString(),
    lines: indent.lines.map((line) => ({ ...line, title: products.get(line.productId)?.title ?? '(deleted product)', code: products.get(line.productId)?.code ?? null, kind: products.get(line.productId)?.kind ?? null })),
  }))
}
