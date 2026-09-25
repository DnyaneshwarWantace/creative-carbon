import type { EntityManager } from '@mikro-orm/postgresql'
import type { MutationGuard } from '@open-mercato/shared/lib/crud/mutation-guard-registry'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'

const PRODUCT_RESOURCE = /^catalog[.:](catalog_)?products?$/

const productInUseGuard: MutationGuard = {
  id: 'dermat_boms.product-in-use',
  targetEntity: '*',
  operations: ['delete'],
  priority: 40,
  async validate(input) {
    if (!PRODUCT_RESOURCE.test(input.resourceKind) || !input.resourceId) return { ok: true }
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    const rows = await em.getConnection().execute<Array<{ code: string; version: number; status: string; title: string; relation: string }>>(
      `select h.code, h.version, h.status, p.title, 'component' as relation
         from dermat_bom_items i
         join dermat_bom_headers h on h.id = i.bom_id and h.deleted_at is null and h.status <> 'superseded'
         join catalog_products p on p.id = h.product_id
        where i.component_product_id = ? and h.tenant_id = ?
       union all
       select h.code, h.version, h.status, p.title, 'owner' as relation
         from dermat_bom_headers h
         join catalog_products p on p.id = h.product_id
        where h.product_id = ? and h.tenant_id = ? and h.deleted_at is null and h.status <> 'superseded'
        limit 10`,
      [input.resourceId, input.tenantId, input.resourceId, input.tenantId],
    )
    if (!rows.length) return { ok: true }
    const used = rows.filter((row) => row.relation === 'component').map((row) => `${row.title} (v${row.version})`)
    const owned = rows.filter((row) => row.relation === 'owner').map((row) => `v${row.version}`)
    const parts = [
      used.length ? `it is used in the BOM of ${used.join(', ')}` : null,
      owned.length ? `it has its own BOM (${owned.join(', ')})` : null,
    ].filter(Boolean)
    const message = `This product cannot be deleted because ${parts.join(' and ')}. Remove it from those BOMs first, or mark the product inactive.`
    return { ok: false, status: 409, body: { error: message, code: 'dermat_boms.product_in_use' } }
  },
}

export const guards: MutationGuard[] = [productInUseGuard]
