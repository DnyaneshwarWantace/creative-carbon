import { QaDocument } from '../data/entities'
import { QcError } from './service'
import { currentUserName, type QcContext } from './server'

const DAY_MS = 86400000

function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function stamp(doc: QaDocument, action: string, by: string | null, note: string | null) {
  doc.history = [...(doc.history ?? []), { action, by, at: new Date().toISOString(), note }]
}

export async function findDocument(ctx: QcContext, id: string): Promise<QaDocument> {
  const doc = await ctx.em.findOne(QaDocument, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!doc) throw new QcError('Document not found', 404)
  return doc
}

export async function createDocument(ctx: QcContext, input: { docNo: string; title: string; docType: string; department?: string | null; effectiveDate: string; reviewDate?: string | null; notes?: string | null }) {
  const exists = await ctx.em.findOne(QaDocument, { docNo: input.docNo.trim(), tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (exists) throw new QcError(`Document ${input.docNo} already exists. Issue a new version of it instead.`, 409)
  if (input.reviewDate && input.reviewDate < input.effectiveDate) throw new QcError('Review date is before the effective date')
  const byName = await currentUserName(ctx)
  const doc = ctx.em.create(QaDocument, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    docNo: input.docNo.trim(),
    version: 1,
    title: input.title.trim(),
    docType: input.docType.trim(),
    department: input.department?.trim() || null,
    effectiveDate: input.effectiveDate,
    reviewDate: input.reviewDate ?? null,
    notes: input.notes ?? null,
    preparedByName: byName,
    approvedByName: byName,
  })
  stamp(doc, 'issued', byName, null)
  ctx.em.persist(doc)
  await ctx.em.flush()
  return doc
}

export async function actOnDocument(ctx: QcContext, doc: QaDocument, input: { action: 'revise' | 'withdraw'; effectiveDate?: string | null; reviewDate?: string | null; changeNote?: string | null }) {
  const byName = await currentUserName(ctx)
  if (doc.status !== 'active') throw new QcError('Only the current version can be revised or withdrawn', 409)
  if (!input.changeNote?.trim()) throw new QcError(input.action === 'revise' ? 'Write what changed in this version' : 'Write why the document is withdrawn')
  if (input.action === 'withdraw') {
    doc.status = 'withdrawn'
    stamp(doc, 'withdrawn', byName, input.changeNote)
    doc.updatedAt = new Date()
    await ctx.em.flush()
    return doc
  }
  const effectiveDate = input.effectiveDate ?? todayIst()
  if (effectiveDate < doc.effectiveDate) throw new QcError('The new version cannot take effect before the current one')
  doc.status = 'superseded'
  stamp(doc, 'superseded', byName, `By version ${doc.version + 1}`)
  const next = ctx.em.create(QaDocument, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    docNo: doc.docNo,
    version: doc.version + 1,
    title: doc.title,
    docType: doc.docType,
    department: doc.department ?? null,
    effectiveDate,
    reviewDate: input.reviewDate ?? null,
    notes: doc.notes ?? null,
    changeNote: input.changeNote.trim(),
    preparedByName: byName,
    approvedByName: byName,
  })
  stamp(next, 'issued', byName, input.changeNote)
  ctx.em.persist(next)
  await ctx.em.flush()
  return next
}

export function documentView(doc: QaDocument, versions: QaDocument[] = []) {
  const today = todayIst()
  return {
    id: doc.id,
    docNo: doc.docNo,
    version: doc.version,
    title: doc.title,
    docType: doc.docType,
    department: doc.department ?? null,
    effectiveDate: doc.effectiveDate,
    reviewDate: doc.reviewDate ?? null,
    reviewDue: doc.status === 'active' && Boolean(doc.reviewDate && doc.reviewDate <= today),
    reviewInDays: doc.reviewDate ? Math.round((Date.parse(`${doc.reviewDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS) : null,
    status: doc.status,
    notes: doc.notes ?? null,
    changeNote: doc.changeNote ?? null,
    preparedByName: doc.preparedByName ?? null,
    approvedByName: doc.approvedByName ?? null,
    updatedAt: doc.updatedAt.toISOString(),
    versions: versions
      .filter((entry) => entry.id !== doc.id)
      .sort((a, b) => b.version - a.version)
      .map((entry) => ({ id: entry.id, version: entry.version, effectiveDate: entry.effectiveDate, status: entry.status, changeNote: entry.changeNote ?? null, preparedByName: entry.preparedByName ?? null })),
  }
}
