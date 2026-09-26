'use client'

import * as React from 'react'
import Link from 'next/link'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { ListEmptyState } from '@open-mercato/ui/backend/filters/ListEmptyState'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { BooleanIcon } from '@open-mercato/ui/backend/ValueIcons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@open-mercato/ui/primitives/select'
import { Plus } from 'lucide-react'
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

type ResponsePayload = {
  items: VendorRow[]
  total: number
  page: number
  totalPages: number
}

type EditableField =
  | 'name'
  | 'code'
  | 'gstNumber'
  | 'contactPerson'
  | 'contactPhone'
  | 'contactEmail'
  | 'paymentTerms'
  | 'category'

const FIELD_TO_COLUMN: Record<EditableField, keyof VendorRow> = {
  name: 'name',
  code: 'code',
  gstNumber: 'gst_number',
  contactPerson: 'contact_person',
  contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
  paymentTerms: 'payment_terms',
  category: 'category',
}

function InlineCell({
  row,
  field,
  onCommit,
}: {
  row: VendorRow
  field: EditableField
  onCommit: (row: VendorRow, field: EditableField, value: string) => Promise<void>
}) {
  const columnKey = FIELD_TO_COLUMN[field]
  const initial = row[columnKey]
  const [value, setValue] = React.useState(initial == null ? '' : String(initial))
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setValue(initial == null ? '' : String(initial))
  }, [initial])

  const commit = React.useCallback(async () => {
    const original = initial == null ? '' : String(initial)
    if (value === original) return
    setSaving(true)
    try {
      await onCommit(row, field, value)
    } finally {
      setSaving(false)
    }
  }, [field, initial, onCommit, row, value])

  return (
    <Input
      value={value}
      disabled={saving}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          ;(event.target as HTMLInputElement).blur()
        }
        if (event.key === 'Escape') {
          setValue(initial == null ? '' : String(initial))
          ;(event.target as HTMLInputElement).blur()
        }
      }}
      className="h-8 border-transparent bg-transparent px-2 hover:border-input focus:border-input"
    />
  )
}

