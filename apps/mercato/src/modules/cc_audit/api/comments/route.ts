import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { currentUserName, listPeople } from '../../../cc_orders/lib/server'
import { commentSchema } from '../../data/validators'
import { recordAccess } from '../../lib/access'
import { recordActivity } from '../../lib/activity'
import { notifyMentions } from '../../lib/notify'

export const metadata = {
  POST: { requireAuth: true },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = commentSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  const access = await recordAccess(ctx, parsed.data.type)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  const byName = await currentUserName(ctx)
  const known = new Map((await listPeople(ctx)).map((person) => [person.id, person.name]))
  const mentioned = parsed.data.mentions.filter((id) => known.has(id))
  const entry = recordActivity(ctx.em, ctx, {
    recordType: parsed.data.type,
    recordId: parsed.data.id,
    action: 'commented',
    kind: 'comment',
    summary: parsed.data.text,
    links: mentioned.map((id) => ({ type: 'user', id, label: `@${known.get(id)}` })),
    actorUserId: ctx.userId ?? null,
    actorName: byName,
  })
  await ctx.em.flush()
  const notified = await notifyMentions(ctx, { recordType: parsed.data.type, recordId: parsed.data.id, userIds: mentioned, text: parsed.data.text, byName })
  return NextResponse.json({ ok: true, id: entry.id, notified }, { status: 201 })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Activity',
  summary: 'Comment on any record; people mentioned with @ get a notification',
  methods: {
    POST: {
      summary: 'Add a comment to the timeline of a record',
      tags: ['Creative Carbon Activity'],
      requestBody: { contentType: 'application/json', schema: commentSchema },
      responses: [{ status: 201, description: 'Comment saved', schema: z.object({ ok: z.boolean(), id: z.string(), notified: z.array(z.string()) }) }],
      errors: [{ status: 403, description: 'No right to see this record' }],
    },
  },
}

export { POST }
