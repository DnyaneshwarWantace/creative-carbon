"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { FileUp, FolderTree, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PRODUCT_KINDS, type ProductKind } from '../lib/kinds'
import { KIND_CONFIG, kindFromSlug } from '../lib/kindConfig'
import { ImportPanel } from './ImportPanel'
import { ExportButton } from './ExportButton'
import { InlineCell } from './InlineCell'
import { withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { downloadCsv, fetchAllPages } from '../lib/csvExport'

type Row = Record<string, unknown> & { id: string }
type CategoryNode = { id: string; name: string; children?: CategoryNode[]; descendantIds?: string[] }
type ProductsResponse = { items?: Row[]; total?: number; totalPages?: number }
type Stock = { onHand: number; reserved: number; available: number }

const PAGE_SIZE = 50

function cell(row: Row, key: string): string {
  const direct = row[key] ?? row[`cf_${key}`]
  const custom = row.customFields && typeof row.customFields === 'object' ? (row.customFields as Row)[key] : undefined
  const value = direct ?? custom
  if (value === undefined || value === null || value === '') return '—'
  return String(value)
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

export function ProductsPage() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const kind: ProductKind = kindFromSlug(searchParams?.get('tab')) ?? 'raw_material'
  const config = KIND_CONFIG[kind]

  const [categoryIds, setCategoryIds] = React.useState<Record<ProductKind, string[]> | null>(null)
  const [rows, setRows] = React.useState<Row[]>([])
  const [stock, setStock] = React.useState<Record<string, Stock>>({})
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)
  const [importOpen, setImportOpen] = React.useState(false)
  const [reloadToken, setReloadToken] = React.useState(0)
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-products-inline' })

  React.useEffect(() => {
    let cancelled = false
    apiCall<{ items?: CategoryNode[] }>('/api/catalog/categories?view=tree', undefined, { fallback: { items: [] } }).then((call) => {
      if (cancelled) return
      const roots = call.result?.items ?? []
      const map = {} as Record<ProductKind, string[]>
      for (const entry of PRODUCT_KINDS) {
        const root = roots.find((node) => node.name === entry.label)
        map[entry.code] = root ? [root.id, ...(root.descendantIds ?? [])] : []
      }
      setCategoryIds(map)
    })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    setPage(1)
    setSearch('')
  }, [kind])

  React.useEffect(() => {
    if (!categoryIds) return
    const ids = categoryIds[kind]
    if (!ids.length) {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      setIsLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        categoryIds: ids.join(','),
        sortField: 'title',
        sortDir: 'asc',
      })
      const term = search.trim()
      const fallback: ProductsResponse = { items: [], total: 0, totalPages: 1 }
      let items: Row[] = []
      if (term) {
        const found = await apiCall<{ items?: Array<{ id: string }> }>(
          `/api/dermat_products/search?kinds=${kind}&q=${encodeURIComponent(term)}&limit=100`,
          undefined,
          { fallback: { items: [] } },
        )
        if (cancelled) return
        const orderedIds = (found.result?.items ?? []).map((item) => item.id)
        if (orderedIds.length) {
          const byIds = new URLSearchParams({ page: '1', pageSize: '100', categoryIds: ids.join(','), ids: orderedIds.join(',') })
          const call = await apiCall<ProductsResponse>(`/api/catalog/products?${byIds.toString()}`, undefined, { fallback })
          if (cancelled) return
          if (!call.ok) {
            flash(t('dermat_products.list.loadError', 'Failed to load products'), 'error')
            setIsLoading(false)
            return
          }
          const rank = new Map(orderedIds.map((id, index) => [id, index]))
          items = [...(call.result?.items ?? [])].sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0))
        }
        setTotal(items.length)
        setTotalPages(1)
      } else {
        const call = await apiCall<ProductsResponse>(`/api/catalog/products?${params.toString()}`, undefined, { fallback })
        if (cancelled) return
        if (!call.ok) {
          flash(t('dermat_products.list.loadError', 'Failed to load products'), 'error')
          setIsLoading(false)
          return
        }
        items = call.result?.items ?? []
        setTotal(call.result?.total ?? items.length)
        setTotalPages(call.result?.totalPages ?? 1)
      }
      setRows(items)
      setIsLoading(false)
      if (items.length) {
        const stockCall = await apiCall<{ items?: Record<string, Stock> }>(
          `/api/dermat_products/stock?productIds=${items.map((item) => item.id).join(',')}`,
          undefined,
          { fallback: { items: {} } },
        )
        if (!cancelled) setStock(stockCall.result?.items ?? {})
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [categoryIds, kind, page, search, reloadToken, t])

  const saveProduct = React.useCallback(
    async (row: Row, key: string, raw: string, numeric: boolean): Promise<boolean> => {
      const trimmed = raw.trim()
      if (key === 'title' && !trimmed) {
        flash(t('dermat_products.inline.nameRequired', 'The name cannot be empty.'), 'error')
        return false
      }
      const value = numeric ? (trimmed === '' ? null : Number(trimmed)) : trimmed || null
      if (numeric && value !== null && !Number.isFinite(value)) {
        flash(t('dermat_products.inline.notNumber', 'Enter a number.'), 'error')
        return false
      }
      const field = key === 'title' ? 'title' : `cf_${key}`
      const body = { id: row.id, [field]: value }
      const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : null
      const call = await runMutation({
        context: { productId: row.id, field },
        mutationPayload: body,
        operation: () => {
          const request = () => apiCall<{ ok?: boolean; error?: string }>('/api/catalog/products', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          return updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(updatedAt), request) : request()
        },
      })
      if (!call.ok) {
        flash(
          call.status === 409 ? t('dermat_products.inline.conflict', 'Someone else changed this product. The list is reloaded.') : (call.result?.error ?? t('dermat_products.inline.error', 'Could not save the change.')),
          'error',
        )
        setReloadToken((token) => token + 1)
        return false
      }
      setRows((prev) => prev.map((entry) => (entry.id === row.id ? { ...entry, [field]: value, updated_at: new Date().toISOString() } : entry)))
      setReloadToken((token) => token + 1)
      return true
    },
    [runMutation, t],
  )

  const editable = React.useCallback(
    (row: Row, key: string, numeric = false, className?: string) => {
      const shown = cell(row, key)
      return (
        <InlineCell
          display={<span className={className}>{shown}</span>}
          value={shown === '—' ? '' : shown}
          kind={numeric ? 'number' : 'text'}
          onSave={(next) => saveProduct(row, key, next, numeric)}
        />
      )
    },
    [saveProduct],
  )

  const columns = React.useMemo<ColumnDef<Row>[]>(() => {
    const base: ColumnDef<Row>[] = [
      { id: 'item_code', header: config.codeLabel, cell: ({ row }) => editable(row.original, 'item_code', false, 'font-mono') },
      {
        id: 'title',
        header: t('dermat_products.list.name', 'Name'),
        cell: ({ row }) => editable(row.original, 'title', false, 'font-medium'),
      },
    ]
    const kindColumns: ColumnDef<Row>[] = config.columns.map((column) => ({
      id: column.key,
      header: column.label,
      cell: ({ row }) => editable(row.original, column.key, Boolean(config.fields.find((field) => field.key === column.key)?.numeric)),
    }))
    const tail: ColumnDef<Row>[] = [
      {
        id: 'stock',
        header: t('dermat_products.list.stock', 'Stock'),
        cell: ({ row }) => {
          const entry = stock[row.original.id]
          const unit = cell(row.original, 'default_unit')
          return `${formatQuantity(entry?.onHand ?? 0)} ${unit === '—' ? '' : unit}`.trim()
        },
      },
      { id: 'sku', header: t('dermat_products.list.sku', 'SKU'), cell: ({ row }) => cell(row.original, 'sku') },
    ]
    return [...base, ...kindColumns, ...tail]
  }, [config, editable, stock, t])

  const createHref = `/backend/products/new/${config.slug}`

  const exportProducts = async () => {
    const ids = categoryIds?.[kind] ?? []
    const items = search.trim()
      ? rows
      : ids.length
        ? await fetchAllPages<Row>(`/api/catalog/products?${new URLSearchParams({ categoryIds: ids.join(','), sortField: 'title', sortDir: 'asc' }).toString()}`)
        : []
    const levels: Record<string, Stock> = {}
    for (let start = 0; start < items.length; start += 100) {
      const chunk = items.slice(start, start + 100).map((item) => item.id)
      const call = await apiCall<{ items?: Record<string, Stock> }>(`/api/dermat_products/stock?productIds=${chunk.join(',')}`, undefined, { fallback: { items: {} } })
      Object.assign(levels, call.result?.items ?? {})
    }
    const value = (row: Row, key: string) => {
      const text = cell(row, key)
      return text === '—' ? '' : text
    }
    downloadCsv(config.title, [
      { header: config.codeLabel, value: (row) => value(row, 'item_code') },
      { header: t('dermat_products.list.name', 'Name'), value: (row) => value(row, 'title') },
      ...config.fields.map((field) => ({ header: field.label, value: (row: Row) => value(row, field.key) })),
      { header: t('dermat_products.export.unit', 'Unit'), value: (row) => value(row, 'default_unit') },
      { header: t('dermat_products.export.onHand', 'On hand'), value: (row) => levels[row.id]?.onHand ?? 0 },
      { header: t('dermat_products.export.reserved', 'Reserved'), value: (row) => levels[row.id]?.reserved ?? 0 },
      { header: t('dermat_products.export.available', 'Available'), value: (row) => levels[row.id]?.available ?? 0 },
      { header: t('dermat_products.list.sku', 'SKU'), value: (row) => value(row, 'sku') },
    ], items)
  }

  return (
    <Page>
      <PageBody>
        <div className="mb-4">
          <Tabs value={config.slug} onValueChange={(slug) => router.replace(`/backend/products?tab=${slug}`)} variant="underline">
            <TabsList aria-label={t('dermat_products.list.tabs', 'Product types')}>
              {PRODUCT_KINDS.map((entry) => (
                <TabsTrigger key={entry.code} value={KIND_CONFIG[entry.code].slug}>
                  {KIND_CONFIG[entry.code].title}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <DataTable
          title={config.title}
          columns={columns}
          data={rows}
          onRowClick={(row) => router.push(`/backend/products/${row.id}`)}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('dermat_products.list.search', 'Search by {label} or name (e.g. AP 293)', { label: config.codeLabel })}
          actions={
            <div className="flex flex-wrap gap-2">
              <ExportButton onExport={exportProducts} />
              <Button asChild variant="outline">
                <Link href="/backend/catalog/categories">
                  <FolderTree className="mr-2 h-4 w-4" />
                  {t('dermat_products.list.categories', 'Manage categories')}
                </Link>
              </Button>
              <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp className="mr-2 h-4 w-4" />
                {t('dermat_products.list.import', 'Import')}
              </Button>
              <Button asChild>
                <Link href={createHref}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('dermat_products.list.add', 'Add {kind}', { kind: config.singular })}
                </Link>
              </Button>
            </div>
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
        <ImportPanel open={importOpen} onOpenChange={setImportOpen} kind={kind} onImported={() => setReloadToken((value) => value + 1)} />
      </PageBody>
    </Page>
  )
}

export default ProductsPage