function InlineSelectCell({
  row,
  field,
  options,
  onCommit,
}: {
  row: VendorRow
  field: EditableField
  options: readonly string[]
  onCommit: (row: VendorRow, field: EditableField, value: string) => Promise<void>
}) {
  const columnKey = FIELD_TO_COLUMN[field]
  const initial = row[columnKey]
  const value = initial == null ? '' : String(initial)
  const [saving, setSaving] = React.useState(false)

  const handleChange = React.useCallback(
    async (nextValue: string) => {
      if (nextValue === value) return
      setSaving(true)
      try {
        await onCommit(row, field, nextValue)
      } finally {
        setSaving(false)
      }
    },
    [field, onCommit, row, value]
  )

  return (
    <Select value={value} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className="h-8 border-transparent bg-transparent px-2 hover:border-input focus:border-input">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function DermatVendorsPage() {
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
  const mutationContextId = 'dermat-vendors-list:mutation'
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
          `/api/dermat_vendors/vendors?${params.toString()}`,
          undefined,
          { fallback }
        )

        if (!call.ok) {
          flash(t('dermat_vendors.list.error.load', 'Failed to load vendors'), 'error')
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
          flash(t('dermat_vendors.list.error.load', 'Failed to load vendors'), 'error')
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

  const handleInlineCommit = React.useCallback(
    async (row: VendorRow, field: EditableField, value: string) => {
      try {
        const payload: Record<string, unknown> = { id: row.id, [field]: value }
        await runMutation({
          operation: async () => {
            const call = await withScopedApiRequestHeaders(
              buildOptimisticLockHeader(row.updated_at),
              () => apiCall(`/api/dermat_vendors/vendors`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              }),
            )
            if (!call.ok) {
              throw Object.assign(new Error('[internal] dermat_vendors.update failed'), {
                status: call.status,
                ...((call.result as Record<string, unknown> | null) ?? {}),
              })
            }
            return call
          },
          context: {
            formId: mutationContextId,
            resourceKind: 'dermat_vendors.vendor',
            resourceId: row.id,
            retryLastMutation,
          },
          mutationPayload: payload,
        })

        setReloadToken((tokenValue) => tokenValue + 1)
      } catch (error) {
        if (surfaceRecordConflict(error, t, { onRefresh: () => setReloadToken((tokenValue) => tokenValue + 1) })) return
        flash(t('dermat_vendors.flash.updateError', 'Failed to update vendor'), 'error')
        setReloadToken((tokenValue) => tokenValue + 1)
      }
    },
    [mutationContextId, retryLastMutation, runMutation, t]
  )

  const handleDelete = React.useCallback(
    async (row: VendorRow) => {
      const confirmed = await confirmDialog({
        title: t('dermat_vendors.list.confirmDelete', 'Delete {name}?', { name: row.name }),
        variant: 'destructive',
      })
      if (!confirmed) return

      try {
        await runMutation({
          operation: async () => {
            const call = await withScopedApiRequestHeaders(
              buildOptimisticLockHeader(row.updated_at),
              () => apiCall(`/api/dermat_vendors/vendors`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: row.id, organizationId: row.organization_id, tenantId: row.tenant_id }),
              }),
            )
            if (!call.ok) {
              throw Object.assign(new Error('[internal] dermat_vendors.delete failed'), {
                status: call.status,
                ...((call.result as Record<string, unknown> | null) ?? {}),
              })
            }
            return call
          },
          context: {
            formId: mutationContextId,
            resourceKind: 'dermat_vendors.vendor',
            resourceId: row.id,
            retryLastMutation,
          },
          mutationPayload: { id: row.id },
        })

        flash(t('dermat_vendors.flash.deleted', 'Vendor deleted'), 'success')
        setReloadToken((tokenValue) => tokenValue + 1)
      } catch (error) {
        if (surfaceRecordConflict(error, t, { onRefresh: () => setReloadToken((tokenValue) => tokenValue + 1) })) return
        flash(t('dermat_vendors.flash.deleteError', 'Failed to delete vendor'), 'error')
      }
    },
    [t, confirmDialog, mutationContextId, retryLastMutation, runMutation]
  )

  const columns = React.useMemo<ColumnDef<VendorRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('dermat_vendors.list.columns.name', 'Name'),
        cell: ({ row }) => (
          <InlineCell row={row.original} field="name" onCommit={handleInlineCommit} />
        ),
      },
      {
        accessorKey: 'code',
        header: t('dermat_vendors.list.columns.code', 'Code'),
        cell: ({ row }) => (
          <InlineCell row={row.original} field="code" onCommit={handleInlineCommit} />
        ),
      },
      {
        accessorKey: 'gst_number',
        header: t('dermat_vendors.list.columns.gstNumber', 'GST number'),
        cell: ({ row }) => (
          <InlineCell row={row.original} field="gstNumber" onCommit={handleInlineCommit} />
        ),
      },
      {
        accessorKey: 'category',
        header: t('dermat_vendors.list.columns.category', 'Category'),
        cell: ({ row }) => (
          <InlineSelectCell
            row={row.original}
            field="category"
            options={VENDOR_CATEGORIES}
            onCommit={handleInlineCommit}
          />
        ),
      },
      {
        accessorKey: 'contact_person',
        header: t('dermat_vendors.list.columns.contactPerson', 'Contact person'),
        cell: ({ row }) => (
          <InlineCell row={row.original} field="contactPerson" onCommit={handleInlineCommit} />
        ),
      },
      {
        accessorKey: 'contact_phone',
        header: t('dermat_vendors.list.columns.contactPhone', 'Contact phone'),
        cell: ({ row }) => (
          <InlineCell row={row.original} field="contactPhone" onCommit={handleInlineCommit} />
        ),
      },
      {
        accessorKey: 'contact_email',
        header: t('dermat_vendors.list.columns.contactEmail', 'Contact email'),
        cell: ({ row }) => (
          <InlineCell row={row.original} field="contactEmail" onCommit={handleInlineCommit} />
        ),
      },
      {
        accessorKey: 'payment_terms',
        header: t('dermat_vendors.list.columns.paymentTerms', 'Payment terms'),
        cell: ({ row }) => (
          <InlineCell row={row.original} field="paymentTerms" onCommit={handleInlineCommit} />
        ),
      },
      {
        accessorKey: 'is_active',
        header: t('dermat_vendors.list.columns.active', 'Active'),
        enableSorting: false,
        cell: ({ getValue }) => <BooleanIcon value={Boolean(getValue())} />,
      },
    ],
    [t, handleInlineCommit]
  )

  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'category',
        label: t('dermat_vendors.list.filters.category', 'Category'),
        type: 'select',
        options: [
          { label: t('dermat_vendors.list.filters.all', 'All'), value: '' },
          ...VENDOR_CATEGORIES.map((category) => ({ label: category, value: category })),
        ],
      },
      {
        id: 'isActive',
        label: t('dermat_vendors.list.filters.status', 'Status'),
        type: 'select',
        options: [
          { label: t('dermat_vendors.list.filters.all', 'All'), value: '' },
          { label: t('dermat_vendors.list.filters.active', 'Active'), value: 'true' },
          { label: t('dermat_vendors.list.filters.inactive', 'Inactive'), value: 'false' },
        ],
      },
    ],
    [t]
  )

  return (
    <Page>
      <PageBody>
        <DataTable
          title={t('dermat_vendors.list.title', 'Vendors')}
          columns={columns}
          data={rows}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('dermat_vendors.list.searchPlaceholder', 'Search vendors')}
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
            <Button asChild>
              <Link href="/backend/dermat_vendors/create">
                <Plus className="mr-2 h-4 w-4" />
                {t('dermat_vendors.list.actions.create', 'New vendor')}
              </Link>
            </Button>
          }
          rowActions={(row) => (
            <RowActions
              items={[
                {
                  id: 'open',
                  label: t('dermat_vendors.list.actions.open', 'Open vendor file'),
                  href: `/backend/dermat_vendors/${row.id}`,
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
              entityName={t('dermat_vendors.list.title', 'Vendors')}
              createHref="/backend/dermat_vendors/create"
              createLabel={t('dermat_vendors.list.actions.create', 'New vendor')}
            />
          )}
          pagination={{ page, pageSize: 50, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
      </PageBody>
      {ConfirmDialogElement}
    </Page>
  )
}
