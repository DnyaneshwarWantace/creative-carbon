"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Ban, Factory, PackageCheck, Plus, Printer, Search, Trash2, Truck, Waypoints } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { PhoneList } from '../../cc_ui/components/PhoneList'
import { FieldList, LinkRows, Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, RegisterGrid, formatDay, formatKg, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { Dropdown } from '../../cc_lists/components/Dropdown'
import { Timeline } from '../../cc_ui/components/Timeline'

type Status = 'open' | 'part_returned' | 'returned' | 'cancelled'
type Line = { lineId: string; productId: string; title: string; hsn: string | null; unit: string; lotId: string; lotNumber: string; fromPlace: string; fromPlaceLabel: string; qty: number; value: number; returnedQty: number; lossQty: number; pending: number }
type Challan = {
  id: string
  code: string
  vendorId: string
  vendorName: string
  vendorGstin: string | null
  challanDate: string
  process: string
  expectedReturn: string | null
  vehicleNo: string | null
  notes: string | null
  status: Status
  lines: Line[]
  returns: Array<{ id: string; date: string; by: string | null; at: string; note: string | null; lines: Array<{ lineId: string; qty: number; lossQty: number; toPlace: string }> }>
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  totals: { sent: number; returned: number; loss: number; out: number; value: number }
  daysOut: number
  overdue: boolean
  limitDate: string
  pastLimit: boolean
  createdByName: string | null
  updatedAt: string
}
type LotOption = { lotId: string; lotNumber: string; productId: string; title: string; unit: string; place: string; placeLabel: string; free: number }
type Company = { name: string; legalName?: string | null; gstin?: string | null; address?: string | null; phone?: string | null; signatory?: string | null }

const STATUS: Record<Status, { label: string; variant: StatusBadgeVariant }> = {
  open: { label: 'With job worker', variant: 'warning' },
  part_returned: { label: 'Part back', variant: 'info' },
  returned: { label: 'All back', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

const PLACES: Array<{ value: string; label: string }> = [
  { value: 'wh_a', label: 'Warehouse A' },
  { value: 'wh_b', label: 'Warehouse B' },
  { value: 'floor', label: 'Shop floor' },
  { value: 'fg', label: 'FG store' },
]

const PROCESSES = ['Machining', 'Cutting to size', 'Drilling / punching', 'Grinding', 'Coating', 'Pressing']

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function plusDays(days: number): string {
  const value = new Date(`${today()}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function qty(value: number, unit: string): string {
  return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)} ${unit}`
}

function rupees(value: number): string {
  return `₹ ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
}

export function buildJobWorkHtml(challan: Challan, company: Company | null): string {
  const rows = challan.lines
    .map((line, index) => `<tr><td class="n">${index + 1}</td><td><strong>${esc(line.title)}</strong><div class="code">Lot ${esc(line.lotNumber)}</div></td><td class="mono">${esc(line.hsn ?? '—')}</td><td class="r">${esc(qty(line.qty, line.unit))}</td><td class="r">${line.value ? esc(new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(line.value)) : '—'}</td></tr>`)
    .join('')
  const name = esc(company?.legalName || company?.name || 'Creative Carbon Composites Pvt. Ltd.')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Job-work challan ${esc(challan.code)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;font-size:12px}
    .top{display:flex;justify-content:space-between;border-bottom:2px solid #1c1917;padding-bottom:12px} h1{font-size:19px;margin:0}
    .muted{color:#78716c;font-size:11px} .code,.mono{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:#57534e}
    .doc{text-align:right} .kind{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#78716c;font-weight:700} .no{font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700}
    .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:16px 0} .box{border:1px solid #d6d3d1;border-radius:6px;padding:9px 11px} .box h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#78716c}
    table{width:100%;border-collapse:collapse} th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;text-align:left;border-bottom:1px solid #1c1917;padding:6px}
    td{padding:7px 6px;border-bottom:1px solid #e7e5e4;vertical-align:top} .r{text-align:right;white-space:nowrap} .n{width:22px;color:#78716c}
    .tot td{font-weight:700;border-top:1px solid #1c1917} .decl{margin-top:16px;border:1px solid #1c1917;border-radius:6px;padding:10px 12px;font-size:11.5px;line-height:1.5}
    .sign{display:flex;justify-content:space-between;margin-top:56px} .sign div{width:40%;border-top:1px solid #a8a29e;padding-top:4px;text-align:center;color:#78716c}
    @media print{body{padding:14mm}}
  </style></head><body>
  <div class="top">
    <div><h1>${name}</h1><div class="muted">${esc(company?.address ?? '').replace(/\n/g, '<br>')}</div>${company?.gstin ? `<div class="code">GSTIN ${esc(company.gstin)}</div>` : ''}</div>
    <div class="doc"><div class="kind">Delivery challan · Job work</div><div class="no">${esc(challan.code)}</div><div class="muted">${formatDay(challan.challanDate)}</div></div>
  </div>
  <div class="grid">
    <div class="box"><h3>Job worker (consignee)</h3><strong>${esc(challan.vendorName)}</strong>${challan.vendorGstin ? `<div class="code">GSTIN ${esc(challan.vendorGstin)}</div>` : '<div class="muted">Unregistered</div>'}</div>
    <div class="box"><h3>Process</h3><div>${esc(challan.process)}</div>${challan.expectedReturn ? `<div class="muted">Expected back by ${formatDay(challan.expectedReturn)}</div>` : ''}</div>
    <div class="box"><h3>Transport</h3><div>${esc(challan.vehicleNo ?? '—')}</div></div>
  </div>
  <table><thead><tr><th>#</th><th>Goods</th><th>HSN</th><th class="r">Quantity</th><th class="r">Value ₹</th></tr></thead><tbody>${rows}<tr class="tot"><td></td><td>Total</td><td></td><td class="r">${esc(new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(challan.totals.sent))}</td><td class="r">${challan.totals.value ? esc(new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(challan.totals.value)) : '—'}</td></tr></tbody></table>
  ${challan.notes ? `<p class="muted" style="margin-top:10px">${esc(challan.notes)}</p>` : ''}
  <div class="decl">Goods sent for job work under Section 143 of the CGST Act, 2017 read with Rule 55 of the CGST Rules, 2017. This is not a supply. The goods remain the property of ${name} and are to be returned after processing within one year, i.e. by ${formatDay(challan.limitDate)}. Value is shown for the purpose of this challan only.</div>
  <div class="sign"><div>Received by the job worker (name, stamp)</div><div>For ${name}${company?.signatory ? `<br>${esc(company.signatory)}` : ''}</div></div>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 200) })</script>
  </body></html>`
}

function printChallan(challan: Challan, company: Company | null, onBlocked: () => void) {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return onBlocked()
  popup.document.open()
  popup.document.write(buildJobWorkHtml(challan, company))
  popup.document.close()
}

function useCompany(): Company | null {
  const [company, setCompany] = React.useState<Company | null>(null)
  React.useEffect(() => {
    void apiCall<Company>('/api/cc_accounts/company', undefined, { fallback: null }).then((call) => setCompany(call.ok ? (call.result ?? null) : null))
  }, [])
  return company
}

export function JobWorkListPage() {
  const t = useT()
  const granted = useGranted()
  const canSend = granted.has('cc_purchase.jobwork')
  const [status, setStatus] = React.useState<'open' | 'returned' | 'cancelled' | 'all'>('open')
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<Challan[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams()
      if (status !== 'all') params.set('status', status)
      if (search.trim()) params.set('q', search.trim())
      const call = await apiCall<{ items: Challan[] }>(`/api/cc_purchase/job-work?${params.toString()}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setItems(call.result?.items ?? [])
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [status, search])

  const filters = (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label={t('cc_purchase.jw.filter', 'Show')}>
      {(['open', 'returned', 'cancelled', 'all'] as const).map((value) => (
        <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={cn('h-8 shrink-0 rounded-full border px-3 text-xs font-medium', status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
          {value === 'open' ? t('cc_purchase.jw.open', 'With job workers') : value === 'returned' ? t('cc_purchase.jw.back', 'All back') : value === 'cancelled' ? t('cc_purchase.jw.cancelled', 'Cancelled') : t('cc_purchase.jw.all', 'All')}
        </button>
      ))}
    </div>
  )
  const empty = <EmptyState className="rounded-lg border bg-card py-12" variant="subtle" icon={<Factory className="h-5 w-5" aria-hidden="true" />} title={status === 'open' ? t('cc_purchase.jw.noneOut', 'Nothing is with a job worker') : t('cc_purchase.jw.none', 'No job-work challans here')} description={canSend ? t('cc_purchase.jw.emptyHint', 'Send lots out for machining, cutting or coating with a job-work challan; stock moves to "At job worker" until it comes back.') : undefined} />
  const newButton = canSend ? (
    <Button asChild>
      <Link href="/backend/purchase/job-work/new">
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('cc_purchase.jw.new', 'New job-work challan')}
      </Link>
    </Button>
  ) : null

  return (
    <Page>
      <PageBody>
        <div className="space-y-4">
          <PhoneList
            title={t('cc_purchase.jw.title', 'Job work')}
            total={items?.length}
            actions={canSend ? (
              <Button asChild size="sm" className="h-9">
                <Link href="/backend/purchase/job-work/new">
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('cc_purchase.jw.newShort', 'New')}
                </Link>
              </Button>
            ) : null}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('cc_purchase.jw.search', 'Challan, job worker, process or lot')}
            filters={filters}
            loading={!items}
            empty={empty}
            page={1}
            totalPages={1}
            onPageChange={() => undefined}
            cards={(items ?? []).map((row) => ({
              key: row.id,
              href: recordHref.jobWork(row.id),
              overline: `${row.code} · ${formatDay(row.challanDate)}`,
              title: row.vendorName,
              badge: <StatusBadge variant={row.overdue ? 'error' : STATUS[row.status].variant} dot>{row.overdue ? t('cc_purchase.jw.overdue', 'Overdue') : STATUS[row.status].label}</StatusBadge>,
              lines: [row.process, row.lines.map((line) => line.lotNumber).join(', ')],
              footer: [`${t('cc_purchase.jw.sentShort', 'Sent')} ${formatKg(row.totals.sent)}`, row.totals.out ? `${t('cc_purchase.jw.outShort', 'Out')} ${formatKg(row.totals.out)}` : null, row.expectedReturn ? `${t('cc_purchase.jw.dueShort', 'Due')} ${formatDay(row.expectedReturn)}` : null],
            }))}
          />
          <div className="hidden space-y-4 md:block">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{t('cc_purchase.jw.title', 'Job work')}</h1>
                <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_purchase.jw.lede', 'Material sent to a job worker on a challan stays ours: it shows under "At job worker" until it comes back. GST allows one year for it to return.')}</p>
              </div>
              {newButton}
            </header>
            <div className="flex flex-wrap items-center gap-3">
              {filters}
              <div className="relative ml-auto w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_purchase.jw.search', 'Challan, job worker, process or lot')} aria-label={t('cc_purchase.jw.search', 'Challan, job worker, process or lot')} />
              </div>
            </div>
            {!items ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !items.length ? (
              empty
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      {['Challan', 'Date', 'Job worker', 'Process', 'Lots', 'Sent', 'Still out', 'Due back', 'Status'].map((label, index) => (
                        <th key={label} className={cn('px-3 py-2 font-semibold', index === 5 || index === 6 ? 'text-right' : 'text-left')}>
                          {t(`cc_purchase.jw.col.${index}`, label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs">
                          <Link className="text-primary hover:underline" href={recordHref.jobWork(row.id)}>
                            {row.code}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{formatDay(row.challanDate)}</td>
                        <td className="px-3 py-2">
                          <Link className="hover:underline" href={recordHref.vendor(row.vendorId)}>
                            {row.vendorName}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{row.process}</td>
                        <td className="max-w-xs truncate px-3 py-2 font-mono text-xs" title={row.lines.map((line) => line.lotNumber).join(', ')}>
                          {row.lines.map((line) => line.lotNumber).join(', ')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatKg(row.totals.sent)}</td>
                        <td className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', row.totals.out > 0 && 'font-semibold')}>{row.totals.out ? formatKg(row.totals.out) : '—'}</td>
                        <td className={cn('whitespace-nowrap px-3 py-2', row.overdue && 'font-medium text-status-error-text')}>{row.expectedReturn ? formatDay(row.expectedReturn) : '—'}</td>
                        <td className="px-3 py-2">
                          <StatusBadge variant={row.overdue ? 'error' : STATUS[row.status].variant} dot>
                            {row.overdue ? t('cc_purchase.jw.overdue', 'Overdue') : t(`cc_purchase.jw.status.${row.status}`, STATUS[row.status].label)}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

type DraftLine = LotOption & { qty: string; value: string }

export function JobWorkNewPage() {
  const t = useT()
  const router = useRouter()
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: 'cc-job-work-new' })
  const [vendors, setVendors] = React.useState<Array<{ id: string; name: string; gst_number: string | null }>>([])
  const [form, setForm] = React.useState({ vendorId: '', challanDate: today(), process: '', expectedReturn: plusDays(30), vehicleNo: '', notes: '' })
  const [lines, setLines] = React.useState<DraftLine[]>([])
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState<LotOption[] | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    void apiCall<{ items: Array<{ id: string; name: string; gst_number: string | null }> }>('/api/cc_vendors/vendors?pageSize=100&isActive=true&sortField=name&sortDir=asc', undefined, { fallback: { items: [] } }).then((call) => setVendors(call.result?.items ?? []))
  }, [])

  React.useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items: LotOption[] }>(`/api/cc_purchase/job-work?lots=1${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setOptions(call.result?.items ?? [])
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [search])

  const save = async () => {
    if (!form.vendorId) return flash(t('cc_purchase.jw.pickVendor', 'Pick the job worker'), 'error')
    if (form.process.trim().length < 2) return flash(t('cc_purchase.jw.needProcess', 'Write the process, e.g. Machining'), 'error')
    if (!lines.length) return flash(t('cc_purchase.jw.needLots', 'Add at least one lot'), 'error')
    const bad = lines.find((line) => !(Number(line.qty) > 0) || Number(line.qty) > line.free + 0.0005)
    if (bad) return flash(t('cc_purchase.jw.badQty', '{lot}: enter up to {free} {unit}', { lot: bad.lotNumber, free: bad.free, unit: bad.unit }), 'error')
    const body = { ...form, expectedReturn: form.expectedReturn || null, lines: lines.map((line) => ({ lotId: line.lotId, qty: Number(line.qty), value: Number(line.value || 0) })) }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { formId: 'cc-job-work-new', resourceKind: 'cc_purchase.job_work', resourceId: 'new', retryLastMutation },
        mutationPayload: body,
        operation: () => apiCall<Challan & { error?: string }>('/api/cc_purchase/job-work', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('cc_purchase.jw.saveError', 'Could not make the challan.'), 'error')
        return
      }
      flash(t('cc_purchase.jw.made', 'Challan {code} made; the stock is now "At job worker"', { code: call.result.code }), 'success')
      router.push(recordHref.jobWork(call.result.id))
    } finally {
      setBusy(false)
    }
  }

  const chosen = new Set(lines.map((line) => line.lotId))

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-6xl space-y-5 pb-28 lg:pb-10">
          <div className="flex items-start gap-3">
            <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0" aria-label={t('common.back', 'Back')}>
              <Link href="/backend/purchase/job-work">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl">{t('cc_purchase.jw.newTitle', 'New job-work challan')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_purchase.jw.newHint', 'Pick the job worker and the lots going out. On save the challan gets its number and the stock moves to "At job worker".')}</p>
            </div>
          </div>

          <section className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('cc_purchase.jw.vendor', 'Job worker')} *</Label>
              <Dropdown value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })} aria-label={t('cc_purchase.jw.vendor', 'Job worker')}>
                <option value="">{t('cc_purchase.jw.pickVendor', 'Pick the job worker')}</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </Dropdown>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jw-process" className="text-xs text-muted-foreground">{t('cc_purchase.jw.process', 'Process')} *</Label>
              <Input id="jw-process" list="jw-processes" value={form.process} onChange={(event) => setForm({ ...form, process: event.target.value })} placeholder="e.g. Machining" />
              <datalist id="jw-processes">
                {PROCESSES.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="jw-date" className="text-xs text-muted-foreground">{t('cc_purchase.jw.date', 'Challan date')}</Label>
                <Input id="jw-date" type="date" value={form.challanDate} onChange={(event) => setForm({ ...form, challanDate: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="jw-due" className="text-xs text-muted-foreground">{t('cc_purchase.jw.due', 'Expected back')}</Label>
                <Input id="jw-due" type="date" value={form.expectedReturn} onChange={(event) => setForm({ ...form, expectedReturn: event.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jw-vehicle" className="text-xs text-muted-foreground">{t('cc_purchase.jw.vehicle', 'Vehicle no.')}</Label>
              <Input id="jw-vehicle" className="uppercase" value={form.vehicleNo} onChange={(event) => setForm({ ...form, vehicleNo: event.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1.5 sm:col-span-1 lg:col-span-2">
              <Label htmlFor="jw-notes" className="text-xs text-muted-foreground">{t('cc_purchase.jw.notes', 'Note on the challan')}</Label>
              <Textarea id="jw-notes" rows={1} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t('cc_purchase.jw.notesHint', 'e.g. Drill 8 mm holes as per drawing CC-112')} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs lg:col-span-2">
              <h2 className="text-sm font-semibold">{t('cc_purchase.jw.pickLots', 'Approved stock to send')}</h2>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_purchase.jw.lotSearch', 'Lot no. or item')} aria-label={t('cc_purchase.jw.lotSearch', 'Lot no. or item')} />
              </div>
              {!options ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : !options.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('cc_purchase.jw.noLots', 'No approved stock matches')}</p>
              ) : (
                <ul className="max-h-[420px] divide-y overflow-auto rounded-md border">
                  {options.map((lot) => (
                    <li key={lot.lotId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{lot.title}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {lot.lotNumber} · {lot.placeLabel} · {qty(lot.free, lot.unit)}
                        </span>
                      </span>
                      <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" disabled={chosen.has(lot.lotId)} onClick={() => setLines((prev) => [...prev, { ...lot, qty: String(lot.free), value: '' }])}>
                        {chosen.has(lot.lotId) ? t('cc_purchase.jw.added', 'Added') : t('cc_purchase.jw.add', 'Add')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs lg:col-span-3">
              <h2 className="text-sm font-semibold">{t('cc_purchase.jw.onChallan', 'On this challan')}</h2>
              {!lines.length ? (
                <p className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">{t('cc_purchase.jw.addFromLeft', 'Add lots from the list')}</p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div key={line.lotId} className="grid grid-cols-12 items-end gap-2 rounded-md border p-2">
                      <div className="col-span-12 min-w-0 sm:col-span-5">
                        <p className="truncate text-sm font-medium">{line.title}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {line.lotNumber} · {line.placeLabel} · {t('cc_purchase.jw.free', '{qty} free', { qty: qty(line.free, line.unit) })}
                        </p>
                      </div>
                      <div className="col-span-5 space-y-1 sm:col-span-3">
                        <Label className="text-xs text-muted-foreground">{t('cc_purchase.jw.qty', 'Quantity ({unit})', { unit: line.unit })}</Label>
                        <Input inputMode="decimal" className="text-right" value={line.qty} onChange={(event) => setLines((prev) => prev.map((row) => (row.lotId === line.lotId ? { ...row, qty: event.target.value } : row)))} aria-label={`${line.lotNumber} quantity`} />
                      </div>
                      <div className="col-span-5 space-y-1 sm:col-span-3">
                        <Label className="text-xs text-muted-foreground">{t('cc_purchase.jw.value', 'Value ₹ (for the challan)')}</Label>
                        <Input inputMode="decimal" className="text-right" value={line.value} onChange={(event) => setLines((prev) => prev.map((row) => (row.lotId === line.lotId ? { ...row, value: event.target.value } : row)))} aria-label={`${line.lotNumber} value`} />
                      </div>
                      <div className="col-span-2 flex justify-end sm:col-span-1">
                        <Button type="button" size="icon" variant="ghost" aria-label={t('cc_purchase.jw.remove', 'Remove')} onClick={() => setLines((prev) => prev.filter((row) => row.lotId !== line.lotId))}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="hidden justify-end gap-2 lg:flex">
                <Button asChild variant="ghost">
                  <Link href="/backend/purchase/job-work">{t('common.cancel', 'Cancel')}</Link>
                </Button>
                <Button type="button" disabled={busy} onClick={() => void save()}>
                  <Truck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {busy ? t('cc_purchase.jw.saving', 'Saving…') : t('cc_purchase.jw.send', 'Make challan and send')}
                </Button>
              </div>
            </section>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/95 px-4 py-3 pb-safe backdrop-blur lg:hidden">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/backend/purchase/job-work">{t('common.cancel', 'Cancel')}</Link>
            </Button>
            <Button type="button" className="flex-1" disabled={busy} onClick={() => void save()}>
              {busy ? t('cc_purchase.jw.saving', 'Saving…') : t('cc_purchase.jw.sendShort', 'Make challan')}
            </Button>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export function JobWorkDetailPage({ id }: { id: string }) {
  const t = useT()
  const granted = useGranted()
  const canAct = granted.has('cc_purchase.jobwork')
  const company = useCompany()
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: `cc-job-work-${id}` })
  const [challan, setChallan] = React.useState<Challan | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [mode, setMode] = React.useState<'receive' | 'cancel' | null>(null)
  const [returnDate, setReturnDate] = React.useState(today())
  const [entry, setEntry] = React.useState<Record<string, { qty: string; loss: string; to: string }>>({})
  const [note, setNote] = React.useState('')

  const load = React.useCallback(async () => {
    const call = await apiCall<Challan>(`/api/cc_purchase/job-work?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) setError(t('cc_purchase.jw.loadError', 'Could not load this challan.'))
    else setChallan(call.result)
  }, [id, t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error || !challan) return <RecordState error={error} loadingLabel={t('cc_purchase.loading', 'Loading…')} />

  const open = challan.status === 'open' || challan.status === 'part_returned'
  const act = async (body: Record<string, unknown>, success: string) => {
    setBusy(true)
    try {
      const call = await runMutation({
        context: { formId: `cc-job-work-${challan.id}`, resourceKind: 'cc_purchase.job_work', resourceId: challan.id, retryLastMutation },
        mutationPayload: body,
        operation: () => withScopedApiRequestHeaders(buildOptimisticLockHeader(challan.updatedAt), () => apiCall<Challan & { error?: string }>('/api/cc_purchase/job-work/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: challan.id, ...body }) })),
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('cc_purchase.jw.actError', 'Could not save.'), 'error')
        if (call.status === 409) await load()
        return
      }
      setChallan(call.result)
      setMode(null)
      setEntry({})
      setNote('')
      flash(success, 'success')
    } finally {
      setBusy(false)
    }
  }

  const receive = () =>
    act(
      {
        action: 'receive',
        date: returnDate,
        note: note || null,
        lines: challan.lines.filter((line) => line.pending > 0).map((line) => ({ lineId: line.lineId, qty: Number(entry[line.lineId]?.qty || 0), lossQty: Number(entry[line.lineId]?.loss || 0), toPlace: entry[line.lineId]?.to || line.fromPlace })),
      },
      t('cc_purchase.jw.received', 'Received back into the store'),
    )

  const facts: Fact[] = [
    { label: t('cc_purchase.jw.sent', 'Sent'), value: formatKg(challan.totals.sent) },
    { label: t('cc_purchase.jw.backFact', 'Back'), value: formatKg(challan.totals.returned), tone: challan.totals.returned ? 'good' : undefined },
    { label: t('cc_purchase.jw.loss', 'Process loss'), value: formatKg(challan.totals.loss), tone: challan.totals.loss ? 'warn' : undefined },
    { label: t('cc_purchase.jw.out', 'Still out'), value: formatKg(challan.totals.out), tone: challan.totals.out && challan.overdue ? 'bad' : undefined },
    { label: t('cc_purchase.jw.daysOut', 'Days out'), value: open ? String(challan.daysOut) : '—' },
    { label: t('cc_purchase.jw.dueBack', 'Due back'), value: formatDay(challan.expectedReturn), hint: t('cc_purchase.jw.limit', 'GST limit {date}', { date: formatDay(challan.limitDate) }), tone: challan.overdue ? 'bad' : undefined },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/purchase/job-work', label: t('cc_purchase.jw.title', 'Job work') }}
      overline={t('cc_purchase.jw.overline', 'Job-work challan · {process}', { process: challan.process })}
      title={challan.code}
      badges={<StatusBadge variant={challan.overdue ? 'error' : STATUS[challan.status].variant} dot>{challan.overdue ? t('cc_purchase.jw.overdue', 'Overdue') : t(`cc_purchase.jw.status.${challan.status}`, STATUS[challan.status].label)}</StatusBadge>}
      meta={
        <>
          <Link className="underline-offset-2 hover:underline" href={recordHref.vendor(challan.vendorId)}>
            {challan.vendorName}
          </Link>
          {` · ${formatDay(challan.challanDate)}${challan.vehicleNo ? ` · ${challan.vehicleNo}` : ''}${challan.createdByName ? ` · ${challan.createdByName}` : ''}`}
        </>
      }
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => printChallan(challan, company, () => flash(t('cc_purchase.jw.popup', 'Allow pop-ups to print'), 'error'))}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_purchase.jw.print', 'Print challan')}
          </Button>
          {canAct && open ? (
            <Button type="button" size="sm" onClick={() => setMode('receive')} disabled={busy}>
              <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_purchase.jw.receive', 'Receive back')}
            </Button>
          ) : null}
          {canAct && challan.status === 'open' && !challan.returns.length ? (
            <Button type="button" variant="destructive-ghost" size="sm" onClick={() => setMode('cancel')} disabled={busy}>
              <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_purchase.jw.cancel', 'Cancel')}
            </Button>
          ) : null}
        </>
      }
      alert={
        challan.pastLimit ? (
          <p className="rounded-md border border-status-error-border bg-status-error-bg px-3 py-2 text-sm text-status-error-text">{t('cc_purchase.jw.pastLimit', 'Out for more than a year: under GST what has not come back is treated as supplied to the job worker on the challan date. Speak to Accounts.')}</p>
        ) : challan.overdue ? (
          <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">{t('cc_purchase.jw.overdueNote', 'Was due back on {date}. Follow up with {vendor}.', { date: formatDay(challan.expectedReturn), vendor: challan.vendorName })}</p>
        ) : null
      }
      facts={facts}
    >
      {mode === 'cancel' ? (
        <div className="space-y-2 rounded-md border border-status-error-border bg-status-error-bg p-3">
          <Label htmlFor="jw-cancel" className="text-sm text-status-error-text">{t('cc_purchase.jw.cancelWhy', 'Why is it cancelled? The lots go back to the store they came from.')}</Label>
          <Textarea id="jw-cancel" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setMode(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={busy || note.trim().length < 3} onClick={() => void act({ action: 'cancel', reason: note.trim() }, t('cc_purchase.jw.cancelledOk', 'Challan cancelled; stock is back in the store'))}>
              {t('cc_purchase.jw.confirmCancel', 'Cancel the challan')}
            </Button>
          </div>
        </div>
      ) : null}
      {mode === 'receive' ? (
        <Panel title={t('cc_purchase.jw.receiveTitle', 'Receive back')} icon={PackageCheck}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="jw-return-date" className="text-xs text-muted-foreground">{t('cc_purchase.jw.returnDate', 'Date back')}</Label>
                <Input id="jw-return-date" type="date" className="w-44" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="jw-return-note" className="text-xs text-muted-foreground">{t('cc_purchase.jw.returnNote', 'Note (their challan no., remarks)')}</Label>
                <Input id="jw-return-note" value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
            </div>
            {challan.lines.filter((line) => line.pending > 0).map((line) => {
              const value = entry[line.lineId] ?? { qty: '', loss: '', to: line.fromPlace }
              const set = (patch: Partial<typeof value>) => setEntry((prev) => ({ ...prev, [line.lineId]: { ...value, ...patch } }))
              return (
                <div key={line.lineId} className="grid grid-cols-12 items-end gap-2 rounded-md border p-2">
                  <div className="col-span-12 min-w-0 md:col-span-4">
                    <p className="truncate text-sm font-medium">{line.title}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {line.lotNumber} · {t('cc_purchase.jw.stillOut', '{qty} still out', { qty: qty(line.pending, line.unit) })}
                    </p>
                  </div>
                  <div className="col-span-4 space-y-1 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">{t('cc_purchase.jw.backQty', 'Back')}</Label>
                    <div className="flex gap-1">
                      <Input inputMode="decimal" className="text-right" value={value.qty} onChange={(event) => set({ qty: event.target.value })} aria-label={`${line.lotNumber} back`} />
                    </div>
                  </div>
                  <div className="col-span-4 space-y-1 md:col-span-2">
                    <Label className="text-xs text-muted-foreground">{t('cc_purchase.jw.lossQty', 'Loss')}</Label>
                    <Input inputMode="decimal" className="text-right" value={value.loss} onChange={(event) => set({ loss: event.target.value })} aria-label={`${line.lotNumber} loss`} />
                  </div>
                  <div className="col-span-4 space-y-1 md:col-span-3">
                    <Label className="text-xs text-muted-foreground">{t('cc_purchase.jw.into', 'Into')}</Label>
                    <Dropdown value={value.to} onChange={(event) => set({ to: event.target.value })} aria-label={`${line.lotNumber} into`}>
                      {PLACES.map((place) => (
                        <option key={place.value} value={place.value}>
                          {place.label}
                        </option>
                      ))}
                    </Dropdown>
                  </div>
                  <div className="col-span-12 flex justify-end md:col-span-1">
                    <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => set({ qty: String(Math.max(0, line.pending - Number(value.loss || 0))) })}>
                      {t('cc_purchase.jw.all', 'All')}
                    </Button>
                  </div>
                </div>
              )
            })}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setMode(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" size="sm" disabled={busy} onClick={() => void receive()}>
                {busy ? t('cc_purchase.jw.saving', 'Saving…') : t('cc_purchase.jw.saveReceive', 'Save what came back')}
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}
      <RecordColumns
        main={
          <Panel title={t('cc_purchase.jw.lines', 'Lots on this challan')} icon={Truck} count={challan.lines.length} flush>
            <RegisterGrid
              rows={challan.lines}
              rowKey={(line) => line.lineId}
              rowHref={(line) => recordHref.lot(line.lotId)}
              empty={<PanelEmpty>—</PanelEmpty>}
              columns={[
                {
                  key: 'lot',
                  label: t('cc_purchase.jw.lot', 'Lot'),
                  render: (line) => (
                    <span className="block min-w-0">
                      <span className="block font-mono text-xs">{line.lotNumber}</span>
                      <span className="block text-xs text-muted-foreground">
                        {line.title} · {line.fromPlaceLabel}
                      </span>
                    </span>
                  ),
                },
                { key: 'sent', label: t('cc_purchase.jw.sent', 'Sent'), align: 'right', render: (line) => qty(line.qty, line.unit) },
                { key: 'back', label: t('cc_purchase.jw.backFact', 'Back'), align: 'right', render: (line) => (line.returnedQty ? qty(line.returnedQty, line.unit) : '—') },
                { key: 'loss', label: t('cc_purchase.jw.lossShort', 'Loss'), align: 'right', render: (line) => (line.lossQty ? qty(line.lossQty, line.unit) : '—') },
                { key: 'out', label: t('cc_purchase.jw.out', 'Still out'), align: 'right', render: (line) => (line.pending ? qty(line.pending, line.unit) : '—') },
                { key: 'value', label: t('cc_purchase.jw.valueShort', 'Value'), align: 'right', render: (line) => (line.value ? rupees(line.value) : '—'), total: challan.totals.value ? rupees(challan.totals.value) : undefined },
              ]}
            />
          </Panel>
        }
        side={
          <>
            <Panel title={t('cc_purchase.jw.details', 'Challan')} icon={Factory}>
              <FieldList
                columns={1}
                fields={[
                  [t('cc_purchase.jw.vendor', 'Job worker'), challan.vendorName],
                  ['GSTIN', challan.vendorGstin],
                  [t('cc_purchase.jw.process', 'Process'), challan.process],
                  [t('cc_purchase.jw.vehicle', 'Vehicle no.'), challan.vehicleNo],
                  [t('cc_purchase.jw.notes', 'Note on the challan'), challan.notes],
                ]}
              />
            </Panel>
            <Panel title={t('cc_purchase.jw.returns', 'Received back')} icon={Waypoints} count={challan.returns.length} flush>
              <LinkRows
                empty={t('cc_purchase.jw.nothingBack', 'Nothing back yet')}
                rows={challan.returns.map((entry) => ({
                  key: entry.id,
                  primary: formatDay(entry.date),
                  secondary: [entry.by, entry.note].filter(Boolean).join(' · '),
                  value: formatKg(entry.lines.reduce((sum, row) => sum + row.qty, 0)),
                  valueHint: entry.lines.some((row) => row.lossQty) ? t('cc_purchase.jw.withLoss', '{qty} loss', { qty: formatKg(entry.lines.reduce((sum, row) => sum + row.lossQty, 0)) }) : undefined,
                }))}
              />
            </Panel>
          </>
        }
      />
      <Timeline type="job_work" id={challan.id} refreshKey={challan.history.length} />
    </RecordPage>
  )
}
