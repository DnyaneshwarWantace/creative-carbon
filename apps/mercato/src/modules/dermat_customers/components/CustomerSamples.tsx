"use client"

import * as React from 'react'
import Link from 'next/link'
import { Beaker, FlaskConical } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../dermat_departments/components/useGranted'

type Bom = { id: string; code: string; version: number; status: string; orderSpecific: boolean } | null
type Formula = { productId: string; title: string; code: string | null; orders: number; pieces: number; lastOrder: string; lastOrderId: string; lastOrderNo: string; rdNumbers: string | null; batches: string | null; packBom: Bom; orderSpecificBoms: number; bulkId: string | null; bulkTitle: string | null; formula: Bom }
type Request = { id: string; code: string; status: string; productName: string; productType: string | null; orderId: string | null; orderNo: string | null; lastSentOn: string | null; rounds: Array<{ round?: number; feedback?: string | null }>; dueDate: string | null }

const RD_STATUS: Record<string, StatusBadgeVariant> = { requested: 'warning', in_progress: 'info', sample_sent: 'info', changes: 'warning', approved: 'success', dropped: 'neutral' }
const BOM_STATUS: Record<string, StatusBadgeVariant> = { approved: 'success', draft: 'warning', archived: 'neutral' }

function BomChip({ bom, label }: { bom: Bom; label: string }) {
  if (!bom) return <span className="text-xs text-status-warning-text">{label}: none</span>
  return (
    <Link href={`/backend/boms/${bom.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs hover:bg-muted">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold">{bom.code}</span>
      <span className="text-muted-foreground">v{bom.version}</span>
      <StatusBadge variant={BOM_STATUS[bom.status] ?? 'neutral'}>{bom.status}</StatusBadge>
    </Link>
  )
}

export function CustomerSamples({ customerId }: { customerId: string }) {
  const t = useT()
  const granted = useGranted()
  const [formulas, setFormulas] = React.useState<Formula[] | null>(null)
  const [requests, setRequests] = React.useState<Request[] | null>(null)

  React.useEffect(() => {
    void apiCall<{ items?: Formula[] }>(`/api/dermat_customers/formulas?customerId=${encodeURIComponent(customerId)}`, undefined, { fallback: { items: [] } }).then((call) => setFormulas(call.result?.items ?? []))
    void apiCall<{ items?: Request[] }>(`/api/dermat_rnd/requests?view=all&customerId=${encodeURIComponent(customerId)}`, undefined, { fallback: { items: [] } }).then((call) => setRequests(call.ok ? (call.result?.items ?? []) : null))
  }, [customerId])

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b bg-muted/20 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('dermat_customers.samples.formulas', 'Products and formulas')}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {formulas === null ? <p className="p-4 text-sm text-muted-foreground">{t('dermat_customers.samples.loading', 'Loading…')}</p> : null}
          {formulas && !formulas.length ? <p className="p-4 text-sm text-muted-foreground">{t('dermat_customers.samples.noProducts', 'No orders yet, so no products.')}</p> : null}
          {(formulas ?? []).map((item) => (
            <div key={item.productId} className="space-y-1.5 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/backend/products/${item.productId}`} className="font-medium hover:underline">{item.title}</Link>
                <span className="text-xs text-muted-foreground">
                  {t('dermat_customers.samples.ordered', '{orders} orders · {pieces} pcs · last', { orders: item.orders, pieces: item.pieces.toLocaleString('en-IN') })}{' '}
                  <Link href={`/backend/orders/${item.lastOrderId}`} className="font-mono hover:underline">{item.lastOrderNo}</Link>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <BomChip bom={item.packBom} label={t('dermat_customers.samples.pack', 'Pack BOM')} />
                <BomChip bom={item.formula} label={t('dermat_customers.samples.formula', 'Formula')} />
                {item.orderSpecificBoms ? <span className="text-xs text-muted-foreground">{t('dermat_customers.samples.orderBoms', '+{n} order-specific', { n: item.orderSpecificBoms })}</span> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {[item.rdNumbers ? `R&D ${item.rdNumbers}` : null, item.batches ? `Batches ${item.batches}` : null].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b bg-muted/20 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <Beaker className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('dermat_customers.samples.title', 'Samples and R&D requests')}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {requests === null ? <p className="p-4 text-sm text-muted-foreground">{granted.ready && !granted.has('dermat_rnd.request') ? t('dermat_customers.samples.noAccess', 'You cannot see R&D requests.') : t('dermat_customers.samples.loading', 'Loading…')}</p> : null}
          {requests && !requests.length ? <p className="p-4 text-sm text-muted-foreground">{t('dermat_customers.samples.none', 'No R&D requests for this customer yet.')}</p> : null}
          {(requests ?? []).map((request) => (
            <Link key={request.id} href={`/backend/rnd/requests?id=${request.id}`} className="block space-y-1 p-4 hover:bg-muted/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{request.productName}</span>
                <StatusBadge variant={RD_STATUS[request.status] ?? 'neutral'}>{request.status.replace(/_/g, ' ')}</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{request.code}</span>
                {request.orderNo ? ` · for ${request.orderNo}` : ''}
                {request.rounds.length ? ` · ${request.rounds.length} sample round(s)` : ''}
                {request.lastSentOn ? ` · last sent ${request.lastSentOn}` : ''}
                {request.dueDate ? ` · due ${request.dueDate}` : ''}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
