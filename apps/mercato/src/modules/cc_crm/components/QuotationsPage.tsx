"use client"

import * as React from 'react'
import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'

import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PlantTable } from '../../cc_production/components/PlantTable'
import { useGranted } from '../../cc_departments/components/useGranted'
import { formatDate, formatQty } from '../../cc_orders/components/format'
import { QUOTE_LABEL, QUOTE_VARIANT, type QuotationRow } from './types'
import { PageLoading } from '../../cc_ui/components/PageLoading'

const TABS = ['open', 'draft', 'sent', 'accepted', 'converted', 'rejected', 'all'] as const

export function QuotationsPage() {
  const t = useT()
  const granted = useGranted()
  const [tab, setTab] = React.useState<(typeof TABS)[number]>('open')
  const [rows, setRows] = React.useState<QuotationRow[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setRows(null)
    apiCall<{ items: QuotationRow[] }>(`/api/cc_crm/quotations?status=${tab}`).then((call) => {
      if (!cancelled) setRows(call.result?.items ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [tab])

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">{t('cc_crm.quotations.title', 'Quotations')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_crm.quotations.subtitle', 'Quotations with lines as on an order. "Convert to order" carries everything across.')}</p>
            </div>
            {granted.has('cc_crm.manage') ? (
              <Button asChild>
                <Link href="/backend/crm/quotations/new">
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('cc_crm.quotations.new', 'New quotation')}
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn('rounded-full border px-3 py-1 text-xs', tab === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
              >
                {key === 'open' ? t('cc_crm.tab.open', 'Open') : key === 'all' ? t('cc_crm.tab.all', 'All') : t(`cc_crm.quote.${key}`, QUOTE_LABEL[key])}
              </button>
            ))}
          </div>
          {!rows ? (
            <PageLoading label={t('cc_crm.loading', 'Loading…')} />
          ) : (
            <div className="rounded-xl border bg-card shadow-xs">
              <PlantTable
                tableId="cc_crm.quotations"
                rows={rows}
                rowKey={(row) => row.id}
                rowHref={(row) => `/backend/crm/quotations/${row.id}`}
                empty={<EmptyState className="py-12" variant="subtle" icon={<FileText className="h-5 w-5" aria-hidden="true" />} title={t('cc_crm.quotations.empty', 'No quotations here')} />}
                columns={[
                  { key: 'no', label: t('cc_crm.quotations.no', 'Quotation'), alwaysVisible: true, render: (row) => <span className="font-mono text-xs">{row.quoteNo}</span> },
                  { key: 'date', label: t('cc_crm.quotations.date', 'Date'), render: (row) => formatDate(row.quoteDate) },
                  { key: 'customer', label: t('cc_crm.form.customer', 'Customer'), render: (row) => <span className="font-medium">{row.customerName}</span> },
                  { key: 'enquiry', label: t('cc_crm.enquiries.no', 'Enquiry'), hidden: true, render: (row) => <span className="font-mono text-xs">{row.enquiryNo ?? ''}</span> },
                  { key: 'terms', label: t('cc_crm.quotations.terms', 'Terms'), render: (row) => (row.market === 'export' ? `${t('cc_orders.form.export', 'Export')} ${row.incoterm ?? ''}` : t('cc_orders.form.domestic', 'Domestic')) },
                  { key: 'lines', label: t('cc_crm.quotations.lines', 'Items'), align: 'right', hidden: true, render: (row) => row.lineCount },
                  { key: 'total', label: t('cc_crm.quotations.total', 'Value'), align: 'right', render: (row) => <span className="tabular-nums">{row.currency} {formatQty(row.totalAmount, 2)}</span> },
                  { key: 'valid', label: t('cc_crm.form.validUntil', 'Valid until'), render: (row) => <span className={cn(row.expired && 'text-status-error-text')}>{formatDate(row.validUntil)}{row.expired ? ` · ${t('cc_crm.quotations.expired', 'expired')}` : ''}</span> },
                  { key: 'status', label: t('cc_crm.enquiries.stage', 'Stage'), render: (row) => <StatusBadge variant={QUOTE_VARIANT[row.status]}>{t(`cc_crm.quote.${row.status}`, QUOTE_LABEL[row.status])}</StatusBadge> },
                  { key: 'order', label: t('cc_crm.quotations.order', 'Order'), render: (row) => <span className="font-mono text-xs">{row.orderNo ?? ''}</span> },
                  { key: 'by', label: t('cc_crm.quotations.by', 'Made by'), hidden: true, render: (row) => row.byName ?? '' },
                ]}
              />
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default QuotationsPage
