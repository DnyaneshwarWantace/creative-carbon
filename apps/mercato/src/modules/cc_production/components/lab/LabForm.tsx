"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CircleDashed, Copy, FileText, FlaskConical, PackageSearch, Trash2, Truck, Upload, X, XCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SearchPicker, type PickerOption } from '../../../cc_orders/components/SearchPicker'
import { searchCustomers } from '../../../cc_orders/components/loaders'
import { useListOptions } from '../../../cc_lists/components/useListOptions'
import { todayIso } from '../resin/shared'
import type { LabTest, LabReportFile } from './types'

export const LAB_ENTITY = 'cc_production:lab_test'
const INCOMING_KINDS = 'chemical,reinforcement,chindi,resin'
const OUTGOING_KINDS = 'laminate,moulded,bstage,bought_in'
const MAX_FILE_MB = 20

type TestPoint = 'incoming' | 'outgoing'
type Result = 'pass' | 'fail' | 'pending'
type LotOption = { lotId: string; lotNumber: string; title: string; placeLabel: string; productId: string }
type OrderOption = { id: string; orderNo: string; customerId: string; customerName: string }

type Draft = {
  testPoint: TestPoint
  testDate: string
  testedBy: string
  reportNo: string
  testType: string
  standard: string
  result: Result
  order: OrderOption | null
  customer: { id: string | null; name: string } | null
  lots: string[]
  itemTitle: string
  productId: string | null
  notes: string
}

