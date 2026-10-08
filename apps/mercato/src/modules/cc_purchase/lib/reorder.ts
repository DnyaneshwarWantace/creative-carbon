import type { OrderContext } from '../../cc_orders/lib/server'
import { loadProducts } from '../../cc_orders/lib/server'
import { PURCHASED_KINDS, type ProductKind } from '../../cc_products/lib/kinds'

type Row = { product_id: string; reorder_point: string; safety_stock: string; on_hand: string; free: string; on_order: string; on_indent: string }

function qty(value: number): number {
  return Math.round(value * 1000) / 1000
}

export async function reorderSuggestions(ctx: OrderContext, options: { all?: boolean } = {}) {
  const scope = [ctx.tenantId, ctx.organizationId]
  const rows = await ctx.em.getConnection().execute<Row[]>(
    `select p.catalog_product_id as product_id, p.reorder_point, p.safety_stock,
            coalesce(stock.on_hand, 0) as on_hand, coalesce(stock.free, 0) as free,
            coalesce(po.open, 0) as on_order, coalesce(ind.open, 0) as on_indent
       from wms_product_inventory_profiles p
       left join lateral (
         select sum(b.quantity_on_hand) as on_hand, sum(b.quantity_on_hand - b.quantity_reserved - b.quantity_allocated) as free
           from wms_inventory_balances b join catalog_product_variants v on v.id = b.catalog_variant_id
          where v.product_id = p.catalog_product_id and b.tenant_id = p.tenant_id and b.organization_id = p.organization_id and b.deleted_at is null
       ) stock on true
       left join lateral (
         select sum(greatest(l.quantity - l.received_qty, 0)) as open
           from cc_po_lines l join cc_pos o on o.id = l.po_id
          where l.product_id = p.catalog_product_id and o.tenant_id = p.tenant_id and o.organization_id = p.organization_id and o.deleted_at is null
            and o.status in ('draft', 'pending_approval', 'approved', 'partly_received')
       ) po on true
       left join lateral (
         select sum((line->>'quantity')::numeric) as open
           from cc_purchase_indents i cross join lateral jsonb_array_elements(i.lines) as line
          where (line->>'productId')::uuid = p.catalog_product_id and i.tenant_id = p.tenant_id and i.organization_id = p.organization_id and i.deleted_at is null
            and i.status in ('submitted', 'approved')
       ) ind on true
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.reorder_point > 0`,
    scope,
  )
  const products = await loadProducts(ctx, rows.map((row) => row.product_id))
  const items = rows
    .map((row) => {
      const product = products.get(row.product_id)
      const reorderPoint = Number(row.reorder_point)
      const safetyStock = Number(row.safety_stock)
      const onHand = qty(Number(row.on_hand))
      const onOrder = qty(Number(row.on_order))
      const onIndent = qty(Number(row.on_indent))
      const position = qty(onHand + onOrder + onIndent)
      const below = position < reorderPoint
      return {
        productId: row.product_id,
        title: product?.title ?? '',
        code: product?.code ?? product?.sku ?? null,
        kind: product?.kind ?? null,
        unit: product?.unit ?? 'kg',
        reorderPoint,
        safetyStock,
        onHand,
        free: qty(Number(row.free)),
        onOrder,
        onIndent,
        position,
        below,
        stockBelow: onHand < reorderPoint,
        suggested: below ? Math.ceil(reorderPoint + safetyStock - position) : 0,
      }
    })
    .filter((item) => item.title && PURCHASED_KINDS.has((item.kind ?? '') as ProductKind))
    .filter((item) => options.all || item.stockBelow || item.below)
    .sort((left, right) => Number(right.below) - Number(left.below) || left.position / left.reorderPoint - right.position / right.reorderPoint)
  return { items, below: items.filter((item) => item.below).length }
}
