import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { tallyBridgeResultSchema } from '../../../data/validators'
import { hashBridgeToken } from '../../../lib/tallyClient'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { points: 240, duration: 60, keyPrefix: 'cc_tally_bridge' } },
  POST: { requireAuth: false, rateLimit: { points: 240, duration: 60, keyPrefix: 'cc_tally_bridge' } },
}

type Owner = { profileId: string; tenantId: string; organizationId: string }

async function owner(req: Request): Promise<{ em: EntityManager; owner: Owner } | null> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!/^tb_[A-Za-z0-9_-]{20,}$/.test(token)) return null
  const container = await createRequestContainer()
  const em = (container.resolve('em') as EntityManager).fork()
  const [row] = await em.getConnection().execute<Array<{ id: string; tenant_id: string; organization_id: string }>>(
    `select id, tenant_id, organization_id from cc_company_profiles where tally_settings->>'bridgeTokenHash' = ? limit 1`,
    [hashBridgeToken(token)],
  )
  return row ? { em, owner: { profileId: row.id, tenantId: row.tenant_id, organizationId: row.organization_id } } : null
}

async function seen(em: EntityManager, who: Owner, tallyUrl: string | null) {
  const patch: Record<string, string> = { bridgeSeenAt: new Date().toISOString() }
  if (tallyUrl) patch.bridgeTallyUrl = tallyUrl
  await em.getConnection().execute(`update cc_company_profiles set tally_settings = coalesce(tally_settings, '{}'::jsonb) || ?::jsonb where id = ?`, [JSON.stringify(patch), who.profileId])
}

async function GET(req: Request) {
  const found = await owner(req)
  if (!found) return NextResponse.json({ error: 'Bridge key not recognised' }, { status: 401 })
  const tallyUrl = new URL(req.url).searchParams.get('tally')?.slice(0, 200) ?? null
  await seen(found.em, found.owner, tallyUrl)
  const [job] = await found.em.getConnection().execute<Array<{ id: string; purpose: string; request_xml: string }>>(
    `update cc_tally_jobs set status = 'taken', taken_at = now(), updated_at = now()
      where id = (select id from cc_tally_jobs where tenant_id = ? and organization_id = ? and status = 'queued' and created_at > now() - interval '2 minutes' order by created_at asc limit 1 for update skip locked)
      returning id, purpose, request_xml`,
    [found.owner.tenantId, found.owner.organizationId],
  )
  if (!job) return NextResponse.json({ job: null })
  return NextResponse.json({ job: { id: job.id, purpose: job.purpose, xml: job.request_xml } })
}

async function POST(req: Request) {
  const found = await owner(req)
  if (!found) return NextResponse.json({ error: 'Bridge key not recognised' }, { status: 401 })
  const parsed = tallyBridgeResultSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Bad result' }, { status: 400 })
  const result = parsed.data
  const failed = Boolean(result.error) || result.httpStatus == null
  await found.em.getConnection().execute(
    `update cc_tally_jobs set status = ?, http_status = ?, response_text = ?, error = ?, done_at = now(), updated_at = now()
      where id = ? and tenant_id = ? and organization_id = ? and status = 'taken'`,
    [failed ? 'failed' : 'done', result.httpStatus ?? null, result.responseText ?? null, result.error ?? null, result.id, found.owner.tenantId, found.owner.organizationId],
  )
  await seen(found.em, found.owner, null)
  return NextResponse.json({ ok: true })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Tally bridge: the small program on the accounts PC asks for the next request to pass to Tally and sends back Tally’s answer (Bearer bridge key)',
  methods: {
    GET: { summary: 'Next request for Tally (marks the bridge as running)', tags: ['Creative Carbon Accounts'], responses: [{ status: 200, description: 'Job or null', schema: z.object({ job: z.object({ id: z.string(), purpose: z.string(), xml: z.string() }).nullable() }) }], errors: [{ status: 401, description: 'Unknown bridge key' }] },
    POST: { summary: 'Tally’s answer for a request', tags: ['Creative Carbon Accounts'], requestBody: { schema: tallyBridgeResultSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean() }) }] },
  },
}

export { GET, POST }
