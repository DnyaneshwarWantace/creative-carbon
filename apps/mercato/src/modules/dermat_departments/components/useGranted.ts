"use client"

import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

const UI_FEATURES = [
  'dermat_orders.manage',
  'dermat_orders.stages',
  'dermat_orders.reopen',
  'dermat_orders.work.accounts',
  'dermat_orders.work.rnd',
  'dermat_orders.work.artwork',
  'dermat_orders.work.planning',
  'dermat_orders.work.production',
  'dermat_orders.work.qa',
  'dermat_orders.work.dispatch',
  'dermat_accounts.record',
  'customers.companies.manage',
  'dermat_purchase.manage',
  'dermat_purchase.indent',
  'dermat_purchase.approve',
  'dermat_purchase.receive',
  'dermat_vendors.manage',
  'dermat_store.issue',
  'dermat_store.request',
  'dermat_store.adjust',
  'dermat_boms.manage',
  'dermat_boms.approve',
  'dermat_planning.reserve',
  'dermat_quality.chemical',
  'dermat_quality.micro',
  'dermat_quality.rules',
  'dermat_quality.documents',
  'dermat_lists.manage',
  'dermat_rnd.request',
  'dermat_rnd.manage',
  'catalog.products.manage',
]

let cache: Promise<Set<string>> | null = null

function load(): Promise<Set<string>> {
  if (!cache) {
    cache = apiCall<{ ok?: boolean; granted?: string[] }>(
      '/api/auth/feature-check',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ features: UI_FEATURES }) },
      { fallback: { ok: false, granted: [] } },
    ).then((call) => {
      if (!call.ok) cache = null
      return new Set(call.result?.ok ? UI_FEATURES : call.result?.granted ?? [])
    })
  }
  return cache
}

export function useGranted(): { ready: boolean; has: (feature: string) => boolean } {
  const [granted, setGranted] = React.useState<Set<string> | null>(null)
  React.useEffect(() => {
    let cancelled = false
    void load().then((set) => {
      if (!cancelled) setGranted(set)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return React.useMemo(() => ({ ready: granted !== null, has: (feature: string) => Boolean(granted?.has(feature)) }), [granted])
}
