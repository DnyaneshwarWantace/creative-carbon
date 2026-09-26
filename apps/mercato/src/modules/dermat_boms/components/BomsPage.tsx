"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { BomKind } from '../lib/bomKinds'
import { STATUS_VARIANT } from './BomEditor'
import { formatQty } from './MaterialPicker'
import type { BomListItem } from './types'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv, fetchAllPages } from '../../dermat_products/lib/csvExport'

type ListResponse = { items?: BomListItem[]; total?: number; totalPages?: number }

const PAGE_SIZE = 50

export function BomsPage() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const kind: BomKind = searchParams?.get('tab') === 'pack' ? 'pack' : 'formula'
  const [rows, setRows] = React.useState<BomListItem[]>([])
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    setPage(1)
    setSearch('')
  }, [kind])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const params = new URLSearchParams({ kind, page: String(page), pageSize: String(PAGE_SIZE) })
    if (search.trim()) params.set('search', search.trim())
    apiCall<ListResponse>(`/api/dermat_boms/boms?${params.toString()}`, undefined, { fallback: { items: [] } }).then((call) => {
      if (cancelled) return
      if (!call.ok) flash(t('dermat_boms.list.loadError', 'Failed to load BOMs'), 'error')
      setRows(call.result?.items ?? [])
      setTotal(call.result?.total ?? 0)
      setTotalPages(call.result?.totalPages ?? 1)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [kind, page, search, t])

  const columns = React.useMemo<ColumnDef<BomListItem>[]>(() => {
    const base: ColumnDef<BomListItem>[] = [
      {
        id: 'product',
        header: t('dermat_boms.list.product', 'Product'),
        cell: ({ row }) => (
          <span>
            <span className="font-medium">{row.original.productName}</span>
            <span className="block font-mono text-xs text-muted-foreground">{row.original.productCode ?? ''}</span>
          </span>
        ),
      },
      {
        id: 'version',
        header: t('dermat_boms.list.version', 'Version'),
        cell: ({ row }) => (row.original.orderNo ? `v${row.original.version} · ${t('dermat_boms.list.forOrder', 'only {order}', { order: row.original.orderNo })}` : `v${row.original.version}`),
      },
      {
        id: 'status',
        header: t('dermat_boms.list.status', 'Status'),
        cell: ({ row }) => (
          <StatusBadge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'} dot>
            {t(`dermat_boms.status.${row.original.status}`, row.original.status)}
          </StatusBadge>
        ),
      },
      { id: 'lines', header: t('dermat_boms.list.lines', 'Lines'), cell: ({ row }) => row.original.lineCount },
    ]
    const percent: ColumnDef<BomListItem>[] =
      kind === 'formula'
        ? [
            {
              id: 'total',
              header: t('dermat_boms.list.total', 'Total %'),
              cell: ({ row }) => {
                const value = row.original.totalPercent ?? 0
                return (
                  <span className={cn('font-mono', Math.abs(value - 100) > 0.001 && 'text-status-error-text')}>{formatQty(value, 4)} %</span>
                )
              },
            },
          ]
        : []
    const tail: ColumnDef<BomListItem>[] = [
      {
        id: 'batch',
        header: t('dermat_boms.list.batch', 'Batch'),
        cell: ({ row }) => `${formatQty(row.original.batchSize)} ${row.original.batchUnit}`,
      },
      {
        id: 'updated',
        header: t('dermat_boms.list.updated', 'Updated'),
        cell: ({ row }) => (
          <span className="text-xs">
            {new Date(row.original.updatedAt).toLocaleDateString('en-IN')}
            <span className="block text-muted-foreground">{row.original.approvedByName ?? row.original.createdByName ?? ''}</span>
          </span>
        ),
      },
    ]
    return [...base, ...percent, ...tail]
  }, [kind, t])

  const exportBoms = async () => {
    const params = new URLSearchParams({ kind })
    if (search.trim()) params.set('search', search.trim())
    const items = await fetchAllPages<BomListItem>(`/api/dermat_boms/boms?${params.toString()}`)
    downloadCsv(kind === 'formula' ? 'formulas' : 'pack-boms', [
      { header: 'BOM', value: (row) => row.code },
      { header: 'Product ID', value: (row) => row.productCode ?? '' },
      { header: 'Product', value: (row) => row.productName },
      { header: 'Only for order', value: (row) => row.orderNo ?? '' },
      { header: 'Version', value: (row) => row.version },
      { header: 'Status', value: (row) => row.status },
      { header: 'Batch size', value: (row) => row.batchSize },
      { header: 'Batch unit', value: (row) => row.batchUnit },
      { header: 'Lines', value: (row) => row.lineCount },
      { header: 'Total %', value: (row) => row.totalPercent ?? '' },
      { header: 'Created by', value: (row) => row.createdByName ?? '' },
      { header: 'Approved by', value: (row) => row.approvedByName ?? '' },
      { header: 'Last changed', value: (row) => row.updatedAt.slice(0, 10) },
    ], items)
  }

  return (
    <Page>
      <PageBody>
        <div className="mb-4">
          <Tabs value={kind} onValueChange={(value) => router.replace(`/backend/boms?tab=${value}`)} variant="underline">
            <TabsList aria-label={t('dermat_boms.list.tabs', 'BOM types')}>
              <TabsTrigger value="formula">{t('dermat_boms.list.formulas', 'Formulas (Bulk & R&D)')}</TabsTrigger>
              <TabsTrigger value="pack">{t('dermat_boms.list.packs', 'Pack BOMs (Finished Goods)')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <DataTable
          title={kind === 'formula' ? t('dermat_boms.list.formulaTitle', 'Formulas') : t('dermat_boms.list.packTitle', 'Pack BOMs')}
          columns={columns}
          data={rows}
          onRowClick={(row) => router.push(`/backend/boms/${row.id}`)}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('dermat_boms.list.search', 'Search by product name or internal ID')}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ExportButton onExport={exportBoms} />
              <Button asChild>
                <Link href="/backend/boms/new">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('dermat_boms.list.new', 'New BOM')}
                </Link>
              </Button>
            </div>
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
      </PageBody>
    </Page>
  )
}

export default BomsPage
