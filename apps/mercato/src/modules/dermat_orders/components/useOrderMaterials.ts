"use client"

import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { Order } from './types'

export type Requirement = { productId: string; name: string; code: string | null; kind: string | null; unit: string | null; quantity: number; onHand: number }
type TreeNode = { productId: string; kind: string | null; quantity: number; unit: string | null; children: TreeNode[] }

export type OrderMaterials = { rows: Requirement[]; bulkByLine: Record<string, number>; missing: string[] }

export function useOrderMaterials(order: Order | null): OrderMaterials | null {
  const [materials, setMaterials] = React.useState<OrderMaterials | null>(null)
  const lineKey = order?.lines.map((line) => `${line.productId}:${line.quantity}:${line.bom?.id ?? ''}`).join('|') ?? ''

  React.useEffect(() => {
    if (!order) return
    let cancelled = false
    ;(async () => {
      const totals = new Map<string, Requirement>()
      const bulkByLine: Record<string, number> = {}
      const missing: string[] = []
      for (const line of order.lines) {
        if (!line.bom) {
          missing.push(line.product?.title ?? '—')
          continue
        }
        const call = await apiCall<{ tree?: TreeNode; requirements?: Requirement[] }>(
          `/api/dermat_boms/tree?bomId=${encodeURIComponent(line.bom.id)}&quantity=${line.quantity}&orderId=${encodeURIComponent(order.id)}`,
          undefined,
          { fallback: {} },
        )
        bulkByLine[line.id] = (call.result?.tree?.children ?? []).filter((child) => child.kind === 'bulk').reduce((sum, child) => sum + child.quantity, 0)
        for (const row of call.result?.requirements ?? []) {
          const current = totals.get(row.productId)
          totals.set(row.productId, current ? { ...current, quantity: current.quantity + row.quantity } : { ...row })
        }
      }
      if (cancelled) return
      const rows = Array.from(totals.values()).sort((a, b) => (a.kind ?? '').localeCompare(b.kind ?? '') || a.name.localeCompare(b.name))
      setMaterials({ rows, bulkByLine, missing })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, lineKey])

  return materials
}
