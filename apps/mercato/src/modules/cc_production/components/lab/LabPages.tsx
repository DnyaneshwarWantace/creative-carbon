"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FlaskConical, Paperclip, Plus } from 'lucide-react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, todayIso } from '../resin/shared'
import type { LabResult, LabTest } from './types'
import { PhoneList } from '../../../cc_ui/components/PhoneList'
import { cn } from '@open-mercato/shared/lib/utils'

export { LabFormPage } from './LabForm'
export { LabDetailPage } from './LabDetail'

const RESULT_VARIANT: Record<LabResult, 'success' | 'error' | 'warning'> = { pass: 'success', fail: 'error', pending: 'warning' }
const PAGE_SIZE = 50

function ResultBadge({ result }: { result: LabResult }) {
  const t = useT()
  const label = { pass: t('cc_production.lab.pass', 'Pass'), fail: t('cc_production.lab.fail', 'Fail'), pending: t('cc_production.lab.pending', 'Pending') }[result]
  return (
    <StatusBadge variant={RESULT_VARIANT[result]} dot>
      {label}
    </StatusBadge>
  )
}

export function LabListPage() {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.quality.enter')
  const [rows, setRows] = React.useState<LabTest[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (typeof filters.result === 'string' && filters.result) params.set('result', filters.result)
      if (typeof filters.testPoint === 'string' && filters.testPoint) params.set('testPoint', filters.testPoint)
      if (typeof filters.month === 'string' && /^\d{4}-\d{2}$/.test(filters.month)) params.set('month', filters.month)
      const call = await apiCall<{ items: LabTest[] }>(`/api/cc_production/lab?${params.toString()}`, undefined, { fallback: { items: [] } })
      if (cancelled) return
      setRows(call.ok ? (call.result?.items ?? []) : [])
      setLoading(false)
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [search, filters])

  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      { id: 'result', label: t('cc_production.lab.result', 'Result'), type: 'select', options: [{ value: 'pass', label: t('cc_production.lab.pass', 'Pass') }, { value: 'fail', label: t('cc_production.lab.fail', 'Fail') }, { value: 'pending', label: t('cc_production.lab.pending', 'Pending') }] },
      { id: 'testPoint', label: t('cc_production.lab.point', 'Testing point'), type: 'select', options: [{ value: 'incoming', label: t('cc_production.lab.incoming', 'Raw material in') }, { value: 'outgoing', label: t('cc_production.lab.outgoing', 'Finished goods out') }] },
      { id: 'month', label: t('cc_production.lab.month', 'Month (YYYY-MM)'), type: 'text', placeholder: todayIso().slice(0, 7) },
    ],
    [t],
  )

  const columns = React.useMemo<ColumnDef<LabTest>[]>(
    () => [
      { id: 'testDate', header: t('cc_production.lab.testedOn', 'Tested on'), accessorKey: 'testDate', cell: ({ row }) => <span className="whitespace-nowrap">{day(row.original.testDate)}</span> },
      { id: 'testType', header: t('cc_production.lab.type', 'Test type'), accessorKey: 'testType', cell: ({ row }) => <span className="font-medium">{row.original.testType}</span> },
      { id: 'result', header: t('cc_production.lab.result', 'Result'), accessorKey: 'result', cell: ({ row }) => <ResultBadge result={row.original.result} /> },
      {
        id: 'report',
        header: t('cc_production.lab.reportFile', 'Lab test report'),
        cell: ({ row }) => {
          const files = row.original.reports ?? []
          if (!files.length) return <span className="text-xs text-status-warning-text">{t('cc_production.lab.notAttached', 'Not attached')}</span>
          return (
            <a
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              href={`/api/attachments/file/${files[0].id}?download=1`}
              onClick={(event) => event.stopPropagation()}
              title={files.map((file) => file.fileName).join(', ')}
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              {files.length > 1 ? t('cc_production.lab.files', '{count} files', { count: files.length }) : t('cc_production.lab.download', 'Download report')}
            </a>
          )
        },
      },
      { id: 'point', header: t('cc_production.lab.point', 'Testing point'), accessorKey: 'testPoint', cell: ({ row }) => (row.original.testPoint === 'incoming' ? t('cc_production.lab.incoming', 'Raw material in') : t('cc_production.lab.outgoing', 'Finished goods out')) },
      { id: 'lots', header: t('cc_production.lab.lots', 'Lot(s)'), accessorKey: 'lotRefs', cell: ({ row }) => <span className="font-mono text-xs">{row.original.lotRefs ?? '—'}</span>, meta: { truncate: true, maxWidth: '220px' } },
      { id: 'item', header: t('cc_production.lab.item', 'Item'), accessorKey: 'itemTitle', cell: ({ row }) => row.original.itemTitle ?? '—', meta: { truncate: true, maxWidth: '220px' } },
      { id: 'standard', header: t('cc_production.lab.standard', 'Standard'), accessorKey: 'standard', cell: ({ row }) => row.original.standard ?? '—' },
      { id: 'customer', header: t('cc_production.moulding.customer', 'Customer'), accessorKey: 'customerName', cell: ({ row }) => row.original.customerName ?? <span className="text-muted-foreground">—</span> },
      {
        id: 'order',
        header: t('cc_production.lab.order', 'Order'),
        accessorKey: 'orderNo',
        cell: ({ row }) =>
          row.original.orderId ? (
            <Link className="font-mono text-xs text-primary hover:underline" href={`/backend/orders/${row.original.orderId}`} onClick={(event) => event.stopPropagation()}>
              {row.original.orderNo}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      { id: 'reportNo', header: t('cc_production.lab.reportNo', 'Report no.'), accessorKey: 'reportNo', cell: ({ row }) => <span className="font-mono text-xs">{row.original.reportNo ?? '—'}</span> },
      { id: 'testedBy', header: t('cc_production.lab.testedBy', 'Tested by'), accessorKey: 'testedBy', cell: ({ row }) => row.original.testedBy ?? row.original.byName ?? '—' },
    ],
    [t],
  )

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <Page>
      <PageBody>
        <PhoneList
          title={t('cc_production.nav.lab', 'Lab test reports')}
          total={total}
          actions={
            canEnter ? (
              <Button asChild size="sm" className="h-9">
                <Link href="/backend/quality/lab/new">
                  <Plus className="mr-1 h-4 w-4" />
                  {t('cc_production.lab.newShort', 'New test')}
                </Link>
              </Button>
            ) : null
          }
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('cc_production.lab.searchShort', 'Lot, item, customer or report no.')}
          filters={
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {(['', 'pending', 'fail', 'pass'] as const).map((value) => {
                const active = (typeof filters.result === 'string' ? filters.result : '') === value
                return (
                  <button
                    key={value || 'all'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, result: value || undefined }))
                      setPage(1)
                    }}
                    className={cn('h-8 shrink-0 rounded-full border px-3 text-xs font-medium', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground')}
                  >
                    {value === 'pending' ? t('cc_production.lab.pending', 'Pending') : value === 'fail' ? t('cc_production.lab.fail', 'Fail') : value === 'pass' ? t('cc_production.lab.pass', 'Pass') : t('cc_production.lab.all', 'All')}
                  </button>
                )
              })}
            </div>
          }
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          empty={
              <EmptyState
              className="py-12"
              variant="subtle"
              icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />}
              title={t('cc_production.lab.empty', 'No lab tests yet')}
              description={t('cc_production.lab.emptyHint', 'Record a test when raw material comes in or finished goods go out, and attach the lab’s report.')}
            />
          }
          cards={pageRows.map((row) => ({
            key: row.id,
            href: `/backend/quality/lab/${row.id}`,
            overline: `${day(row.testDate)}${row.reportNo ? ` · ${row.reportNo}` : ''}`,
            title: `${row.testType} · ${row.itemTitle ?? (row.testPoint === 'incoming' ? t('cc_production.lab.incoming', 'Raw material in') : t('cc_production.lab.outgoing', 'Finished goods out'))}`,
            badge: <ResultBadge result={row.result} />,
            lines: [row.lotRefs ? <span className="font-mono">{row.lotRefs}</span> : null, row.customerName ? `${row.customerName}${row.orderNo ? ` · ${row.orderNo}` : ''}` : null],
            footer: [
              row.testPoint === 'incoming' ? t('cc_production.lab.incoming', 'Raw material in') : t('cc_production.lab.outgoing', 'Finished goods out'),
              row.standard,
              (row.reports ?? []).length ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Paperclip className="h-3 w-3" aria-hidden="true" />
                  {t('cc_production.lab.attached', 'Report attached')}
                </span>
              ) : (
                <span className="text-status-warning-text">{t('cc_production.lab.notAttached', 'Not attached')}</span>
              ),
            ],
          }))}
        />
        <div className="hidden md:block">
        <DataTable
          perspective={{ tableId: 'cc_production.lab_tests' }}
          title={t('cc_production.nav.lab', 'Lab test reports')}
          columns={columns}
          data={pageRows}
          isLoading={loading}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('cc_production.lab.search', 'Lot, item, customer, order, test or report no.')}
          filters={filterDefs}
          filterValues={filters}
          onFiltersApply={(values) => {
            setFilters(values)
            setPage(1)
          }}
          onFiltersClear={() => {
            setFilters({})
            setPage(1)
          }}
          actions={
            canEnter ? (
              <Button asChild>
                <Link href="/backend/quality/lab/new">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('cc_production.lab.new', 'New lab test')}
                </Link>
              </Button>
            ) : null
          }
          onRowClick={(row) => router.push(`/backend/quality/lab/${row.id}`)}
          rowActions={(row) => (
            <RowActions
              items={[
                { id: 'open', label: t('cc_production.lab.open', 'Open'), href: `/backend/quality/lab/${row.id}` },
                ...((row.reports ?? []).length ? [{ id: 'download', label: t('cc_production.lab.download', 'Download report'), href: `/api/attachments/file/${row.reports![0].id}?download=1` }] : []),
                ...(canEnter ? [{ id: 'edit', label: t('cc_production.lab.edit', 'Edit'), href: `/backend/quality/lab/${row.id}/edit` }] : []),
              ]}
            />
          )}
          emptyState={
            <EmptyState
              className="py-12"
              variant="subtle"
              icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />}
              title={t('cc_production.lab.empty', 'No lab tests yet')}
              description={t('cc_production.lab.emptyHint', 'Record a test when raw material comes in or finished goods go out, and attach the lab’s report.')}
            />
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
        />
        </div>
      </PageBody>
    </Page>
  )
}
