"use client"

import * as React from 'react'
import Link from 'next/link'
import { Boxes, Check, ExternalLink } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

export type LinkedPackingItem = { id: string; title: string; type: string; sku: string | null; unit: string | null }

type PackingItemsCardProps = {
  productId?: string
  productTitle: string
  selected: string[]
  onChange: (types: string[]) => void
  refreshKey?: number
}

export function PackingItemsCard({ productId, productTitle, selected, onChange, refreshKey }: PackingItemsCardProps) {
  const t = useT()
  const [types, setTypes] = React.useState<string[]>([])
  const [linked, setLinked] = React.useState<LinkedPackingItem[]>([])

  React.useEffect(() => {
    let cancelled = false
    const query = productId ? `?productId=${encodeURIComponent(productId)}` : ''
    apiCall<{ items?: LinkedPackingItem[]; types?: string[] }>(`/api/dermat_products/packing${query}`, undefined, {
      fallback: { items: [], types: [] },
    }).then((call) => {
      if (cancelled) return
      setTypes(call.result?.types ?? [])
      setLinked(call.result?.items ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [productId, refreshKey])

  const linkedByType = new Map(linked.map((item) => [item.type.toLowerCase(), item]))
  const chosen = new Set(selected.map((type) => type.toLowerCase()))
  const name = productTitle.trim() || t('dermat_products.packing.thisProduct', 'this product')

  const toggle = (type: string) => {
    if (linkedByType.has(type.toLowerCase())) return
    const next = chosen.has(type.toLowerCase()) ? selected.filter((entry) => entry.toLowerCase() !== type.toLowerCase()) : [...selected, type]
    onChange(next)
  }

  const pending = selected.filter((type) => !linkedByType.has(type.toLowerCase()))

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <Boxes className="h-4 w-4 text-primary" />
          {t('dermat_products.packing.title', 'Packing for this product')}
        </CardTitle>
        <CardDescription className="text-xs">
          {t(
            'dermat_products.packing.hint',
            'Tick what this product is packed in. Each one is created as a packing material named "<Type> - {name}" with this product\'s SKU — no new SKU. The list is in Masters → Dropdown Options.',
            { name },
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap gap-2">
          {types.map((type) => {
            const existing = linkedByType.get(type.toLowerCase())
            const active = Boolean(existing) || chosen.has(type.toLowerCase())
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggle(type)}
                disabled={Boolean(existing)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                  existing && 'cursor-default',
                )}
              >
                {active ? <Check className="h-3 w-3" /> : null}
                {type}
              </button>
            )
          })}
        </div>

        {linked.length ? (
          <ul className="divide-y rounded-md border text-sm">
            {linked.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{item.sku ?? ''}</span>
                </span>
                <Link href={`/backend/products/${item.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                  {t('dermat_products.packing.open', 'Open')}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {pending.length ? (
          <p className="text-xs text-muted-foreground">
            {t('dermat_products.packing.pending', 'Will be created when you save: {items}', {
              items: pending.map((type) => `${type} - ${name}`).join(', '),
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default PackingItemsCard