function draftOf(test: LabTest | null): Draft {
  return {
    testPoint: test?.testPoint ?? 'outgoing',
    testDate: test?.testDate ?? todayIso(),
    testedBy: test?.testedBy ?? '',
    reportNo: test?.reportNo ?? '',
    testType: test?.testType ?? '',
    standard: test?.standard ?? '',
    result: test?.result ?? 'pending',
    order: test?.orderId ? { id: test.orderId, orderNo: test.orderNo ?? '', customerId: test.customerId ?? '', customerName: test.customerName ?? '' } : null,
    customer: test?.customerId || test?.customerName ? { id: test.customerId ?? null, name: test.customerName ?? '' } : null,
    lots: (test?.lotRefs ?? '').split(',').map((lot) => lot.trim()).filter(Boolean),
    itemTitle: test?.itemTitle ?? '',
    productId: test?.productId ?? null,
    notes: test?.notes ?? '',
  }
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function searchOrders(query: string): Promise<PickerOption<OrderOption>[]> {
  const params = new URLSearchParams({ pageSize: '20', stageStatus: 'active' })
  if (query) params.set('search', query)
  const call = await apiCall<{ items?: Array<{ id: string; orderNo: string; customerId: string; customerName: string; status: string }> }>(`/api/cc_orders/orders?${params.toString()}`, undefined, { fallback: { items: [] } })
  return (call.ok ? (call.result?.items ?? []) : [])
    .filter((order) => order.status !== 'cancelled')
    .map((order) => ({ id: order.id, primary: order.orderNo, secondary: order.customerName, value: { id: order.id, orderNo: order.orderNo, customerId: order.customerId, customerName: order.customerName } }))
}

type OrderDetail = { id: string; orderNo: string; customerId: string; customer: { name: string } | null; lines: Array<{ product: { id: string; title: string } | null; specs: Record<string, Record<string, string>> }> }

async function orderPrefill(orderId: string) {
  const [orderCall, fulfilmentCall] = await Promise.all([
    apiCall<OrderDetail>(`/api/cc_orders/orders?id=${encodeURIComponent(orderId)}`),
    apiCall<{ qc?: { lots: Array<{ lotNumber: string }> } }>(`/api/cc_orders/orders/fulfilment?id=${encodeURIComponent(orderId)}`),
  ])
  if (!orderCall.ok || !orderCall.result) return null
  const order = orderCall.result
  return {
    order: { id: order.id, orderNo: order.orderNo, customerId: order.customerId, customerName: order.customer?.name ?? '' },
    productId: order.lines[0]?.product?.id ?? null,
    itemTitle: order.lines.map((line) => line.product?.title).filter(Boolean).join(', '),
    standard: order.lines.map((line) => line.specs?.packing?.test_standard).find(Boolean) ?? '',
    lots: fulfilmentCall.ok ? (fulfilmentCall.result?.qc?.lots ?? []).map((lot) => lot.lotNumber) : [],
  }
}

function Section({ step, title, hint, children, className }: { step: number; title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-xs', className)}>
      <header className="flex items-start gap-3 border-b px-4 py-3 sm:px-5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{step}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  )
}

function Field({ label, required, hint, children, className, htmlFor }: { label: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-status-error-text"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ChoiceChips({ options, value, onChange, ariaLabel }: { options: string[]; value: string; onChange: (value: string) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active ? '' : option)}
            className={cn('min-h-9 rounded-full border px-3.5 text-sm transition-colors', active ? 'border-primary bg-primary text-primary-foreground shadow-xs' : 'border-border bg-background text-foreground hover:bg-muted')}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function LotPicker({ testPoint, lots, onChange }: { testPoint: TestPoint; lots: string[]; onChange: (lots: string[], picked?: LotOption) => void }) {
  const t = useT()
  const [all, setAll] = React.useState<LotOption[]>([])
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    let cancelled = false
    apiCall<{ items: LotOption[] }>(`/api/cc_production/finishing/lots?kinds=${testPoint === 'incoming' ? INCOMING_KINDS : OUTGOING_KINDS}`, undefined, { fallback: { items: [] } }).then((call) => {
      if (!cancelled) setAll(call.ok ? (call.result?.items ?? []) : [])
    })
    return () => {
      cancelled = true
    }
  }, [testPoint])
  const term = query.trim().toLowerCase()
  const matches = all.filter((lot) => !lots.includes(lot.lotNumber) && (!term || lot.lotNumber.toLowerCase().includes(term) || lot.title.toLowerCase().includes(term))).slice(0, 8)
  const add = (lot: LotOption | null, typed?: string) => {
    const number = lot?.lotNumber ?? typed?.trim()
    if (!number || lots.includes(number)) return
    onChange([...lots, number], lot ?? undefined)
    setQuery('')
  }
  return (
    <div className="space-y-2">
      {lots.length ? (
        <div className="flex flex-wrap gap-1.5">
          {lots.map((lot) => (
            <span key={lot} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 py-1 pl-2 pr-1 font-mono text-xs">
              {lot}
              <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground" aria-label={t('cc_production.lab.removeLot', 'Remove {lot}', { lot })} onClick={() => onChange(lots.filter((entry) => entry !== lot))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative">
        <PackageSearch className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          className="pl-9"
          value={query}
          placeholder={testPoint === 'incoming' ? t('cc_production.lab.lotSearchIn', 'Search raw-material lot (chemical, reinforcement…)') : t('cc_production.lab.lotSearchOut', 'Search finished lot (sheet, tube, moulded…)')}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && query.trim()) {
              event.preventDefault()
              add(matches[0] ?? null, matches[0] ? undefined : query)
            }
          }}
        />
        {open && (matches.length || term) ? (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
            {matches.map((lot) => (
              <li key={lot.lotId}>
                <button type="button" className="flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => add(lot)}>
                  <span className="font-mono text-xs">{lot.lotNumber}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {lot.title} · {lot.placeLabel}
                  </span>
                </button>
              </li>
            ))}
            {term && !matches.some((lot) => lot.lotNumber.toLowerCase() === term) ? (
              <li>
                <button type="button" className="w-full rounded px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => add(null, query)}>
                  {t('cc_production.lab.useTyped', 'Use "{lot}" as typed (lot not in stock)', { lot: query.trim() })}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

function ReportUpload({ queued, setQueued, existing, onRemoveExisting }: { queued: File[]; setQueued: (files: File[]) => void; existing: LabReportFile[]; onRemoveExisting: (file: LabReportFile) => void }) {
  const t = useT()
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const accept = (files: FileList | null) => {
    if (!files) return
    const next = [...queued]
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        flash(t('cc_production.lab.tooBig', '{name} is over {mb} MB', { name: file.name, mb: MAX_FILE_MB }), 'error')
        continue
      }
      if (!next.some((entry) => entry.name === file.name && entry.size === file.size)) next.push(file)
    }
    setQueued(next)
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          accept(event.dataTransfer.files)
        }}
        className={cn('flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors', dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-muted/40')}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Upload className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium">{t('cc_production.lab.uploadTitle', 'Upload the lab test report')}</span>
        <span className="text-xs text-muted-foreground">{t('cc_production.lab.uploadHint', 'Drop the PDF or a photo here, or tap to choose. Up to {mb} MB each.', { mb: MAX_FILE_MB })}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
        capture={undefined}
        className="hidden"
        onChange={(event) => {
          accept(event.target.files)
          event.target.value = ''
        }}
      />
      {existing.length || queued.length ? (
        <ul className="divide-y rounded-lg border">
          {existing.map((file) => (
            <li key={file.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <a className="min-w-0 flex-1 truncate text-sm hover:underline" href={`/api/attachments/file/${file.id}?download=1`}>
                {file.fileName}
              </a>
              <span className="text-xs text-muted-foreground">{fileSize(file.fileSize)}</span>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('cc_production.lab.removeFile', 'Remove file')} onClick={() => onRemoveExisting(file)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {queued.map((file) => (
            <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t('cc_production.lab.toUpload', 'uploads on save')}</span>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('cc_production.lab.removeFile', 'Remove file')} onClick={() => setQueued(queued.filter((entry) => entry !== file))}>
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

async function uploadReports(recordId: string, files: File[]): Promise<string[]> {
  const failed: string[] = []
  for (const file of files) {
    const form = new FormData()
    form.set('entityId', LAB_ENTITY)
    form.set('recordId', recordId)
    form.set('file', file)
    const call = await apiCall<{ ok?: boolean; error?: string }>('/api/attachments', { method: 'POST', body: form }, { fallback: null })
    if (!call.ok) failed.push(file.name)
  }
  return failed
}

const RESULTS: Array<{ value: Result; label: string; hint: string; icon: typeof CheckCircle2; tone: string }> = [
  { value: 'pass', label: 'Pass', hint: 'QC done, report OK', icon: CheckCircle2, tone: 'border-status-success-border bg-status-success-bg text-status-success-text' },
  { value: 'fail', label: 'Fail', hint: 'Does not meet the standard', icon: XCircle, tone: 'border-status-error-border bg-status-error-bg text-status-error-text' },
  { value: 'pending', label: 'Pending', hint: 'Sent to the lab, waiting', icon: CircleDashed, tone: 'border-status-warning-border bg-status-warning-bg text-status-warning-text' },
]

export function LabFormPage({ testId, orderId }: { testId?: string; orderId?: string }) {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `cc-lab-${testId ?? 'new'}` })
  const testTypes = useListOptions('lab_test_types')
  const standards = useListOptions('lab_standards')
  const [test, setTest] = React.useState<LabTest | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(testId || orderId ? null : draftOf(null))
  const [queued, setQueued] = React.useState<File[]>([])
  const [existing, setExisting] = React.useState<LabReportFile[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (testId) {
        const call = await apiCall<LabTest>(`/api/cc_production/lab?id=${encodeURIComponent(testId)}`)
        if (cancelled) return
        if (!call.ok || !call.result) {
          setLoadError(t('cc_production.lab.loadError', 'Could not load the lab test.'))
          return
        }
        setTest(call.result)
        setExisting(call.result.reports ?? [])
        setDraft(draftOf(call.result))
        return
      }
      if (orderId) {
        const prefill = await orderPrefill(orderId)
        if (cancelled) return
        if (!prefill) {
          setLoadError(t('cc_production.lab.orderError', 'Could not load the order.'))
          return
        }
        setDraft({ ...draftOf(null), order: prefill.order, customer: { id: prefill.order.customerId, name: prefill.order.customerName }, productId: prefill.productId, itemTitle: prefill.itemTitle, standard: prefill.standard, lots: prefill.lots })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [testId, orderId, t])

  const backHref = test ? `/backend/quality/lab/${test.id}` : orderId ? `/backend/orders/${orderId}/stages/qc` : '/backend/quality/lab'
  const patch = (value: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...value } : prev))

  const pickOrder = async (option: PickerOption<OrderOption>) => {
    patch({ order: option.value, customer: { id: option.value.customerId, name: option.value.customerName }, testPoint: 'outgoing' })
    const prefill = await orderPrefill(option.value.id)
    if (prefill) setDraft((prev) => (prev ? { ...prev, itemTitle: prev.itemTitle || prefill.itemTitle, productId: prev.productId ?? prefill.productId, standard: prev.standard || prefill.standard, lots: prev.lots.length ? prev.lots : prefill.lots } : prev))
  }

  const copyPrevious = async () => {
    if (!draft) return
    const params = new URLSearchParams({ last: 'true' })
    if (draft.customer?.name) params.set('customerName', draft.customer.name)
    if (draft.itemTitle) params.set('itemTitle', draft.itemTitle)
    if (!draft.customer?.name && !draft.itemTitle) {
      flash(t('cc_production.lab.copyNeeds', 'Pick the customer or the item first.'), 'info')
      return
    }
    const call = await apiCall<{ item: LabTest | null }>(`/api/cc_production/lab?${params.toString()}`)
    const last = call.ok ? call.result?.item : null
    if (!last) {
      flash(t('cc_production.lab.noLast', 'No earlier test for this item and customer.'), 'info')
      return
    }
    patch({ testType: last.testType, standard: last.standard ?? '', itemTitle: draft.itemTitle || (last.itemTitle ?? ''), notes: draft.notes || (last.notes ?? '') })
    flash(t('cc_production.lab.copied', 'Copied from the test of {date}.', { date: last.testDate }), 'success')
  }

  const removeExisting = async (file: LabReportFile) => {
    const call = await runMutation({ context: {}, mutationPayload: { id: file.id }, operation: () => apiCall(`/api/attachments?id=${encodeURIComponent(file.id)}`, { method: 'DELETE' }) })
    if (!call.ok) {
      flash(t('cc_production.lab.removeFailed', 'Could not remove the file.'), 'error')
      return
    }
    setExisting((prev) => prev.filter((entry) => entry.id !== file.id))
  }

  const save = async () => {
    if (!draft || saving) return
    const next: Record<string, string> = {}
    if (!draft.testDate) next.testDate = t('cc_production.lab.dateRequired', 'Enter the test date')
    if (!draft.testType) next.testType = t('cc_production.lab.typeRequired', 'Pick the test type')
    if (!draft.lots.length && !draft.itemTitle.trim() && !draft.order) next.lots = t('cc_production.lab.lotRequired', 'Pick the lot or write the item that was tested')
    setErrors(next)
    if (Object.keys(next).length) {
      flash(t('cc_production.lab.fix', 'Some fields need fixing.'), 'error')
      return
    }
    if (draft.result !== 'pending' && !queued.length && !existing.length) {
      flash(t('cc_production.lab.noFile', 'Saved without a report file. Attach the report when you have it.'), 'warning')
    }
    setSaving(true)
    const body = {
      ...(test ? { id: test.id } : {}),
      testPoint: draft.testPoint,
      testDate: draft.testDate,
      testedBy: draft.testedBy || null,
      reportNo: draft.reportNo || null,
      testType: draft.testType,
      standard: draft.standard || null,
      result: draft.result,
      orderId: draft.order?.id ?? null,
      customerId: draft.customer?.id || null,
      customerName: draft.customer?.name || null,
      productId: draft.productId,
      itemTitle: draft.itemTitle || null,
      lotRefs: draft.lots.join(', ') || null,
      notes: draft.notes || null,
    }
    try {
      const call = await runMutation({
        context: { testId: test?.id ?? null },
        mutationPayload: body,
        operation: () => {
          const request = () => apiCall<LabTest & { error?: string }>('/api/cc_production/lab', { method: test ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          return test ? withScopedApiRequestHeaders(buildOptimisticLockHeader(test.updatedAt), request) : request()
        },
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.status === 409 ? t('cc_production.lab.conflict', 'Someone else changed this test. Reload to see the latest.') : (call.result?.error ?? t('cc_production.lab.saveError', 'Could not save the lab test.')), 'error')
        return
      }
      const failed = queued.length ? await uploadReports(call.result.id, queued) : []
      if (failed.length) flash(t('cc_production.lab.uploadFailed', 'Saved, but these files did not upload: {files}', { files: failed.join(', ') }), 'warning')
      else flash(test ? t('cc_production.lab.saved', 'Lab test saved') : t('cc_production.lab.created', 'Lab test recorded'), 'success')
      router.push(`/backend/quality/lab/${call.result.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <Page><PageBody><ErrorMessage label={loadError} /></PageBody></Page>
  if (!draft) return <Page><PageBody><LoadingMessage label={t('cc_production.lab.loading', 'Loading…')} /></PageBody></Page>

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto max-w-5xl space-y-5 pb-28"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape') router.push(backHref)
          }}
        >
          <div className="flex items-start gap-3">
            <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0" aria-label={t('common.back', 'Back')}>
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('cc_production.lab.entity', 'Lab test report')}</p>
              <h1 className="text-xl font-semibold sm:text-2xl">{test ? t('cc_production.lab.editTitle', 'Edit lab test') : t('cc_production.lab.newTitle', 'New lab test')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('cc_production.lab.formLede', 'Record that the test was done and attach the report. No readings are typed in; the report file is the record.')}</p>
            </div>
          </div>

          {draft.order ? (
            <Notice compact>
              {t('cc_production.lab.forOrderNotice', 'For order {no} · {customer}. A passed test ticks "Customer tests done" on its QC stage.', { no: draft.order.orderNo, customer: draft.order.customerName })}
            </Notice>
          ) : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
            <div className="space-y-5 lg:col-span-3">
              <Section step={1} title={t('cc_production.lab.whatTested', 'What was tested')} hint={t('cc_production.lab.whatHint', 'Testing happens when raw material comes in and when finished goods go out.')}>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('cc_production.lab.point', 'Testing point')}>
                  {([
                    { value: 'incoming', label: t('cc_production.lab.incoming', 'Raw material in'), hint: t('cc_production.lab.incomingHint', 'Chemicals, reinforcement, chindi'), icon: Truck },
                    { value: 'outgoing', label: t('cc_production.lab.outgoing', 'Finished goods out'), hint: t('cc_production.lab.outgoingHint', 'Sheets, tubes, rods, moulded'), icon: FlaskConical },
                  ] as const).map((option) => {
                    const active = draft.testPoint === option.value
                    const Icon = option.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => patch({ testPoint: option.value, lots: draft.testPoint === option.value ? draft.lots : [] })}
                        className={cn('flex items-start gap-3 rounded-lg border p-3 text-left transition-colors', active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50')}
                      >
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                        <span>
                          <span className="block text-sm font-medium">{option.label}</span>
                          <span className="block text-xs text-muted-foreground">{option.hint}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <Field label={t('cc_production.lab.lots', 'Lot(s)')} required={!draft.itemTitle && !draft.order}>
                  <LotPicker
                    testPoint={draft.testPoint}
                    lots={draft.lots}
                    onChange={(lots, picked) => patch({ lots, ...(picked && !draft.itemTitle ? { itemTitle: picked.title, productId: picked.productId } : {}) })}
                  />
                  {errors.lots ? <p className="text-xs text-status-error-text">{errors.lots}</p> : null}
                </Field>
                <Field label={t('cc_production.lab.item', 'Item')} htmlFor="lab-item">
                  <Input id="lab-item" value={draft.itemTitle} onChange={(event) => patch({ itemTitle: event.target.value })} placeholder={t('cc_production.lab.itemHint', 'Filled from the lot; change if needed')} />
                </Field>
              </Section>

              <Section step={2} title={t('cc_production.lab.theTest', 'The test')}>
                <Field label={t('cc_production.lab.type', 'Test type')} required>
                  <ChoiceChips options={testTypes} value={draft.testType} onChange={(value) => patch({ testType: value })} ariaLabel={t('cc_production.lab.type', 'Test type')} />
                  {errors.testType ? <p className="text-xs text-status-error-text">{errors.testType}</p> : null}
                </Field>
                <Field label={t('cc_production.lab.standard', 'Standard')}>
                  <ChoiceChips options={standards} value={draft.standard} onChange={(value) => patch({ standard: value })} ariaLabel={t('cc_production.lab.standard', 'Standard')} />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label={t('cc_production.lab.testedOn', 'Tested on')} required htmlFor="lab-date">
                    <Input id="lab-date" type="date" value={draft.testDate} onChange={(event) => patch({ testDate: event.target.value })} />
                    {errors.testDate ? <p className="text-xs text-status-error-text">{errors.testDate}</p> : null}
                  </Field>
                  <Field label={t('cc_production.lab.testedBy', 'Tested by')} htmlFor="lab-by">
                    <Input id="lab-by" value={draft.testedBy} onChange={(event) => patch({ testedBy: event.target.value })} placeholder={t('cc_production.lab.testedByHint', 'You, if blank')} />
                  </Field>
                  <Field label={t('cc_production.lab.reportNo', 'Report no.')} htmlFor="lab-report">
                    <Input id="lab-report" value={draft.reportNo} onChange={(event) => patch({ reportNo: event.target.value })} placeholder="LR/2627/014" />
                  </Field>
                </div>
              </Section>

              <Section step={3} title={t('cc_production.lab.reportFile', 'Lab test report')} hint={t('cc_production.lab.reportFileHint', 'The actual report from the lab: PDF, scan or phone photo.')}>
                <ReportUpload queued={queued} setQueued={setQueued} existing={existing} onRemoveExisting={(file) => void removeExisting(file)} />
              </Section>
            </div>

            <div className="space-y-5 lg:col-span-2">
              <Section step={4} title={t('cc_production.lab.result', 'Result')}>
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-1" role="radiogroup" aria-label={t('cc_production.lab.result', 'Result')}>
                  {RESULTS.map((option) => {
                    const active = draft.result === option.value
                    const Icon = option.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => patch({ result: option.value })}
                        className={cn('flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors lg:flex-row lg:gap-3 lg:text-left', active ? option.tone : 'hover:bg-muted/50')}
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span>
                          <span className="block text-sm font-semibold">{t(`cc_production.lab.${option.value}`, option.label)}</span>
                          <span className="hidden text-xs opacity-80 lg:block">{t(`cc_production.lab.${option.value}Hint`, option.hint)}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </Section>

              <Section step={5} title={t('cc_production.lab.forWhom', 'For whom')} hint={t('cc_production.lab.forWhomHint', 'Optional. Leave both empty for a routine test.')}>
                <Field label={t('cc_production.lab.order', 'Order')} hint={t('cc_production.lab.orderHint', 'A passed test for an order ticks "Customer tests done" on its QC stage.')}>
                  <SearchPicker
                    value={draft.order ? { id: draft.order.id, primary: draft.order.orderNo, secondary: draft.order.customerName, value: draft.order } : null}
                    placeholder={t('cc_production.lab.orderPick', 'Not for an order')}
                    searchPlaceholder={t('cc_production.lab.orderSearch', 'Order no. or customer')}
                    load={searchOrders}
                    onSelect={(option) => void pickOrder(option)}
                  />
                  {draft.order ? (
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => patch({ order: null })}>
                      {t('cc_production.lab.orderClear', 'Not for an order')}
                    </button>
                  ) : null}
                </Field>
                <Field label={t('cc_production.moulding.customer', 'Customer')}>
                  <SearchPicker
                    value={draft.customer ? { id: draft.customer.id ?? draft.customer.name, primary: draft.customer.name, value: draft.customer } : null}
                    placeholder={t('cc_production.lab.customerPick', 'No particular customer')}
                    searchPlaceholder={t('cc_orders.form.customerSearch', 'Type a customer name')}
                    load={async (query) => (await searchCustomers(query)).map((option) => ({ ...option, value: { id: option.id as string | null, name: option.primary } }))}
                    onSelect={(option) => patch({ customer: option.value })}
                    disabled={Boolean(draft.order)}
                  />
                  {draft.customer && !draft.order ? (
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => patch({ customer: null })}>
                      {t('cc_production.lab.customerClear', 'No particular customer')}
                    </button>
                  ) : null}
                </Field>
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void copyPrevious()}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t('cc_production.lab.copyPrevious', 'Copy previous test for this item & customer')}
                </Button>
              </Section>

              <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
                <Field label={t('cc_production.resin.notes', 'Remarks')} htmlFor="lab-notes">
                  <Textarea id="lab-notes" rows={4} value={draft.notes} onChange={(event) => patch({ notes: event.target.value })} />
                </Field>
              </section>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:sticky lg:-mx-0 lg:rounded-xl lg:border">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
              <p className="hidden text-xs text-muted-foreground sm:block">{t('cc_production.lab.keys', 'Ctrl/⌘ + Enter saves · Esc goes back')}</p>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button asChild type="button" variant="outline" className="flex-1 sm:flex-none">
                  <Link href={backHref}>{t('common.cancel', 'Cancel')}</Link>
                </Button>
                <Button type="submit" className="flex-1 sm:flex-none" disabled={saving}>
                  {saving ? t('cc_production.lab.saving', 'Saving…') : t('cc_production.lab.save', 'Save lab test')}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}
