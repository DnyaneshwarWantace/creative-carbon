import type { ApiInterceptor, InterceptorContext } from '@open-mercato/shared/lib/crud/api-interceptor'
import { syncAccess } from '../lib/accessLog'

const REASON_HEADER = 'x-cc-reason'

async function scopeOf(context: InterceptorContext) {
  let organizationId = context.organizationId
  if (!organizationId) {
    const [actor] = await context.em.getConnection().execute<Array<{ organization_id: string | null }>>('select organization_id from users where id = ?', [context.userId])
    organizationId = actor?.organization_id ?? ''
  }
  return { em: context.em, tenantId: context.tenantId, organizationId, userId: context.userId }
}

function reasonFrom(headers: Record<string, string>): string | null {
  const raw = headers[REASON_HEADER]
  if (!raw) return null
  try {
    return decodeURIComponent(raw).trim() || null
  } catch {
    return raw.trim() || null
  }
}

function idFrom(request: { body?: Record<string, unknown>; query?: Record<string, unknown>; url: string }): string | null {
  const fromBody = request.body?.id
  if (typeof fromBody === 'string') return fromBody
  const fromQuery = request.query?.id
  if (typeof fromQuery === 'string') return fromQuery
  const fromUrl = new URL(request.url, 'http://local').searchParams.get('id')
  return fromUrl
}

export const interceptors: ApiInterceptor[] = [
  {
    id: 'cc_departments.users.access-log',
    targetRoute: 'auth/users',
    methods: ['POST', 'PUT', 'DELETE'],
    priority: 50,
    async before(request, context) {
      if (request.method === 'POST') return { ok: true, metadata: { reason: reasonFrom(request.headers) } }
      const userId = idFrom(request)
      if (!userId) return { ok: true }
      await syncAccess(await scopeOf(context), { subjectType: 'user', subjectId: userId, phase: 'before' })
      const undoOf = request.headers['x-cc-undo-of']
      return { ok: true, metadata: { userId, reason: reasonFrom(request.headers), undoOf: undoOf && /^[0-9a-f-]{36}$/i.test(undoOf) ? undoOf : null } }
    },
    async after(request, response, context) {
      if (response.statusCode >= 400) return {}
      const metadata = (context.metadata ?? {}) as { userId?: string; reason?: string | null; undoOf?: string | null }
      if (request.method === 'POST') {
        const id = typeof response.body?.id === 'string' ? response.body.id : null
        if (id) await syncAccess(await scopeOf(context), { subjectType: 'user', subjectId: id, phase: 'after', reason: metadata.reason ?? null, initial: { exists: false, label: 'Person', superAdmin: false, features: null, roles: [], password: null } })
        return {}
      }
      if (metadata.userId) await syncAccess(await scopeOf(context), { subjectType: 'user', subjectId: metadata.userId, phase: 'after', reason: metadata.reason ?? null, undoOf: metadata.undoOf ?? null })
      return {}
    },
  },
]
