import { variantCreateSchema } from '@open-mercato/core/modules/catalog/data/validators'
import { productInventoryProfileCreateSchema } from '@open-mercato/core/modules/wms/data/validators'
import { variantsForProducts } from '../../dermat_products/lib/stock'
import { runCommand, type StoreContext } from './server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function ensureStockRecords(ctx: StoreContext, productIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(productIds.filter((id) => UUID_RE.test(id))))
  const variants = await variantsForProducts(ctx, ids)
  const missing = ids.filter((id) => !variants.has(id))
  if (!missing.length) return variants
  const products = await ctx.em.getConnection().execute<Array<{ id: string; title: string; sku: string | null; unit: string | null; has_profile: boolean }>>(
    `select p.id, p.title, p.sku, p.default_unit as unit,
            exists(select 1 from wms_product_inventory_profiles ip where ip.catalog_product_id = p.id and ip.deleted_at is null) as has_profile
       from catalog_products p where p.id = any(?::uuid[]) and p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null`,
    [`{${missing.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const product of products) {
    const input = variantCreateSchema.parse({
      productId: product.id,
      name: product.title,
      sku: product.sku ?? `ITEM-${product.id.slice(0, 8).toUpperCase()}`,
      isDefault: true,
      isActive: true,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
    const created = await runCommand<{ variantId?: string; id?: string }>(ctx, 'catalog.variants.create', input)
    const variantId = created?.variantId ?? created?.id
    if (variantId) variants.set(product.id, variantId)
    if (!product.has_profile) {
      const profile = productInventoryProfileCreateSchema.parse({
        catalogProductId: product.id,
        defaultUom: product.unit ?? 'pc',
        defaultStrategy: 'fifo',
        trackLot: true,
        reorderPoint: 0,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
      })
      await runCommand(ctx, 'wms.inventoryProfiles.create', profile)
    }
  }
  return variants
}
