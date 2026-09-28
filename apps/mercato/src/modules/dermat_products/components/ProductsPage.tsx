"use client"

import * as React from 'react'
import { useGranted } from '../../dermat_departments/components/useGranted'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { FileUp, Plus } from 'lucide-react'
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
import { EditField } from './EditField'
import { EditTableBar } from './EditTableBar'
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
  const granted = useGranted()
  const canManage = !granted.ready || granted.has('catalog.products.manage')
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

  const [editing, setEditing] = React.useState(false)
  const [drafts, setDrafts] = React.useState<Record<string, { row: Row; key: string; numeric: boolean; value: string }>>({})
  const [savingAll, setSavingAll] = React.useState(false)

  const saveAll = async () => {
    const byRow = new Map<string, Array<{ row: Row; key: string; numeric: boolean; value: string }>>()
    for (const draft of Object.values(drafts)) byRow.set(draft.row.id, [...(byRow.get(draft.row.id) ?? []), draft])
    for (const list of byRow.values()) {
      for (const draft of list) {
        if (draft.key === 'title' && !draft.value.trim()) {
          flash(t('dermat_products.inline.nameRequired', 'The name cannot be empty.'), 'error')
          return
        }
        if (draft.numeric && draft.value.trim() && !Number.isFinite(Number(draft.value))) {
          flash(t('dermat_products.inline.notNumber', 'Enter a number.'), 'error')
          return
        }
      }
    }
    setSavingAll(true)
    const failed: typeof drafts = {}
    const errors: string[] = []
    let saved = 0
    for (const [rowId, list] of byRow.entries()) {
      const row = list[0].row
      const body: Record<string, unknown> = { id: rowId }
      for (const draft of list) {
        const trimmed = draft.value.trim()
        body[draft.key === 'title' ? 'title' : `cf_${draft.key}`] = draft.numeric ? (trimmed === '' ? null : Number(trimmed)) : trimmed || null
      }
      const updatedAt = typeof row.updated_at === 'string' ? row.updated_at : null
      const call = await runMutation({
        context: { productId: rowId },
        mutationPayload: body,
        operation: () => {
          const request = () => apiCall<{ ok?: boolean; error?: string }>('/api/catalog/products', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          return updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(updatedAt), request) : request()
        },
      })
      if (call.ok) {
        saved += list.length
        setRows((prev) => prev.map((entry) => (entry.id === rowId ? { ...entry, ...body, id: rowId } : entry)))
      } else {
        list.forEach((draft) => {
          failed[`${rowId}|${draft.key}`] = draft
        })
        errors.push(`${cell(row, 'title')}: ${call.status === 409 ? t('dermat_products.inline.conflict', 'someone else changed it') : (call.result?.error ?? t('dermat_products.inline.error', 'could not save'))}`)
      }
    }
    setSavingAll(false)
    setDrafts(failed)
    if (errors.length) flash(`${t('dermat_products.inline.savedSome', '{saved} saved, {failed} not saved.', { saved, failed: Object.keys(failed).length })} ${errors.slice(0, 3).join(' · ')}`, 'error')
    else {
      flash(t('dermat_products.inline.savedAll', '{count} changes saved', { count: saved }), 'success')
      setEditing(false)
    }
    setReloadToken((token) => token + 1)
  }

  const editable = React.useCallback(
    (row: Row, key: string, numeric = false, className?: string) => {
      const shown = cell(row, key)
      if (!editing) return <span className={className}>{shown}</span>
      const original = shown === '—' ? '' : shown
      const draftKey = `${row.id}|${key}`
      const draft = drafts[draftKey]
      return (
        <span onClick={(event) => event.stopPropagation()}>
          <EditField
            kind={numeric ? 'number' : 'text'}
            value={draft ? draft.value : original}
            dirty={Boolean(draft)}
            onChange={(value) =>
              setDrafts((prev) => {
                const next = { ...prev }
                if (value === original) delete next[draftKey]
                else next[draftKey] = { row, key, numeric, value }
                return next
              })
            }
          />
        </span>
      )
    },
    [drafts, editing],
  )

  const columns = React.useMemo<ColumnDef<Row>[]>(() => {
    const base: ColumnDef<Row>[] = [
      {
        id: 'title',
        header: `${config.codeLabel} · ${t('dermat_products.list.name', 'Name')}`,
        size: 320,
        cell: ({ row }) =>
          editing ? (
            <span className="flex min-w-72 flex-col gap-1">
              {editable(row.original, 'item_code', false, 'font-mono')}
              {editable(row.original, 'title', false, 'font-medium')}
            </span>
          ) : (
            <span className="flex min-w-60 max-w-sm flex-col">
              <span className="font-mono text-xs text-muted-foreground">{cell(row.original, 'item_code')}</span>
              <span className="truncate font-medium" title={cell(row.original, 'title')}>
                {cell(row.original, 'title')}
              </span>
            </span>
          ),
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
    ]
    return [...base, ...kindColumns, ...tail]
  }, [config, editable, editing, stock, t])

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
          key={`products-${kind}`}
          perspective={{ tableId: `dermat_products.${kind}` }}
          title={config.title}
          columns={columns}
          data={rows}
          stickyFirstColumn
          onRowClick={(row) => (editing ? undefined : router.push(`/backend/products/${row.id}`))}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('dermat_products.list.search', 'Search by {label} or name (e.g. AP 293)', { label: config.codeLabel })}
          actions={
            <div className="flex flex-wrap gap-2">
              {canManage ? <EditTableBar editing={editing} dirtyCount={Object.keys(drafts).length} saving={savingAll} onEdit={() => setEditing(true)} onCancel={() => { setDrafts({}); setEditing(false) }} onSave={() => void saveAll()} /> : null}
              <ExportButton onExport={exportProducts} />
              {canManage ? (
              <>
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
              </>
              ) : null}
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
