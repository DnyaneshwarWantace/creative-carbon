"use client"

import * as React from 'react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { stripInternal } from './types'

type StoreKind = 'raw_material' | 'packaging_material'

type RequestRow = {
  id: string
  requestNumber: string
  planId: string
  planNumber: string | null
  store: StoreKind
  status: 'requested' | 'issued' | 'cancelled'
  requestedBy: string | null
  issuedBy: string | null
  issuedAt: string | null
  createdAt: string
  lineCount: number
  shortLines: number
}

type RequestLine = {
  id: string
  code: string | null
  name: string | null
  unit: string | null
  requiredQty: number
  stockAtRequest: number
  currentStock: number
  issuedQty: number | null
}

type RequestDetail = { request: RequestRow; lines: RequestLine[] }

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = { requested: 'warning', issued: 'success', cancelled: 'neutral' }

const format = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 3 })

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—')

export function MaterialRequests() {
  const t = useT()
  const [store, setStore] = React.useState<'all' | StoreKind>('all')
  const [status, setStatus] = React.useState<'requested' | 'issued' | 'all'>('requested')
  const [rows, setRows] = React.useState<RequestRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams()
    if (store !== 'all') params.set('store', store)
    if (status !== 'all') params.set('status', status)
    void (async () => {
      const call = await apiCall<{ items: RequestRow[]; error?: string }>(`/api/dermat_workflow/material-requests?${params.toString()}`)
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(stripInternal(call.result?.error, t('dermat_workflow.requests.loadError', 'Could not load requests.')))
      } else {
        setError(null)
        setRows(call.result.items)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [store, status, reloadToken, t])

  const columns = React.useMemo<ColumnDef<RequestRow>[]>(
    () => [
      {
        id: 'number',
        header: t('dermat_workflow.requests.number', 'Request'),
        cell: ({ row }) => <span className="font-medium">{row.original.requestNumber}</span>,
      },
      {
        id: 'store',
        header: t('dermat_workflow.requests.store', 'Store'),
        cell: ({ row }) => (
          <Tag variant="neutral">
            {row.original.store === 'raw_material' ? t('dermat_workflow.plan.rmStore', 'RM Store') : t('dermat_workflow.plan.pmStore', 'PM Store')}
          </Tag>
        ),
      },
      {
        id: 'plan',
        header: t('dermat_workflow.requests.plan', 'Plan'),
        cell: ({ row }) => row.original.planNumber ?? '—',
      },
      {
        id: 'lines',
        header: t('dermat_workflow.requests.materials', 'Materials'),
        cell: ({ row }) =>
          row.original.shortLines > 0
            ? t('dermat_workflow.requests.linesShort', '{count} ({short} short)', { count: row.original.lineCount, short: row.original.shortLines })
            : String(row.original.lineCount),
      },
      {
        id: 'requested',
        header: t('dermat_workflow.requests.requestedBy', 'Requested'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div>{formatDate(row.original.createdAt)}</div>
            <div className="truncate text-xs text-muted-foreground">{row.original.requestedBy ?? ''}</div>
          </div>
        ),
      },
      {
        id: 'status',
        header: t('dermat_workflow.requests.status', 'Status'),
        cell: ({ row }) => (
          <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>
            {t(`dermat_workflow.requests.status.${row.original.status}`, row.original.status)}
          </StatusBadge>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl
          value={store}
          onValueChange={(value) => setStore(value as 'all' | StoreKind)}
        >
          <SegmentedControlItem value="all">{t('dermat_workflow.requests.allStores', 'All stores')}</SegmentedControlItem>
          <SegmentedControlItem value="raw_material">{t('dermat_workflow.plan.rmStore', 'RM Store')}</SegmentedControlItem>
          <SegmentedControlItem value="packaging_material">{t('dermat_workflow.plan.pmStore', 'PM Store')}</SegmentedControlItem>
        </SegmentedControl>
        <SegmentedControl
          value={status}
          onValueChange={(value) => setStatus(value as 'requested' | 'issued' | 'all')}
        >
          <SegmentedControlItem value="requested">{t('dermat_workflow.requests.toIssue', 'To issue')}</SegmentedControlItem>
          <SegmentedControlItem value="issued">{t('dermat_workflow.requests.issued', 'Issued')}</SegmentedControlItem>
          <SegmentedControlItem value="all">{t('dermat_workflow.requests.all', 'All')}</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <DataTable<RequestRow>
        columns={columns}
        data={rows}
        isLoading={loading}
        error={error}
        onRowClick={(row) => setOpenId(row.id)}
        refreshButton={{
          onRefresh: () => setReloadToken((value) => value + 1),
          label: t('dermat_workflow.requests.refresh', 'Refresh'),
          isRefreshing: loading,
        }}
        emptyState={t('dermat_workflow.requests.empty', 'No material requests here.')}
      />
      <MaterialRequestSheet
        requestId={openId}
        onOpenChange={(open) => !open && setOpenId(null)}
        onIssued={() => setReloadToken((value) => value + 1)}
      />
    </div>
  )
}

function MaterialRequestSheet({
  requestId,
  onOpenChange,
  onIssued,
}: {
  requestId: string | null
  onOpenChange: (open: boolean) => void
  onIssued: () => void
}) {
  const t = useT()
  const [detail, setDetail] = React.useState<RequestDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [issueQty, setIssueQty] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const mutationContextId = 'dermat_workflow.material-request'
  const { runMutation, retryLastMutation } = useGuardedMutation<{
    formId: string
    resourceKind: string
    resourceId: string
    retryLastMutation: () => Promise<boolean>
  }>({ contextId: mutationContextId })

  React.useEffect(() => {
    if (!requestId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const call = await apiCall<RequestDetail & { error?: string }>(`/api/dermat_workflow/material-requests/${requestId}`)
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(stripInternal(call.result?.error, t('dermat_workflow.requests.detailError', 'Could not load the request.')))
      } else {
        setError(null)
        setDetail(call.result)
        setIssueQty(
          Object.fromEntries(
            call.result.lines.map((line) => [
              line.id,
              String(line.issuedQty ?? Math.round(Math.max(0, Math.min(line.requiredQty, line.currentStock)) * 1000) / 1000),
            ]),
          ),
        )
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [requestId, t])

  const editable = detail?.request.status === 'requested'

  const issue = async () => {
    if (!detail || !editable || busy) return
    const payload = { lines: detail.lines.map((line) => ({ lineId: line.id, issuedQty: Number(issueQty[line.id]) || 0 })) }
    setBusy(true)
    try {
      const call = await runMutation({
        operation: async () =>
          apiCall<{ requestNumber?: string; error?: string }>(`/api/dermat_workflow/material-requests/${detail.request.id}/issue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }),
        context: { formId: mutationContextId, resourceKind: 'dermat_workflow.material_request', resourceId: detail.request.id, retryLastMutation },
        mutationPayload: payload,
      })
      if (!call.ok) {
        flash(stripInternal(call.result?.error, t('dermat_workflow.requests.issueError', 'Could not issue the material.')), 'error')
        return
      }
      flash(t('dermat_workflow.requests.issuedOk', '{number} issued — stock deducted.', { number: detail.request.requestNumber }), 'success')
      onIssued()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const columns: ColumnDef<RequestLine>[] = [
    {
      id: 'material',
      header: t('dermat_workflow.plan.material', 'Material'),
      meta: { maxWidth: '240px' },
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.name ?? '—'}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.code ?? ''}</div>
        </div>
      ),
    },
    {
      id: 'need',
      header: t('dermat_workflow.plan.weNeed', 'We need'),
      cell: ({ row }) => `${format(row.original.requiredQty)} ${row.original.unit ?? ''}`,
    },
    {
      id: 'stock',
      header: t('dermat_workflow.requests.inStockNow', 'In stock now'),
      cell: ({ row }) =>
        row.original.currentStock < row.original.requiredQty && editable ? (
          <StatusBadge variant="warning">{format(row.original.currentStock)}</StatusBadge>
        ) : (
          format(row.original.currentStock)
        ),
    },
    {
      id: 'issue',
      header: t('dermat_workflow.requests.issueQty', 'Issue'),
      cell: ({ row }) =>
        editable ? (
          <Input
            type="number"
            min={0}
            className="w-28"
            value={issueQty[row.original.id] ?? ''}
            onChange={(event) => setIssueQty((current) => ({ ...current, [row.original.id]: event.target.value }))}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          format(row.original.issuedQty)
        ),
    },
  ]

  const shortLines = (detail?.lines ?? []).filter((line) => line.currentStock < line.requiredQty)

  return (
    <Sheet open={Boolean(requestId)} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-3xl overflow-y-auto"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            void issue()
          }
        }}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {detail?.request.requestNumber ?? t('dermat_workflow.requests.title', 'Material request')}
            {detail ? (
              <StatusBadge variant={STATUS_VARIANT[detail.request.status] ?? 'neutral'}>
                {t(`dermat_workflow.requests.status.${detail.request.status}`, detail.request.status)}
              </StatusBadge>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            {detail
              ? t('dermat_workflow.requests.sheetHint', 'Plan {plan} asks the {store} for this material. Issuing deducts it from stock.', {
                  plan: detail.request.planNumber ?? '',
                  store: detail.request.store === 'raw_material' ? t('dermat_workflow.plan.rmStore', 'RM Store') : t('dermat_workflow.plan.pmStore', 'PM Store'),
                })
              : null}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          {loading ? <Spinner /> : null}
          {error ? <Notice variant="error" message={error} /> : null}
          {detail && editable && shortLines.length ? (
            <Notice
              variant="warning"
              message={t('dermat_workflow.requests.shortHint', '{count} material(s) are short. Issue what you have — the rest has to be purchased.', { count: shortLines.length })}
            />
          ) : null}
          {detail && !editable ? (
            <Notice compact message={t('dermat_workflow.requests.issuedBy', 'Issued by {user} on {date}.', { user: detail.request.issuedBy ?? '—', date: formatDate(detail.request.issuedAt) })} />
          ) : null}
          {detail ? <DataTable<RequestLine> embedded columns={columns} data={detail.lines} /> : null}
        </div>
        {editable ? (
          <SheetFooter className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('dermat_workflow.plan.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={() => void issue()} disabled={busy}>
              {busy ? <Spinner /> : null}
              {t('dermat_workflow.requests.issue', 'Issue material')}
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

export default MaterialRequests
