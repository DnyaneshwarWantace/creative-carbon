import { sendEmail } from '@open-mercato/shared/lib/email/send'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { myWork, openStages, type Scope, type WorkItem } from './overview'
import { DigestEmail } from './DigestEmail'

export type DigestResult = { userId: string; name: string; email: string | null; steps: number; sent: boolean; error: string | null }

export async function digestRecipients(ctx: Scope): Promise<Array<{ userId: string; name: string; email: string | null; items: WorkItem[] }>> {
  const rows = await openStages(ctx)
  const userIds = Array.from(new Set(rows.map((row) => row.responsible_user_id).filter((id): id is string => Boolean(id))))
  if (!userIds.length) return []
  const users = await findWithDecryption(ctx.em, User, { id: { $in: userIds }, deletedAt: null }, undefined, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  const result: Array<{ userId: string; name: string; email: string | null; items: WorkItem[] }> = []
  for (const userId of userIds) {
    const user = users.find((entry) => entry.id === userId)
    const email = typeof user?.email === 'string' ? user.email : null
    const name = (typeof user?.name === 'string' && user.name.trim()) || email || 'there'
    result.push({ userId, name, email, items: await myWork(ctx, userId, false) })
  }
  return result
}

export async function sendDigests(ctx: Scope, options: { dryRun: boolean; baseUrl: string }): Promise<DigestResult[]> {
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
  const results: DigestResult[] = []
  for (const recipient of await digestRecipients(ctx)) {
    const base = { userId: recipient.userId, name: recipient.name, email: recipient.email, steps: recipient.items.length }
    if (!recipient.items.length) continue
    if (!recipient.email) {
      results.push({ ...base, sent: false, error: 'No email address' })
      continue
    }
    if (options.dryRun) {
      results.push({ ...base, sent: false, error: null })
      continue
    }
    try {
      await sendEmail({
        to: recipient.email,
        subject: `Your pending work · ${recipient.items.length} step${recipient.items.length === 1 ? '' : 's'}`,
        react: DigestEmail({ name: recipient.name, date, items: recipient.items, baseUrl: options.baseUrl }),
      })
      results.push({ ...base, sent: true, error: null })
    } catch (error) {
      results.push({ ...base, sent: false, error: error instanceof Error ? error.message : 'Send failed' })
    }
  }
  return results
}
