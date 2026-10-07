import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { splitCustomFieldPayload } from '@open-mercato/shared/lib/crud/custom-fields'
import { productCreateSchema, variantCreateSchema } from '@open-mercato/core/modules/catalog/data/validators'
import { productInventoryProfileCreateSchema } from '@open-mercato/core/modules/wms/data/validators'
import type { ProductKind } from './kinds'
import { nextSeriesCode } from '../../cc_accounts/lib/numberSeries'

export type CreateProductInput = {
  title: string
  kind: ProductKind
  unit: string
  categoryId: string | null
  taxRateId: string | null
  sku?: string | null
  custom: Record<string, unknown>
  tenantId: string
  organizationId: string
}

export async function createProductWithStockSetup(
  commandBus: CommandBus,
  ctx: CommandRuntimeContext,
  connection: ReturnType<EntityManager['getConnection']>,
  input: CreateProductInput,
): Promise<{ productId: string; variantId: string; sku: string | null }> {
  const split = splitCustomFieldPayload({ cf_product_type: 'Storable', ...input.custom })
  const sku = input.sku || (await nextSeriesCode({ em: ctx.container.resolve('em') as EntityManager, tenantId: input.tenantId, organizationId: input.organizationId }, 'SKU'))
  const createInput = productCreateSchema.parse({
    title: input.title,
    sku,
    defaultUnit: input.unit,
    defaultSalesUnit: input.unit,
    uomRoundingScale: 3,
    customFieldsetCode: input.kind,
    categoryIds: input.categoryId ? [input.categoryId] : [],
    taxRateId: input.taxRateId,
    isActive: true,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
  })
  const { result: product } = await commandBus.execute<Record<string, unknown>, { productId?: string; id?: string }>('catalog.products.create', {
    input: { ...createInput, customFields: split.custom },
    ctx,
  })
  const productId = product?.productId ?? product?.id
  if (!productId) throw new Error('[internal] product was not created')
  const [created] = await connection.execute<Array<{ sku: string | null }>>(`select sku from catalog_products where id = ?`, [productId])
  const variantInput = variantCreateSchema.parse({
    productId,
    name: input.title,
    sku: created?.sku ?? undefined,
    isDefault: true,
    isActive: true,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
  })
  const { result: variant } = await commandBus.execute<Record<string, unknown>, { variantId?: string; id?: string }>('catalog.variants.create', {
    input: variantInput,
    ctx,
  })
  const variantId = variant?.variantId ?? variant?.id
  if (!variantId) throw new Error('[internal] variant was not created')
  const profileInput = productInventoryProfileCreateSchema.parse({
    catalogProductId: productId,
    defaultUom: input.unit,
    defaultStrategy: 'fifo',
    trackLot: true,
    reorderPoint: 0,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
  })
  await commandBus.execute('wms.inventoryProfiles.create', { input: profileInput, ctx })
  return { productId, variantId, sku: created?.sku ?? null }
}
