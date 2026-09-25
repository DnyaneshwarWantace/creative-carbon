"use client"

import * as React from 'react'
import { extensionPoints } from '@open-mercato/core/modules/catalog/extension-points'
import Link from 'next/link'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import type { SortingState } from '@tanstack/react-table'
import { DataTable, type DataTableExportFormat } from '@open-mercato/ui/backend/DataTable'
import { ListEmptyState } from '@open-mercato/ui/backend/filters/ListEmptyState'
import { Button } from '@open-mercato/ui/primitives/button'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { apiCall, readApiResultOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { deleteCrud, buildCrudExportUrl } from '@open-mercato/ui/backend/utils/crud'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import {
  fetchCustomFieldDefinitionsPayload,
  useCustomFieldDefs,
  type CustomFieldDefDto,
  type CustomFieldsetDto,
} from '@open-mercato/ui/backend/utils/customFieldDefs'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Tag } from '@open-mercato/ui/primitives/tag'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterBar'
import type { FilterOption } from '@open-mercato/ui/backend/FilterOverlay'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { useAppEvent } from '@open-mercato/ui/backend/injection/useAppEvent'
import { E } from '#generated/entities.ids.generated'
import { productListFields } from './productCategoryFields'

export type ProductRow = {
  id: string
  title: string
  description?: string | null
  sku?: string | null
  default_media_id?: string | null
  default_media_url?: string | null
  is_active?: boolean
  metadata?: Record<string, unknown> | null
  custom_fieldset_code?: string | null
  created_at?: string
  updated_at?: string
  variants?: Array<Record<string, any>>
  variant_count?: number
} & Record<string, unknown>

type ProductsResponse = {
  items?: ProductRow[]
  total?: number
  totalPages?: number
}

const PAGE_SIZE = 25
const ENTITY_ID = E.catalog.catalog_product

function formatDate(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString()
}

export type ProductsDataTableSnapshot = {
  search: string
  filterValues: FilterValues
  total: number
}

export type ProductsDataTableProps = {
  extraActions?: React.ReactNode
  onSnapshotChange?: (snapshot: ProductsDataTableSnapshot) => void
  /**
   * Locks the list to a single `cf_product_category_group` value — the clean
   * enum (`raw_material` / `packing_material` / `finished_goods` / `bulk`)
   * that drives the Dermat category pages and the fieldset-follows-category
   * mechanism. Distinct from `cf_category`, which stays a free-text/rich
   * classification label. When set:
   *  - `cf_product_category_group` is force-merged into the query params on
   *    every request — it wins over any value in `filterValues`, so the
   *    fixed scope can never be widened from the filter UI.
   *  - The "Create" button/empty-state link default to `?category=<value>`
   *    so the create form pre-selects this page's category.
   * All four category views (and the unfiltered All Products page) still
   * read/write the exact same `catalog_product` table/API — this prop only
   * narrows what the list shows and what the create link pre-fills.
   */
  fixedCategoryFilter?: string
  /** Overrides the default create-product href; defaults to
   * `/backend/catalog/products/create`, optionally suffixed with
   * `?category=<fixedCategoryFilter>` when that prop is set. */
  createHref?: string
  /** Overrides the DataTable's perspective/extension tableId + injection spot
   * so each fixed-category view gets its own saved-column/perspective scope
   * instead of colliding with the All Products table. Defaults to the shared
   * catalog products table id. */
  tableId?: string
}

