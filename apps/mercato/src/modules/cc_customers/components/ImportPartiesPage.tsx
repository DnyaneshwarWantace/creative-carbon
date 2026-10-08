"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Upload } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { parseCsv, normalizeHeader } from '../../cc_products/lib/csv'
import { downloadCsv } from '../../cc_products/lib/csvExport'
import { GSTIN_PATTERN, GST_STATES, stateFromGstin } from '../../cc_accounts/lib/gstStates'
import { usePaymentTerms } from '../../cc_lists/components/usePaymentTerms'
import { paymentTermKey } from '../../cc_lists/lib/paymentTerms'

export type ImportKind = 'customers' | 'vendors'
type Kind = ImportKind
type Column = { key: string; header: string; required?: boolean; example: string }
type Row = { line: number; values: Record<string, string>; errors: string[]; status: 'ready' | 'error' | 'duplicate' | 'done' | 'failed'; message?: string }

const CUSTOMER_COLUMNS: Column[] = [
  { key: 'name', header: 'Customer name', required: true, example: 'Rudra Cosmetics' },
  { key: 'legal_name', header: 'Legal name', example: 'Rudra Cosmetics Pvt Ltd' },
  { key: 'type', header: 'Business or Individual', example: 'Business' },
  { key: 'gst_treatment', header: 'GST treatment', example: 'Registered' },
  { key: 'gstin', header: 'GSTIN', example: '27AAACR1234A1Z5' },
  { key: 'sales_manager', header: 'Sales manager', example: 'Priya' },
  { key: 'payment_terms', header: 'Payment terms', example: '30 days' },
  { key: 'payment_remarks', header: 'Payment remarks', example: '40% advance 60% before dispatch' },
  { key: 'phone', header: 'Phone', example: '+91 98200 11111' },
  { key: 'email', header: 'Email', example: 'accounts@rudra.example' },
  { key: 'contact_name', header: 'Contact name', example: 'Rahul Shah' },
  { key: 'contact_phone', header: 'Contact phone', example: '+91 98200 22222' },
  { key: 'contact_email', header: 'Contact email', example: 'rahul@rudra.example' },
  { key: 'billing_street', header: 'Billing street', example: 'Plot 14, MIDC Taloja' },
  { key: 'billing_city', header: 'Billing city', example: 'Raigad' },
  { key: 'billing_state', header: 'Billing state', example: 'Maharashtra' },
  { key: 'billing_pin', header: 'Billing PIN', example: '410208' },
  { key: 'shipping_street', header: 'Shipping street', example: '' },
  { key: 'shipping_city', header: 'Shipping city', example: '' },
  { key: 'shipping_state', header: 'Shipping state', example: '' },
  { key: 'shipping_pin', header: 'Shipping PIN', example: '' },
]

const VENDOR_COLUMNS: Column[] = [
  { key: 'name', header: 'Vendor name', required: true, example: 'Shree Ganesh Chemicals' },
  { key: 'code', header: 'Vendor code', example: 'V-012' },
  { key: 'gstin', header: 'GST number', example: '27AAKFS4471M1Z2' },
  { key: 'supplies', header: 'Supplies (RM, PM or Both)', example: 'RM' },
  { key: 'contact_name', header: 'Contact person', example: 'Mahesh' },
  { key: 'phone', header: 'Phone', example: '+91 98700 12345' },
  { key: 'email', header: 'Email', example: 'sales@ganesh.example' },
  { key: 'address', header: 'Address', example: 'Vasai East, Palghar' },
  { key: 'payment_terms', header: 'Payment terms', example: '30 days' },
]

const GST_TYPES = ['registered', 'unregistered', 'composition', 'overseas']
const STATE_NAMES = new Set(Object.values(GST_STATES).map((name) => name.toLowerCase()))

type TermOption = { value: string; label: string }

function termValue(text: string, terms: TermOption[]): string | null {
  const clean = text.trim().toLowerCase()
  if (!clean) return null
  const direct = terms.find((term) => term.label.toLowerCase() === clean || term.value === paymentTermKey(clean))
  if (direct) return direct.value
  const days = clean.match(/(\d{1,3})/)?.[1]
  const byDays = days ? terms.find((term) => term.value === `${days}_days`) : null
  if (byDays) return byDays.value
  return clean.includes('deliver') ? terms.find((term) => term.value === 'due_on_delivery')?.value ?? null : null
}

