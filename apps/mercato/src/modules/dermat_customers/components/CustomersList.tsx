'use client'

import * as React from 'react'
import Link from 'next/link'
import { FileUp, Plus } from 'lucide-react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { ListEmptyState } from '@open-mercato/ui/backend/filters/ListEmptyState'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { paymentTermLabel } from '../../dermat_lists/lib/paymentTerms'
import { useGranted } from '../../dermat_departments/components/useGranted'

type CustomerRow = {
  id: string
  display_name: string
  primary_email: string | null
  primary_phone: string | null
  cf_customer_no?: string | null
  cf_gstin?: string | null
  cf_legal_trade_name?: string | null
  cf_sales_manager?: string | null
  cf_payment_terms?: string | null
  cf_payment_remarks?: string | null
}

type Payload = { items?: CustomerRow[]; total?: number; totalPages?: number }

const PAGE_SIZE = 50

export default function CustomersList() {
  const t = useT()
  const granted = useGranted()
  const canManage = !granted.ready || granted.has('customers.companies.manage')
  const scopeVersion = useOrganizationScopeVersion()
  const [rows, setRows] = React.useState<CustomerRow[]>([])
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [search, setSearch] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), sortField: 'display_name', sortDir: 'asc' })
      if (search.trim()) params.set('search', search.trim())
      const call = await apiCall<Payload>(`/api/customers/companies?${params.toString()}`, undefined, { fallback: { items: [] } })
      if (cancelled) return
      if (!call.ok) flash(t('dermat_customers.list.loadError', 'Could not load customers.'), 'error')
      setRows(call.result?.items ?? [])
      setTotal(call.result?.total ?? 0)
      setTotalPages(call.result?.totalPages ?? 1)
      setIsLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [page, search, scopeVersion, t])

  const columns = React.useMemo<ColumnDef<CustomerRow>[]>(
    () => [
      {
        accessorKey: 'display_name',
        header: t('dermat_customers.list.name', 'Customer'),
        cell: ({ row }) => (
          <Link href={`/backend/customers/companies/${row.original.id}`} className="font-medium hover:underline">
            {row.original.display_name}
          </Link>
        ),
      },
      { accessorKey: 'cf_customer_no', header: t('dermat_customers.list.code', 'Customer no.'), cell: ({ row }) => <span className="font-mono text-sm">{row.original.cf_customer_no || '—'}</span> },
      { accessorKey: 'cf_gstin', header: t('dermat_customers.list.gstin', 'GSTIN'), cell: ({ row }) => <span className="font-mono text-sm">{row.original.cf_gstin || '—'}</span> },
      { accessorKey: 'cf_sales_manager', header: t('dermat_customers.list.salesManager', 'Sales manager'), cell: ({ row }) => <span className="text-sm">{row.original.cf_sales_manager || '—'}</span> },
      { accessorKey: 'cf_payment_terms', header: t('dermat_customers.list.terms', 'Payment terms'), cell: ({ row }) => <span className="text-sm">{paymentTermLabel(row.original.cf_payment_terms) || '—'}</span> },
      { accessorKey: 'primary_phone', header: t('dermat_customers.list.phone', 'Phone'), cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.primary_phone || '—'}</span> },
      { accessorKey: 'primary_email', header: t('dermat_customers.list.email', 'Email'), cell: ({ row }) => <span className="text-sm">{row.original.primary_email || '—'}</span> },
    ],
    [t],
  )

  return (
    <Page>
      <PageBody>
        <DataTable
          perspective={{ tableId: 'dermat_customers.list' }}
          title={t('dermat_customers.list.title', 'Customers')}
          columns={columns}
          data={rows}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('dermat_customers.list.search', 'Search by name, customer no., GSTIN or phone')}
          actions={
            canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/backend/masters/import-customers">
                    <FileUp className="mr-2 h-4 w-4" />
                    {t('dermat_customers.list.import', 'Import')}
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/backend/customers/companies/create">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('dermat_customers.list.create', 'New customer')}
                  </Link>
                </Button>
              </div>
            ) : null
          }
          rowActions={(row) => (
            <RowActions
              items={[
                { id: 'open', label: t('dermat_customers.list.open', 'Open customer'), href: `/backend/customers/companies/${row.id}` },
                ...(canManage ? [{ id: 'edit', label: t('dermat_customers.list.edit', 'Edit'), href: `/backend/customers/edit/${row.id}` }] : []),
              ]}
            />
          )}
          emptyState={
            <ListEmptyState
              entityName={t('dermat_customers.list.title', 'Customers')}
              createHref={canManage ? '/backend/customers/companies/create' : undefined}
              createLabel={t('dermat_customers.list.create', 'New customer')}
            />
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
      </PageBody>
    </Page>
  )
}
