"use client"

import * as React from 'react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

const UI_FEATURES = [
  'cc_orders.manage',
  'cc_orders.stages',
  'cc_orders.reopen',
  'cc_orders.money',
  'cc_orders.view',
  'cc_store.view',
  'cc_purchase.view',
  'wms.view',
  'cc_dashboard.everyone',
  'cc_orders.work.accounts',
  'cc_orders.work.store',
  'cc_orders.work.qc',
  'cc_orders.work.dispatch',
  'cc_accounts.record',
  'customers.companies.manage',
  'cc_purchase.manage',
  'cc_purchase.indent',
  'cc_purchase.approve',
  'cc_purchase.receive',
  'cc_vendors.manage',
  'cc_store.adjust',
  'cc_lists.manage',
  'cc_production.masters.manage',
  'cc_production.prices.view',
  'cc_production.resin.enter',
  'cc_production.resin.sign',
  'cc_production.chemicals.issue',
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
