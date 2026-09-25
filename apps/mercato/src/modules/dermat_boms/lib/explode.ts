import { BomHeader, BomItem } from '../data/entities'
import { batchQuantity, bomKindForProduct } from './bomKinds'
import { loadProducts, loadStock, type BomRequestContext } from './server'

export type TreeNode = {
  productId: string
  name: string
  code: string | null
  kind: string | null
  unit: string | null
  perParent: number | null
  quantity: number
  onHand: number
  bom: { id: string; code: string; version: number; status: string } | null
  children: TreeNode[]
  cycle?: boolean
  fill: { qty: number; unit: string; specificGravity: number | null } | null
}

export type Requirement = {
  productId: string
  name: string
  code: string | null
  kind: string | null
  unit: string | null
  quantity: number
  onHand: number
  shortage: number
}

const MAX_DEPTH = 6

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

async function currentBomFor(ctx: BomRequestContext, productId: string): Promise<BomHeader | null> {
  const candidates = await ctx.em.find(
    BomHeader,
    { productId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: { $in: ['approved', 'draft'] } },
    { orderBy: { version: 'desc' } },
  )
  return candidates.find((entry) => entry.status === 'approved') ?? candidates[0] ?? null
}

export async function explodeBom(ctx: BomRequestContext, root: BomHeader, quantity: number) {
  const headers = new Map<string, BomHeader | null>([[root.productId, root]])
  const itemsByBom = new Map<string, BomItem[]>()
  const productIds = new Set<string>([root.productId])

  async function load(productId: string, depth: number, path: Set<string>): Promise<void> {
    if (depth > MAX_DEPTH) return
    if (!headers.has(productId)) headers.set(productId, await currentBomFor(ctx, productId))
    const header = headers.get(productId)
    if (!header) return
    if (!itemsByBom.has(header.id)) {
      itemsByBom.set(header.id, await ctx.em.find(BomItem, { bomId: header.id }, { orderBy: { position: 'asc' } }))
    }
    for (const item of itemsByBom.get(header.id) ?? []) {
      productIds.add(item.componentProductId)
      if (item.componentKind === 'bulk' && !path.has(item.componentProductId)) {
        await load(item.componentProductId, depth + 1, new Set([...path, item.componentProductId]))
      }
    }
  }
  await load(root.productId, 0, new Set([root.productId]))

  const ids = Array.from(productIds)
  const [products, stock] = await Promise.all([loadProducts(ctx, ids), loadStock(ctx, ids)])
  const requirements = new Map<string, Requirement>()

  function build(
    productId: string,
    qty: number,
    perParent: number | null,
    path: Set<string>,
    depth: number,
    fill: TreeNode['fill'] = null,
  ): TreeNode {
    const product = products.get(productId)
    const header = headers.get(productId) ?? null
    const node: TreeNode = {
      productId,
      name: product?.title ?? '(deleted product)',
      code: product?.code ?? null,
      kind: product?.kind ?? null,
      unit: product?.unit ?? null,
      perParent,
      quantity: round(qty),
      onHand: stock.get(productId)?.onHand ?? 0,
      bom: header ? { id: header.id, code: header.code, version: header.version, status: header.status } : null,
      children: [],
      fill,
    }
    if (path.has(productId)) node.cycle = true
    if (!header || node.cycle || depth > MAX_DEPTH) {
      if (depth > 0) {
        const existing = requirements.get(productId)
        const total = (existing?.quantity ?? 0) + qty
        requirements.set(productId, {
          productId,
          name: node.name,
          code: node.code,
          kind: node.kind,
          unit: node.unit,
          quantity: round(total),
          onHand: node.onHand,
          shortage: round(Math.max(0, total - node.onHand)),
        })
      }
      return node
    }
    const kind = bomKindForProduct(header.productKind) ?? 'formula'
    for (const item of itemsByBom.get(header.id) ?? []) {
      const value = Number(kind === 'formula' ? item.percent : item.qtyPerUnit) || 0
      const childQty = batchQuantity(
        kind,
        qty,
        value,
        product?.unit,
        products.get(item.componentProductId)?.unit ?? item.unit,
        products.get(item.componentProductId)?.specificGravity,
      )
      const childFill =
        item.fillQty != null && item.fillUnit
          ? { qty: Number(item.fillQty), unit: item.fillUnit, specificGravity: products.get(item.componentProductId)?.specificGravity ?? null }
          : null
      node.children.push(build(item.componentProductId, childQty, value, new Set([...path, productId]), depth + 1, childFill))
    }
    return node
  }

  const tree = build(root.productId, quantity, null, new Set(), 0)
  const list = Array.from(requirements.values()).sort((a, b) => (a.kind ?? '').localeCompare(b.kind ?? '') || a.name.localeCompare(b.name))
  return { tree, requirements: list }
}