export default function ProductsDataTable({
  extraActions,
  onSnapshotChange,
  fixedCategoryFilter,
  createHref,
  tableId,
}: ProductsDataTableProps = {}) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const scopeVersion = useOrganizationScopeVersion()
  const [rows, setRows] = React.useState<ProductRow[]>([])
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [cacheStatus, setCacheStatus] = React.useState<'hit' | 'miss' | null>(null)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'title', desc: false }])
  const [search, setSearch] = React.useState('')
  const [filterValues, setFilterValues] = React.useState<FilterValues>({})
  const [isLoading, setIsLoading] = React.useState(false)
  const [reloadToken, setReloadToken] = React.useState(0)
  // Step 5.18 (spec §10 line 836, D18 demo): refresh the list when a
  // catalog.product.* event arrives via the DOM event bridge. Confirmed
  // AI bulk mutations (one `ai.action.confirmed` + one
  // `catalog.product.updated` per record) and direct API writes both
  // surface here so the table reflects the new state without a manual
  // reload.
  useAppEvent('catalog.product.*', () => {
    setReloadToken((token) => token + 1)
  })
  const [customFieldsetFilter, setCustomFieldsetFilter] = React.useState<string | null>(null)
  const { data: customFieldDefs = [] } = useCustomFieldDefs(ENTITY_ID, {
    keyExtras: [scopeVersion, reloadToken],
  })
  const [activeCategory, setActiveCategory] = React.useState<string | null>(
    typeof fixedCategoryFilter === 'string' && fixedCategoryFilter.trim().length ? fixedCategoryFilter.trim() : null,
  )
  const [categories, setCategories] = React.useState<CustomFieldsetDto[]>([])
  React.useEffect(() => {
    let cancelled = false
    void fetchCustomFieldDefinitionsPayload([ENTITY_ID])
      .then((payload) => {
        if (!cancelled) setCategories(payload.fieldsetsByEntity?.[ENTITY_ID] ?? [])
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [scopeVersion, reloadToken])
  const categoryLabels = React.useMemo(
    () => new Map(categories.map((category) => [category.code, category.label ?? category.code])),
    [categories],
  )
  const [categoryOptionsCache, setCategoryOptionsCache] = React.useState<Record<string, FilterOption>>({})

  const registerOptions = React.useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<Record<string, FilterOption>>>,
      options: FilterOption[]
    ) => {
      setter((prev) => {
        const next = { ...prev }
        options.forEach((opt) => {
          if (opt.value) next[opt.value] = opt
        })
        return next
      })
    },
    []
  )

  const registerCategoryOptions = React.useCallback(
    (options: FilterOption[]) => registerOptions(setCategoryOptionsCache, options),
    [registerOptions]
  )

  const categoryOptions = React.useMemo(() => Object.values(categoryOptionsCache), [categoryOptionsCache])

  const loadCategoryOptions = React.useCallback(
    async (term?: string): Promise<FilterOption[]> => {
      try {
        const params = new URLSearchParams({ pageSize: '200', view: 'manage' })
        if (term && term.trim().length) params.set('search', term.trim())
        const payload = await readApiResultOrThrow<{ items?: Array<{ id?: string; name?: string; parentName?: string | null }> }>(
          `/api/catalog/categories?${params.toString()}`,
          undefined,
          { errorMessage: t('catalog.products.filters.categoriesLoadError', 'Failed to load categories') },
        )
        const items = Array.isArray(payload?.items) ? payload.items : []
        const options = items
          .map((entry) => {
            const value = typeof entry.id === 'string' ? entry.id : null
            if (!value) return null
            const label = typeof entry.name === 'string' && entry.name.trim().length ? entry.name : value
            const description =
              typeof entry.parentName === 'string' && entry.parentName.trim().length ? entry.parentName : null
            return { value, label, description }
          })
          .filter((option) => !!option) as FilterOption[]
        registerCategoryOptions(options)
        return options
      } catch {
        return []
      }
    },
    [registerCategoryOptions, t],
  )

  const filters = React.useMemo<FilterDef[]>(() => [
    { id: 'isActive', label: t('catalog.products.filters.active'), type: 'checkbox' },
  ], [
    categoryOptions,
    categoryOptionsCache,
    loadCategoryOptions,
    t,
  ])

  const columns = React.useMemo<ColumnDef<ProductRow>[]>(() => {
    const noValue = <span className="text-xs text-muted-foreground">—</span>
    const renderValue = (def: CustomFieldDefDto, raw: unknown) => {
      if (raw === null || raw === undefined || raw === '') return noValue
      if (Array.isArray(raw)) return raw.length ? <span className="text-sm">{raw.map(String).join(', ')}</span> : noValue
      if (typeof raw === 'boolean') {
        return <span className="text-sm">{raw ? t('catalog.products.table.yes', 'Yes') : t('catalog.products.table.no', 'No')}</span>
      }
      const option = (def.options ?? []).find((entry) => String(entry.value) === String(raw))
      return <span className="text-sm">{option?.label ?? String(raw)}</span>
    }
    const categoryOf = (row: ProductRow): string | null => {
      const code = row.custom_fieldset_code ?? (typeof row.cf_product_category_group === 'string' ? row.cf_product_category_group : null)
      return typeof code === 'string' && code.length ? code : null
    }
    const base: ColumnDef<ProductRow>[] = [
      {
        accessorKey: 'title',
        header: t('catalog.products.table.title', 'Product name'),
        meta: { sticky: true, maxWidth: '320px' },
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col py-1">
            <span className="truncate font-medium">{row.original.title || '—'}</span>
            {row.original.sku ? <span className="font-mono text-xs text-muted-foreground">{row.original.sku}</span> : null}
          </div>
        ),
      },
    ]
    if (!activeCategory) {
      base.push({
        id: 'category',
        header: t('catalog.products.table.category', 'Category'),
        cell: ({ row }) => {
          const code = categoryOf(row.original)
          return code ? <Tag variant="neutral">{categoryLabels.get(code) ?? code}</Tag> : noValue
        },
      })
    }
    const fieldColumns = productListFields(customFieldDefs, activeCategory).map<ColumnDef<ProductRow>>((def) => ({
      accessorKey: `cf_${def.key}`,
      header: def.label || def.key,
      meta: { maxWidth: '220px', truncate: true },
      cell: ({ row }) => renderValue(def, row.original[`cf_${def.key}`]),
    }))
    const trailing: ColumnDef<ProductRow>[] = [
      {
        accessorKey: 'is_active',
        header: t('catalog.products.table.active'),
        cell: ({ row }) => <BooleanIcon value={!!row.original.is_active} />,
      },
    ]
    return [...base, ...fieldColumns, ...trailing]
  }, [activeCategory, categoryLabels, customFieldDefs, t])

  const handleSearchChange = React.useCallback((value: string) => {
    setSearch(value)
    setPage(1)
  }, [])

  const handleFiltersApply = React.useCallback((values: FilterValues) => {
    setFilterValues(values)
    setPage(1)
  }, [])

  const handleFiltersClear = React.useCallback(() => {
    setFilterValues({})
    setPage(1)
  }, [])

  const handleCustomFieldsetFilterChange = React.useCallback(
    (value: string | null) => {
      if (value === customFieldsetFilter) return
      setCustomFieldsetFilter(value)
      setFilterValues((prev) => {
        const entries = Object.entries(prev)
        if (!entries.some(([key]) => key.startsWith('cf_'))) return prev
        const next: FilterValues = {}
        entries.forEach(([key, val]) => {
          if (!key.startsWith('cf_')) next[key] = val
        })
        return next
      })
      setPage(1)
    },
    [customFieldsetFilter],
  )

  const handleRefresh = React.useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  const queryParams = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', String(PAGE_SIZE))
    if (search.trim()) params.set('search', search.trim())
    const sort = sorting[0]
    if (sort?.id) {
      params.set('sortField', sort.id)
      params.set('sortDir', sort.desc ? 'desc' : 'asc')
    }
    if (filterValues.isActive === true) params.set('isActive', 'true')
    if (filterValues.isActive === false) params.set('isActive', 'false')
    Object.entries(filterValues).forEach(([key, value]) => {
      if (!key.startsWith('cf_') || value == null) return
      if (Array.isArray(value)) {
        const entries = value
          .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry || '').trim()))
          .filter((entry) => entry.length > 0)
        if (entries.length) params.set(key, entries.join(','))
      } else if (typeof value === 'object' && value !== null && ('from' in (value as Record<string, unknown>) || 'to' in (value as Record<string, unknown>))) {
        const range = value as { from?: string; to?: string }
        if (typeof range.from === 'string' && range.from.trim().length) {
          params.set(`${key}:from`, range.from.trim())
        }
        if (typeof range.to === 'string' && range.to.trim().length) {
          params.set(`${key}:to`, range.to.trim())
        }
      } else if (typeof value === 'string' && value.trim()) {
        params.set(key, value.trim())
      }
    })
    if (typeof customFieldsetFilter === 'string' && customFieldsetFilter.trim().length > 0) {
      params.set('customFieldset', customFieldsetFilter.trim())
    }
    if (activeCategory) params.set('cf_product_category_group', activeCategory)
    return params.toString()
  }, [activeCategory, customFieldsetFilter, filterValues, page, search, sorting])

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setCacheStatus(null)
      try {
        const fallback: ProductsResponse = { items: [], total: 0, totalPages: 1 }
        const call = await apiCall<ProductsResponse>(
          `/api/catalog/products?${queryParams}`,
          undefined,
          { fallback },
        )
        if (!call.ok) {
          const message = t('catalog.products.list.error.load', 'Failed to load products')
          flash(message, 'error')
          if (!cancelled) setCacheStatus(null)
          return
        }
        const payload = call.result ?? fallback
        if (cancelled) return
        setCacheStatus(call.cacheStatus ?? null)
        const items = Array.isArray(payload.items) ? payload.items : []
        const normalized = items.filter((item): item is ProductRow => typeof item?.id === 'string')
        setRows(normalized)
        setTotal(typeof payload.total === 'number' ? payload.total : normalized.length)
        setTotalPages(typeof payload.totalPages === 'number' ? payload.totalPages : 1)
      } catch (error) {
        if (!cancelled) {
          setCacheStatus(null)
          const message =
            error instanceof Error
              ? error.message
              : t('catalog.products.list.error.load', 'Failed to load products')
          flash(message, 'error')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [queryParams, reloadToken, scopeVersion, t])

  const handleDelete = React.useCallback(async (row: ProductRow) => {
    const confirmed = await confirm({
      title: t('catalog.products.list.deleteConfirm', 'Delete this product?'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      const headers = buildOptimisticLockHeader(typeof row.updated_at === 'string' ? row.updated_at : null)
      await withScopedApiRequestHeaders(headers, () => (
        deleteCrud('catalog/products', row.id, {
          errorMessage: t('catalog.products.list.error.delete', 'Failed to delete product'),
        })
      ))
      flash(t('catalog.products.flash.deleted', 'Product deleted'), 'success')
      setReloadToken((token) => token + 1)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t('catalog.products.list.error.delete', 'Failed to delete product')
      flash(message, 'error')
    }
  }, [confirm, t])

  React.useEffect(() => {
    if (!onSnapshotChange) return
    onSnapshotChange({ search, filterValues, total })
  }, [onSnapshotChange, search, filterValues, total])

  const currentParams = React.useMemo(() => Object.fromEntries(new URLSearchParams(queryParams)), [queryParams])

  const exportConfig = React.useMemo(() => ({
    view: {
      getUrl: (format: DataTableExportFormat) =>
        buildCrudExportUrl('catalog/products', { ...currentParams, exportScope: 'view' }, format),
    },
    full: {
      getUrl: (format: DataTableExportFormat) =>
        buildCrudExportUrl('catalog/products', { ...currentParams, exportScope: 'full', all: 'true' }, format),
    },
  }), [currentParams])

  const resolvedCreateHref = React.useMemo(() => {
    if (createHref) return createHref
    const base = '/backend/catalog/products/create'
    return activeCategory ? `${base}?category=${encodeURIComponent(activeCategory)}` : base
  }, [activeCategory, createHref])

  const resolvedTableId = tableId ?? extensionPoints.hosts.productsTable.tableId
  const resolvedInjectionSpotId = tableId
    ? `data-table:${tableId}`
    : extensionPoints.hosts.productsTable.baseSpotId

  const showCategoryTabs = !fixedCategoryFilter && categories.length > 0

  return (
    <>
      {showCategoryTabs ? (
        <SegmentedControl
          className="mb-4"
          value={activeCategory ?? 'all'}
          onValueChange={(value) => {
            setActiveCategory(value === 'all' ? null : value)
            setPage(1)
          }}
          aria-label={t('catalog.products.tabs.label', 'Product category')}
        >
          <SegmentedControlItem value="all">{t('catalog.products.tabs.all', 'All')}</SegmentedControlItem>
          {categories.map((category) => (
            <SegmentedControlItem key={category.code} value={category.code}>
              {category.label ?? category.code}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      ) : null}
      <DataTable<ProductRow>
        title={t('catalog.products.page.title', 'Products')}
        entityId={ENTITY_ID}
        customFieldFilterKeyExtras={[scopeVersion, reloadToken]}
        refreshButton={{
          label: t('catalog.products.actions.refresh', 'Refresh'),
          onRefresh: handleRefresh,
          isRefreshing: isLoading,
        }}
        actions={(
          <div className="flex items-center gap-2">
            {extraActions}
            <Button asChild>
              <Link href={resolvedCreateHref}>
                {t('catalog.products.actions.addProduct', 'Add product')}
              </Link>
            </Button>
          </div>
        )}
        columns={columns}
        data={rows}
        emptyState={(
          <ListEmptyState
            entityName={t('catalog.products.page.title', 'Products')}
            createHref={resolvedCreateHref}
            createLabel={t('catalog.products.actions.create', 'Create')}
          />
        )}
        searchValue={search}
        onSearchChange={handleSearchChange}
        filters={filters}
        filterValues={filterValues}
        onFiltersApply={handleFiltersApply}
        onFiltersClear={handleFiltersClear}
        onCustomFieldFilterFieldsetChange={handleCustomFieldsetFilterChange}
        sorting={sorting}
        onSortingChange={setSorting}
        injectionSpotId={resolvedInjectionSpotId}
        injectionContext={{
          search,
          filters: filterValues,
          customFieldset: customFieldsetFilter,
          page,
          sorting,
          scopeVersion,
          // Step 5.15: surface `total` so the merchandising AI widget
          // (rendered in `data-table:catalog.products:header`) can build
          // a selection-aware pageContext per spec §10.1 without taking a
          // dependency on the host page.
          total,
          totalMatching: total,
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          totalPages,
          onPageChange: setPage,
          cacheStatus,
        }}
        exporter={exportConfig}
        isLoading={isLoading}
        perspective={{ tableId: activeCategory ? `${resolvedTableId}:${activeCategory}` : resolvedTableId }}
        stickyActionsColumn
        rowActions={(row) => (
          <RowActions
            items={[
              {
                id: 'edit',
                label: t('catalog.products.table.actions.edit', 'Edit'),
                href: `/backend/catalog/products/${row.id}`,
              },
              {
                id: 'delete',
                label: t('catalog.products.table.actions.delete', 'Delete'),
                destructive: true,
                onSelect: () => {
                  void handleDelete(row)
                },
              },
            ]}
          />
        )}
      />
      {ConfirmDialogElement}
    </>
  )
}
