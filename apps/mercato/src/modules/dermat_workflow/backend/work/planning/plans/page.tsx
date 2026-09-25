"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { stripInternal } from '../../../../components/types'

type PlanSummary = {
  id: string
  planNumber: string
  name: string | null
  status: string
  bomNames: string[]
  totalBulkKg: number
  requests: Array<{ id: string; requestNumber: string; store: string; status: string }>
  createdBy: string | null
  createdAt: string
}

const PLAN_STATUS: Record<string, StatusBadgeVariant> = { draft: 'neutral', requested: 'info', completed: 'success', cancelled: 'neutral' }
const REQUEST_STATUS: Record<string, StatusBadgeVariant> = { requested: 'warning', issued: 'success', cancelled: 'neutral' }

export default function MaterialPlansPage() {
  const t = useT()
  const router = useRouter()
  const [rows, setRows] = React.useState<PlanSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const call = await apiCall<{ items: PlanSummary[]; error?: string }>('/api/dermat_workflow/material-plans')
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(stripInternal(call.result?.error, t('dermat_workflow.plans.loadError', 'Could not load plans.')))
      } else {
        setError(null)
        setRows(call.result.items)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken, t])

  const term = search.trim().toLowerCase()
  const visible = term
    ? rows.filter((row) => [row.planNumber, row.name ?? '', ...row.bomNames].some((value) => value.toLowerCase().includes(term)))
    : rows

  const columns = React.useMemo<ColumnDef<PlanSummary>[]>(
    () => [
      {
        id: 'plan',
        header: t('dermat_workflow.plans.plan', 'Plan'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.planNumber}</div>
            {row.original.name ? <div className="truncate text-xs text-muted-foreground">{row.original.name}</div> : null}
          </div>
        ),
      },
      {
        id: 'boms',
        header: t('dermat_workflow.plans.boms', 'BOMs'),
        meta: { maxWidth: '360px' },
        cell: ({ row }) => <span className="truncate">{row.original.bomNames.join(', ') || '—'}</span>,
      },
      {
        id: 'bulk',
        header: t('dermat_workflow.plan.bulkKg', 'Bulk (kg)'),
        cell: ({ row }) => row.original.totalBulkKg.toLocaleString(undefined, { maximumFractionDigits: 3 }),
      },
      {
        id: 'requests',
        header: t('dermat_workflow.plans.requests', 'Store requests'),
        cell: ({ row }) =>
          row.original.requests.length ? (
            <div className="flex flex-wrap gap-1">
              {row.original.requests.map((request) => (
                <StatusBadge key={request.id} variant={REQUEST_STATUS[request.status] ?? 'neutral'}>
                  {`${request.requestNumber} · ${t(`dermat_workflow.requests.status.${request.status}`, request.status)}`}
                </StatusBadge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">{t('dermat_workflow.plans.noRequests', 'Not sent')}</span>
          ),
      },
      {
        id: 'status',
        header: t('dermat_workflow.requests.status', 'Status'),
        cell: ({ row }) => (
          <StatusBadge variant={PLAN_STATUS[row.original.status] ?? 'neutral'}>
            {t(`dermat_workflow.plan.status.${row.original.status}`, row.original.status)}
          </StatusBadge>
        ),
      },
      {
        id: 'created',
        header: t('dermat_workflow.plans.created', 'Created'),
        cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
      },
    ],
    [t],
  )

  return (
    <Page>
      <PageBody>
        <div className="mb-4">
          <h1 className="text-lg font-semibold">{t('dermat_workflow.plans.pageTitle', 'Production Plans')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('dermat_workflow.plans.pageSubtitle', 'Plan several BOMs together. The raw and packing material they need is calculated for you and sent to the RM and PM stores as requests.')}
          </p>
        </div>
        <DataTable<PlanSummary>
          columns={columns}
          data={visible}
          isLoading={loading}
          error={error}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('dermat_workflow.plans.search', 'Search plan or BOM…')}
          onRowClick={(row) => router.push(`/backend/work/planning/plans/${row.id}`)}
          actions={
            <Button asChild>
              <Link href="/backend/work/planning/plans/create">{t('dermat_workflow.plans.new', 'New plan')}</Link>
            </Button>
          }
          refreshButton={{
            onRefresh: () => setReloadToken((value) => value + 1),
            label: t('dermat_workflow.requests.refresh', 'Refresh'),
            isRefreshing: loading,
          }}
          emptyState={t('dermat_workflow.plans.empty', 'No plans yet — create one to calculate material for several BOMs at once.')}
        />
      </PageBody>
    </Page>
  )
}
