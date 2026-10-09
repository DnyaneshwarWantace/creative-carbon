'use client'

import * as React from 'react'
import Link from 'next/link'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { ListEmptyState } from '@open-mercato/ui/backend/filters/ListEmptyState'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { Button } from '@open-mercato/ui/primitives/button'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import { FileUp, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { VENDOR_CATEGORIES } from '../../data/validators'
import { VENDOR_CATEGORY_LABEL } from '../../lib/categories'
import { PhoneList } from '../../../cc_ui/components/PhoneList'
import { cn } from '@open-mercato/shared/lib/utils'

type VendorRow = {
  id: string
  name: string
  code: string | null
  gst_number: string | null
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  address: string | null
  payment_terms: string | null
  category: string | null
  is_active: boolean
  organization_id: string
  tenant_id: string
  created_at: string
  updated_at: string
}

const CATEGORY_TEXT: Record<string, string> = VENDOR_CATEGORY_LABEL

type ResponsePayload = {
  items: VendorRow[]
  total: number
  page: number
  totalPages: number
}

export default function CcVendorsPage() {
  const t = useT()
  const { confirm: confirmDialog, ConfirmDialogElement } = useConfirmDialog()
  const [rows, setRows] = React.useState<VendorRow[]>([])
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [isLoading, setIsLoading] = React.useState(true)
  const [reloadToken, setReloadToken] = React.useState(0)
  const scopeVersion = useOrganizationScopeVersion()
  const mutationContextId = 'cc-vendors-list:mutation'
  const { runMutation, retryLastMutation } = useGuardedMutation<{
    formId: string
    resourceKind: string
    resourceId: string
    retryLastMutation: () => Promise<boolean>
  }>({
    contextId: mutationContextId,
    blockedMessage: t('ui.forms.flash.saveBlocked', 'Save blocked by validation'),
  })

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('pageSize', '50')
        if (search) params.set('search', search)
        if (filters.category) params.set('category', String(filters.category))
        if (filters.isActive === 'true') params.set('isActive', 'true')
        if (filters.isActive === 'false') params.set('isActive', 'false')

        const fallback: ResponsePayload = { items: [], total: 0, page, totalPages: 1 }
        const call = await apiCall<ResponsePayload>(
          `/api/cc_vendors/vendors?${params.toString()}`,
          undefined,
          { fallback }
        )

        if (!call.ok) {
          flash(t('cc_vendors.list.error.load', 'Failed to load vendors'), 'error')
          return
        }

        const payload = call.result ?? fallback
        if (!cancelled) {
          setRows(Array.isArray(payload.items) ? payload.items : [])
          setTotal(payload.total || 0)
          setTotalPages(payload.totalPages || 1)
        }
      } catch (error) {
        if (!cancelled) {
          flash(t('cc_vendors.list.error.load', 'Failed to load vendors'), 'error')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [page, search, filters, reloadToken, scopeVersion, t])

  const handleDelete = React.useCallback(
    async (row: VendorRow) => {
      const confirmed = await confirmDialog({
        title: t('cc_vendors.list.confirmDelete', 'Delete {name}?', { name: row.name }),
        variant: 'destructive',
      })
      if (!confirmed) return

      try {
        await runMutation({
          operation: async () => {
            const call = await withScopedApiRequestHeaders(
              buildOptimisticLockHeader(row.updated_at),
              () => apiCall(`/api/cc_vendors/vendors`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: row.id, organizationId: row.organization_id, tenantId: row.tenant_id }),
              }),
            )
            if (!call.ok) {
              throw Object.assign(new Error('[internal] cc_vendors.delete failed'), {
                status: call.status,
                ...((call.result as Record<string, unknown> | null) ?? {}),
              })
            }
            return call
          },
          context: {
            formId: mutationContextId,
            resourceKind: 'cc_vendors.vendor',
            resourceId: row.id,
            retryLastMutation,
          },
          mutationPayload: { id: row.id },
        })

        flash(t('cc_vendors.flash.deleted', 'Vendor deleted'), 'success')
        setReloadToken((tokenValue) => tokenValue + 1)
      } catch (error) {
        if (surfaceRecordConflict(error, t, { onRefresh: () => setReloadToken((tokenValue) => tokenValue + 1) })) return
        flash(t('cc_vendors.flash.deleteError', 'Failed to delete vendor'), 'error')
      }
    },
    [t, confirmDialog, mutationContextId, retryLastMutation, runMutation]
  )

  const columns = React.useMemo<ColumnDef<VendorRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('cc_vendors.list.columns.name', 'Name'),
        cell: ({ row }) => (
          <Link href={`/backend/cc_vendors/${row.original.id}`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'code',
        header: t('cc_vendors.list.columns.code', 'Code'),
        cell: ({ row }) => <span className="text-sm">{row.original.code || '—'}</span>,
      },
      {
        accessorKey: 'gst_number',
        header: t('cc_vendors.list.columns.gstNumber', 'GST number'),
        cell: ({ row }) => <span className="text-sm">{row.original.gst_number || '—'}</span>,
      },
      {
        accessorKey: 'category',
        header: t('cc_vendors.list.columns.category', 'Category'),
        cell: ({ row }) => <span className="text-sm">{CATEGORY_TEXT[row.original.category ?? ''] ?? row.original.category ?? '—'}</span>,
      },
      {
        accessorKey: 'contact_person',
        header: t('cc_vendors.list.columns.contactPerson', 'Contact person'),
        cell: ({ row }) => <span className="text-sm">{row.original.contact_person || '—'}</span>,
      },
      {
        accessorKey: 'contact_phone',
        header: t('cc_vendors.list.columns.contactPhone', 'Contact phone'),
        cell: ({ row }) => <span className="text-sm">{row.original.contact_phone || '—'}</span>,
      },
      {
        accessorKey: 'contact_email',
        header: t('cc_vendors.list.columns.contactEmail', 'Contact email'),
        cell: ({ row }) => <span className="text-sm">{row.original.contact_email || '—'}</span>,
      },
      {
        accessorKey: 'payment_terms',
        header: t('cc_vendors.list.columns.paymentTerms', 'Payment terms'),
        cell: ({ row }) => <span className="text-sm">{row.original.payment_terms || '—'}</span>,
      },
      {
        accessorKey: 'is_active',
        header: t('cc_vendors.list.columns.active', 'Active'),
        enableSorting: false,
        cell: ({ getValue }) => <BooleanIcon value={Boolean(getValue())} />,
      },
    ],
    [t]
  )

  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'category',
        label: t('cc_vendors.list.filters.category', 'Category'),
        type: 'select',
        options: [
          { label: t('cc_vendors.list.filters.all', 'All'), value: '' },
          ...VENDOR_CATEGORIES.map((category) => ({ label: t(`cc_vendors.category.${category}`, CATEGORY_TEXT[category]), value: category })),
        ],
      },
      {
        id: 'isActive',
        label: t('cc_vendors.list.filters.status', 'Status'),
        type: 'select',
        options: [
          { label: t('cc_vendors.list.filters.all', 'All'), value: '' },
          { label: t('cc_vendors.list.filters.active', 'Active'), value: 'true' },
          { label: t('cc_vendors.list.filters.inactive', 'Inactive'), value: 'false' },
        ],
      },
    ],
    [t]
  )

  return (
    <Page>
      <PageBody>
        <PhoneList
          title={t('cc_vendors.list.title', 'Vendors')}
          total={total}
          actions={
            <Button asChild size="sm" className="h-9">
              <Link href="/backend/cc_vendors/create">
                <Plus className="mr-1 h-4 w-4" />
                {t('cc_vendors.list.actions.createShort', 'New')}
              </Link>
            </Button>
          }
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('cc_vendors.list.searchShort', 'Name, code, GSTIN or phone')}
          filters={
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {['', ...VENDOR_CATEGORIES].map((value) => {
                const active = (filters.category ?? '') === value
                return (
                  <button
                    key={value || 'all'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setFilters((prev) => ({ ...prev, category: value || undefined }))
                      setPage(1)
                    }}
                    className={cn('h-8 shrink-0 rounded-full border px-3 text-xs font-medium', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground')}
                  >
                    {value ? t(`cc_vendors.category.${value}`, CATEGORY_TEXT[value]) : t('cc_vendors.list.filters.all', 'All')}
                  </button>
                )
              })}
            </div>
          }
          loading={isLoading}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          empty={<ListEmptyState entityName={t('cc_vendors.list.title', 'Vendors')} createHref="/backend/cc_vendors/create" createLabel={t('cc_vendors.list.actions.create', 'New vendor')} />}
          cards={rows.map((row) => ({
            key: row.id,
            href: `/backend/cc_vendors/${row.id}`,
            overline: row.code || undefined,
            title: row.name,
            badge: row.is_active ? null : <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('cc_vendors.list.filters.inactive', 'Inactive')}</span>,
            lines: [row.category ? t(`cc_vendors.category.${row.category}`, CATEGORY_TEXT[row.category] ?? row.category) : null, row.gst_number ? <span className="font-mono">{row.gst_number}</span> : null],
            footer: [row.contact_person, row.contact_phone, row.payment_terms],
          }))}
        />
        <div className="hidden md:block">
        <DataTable
          perspective={{ tableId: 'cc_vendors.list' }}
          title={t('cc_vendors.list.title', 'Vendors')}
          columns={columns}
          data={rows}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('cc_vendors.list.searchPlaceholder', 'Search vendors')}
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
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/backend/cc_vendors/import">
                  <FileUp className="mr-2 h-4 w-4" />
                  {t('cc_vendors.list.actions.import', 'Import')}
                </Link>
              </Button>
              <Button asChild>
                <Link href="/backend/cc_vendors/create">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('cc_vendors.list.actions.create', 'New vendor')}
                </Link>
              </Button>
            </div>
          }
          rowActions={(row) => (
            <RowActions
              items={[
                {
                  id: 'open',
                  label: t('cc_vendors.list.actions.open', 'Open vendor file'),
                  href: `/backend/cc_vendors/${row.id}`,
                },
                {
                  id: 'edit',
                  label: t('cc_vendors.list.actions.edit', 'Edit'),
                  href: `/backend/cc_vendors/${row.id}/edit`,
                },
                {
                  id: 'delete',
                  label: t('common.delete', 'Delete'),
                  destructive: true,
                  onSelect: () => handleDelete(row),
                },
              ]}
            />
          )}
          emptyState={(
            <ListEmptyState
              entityName={t('cc_vendors.list.title', 'Vendors')}
              createHref="/backend/cc_vendors/create"
              createLabel={t('cc_vendors.list.actions.create', 'New vendor')}
            />
          )}
          pagination={{ page, pageSize: 50, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
        </div>
      </PageBody>
      {ConfirmDialogElement}
    </Page>
  )
}