function validate(kind: Kind, values: Record<string, string>, terms: TermOption[]): string[] {
  const errors: string[] = []
  if (!values.name?.trim()) errors.push('Name is missing')
  const gstin = values.gstin?.trim().toUpperCase()
  if (gstin && !GSTIN_PATTERN.test(gstin)) errors.push('GSTIN is not valid')
  if (values.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.push('Email is not valid')
  if (values.payment_terms?.trim() && kind === 'customers' && !termValue(values.payment_terms, terms)) errors.push(`Payment terms not recognised (use ${terms.map((term) => term.label).join(', ')})`)
  if (kind === 'customers') {
    const treatment = values.gst_treatment?.trim().toLowerCase()
    if (treatment && !GST_TYPES.includes(treatment)) errors.push('GST treatment must be Registered, Unregistered, Composition or Overseas')
    if ((treatment === 'registered' || treatment === 'composition') && !gstin) errors.push('This GST treatment needs a GSTIN')
    for (const prefix of ['billing', 'shipping']) {
      const pin = values[`${prefix}_pin`]?.trim()
      if (pin && !/^\d{6}$/.test(pin)) errors.push(`${prefix === 'billing' ? 'Billing' : 'Shipping'} PIN must be 6 digits`)
      const state = values[`${prefix}_state`]?.trim().toLowerCase()
      if (state && !STATE_NAMES.has(state)) errors.push(`${prefix === 'billing' ? 'Billing' : 'Shipping'} state is not an Indian state name`)
    }
  } else if (values.supplies?.trim() && !['rm', 'pm', 'both'].includes(values.supplies.trim().toLowerCase())) errors.push('Supplies must be RM, PM or Both')
  return errors
}

export function ImportPartiesPage({ kind }: { kind: Kind }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-import-parties' })
  const terms = usePaymentTerms()
  const [rows, setRows] = React.useState<Row[]>([])
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const columns = kind === 'customers' ? CUSTOMER_COLUMNS : VENDOR_COLUMNS

  const template = () => downloadCsv(`${kind}-import-template`, columns.map((column) => ({ header: `${column.header}${column.required ? ' *' : ''}`, value: (row: Record<string, string>) => row[column.key] })), [Object.fromEntries(columns.map((column) => [column.key, column.example]))])

  const existingNames = async (): Promise<Set<string>> => {
    const names = new Set<string>()
    if (kind === 'vendors') {
      for (let page = 1; page <= 10; page += 1) {
        const call = await apiCall<{ items?: Array<{ name: string }>; totalPages?: number }>(`/api/cc_vendors/vendors?page=${page}&pageSize=100`, undefined, { fallback: { items: [] } })
        for (const item of call.result?.items ?? []) names.add(item.name.trim().toLowerCase())
        if (page >= (call.result?.totalPages ?? 1)) break
      }
    } else {
      for (let page = 1; page <= 10; page += 1) {
        const call = await apiCall<{ items?: Array<{ display_name?: string; cf_legal_trade_name?: string }>; totalPages?: number }>(`/api/customers/companies?page=${page}&pageSize=100`, undefined, { fallback: { items: [] } })
        for (const item of call.result?.items ?? []) {
          if (item.display_name) names.add(String(item.display_name).trim().toLowerCase())
          if (item.cf_legal_trade_name) names.add(String(item.cf_legal_trade_name).trim().toLowerCase())
        }
        if (page >= (call.result?.totalPages ?? 1)) break
      }
    }
    return names
  }

  const readFile = async (file: File) => {
    const table = parseCsv(await file.text())
    const lookup = new Map(columns.map((column) => [normalizeHeader(column.header), column.key]))
    const keys = table.headers.map((header) => lookup.get(normalizeHeader(header.replace(/\*/g, ''))) ?? null)
    if (!keys.includes('name')) {
      flash(t('cc_customers.import.noName', 'The file needs a "{column}" column. Download the template.', { column: columns[0].header }), 'error')
      return
    }
    const existing = await existingNames()
    const seen = new Set<string>()
    const parsed: Row[] = table.rows
      .filter((cells) => cells.some((cell) => cell.trim()))
      .slice(0, 500)
      .map((cells, index) => {
        const values: Record<string, string> = {}
        keys.forEach((key, position) => {
          if (key) values[key] = (cells[position] ?? '').trim()
        })
        const errors = validate(kind, values, terms)
        const name = values.name?.trim().toLowerCase() ?? ''
        const duplicate = Boolean(name) && (existing.has(name) || seen.has(name))
        if (name) seen.add(name)
        return { line: index + 2, values, errors, status: errors.length ? 'error' : duplicate ? 'duplicate' : 'ready', message: duplicate ? 'Already exists, will be skipped' : undefined }
      })
    setRows(parsed)
    setFileName(file.name)
  }

  const importCustomer = async (values: Record<string, string>) => {
    const gstin = values.gstin?.trim().toUpperCase() || null
    const body: Record<string, unknown> = {
      displayName: values.name.trim(),
      primaryPhone: values.phone || null,
      primaryEmail: values.email || null,
      cf_customer_type_category: values.type?.toLowerCase().startsWith('ind') ? 'individual' : 'business',
      cf_legal_trade_name: values.legal_name || values.name.trim(),
      cf_gst_registration_type: values.gst_treatment?.trim().toLowerCase() || (gstin ? 'registered' : 'unregistered'),
      cf_gstin: gstin,
      cf_sales_manager: values.sales_manager || null,
      cf_payment_terms: termValue(values.payment_terms ?? '', terms) ?? 'due_on_delivery',
      cf_payment_remarks: values.payment_remarks || null,
      cf_default_currency: 'INR',
    }
    const call = await apiCall<{ id?: string; error?: string }>('/api/customers/companies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!call.ok || !call.result?.id) throw new Error(call.result?.error ?? 'not saved')
    const id = call.result.id
    for (const prefix of ['billing', 'shipping'] as const) {
      if (!values[`${prefix}_street`]) continue
      const state = values[`${prefix}_state`] || (prefix === 'billing' ? stateFromGstin(gstin)?.name : '') || undefined
      await apiCall('/api/customers/addresses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId: id, purpose: prefix, name: prefix === 'billing' ? 'Billing' : 'Shipping', addressLine1: values[`${prefix}_street`], city: values[`${prefix}_city`] || undefined, region: state, postalCode: values[`${prefix}_pin`] || undefined, country: 'India', isPrimary: prefix === 'billing' }) })
    }
    if (values.contact_name) await apiCall('/api/customers/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entityId: id, name: values.contact_name, phone: values.contact_phone || undefined, email: values.contact_email || undefined }) })
    await apiCall('/api/cc_customers/number', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerId: id }) })
  }

  const importVendor = async (values: Record<string, string>) => {
    const supplies = values.supplies?.trim().toLowerCase()
    const body = {
      name: values.name.trim(),
      code: values.code || null,
      gstNumber: values.gstin?.toUpperCase() || null,
      category: supplies === 'rm' ? 'rm_supplier' : supplies === 'pm' ? 'pm_supplier' : supplies === 'both' ? 'both' : null,
      contactPerson: values.contact_name || null,
      contactPhone: values.phone || null,
      contactEmail: values.email || null,
      address: values.address || null,
      paymentTerms: values.payment_terms || null,
      isActive: true,
    }
    const call = await apiCall<{ id?: string; error?: string; fieldErrors?: Record<string, string> }>('/api/cc_vendors/vendors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!call.ok) throw new Error(call.result?.error ?? Object.values(call.result?.fieldErrors ?? {})[0] ?? 'not saved')
  }

  const runImport = async () => {
    const todo = rows.filter((row) => row.status === 'ready')
    if (!todo.length) return
    setBusy(true)
    setProgress(0)
    let done = 0
    try {
      await runMutation({
        context: { resourceKind: `cc_import.${kind}`, resourceId: fileName ?? 'file' },
        mutationPayload: { rows: todo.length },
        operation: async () => {
          for (const row of todo) {
            try {
              if (kind === 'customers') await importCustomer(row.values)
              else await importVendor(row.values)
              row.status = 'done'
            } catch (error) {
              row.status = 'failed'
              row.message = error instanceof Error ? error.message : 'not saved'
            }
            done += 1
            setProgress(done)
            setRows((prev) => [...prev])
          }
          return { ok: true }
        },
      })
      const failed = todo.filter((row) => row.status === 'failed').length
      flash(failed ? t('cc_customers.import.partial', '{done} imported, {failed} failed. See the rows marked red.', { done: todo.length - failed, failed }) : t('cc_customers.import.done', '{done} imported', { done: todo.length }), failed ? 'error' : 'success')
    } finally {
      setBusy(false)
    }
  }

  const counts = { ready: rows.filter((row) => row.status === 'ready').length, error: rows.filter((row) => row.status === 'error').length, duplicate: rows.filter((row) => row.status === 'duplicate').length }
  const shown = columns.slice(0, 6)

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <Link href={kind === 'customers' ? '/backend/customers/companies' : '/backend/cc_vendors'} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {kind === 'customers' ? t('cc_customers.import.backCustomers', 'Customers') : t('cc_customers.import.backVendors', 'Vendors')}
              </Link>
              <h1 className="text-2xl font-bold tracking-tight">{kind === 'customers' ? t('cc_customers.import.titleCustomers', 'Import customers') : t('cc_customers.import.titleVendors', 'Import vendors')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_customers.import.lede', 'Fill the template in Excel, save it as CSV and upload it. Every row is checked before anything is saved; names that already exist are skipped.')}</p>
            </div>
          </header>

          <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <li className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cc_customers.import.step1', '1. Template')}</p>
              <p className="mt-1 text-sm">{t('cc_customers.import.step1Text', '{count} columns; the name is required.', { count: columns.length })}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={template}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_customers.import.download', 'Download template')}
              </Button>
            </li>
            <li className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cc_customers.import.step2', '2. Upload the CSV')}</p>
              <p className="mt-1 truncate text-sm">{fileName ?? t('cc_customers.import.noFile', 'No file yet')}</p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-label={t('cc_customers.import.pick', 'CSV file')}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void readFile(file)
                  event.target.value = ''
                }}
              />
              <Button type="button" size="sm" className="mt-3" onClick={() => inputRef.current?.click()} disabled={busy}>
                <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_customers.import.choose', 'Choose file')}
              </Button>
            </li>
            <li className="rounded-lg border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cc_customers.import.step3', '3. Import')}</p>
              <p className="mt-1 text-sm">{rows.length ? t('cc_customers.import.summary', '{ready} ready · {error} with errors · {dup} already exist', { ready: counts.ready, error: counts.error, dup: counts.duplicate }) : '—'}</p>
              <Button type="button" size="sm" className="mt-3" onClick={() => void runImport()} disabled={busy || !counts.ready}>
                {busy ? t('cc_customers.import.importing', 'Importing {done}/{total}…', { done: progress, total: counts.ready + progress }) : t('cc_customers.import.run', 'Import {count} rows', { count: counts.ready })}
              </Button>
            </li>
          </ol>

          {rows.length ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_customers.import.line', 'Line')}</th>
                    {shown.map((column) => (
                      <th key={column.key} className="px-3 py-2 text-left font-semibold">{column.header}</th>
                    ))}
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_customers.import.check', 'Check')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.line} className={cn(row.status === 'error' || row.status === 'failed' ? 'bg-status-error-bg' : row.status === 'duplicate' ? 'bg-muted/40' : '')}>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.line}</td>
                      {shown.map((column) => (
                        <td key={column.key} className="max-w-48 truncate px-3 py-2">{row.values[column.key] || '—'}</td>
                      ))}
                      <td className="px-3 py-2 text-xs">
                        {row.status === 'done' ? <StatusBadge variant="success">{t('cc_customers.import.imported', 'Imported')}</StatusBadge> : null}
                        {row.status === 'ready' ? <StatusBadge variant="info">{t('cc_customers.import.ready', 'Ready')}</StatusBadge> : null}
                        {row.status === 'duplicate' ? <span className="text-muted-foreground">{row.message}</span> : null}
                        {row.status === 'error' ? <span className="text-status-error-text">{row.errors.join('; ')}</span> : null}
                        {row.status === 'failed' ? <span className="text-status-error-text">{row.message}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

