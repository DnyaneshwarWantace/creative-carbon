import type { ApiInterceptor, InterceptorContext } from '@open-mercato/shared/lib/crud/api-interceptor'
import { changeRuleError, logProductChange, productSnapshot, REASON_HEADER, stockOnHand, type ProductSnapshot } from '../lib/changeLog'

type Captured = { productId: string; before: ProductSnapshot; labels: Record<string, string>; reason: string | null }

type Scope = { em: InterceptorContext['em']; tenantId: string; organizationId: string; userId: string }

async function scopeFor(context: InterceptorContext, productId: string): Promise<Scope | null> {
  if (context.organizationId) return { em: context.em, tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
  const [row] = await context.em.getConnection().execute<Array<{ organization_id: string }>>('select organization_id from catalog_products where id = ? and tenant_id = ?', [productId, context.tenantId])
  return row ? { em: context.em, tenantId: context.tenantId, organizationId: row.organization_id, userId: context.userId } : null
}

function reasonFrom(headers: Record<string, string>): string | null {
  const raw = headers[REASON_HEADER] ?? headers[REASON_HEADER.toUpperCase()]
  if (!raw) return null
  try {
    return decodeURIComponent(raw).trim() || null
  } catch {
    return raw.trim() || null
  }
}

async function byName(context: InterceptorContext): Promise<string | null> {
  const { userNames } = await import('../../cc_orders/lib/server')
  const names = await userNames({ em: context.em, tenantId: context.tenantId, organizationId: context.organizationId || context.tenantId } as Parameters<typeof userNames>[0], [context.userId])
  return names.get(context.userId) ?? null
}

async function logAfter(context: InterceptorContext) {
  const captured = context.metadata as Captured | undefined
  if (!captured?.productId) return
  const scope = await scopeFor(context, captured.productId)
  if (!scope) return
  const after = await productSnapshot(scope, captured.productId)
  if (!after) return
  logProductChange(scope, { productId: captured.productId, before: captured.before, after: after.snapshot, labels: { ...captured.labels, ...after.labels }, reason: captured.reason, byName: await byName(context) })
  await context.em.flush()
}

export const interceptors: ApiInterceptor[] = [
  {
    id: 'cc_products.catalog-products.change-log',
    targetRoute: 'catalog/products',
    methods: ['PUT'],
    priority: 50,
    async before(request, context) {
      const productId = typeof request.body?.id === 'string' ? request.body.id : null
      if (!productId) return { ok: true }
      const scope = await scopeFor(context, productId)
      if (!scope) return { ok: true }
      const current = await productSnapshot(scope, productId)
      if (!current) return { ok: true }
      const reason = reasonFrom(request.headers)
      const blocked = changeRuleError(current.snapshot, { defaultUnit: request.body?.defaultUnit, isActive: request.body?.isActive }, await stockOnHand(scope, productId), reason)
      if (blocked) return { ok: false, statusCode: blocked.status, message: blocked.message }
      return { ok: true, metadata: { productId, before: current.snapshot, labels: current.labels, reason } satisfies Captured }
    },
    async after(_request, response, context) {
      if (response.statusCode >= 400) return {}
      await logAfter(context)
      return {}
    },
  },
  {
    id: 'cc_products.inventory-profiles.change-log',
    targetRoute: 'wms/inventory-profiles',
    methods: ['PUT'],
    priority: 50,
    async before(request, context) {
      const profileId = typeof request.body?.id === 'string' ? request.body.id : null
      if (!profileId) return { ok: true }
      const [profile] = await context.em.getConnection().execute<Array<{ product_id: string }>>(
        'select catalog_product_id as product_id from wms_product_inventory_profiles where id = ? and tenant_id = ?',
        [profileId, context.tenantId],
      )
      if (!profile?.product_id) return { ok: true }
      const scope = await scopeFor(context, profile.product_id)
      if (!scope) return { ok: true }
      const current = await productSnapshot(scope, profile.product_id)
      if (!current) return { ok: true }
      return { ok: true, metadata: { productId: profile.product_id, before: current.snapshot, labels: current.labels, reason: reasonFrom(request.headers) } satisfies Captured }
    },
    async after(_request, response, context) {
      if (response.statusCode >= 400) return {}
      await logAfter(context)
      return {}
    },
  },
]
