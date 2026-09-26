"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { CHECK_VARIANT, OPERATION_LABEL, PART_LABEL, PART_VARIANT, when } from './shared'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv, fetchAllPages } from '../../dermat_products/lib/csvExport'

type Row = {
  id: string
  code: string
  operation: string
  productTitle: string
  productCode: string | null
  orderNo: string | null
  batchNo: string | null
  status: string
  chemicalStatus: string
  microStatus: string
  chemicalBy: string | null
  microBy: string | null
  createdAt: string
}

type Tab = 'pending' | 'failed' | 'passed' | 'all'
const PAGE_SIZE = 50

export function QcChecksPage() {
  const t = useT()
  const router = useRouter()
  const [tab, setTab] = React.useState<Tab>('pending')
  const [operation, setOperation] = React.useState('all')
  const [rows, setRows] = React.useState<Row[]>([])
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => setPage(1), [tab, operation])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (tab !== 'all') params.set('status', tab)
    if (operation !== 'all') params.set('operation', operation)
    if (search.trim()) params.set('search', search.trim())
    apiCall<{ items?: Row[]; total?: number; totalPages?: number }>(`/api/dermat_quality/checks?${params.toString()}`, undefined, { fallback: { items: [] } }).then((call) => {
      if (cancelled) return
      if (!call.ok) flash(t('dermat_quality.errors.list', 'Failed to load QC checks'), 'error')
      setRows(call.result?.items ?? [])
      setTotal(call.result?.total ?? 0)
      setTotalPages(call.result?.totalPages ?? 1)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tab, operation, page, search, t])

  const columns = React.useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'code',
        header: t('dermat_quality.list.check', 'QC check'),
        cell: ({ row }) => (
          <span>
            <span className="font-mono text-xs font-semibold">{row.original.code}</span>
            <span className="block text-xs text-muted-foreground">{when(row.original.createdAt)}</span>
          </span>
        ),
      },
      {
        id: 'product',
        header: t('dermat_quality.list.product', 'Product'),
        cell: ({ row }) => (
          <span>
            {row.original.productCode ? <span className="mr-1 font-mono text-xs text-muted-foreground">{row.original.productCode}</span> : null}
            {row.original.productTitle}
          </span>
        ),
      },
      { id: 'operation', header: t('dermat_quality.list.operation', 'What is tested'), cell: ({ row }) => <span className="text-xs">{OPERATION_LABEL[row.original.operation]}</span> },
      {
        id: 'order',
        header: t('dermat_quality.list.order', 'Order / batch'),
        cell: ({ row }) => (
          <span className="text-xs">
            <span className="font-mono">{row.original.orderNo ?? '—'}</span>
            {row.original.batchNo ? <span className="block text-muted-foreground">Batch {row.original.batchNo}</span> : null}
          </span>
        ),
      },
      {
        id: 'chemical',
        header: t('dermat_quality.chemical', 'Chemical'),
        cell: ({ row }) => <StatusBadge variant={PART_VARIANT[row.original.chemicalStatus] ?? 'neutral'}>{PART_LABEL[row.original.chemicalStatus]}</StatusBadge>,
      },
      {
        id: 'micro',
        header: t('dermat_quality.micro', 'Micro'),
        cell: ({ row }) => <StatusBadge variant={PART_VARIANT[row.original.microStatus] ?? 'neutral'}>{PART_LABEL[row.original.microStatus]}</StatusBadge>,
      },
      {
        id: 'status',
        header: t('dermat_quality.list.result', 'Result'),
        cell: ({ row }) => (
          <StatusBadge variant={CHECK_VARIANT[row.original.status] ?? 'neutral'} dot>
            {t(`dermat_quality.status.${row.original.status}`, row.original.status)}
          </StatusBadge>
        ),
      },
    ],
    [t],
  )

  const exportChecks = async () => {
    const params = new URLSearchParams()
    if (tab !== 'all') params.set('status', tab)
    if (operation !== 'all') params.set('operation', operation)
    if (search.trim()) params.set('search', search.trim())
    const items = await fetchAllPages<Row>(`/api/dermat_quality/checks?${params.toString()}`)
    downloadCsv(`qc-checks-${tab}`, [
      { header: 'QC no.', value: (row) => row.code },
      { header: 'Stage', value: (row) => OPERATION_LABEL[row.operation] ?? row.operation },
      { header: 'Product ID', value: (row) => row.productCode ?? '' },
      { header: 'Product', value: (row) => row.productTitle },
      { header: 'Order', value: (row) => row.orderNo ?? '' },
      { header: 'Batch', value: (row) => row.batchNo ?? '' },
      { header: 'Result', value: (row) => row.status },
      { header: 'Chemical', value: (row) => PART_LABEL[row.chemicalStatus] ?? row.chemicalStatus },
      { header: 'Chemical by', value: (row) => row.chemicalBy ?? '' },
      { header: 'Micro', value: (row) => PART_LABEL[row.microStatus] ?? row.microStatus },
      { header: 'Micro by', value: (row) => row.microBy ?? '' },
      { header: 'Created', value: (row) => row.createdAt.slice(0, 10) },
    ], items)
  }

  return (
    <Page>
      <PageBody>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} variant="underline">
            <TabsList aria-label={t('dermat_quality.list.tabs', 'QC status')}>
              <TabsTrigger value="pending">{t('dermat_quality.list.pending', 'To test')}</TabsTrigger>
              <TabsTrigger value="failed">{t('dermat_quality.list.failed', 'Failed')}</TabsTrigger>
              <TabsTrigger value="passed">{t('dermat_quality.list.passed', 'Passed')}</TabsTrigger>
              <TabsTrigger value="all">{t('dermat_quality.list.all', 'All')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="w-64">
            <Select value={operation} onValueChange={setOperation}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dermat_quality.list.anyOperation', 'Everything tested')}</SelectItem>
                {Object.entries(OPERATION_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DataTable
          perspective={{ tableId: 'dermat_quality.checks' }}
          title={t('dermat_quality.list.title', 'QC checks')}
          columns={columns}
          data={rows}
          onRowClick={(row) => router.push(`/backend/qc/checks/${row.id}`)}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('dermat_quality.list.search', 'Search QC no., order no., batch or product')}
          actions={<ExportButton onExport={exportChecks} />}
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
      </PageBody>
    </Page>
  )
}

export default QcChecksPage
