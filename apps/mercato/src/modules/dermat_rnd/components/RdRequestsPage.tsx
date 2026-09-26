"use client"

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronRight, FlaskConical, Plus, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../dermat_departments/components/useGranted'
import { SearchPicker, type PickerOption } from '../../dermat_orders/components/SearchPicker'
import { searchCustomers } from '../../dermat_orders/components/loaders'
import type { Customer } from '../../dermat_orders/components/types'

type Status = 'requested' | 'in_progress' | 'sample_sent' | 'changes' | 'approved' | 'dropped'
type Round = { round: number; madeOn: string | null; sentOn: string | null; sentVia: string | null; feedback: string | null; feedbackOn: string | null; result: 'approved' | 'changes' | null; by: string | null }
type Request = {
  id: string
  code: string
  kind: 'client' | 'npd'
  status: Status
  customerId: string | null
  customerName: string | null
  orderId: string | null
  orderNo: string | null
  productName: string
  brand: string | null
  productType: string | null
  ingredients: string | null
  texture: string | null
  fragrance: string | null
  colour: string | null
  packSize: string | null
  notes: string | null
  dueDate: string | null
  assignedName: string | null
  requestedByName: string | null
  rounds: Round[]
  lastSentOn: string | null
  updatedAt: string
  createdAt: string
}
type View = 'open' | 'samples' | 'approved' | 'closed' | 'all'
type Form = { kind: 'client' | 'npd'; customer: PickerOption<Customer> | null; orderId: string | null; productName: string; brand: string; productType: string; ingredients: string; texture: string; fragrance: string; colour: string; packSize: string; dueDate: string; notes: string }

const STATUS: Record<Status, { label: string; variant: StatusBadgeVariant }> = {
  requested: { label: 'New request', variant: 'warning' },
  in_progress: { label: 'R&D working', variant: 'info' },
  sample_sent: { label: 'Sample with client', variant: 'info' },
  changes: { label: 'Client wants changes', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  dropped: { label: 'Dropped', variant: 'neutral' },
}

const EMPTY: Form = { kind: 'client', customer: null, orderId: null, productName: '', brand: '', productType: '', ingredients: '', texture: '', fragrance: '', colour: '', packSize: '', dueDate: '', notes: '' }

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

type ActionState = { request: Request; action: 'sample_sent' | 'feedback' | 'drop' } | null

export function RdRequestsPage({ defaultView = 'open', title }: { defaultView?: View; title?: string }) {
  const t = useT()
  const params = useSearchParams()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-rnd-requests' })
  const [view, setView] = React.useState<View>(defaultView)
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<Request[] | null>(null)
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const [form, setForm] = React.useState<Form | null>(null)
  const [editing, setEditing] = React.useState<Request | null>(null)
  const [action, setAction] = React.useState<ActionState>(null)
  const [actionForm, setActionForm] = React.useState({ sentOn: '', sentVia: '', result: 'approved' as 'approved' | 'changes', text: '' })
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const query = new URLSearchParams({ view })
    if (search.trim()) query.set('search', search.trim())
    const call = await apiCall<{ items?: Request[]; counts?: Record<string, number>; error?: string }>(`/api/dermat_rnd/requests?${query.toString()}`)
    if (!call.ok) {
      setError(call.result?.error ?? t('dermat_rnd.loadError', 'Could not load R&D requests.'))
      return
    }
    setError(null)
    setItems(call.result?.items ?? [])
    setCounts(call.result?.counts ?? {})
  }, [view, search, t])

  React.useEffect(() => {
    const handle = window.setTimeout(() => void load(), search ? 250 : 0)
    return () => window.clearTimeout(handle)
  }, [load, search])

  React.useEffect(() => {
    const orderId = params?.get('orderId')
    if (params?.get('new') && orderId) setForm({ ...EMPTY, orderId, productName: params.get('product') ?? '' })
  }, [params])

  const send = async (url: string, method: 'POST' | 'PUT', body: Record<string, unknown>, version: string | null, success: string) => {
    setBusy(true)
    try {
      const request = () => apiCall<Request & { error?: string }>(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({ context: { resourceKind: 'dermat_rnd.request', resourceId: String(body.id ?? 'new') }, mutationPayload: body, operation: () => (version ? withScopedApiRequestHeaders(buildOptimisticLockHeader(version), request) : request()) })
      if (!call.ok) {
        flash(call.result?.error ?? t('dermat_rnd.saveError', 'Could not save.'), 'error')
        return false
      }
      flash(success.replace('{code}', call.result?.code ?? ''), 'success')
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  const saveForm = async () => {
    if (!form) return
    if (!form.productName.trim()) return flash(t('dermat_rnd.nameNeeded', 'Name the product'), 'error')
    if (form.kind === 'client' && !form.customer && !form.orderId) return flash(t('dermat_rnd.clientNeeded', 'Pick the client, or choose New product'), 'error')
    const body = {
      ...(editing ? { id: editing.id } : {}),
      kind: form.kind,
      customerId: form.customer?.id ?? null,
      orderId: form.orderId,
      productName: form.productName,
      brand: form.brand,
      productType: form.productType,
      ingredients: form.ingredients,
      texture: form.texture,
      fragrance: form.fragrance,
      colour: form.colour,
      packSize: form.packSize,
      dueDate: form.dueDate || null,
      notes: form.notes,
    }
    const ok = await send('/api/dermat_rnd/requests', editing ? 'PUT' : 'POST', body, editing?.updatedAt ?? null, editing ? t('dermat_rnd.saved', '{code} saved') : t('dermat_rnd.created', 'R&D request {code} raised'))
    if (ok) {
      setForm(null)
      setEditing(null)
    }
  }

  const runAction = async (request: Request, name: string, extra: Record<string, unknown> = {}) =>
    send('/api/dermat_rnd/requests/action', 'POST', { id: request.id, action: name, ...extra }, request.updatedAt, t('dermat_rnd.updated', '{code} updated'))

  const submitAction = async () => {
    if (!action) return
    const extra = action.action === 'sample_sent' ? { sentOn: actionForm.sentOn || null, sentVia: actionForm.sentVia } : action.action === 'feedback' ? { result: actionForm.result, feedback: actionForm.text } : { note: actionForm.text }
    const ok = await runAction(action.request, action.action, extra)
    if (ok) setAction(null)
  }

  const text = (key: keyof Form, label: string, placeholder?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`rd-${key}`}>{label}</Label>
      <Input id={`rd-${key}`} value={(form?.[key] as string) ?? ''} placeholder={placeholder} onChange={(event) => setForm((prev) => (prev ? { ...prev, [key]: event.target.value } : prev))} />
    </div>
  )

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{title ?? t('dermat_rnd.title', 'R&D requests')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_rnd.lede', 'Every R&D request with its R&D number: for a client (with or without an order) or a new product of our own. Each sample sent and the client feedback are kept round by round.')}</p>
            </div>
            {granted.has('dermat_rnd.request') ? (
              <Button
                type="button"
                onClick={() => {
                  setEditing(null)
                  setForm({ ...EMPTY })
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('dermat_rnd.new', 'New R&D request')}
              </Button>
            ) : null}
          </header>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SegmentedControl value={view} onValueChange={(value) => setView(value as View)} aria-label={t('dermat_rnd.show', 'Show')}>
              <SegmentedControlItem value="open">{t('dermat_rnd.open', 'Open ({count})', { count: (counts.requested ?? 0) + (counts.in_progress ?? 0) + (counts.changes ?? 0) })}</SegmentedControlItem>
              <SegmentedControlItem value="samples">{t('dermat_rnd.samples', 'Samples with clients ({count})', { count: counts.sample_sent ?? 0 })}</SegmentedControlItem>
              <SegmentedControlItem value="approved">{t('dermat_rnd.approved', 'Approved')}</SegmentedControlItem>
              <SegmentedControlItem value="closed">{t('dermat_rnd.dropped', 'Dropped')}</SegmentedControlItem>
              <SegmentedControlItem value="all">{t('dermat_rnd.all', 'All')}</SegmentedControlItem>
            </SegmentedControl>
            <div className="relative lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_rnd.search', 'R&D no., product, client, brand, order')} className="pl-9" aria-label={t('dermat_rnd.search', 'R&D no., product, client, brand, order')} />
            </div>
          </div>

          {error ? <ErrorMessage label={error} /> : null}
          {!items && !error ? <LoadingMessage label={t('dermat_rnd.loading', 'Loading…')} /> : null}
          {items && !items.length ? <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{t('dermat_rnd.empty', 'No R&D requests here.')}</p> : null}
          {items?.length ? (
            <ul className="divide-y rounded-lg border bg-card">
              {items.map((request) => {
                const expanded = open.has(request.id)
                return (
                  <li key={request.id}>
                    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        className="flex min-w-0 items-start gap-2 text-left"
                        aria-expanded={expanded}
                        onClick={() =>
                          setOpen((prev) => {
                            const next = new Set(prev)
                            if (next.has(request.id)) next.delete(request.id)
                            else next.add(request.id)
                            return next
                          })
                        }
                      >
                        {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-semibold">{request.code}</span>
                            <StatusBadge variant={STATUS[request.status].variant}>{STATUS[request.status].label}</StatusBadge>
                            {request.kind === 'npd' ? <StatusBadge variant="neutral">{t('dermat_rnd.npd', 'New product')}</StatusBadge> : null}
                          </span>
                          <span className="block font-medium">{[request.productName, request.brand].filter(Boolean).join(' · ')}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[request.customerName, request.orderNo, request.assignedName ? t('dermat_rnd.with', 'with {name}', { name: request.assignedName }) : null, request.dueDate ? t('dermat_rnd.due', 'due {date}', { date: day(request.dueDate) }) : null, t('dermat_rnd.rounds', '{count} sample(s)', { count: request.rounds.length })].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {granted.has('dermat_rnd.manage') && (request.status === 'requested' || request.status === 'changes') ? (
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void runAction(request, 'start')}>
                            {t('dermat_rnd.start', 'Start work')}
                          </Button>
                        ) : null}
                        {granted.has('dermat_rnd.manage') && ['requested', 'in_progress', 'changes'].includes(request.status) ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setActionForm({ sentOn: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), sentVia: '', result: 'approved', text: '' })
                              setAction({ request, action: 'sample_sent' })
                            }}
                          >
                            <FlaskConical className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('dermat_rnd.sent', 'Sample sent')}
                          </Button>
                        ) : null}
                        {granted.has('dermat_rnd.request') && request.status === 'sample_sent' ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setActionForm({ sentOn: '', sentVia: '', result: 'approved', text: '' })
                              setAction({ request, action: 'feedback' })
                            }}
                          >
                            {t('dermat_rnd.feedback', 'Client feedback')}
                          </Button>
                        ) : null}
                        {request.orderId ? (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/backend/orders/${request.orderId}?stage=sampling`}>{request.orderNo}</Link>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {expanded ? (
                      <div className="grid grid-cols-1 gap-4 border-t bg-muted/10 px-4 py-3 text-sm lg:grid-cols-2">
                        <dl className="grid grid-cols-3 gap-x-3 gap-y-1">
                          {[
                            [t('dermat_rnd.type', 'Type'), request.productType],
                            [t('dermat_rnd.ingredients', 'Ingredients / actives'), request.ingredients],
                            [t('dermat_rnd.texture', 'Texture'), request.texture],
                            [t('dermat_rnd.fragrance', 'Fragrance'), request.fragrance],
                            [t('dermat_rnd.colour', 'Colour'), request.colour],
                            [t('dermat_rnd.pack', 'Pack size'), request.packSize],
                            [t('dermat_rnd.notes', 'Notes'), request.notes],
                            [t('dermat_rnd.by', 'Raised by'), request.requestedByName],
                          ].map(([label, value]) => (
                            <React.Fragment key={label}>
                              <dt className="text-xs text-muted-foreground">{label}</dt>
                              <dd className="col-span-2 whitespace-pre-line">{value || '—'}</dd>
                            </React.Fragment>
                          ))}
                        </dl>
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('dermat_rnd.history', 'Samples')}</p>
                          {request.rounds.length ? (
                            <ol className="space-y-1.5">
                              {request.rounds.map((round) => (
                                <li key={round.round} className="rounded-md border bg-card px-3 py-2">
                                  <p className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-semibold">{t('dermat_rnd.round', 'Round {n}', { n: round.round })}</span>
                                    <span className="text-muted-foreground">{t('dermat_rnd.sentOn', 'sent {date}', { date: day(round.sentOn) })}{round.sentVia ? ` · ${round.sentVia}` : ''}</span>
                                    {round.result ? <StatusBadge variant={round.result === 'approved' ? 'success' : 'warning'}>{round.result === 'approved' ? t('dermat_rnd.ok', 'Approved') : t('dermat_rnd.changes', 'Changes')}</StatusBadge> : <span className="text-status-warning-text">{t('dermat_rnd.waiting', 'waiting for feedback')}</span>}
                                  </p>
                                  {round.feedback ? <p className="text-xs">{round.feedback}</p> : null}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="text-xs text-muted-foreground">{t('dermat_rnd.noSamples', 'No sample sent yet.')}</p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {granted.has('dermat_rnd.request') && request.status !== 'dropped' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditing(request)
                                  setForm({
                                    kind: request.kind,
                                    customer: request.customerId ? { id: request.customerId, primary: request.customerName ?? '', value: { id: request.customerId, name: request.customerName ?? '' } as Customer } : null,
                                    orderId: request.orderId,
                                    productName: request.productName,
                                    brand: request.brand ?? '',
                                    productType: request.productType ?? '',
                                    ingredients: request.ingredients ?? '',
                                    texture: request.texture ?? '',
                                    fragrance: request.fragrance ?? '',
                                    colour: request.colour ?? '',
                                    packSize: request.packSize ?? '',
                                    dueDate: request.dueDate ?? '',
                                    notes: request.notes ?? '',
                                  })
                                }}
                              >
                                {t('dermat_rnd.edit', 'Edit')}
                              </Button>
                            ) : null}
                            {granted.has('dermat_rnd.manage') && request.status !== 'approved' && request.status !== 'dropped' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setActionForm({ sentOn: '', sentVia: '', result: 'approved', text: '' })
                                  setAction({ request, action: 'drop' })
                                }}
                              >
                                {t('dermat_rnd.drop', 'Drop')}
                              </Button>
                            ) : null}
                            {granted.has('dermat_rnd.manage') && request.status === 'dropped' ? (
                              <Button type="button" size="sm" variant="outline" onClick={() => void runAction(request, 'reopen')}>
                                {t('dermat_rnd.reopen', 'Reopen')}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>

        <Dialog open={Boolean(form)} onOpenChange={(value) => (value ? undefined : setForm(null))}>
          <DialogContent
            className="max-h-screen overflow-y-auto sm:max-w-2xl"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void saveForm()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing ? t('dermat_rnd.editTitle', 'Edit {code}', { code: editing.code }) : t('dermat_rnd.newTitle', 'New R&D request')}</DialogTitle>
              <DialogDescription>{t('dermat_rnd.newHint', 'The R&D number is given when you save. A request from an order fills that order\'s R&D number.')}</DialogDescription>
            </DialogHeader>
            {form ? (
              <div className="space-y-4">
                <div className="flex gap-4 text-sm" role="radiogroup" aria-label={t('dermat_rnd.kind', 'For')}>
                  {(['client', 'npd'] as const).map((kind) => (
                    <label key={kind} className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name="rd-kind" className="h-4 w-4" checked={form.kind === kind} onChange={() => setForm({ ...form, kind })} />
                      {kind === 'client' ? t('dermat_rnd.forClient', 'For a client') : t('dermat_rnd.forNpd', 'New product of our own (NPD)')}
                    </label>
                  ))}
                </div>
                {form.kind === 'client' && !form.orderId ? (
                  <div className="space-y-1">
                    <Label>{t('dermat_rnd.client', 'Client *')}</Label>
                    <SearchPicker value={form.customer} placeholder={t('dermat_rnd.pickClient', 'Pick the client')} searchPlaceholder={t('dermat_rnd.searchClient', 'Search clients')} load={searchCustomers} onSelect={(option) => setForm({ ...form, customer: option })} />
                  </div>
                ) : null}
                {form.orderId ? <p className="text-sm text-muted-foreground">{t('dermat_rnd.fromOrder', 'Linked to the order you came from.')}</p> : null}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {text('productName', t('dermat_rnd.product', 'Product name *'), 'e.g. Vitamin C face serum')}
                  {text('brand', t('dermat_rnd.brand', 'Brand'))}
                  {text('productType', t('dermat_rnd.type', 'Type'), 'Serum, cream, gel, shampoo…')}
                  {text('packSize', t('dermat_rnd.pack', 'Pack size'), '30 ml')}
                  {text('texture', t('dermat_rnd.texture', 'Texture'))}
                  {text('fragrance', t('dermat_rnd.fragrance', 'Fragrance'))}
                  {text('colour', t('dermat_rnd.colour', 'Colour'))}
                  <div className="space-y-1">
                    <Label htmlFor="rd-due">{t('dermat_rnd.dueDate', 'Sample needed by')}</Label>
                    <Input id="rd-due" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rd-ingredients">{t('dermat_rnd.ingredients', 'Ingredients / actives wanted')}</Label>
                  <Textarea id="rd-ingredients" rows={2} value={form.ingredients} onChange={(event) => setForm({ ...form, ingredients: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rd-notes">{t('dermat_rnd.notes', 'Notes')}</Label>
                  <Textarea id="rd-notes" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" onClick={() => void saveForm()} disabled={busy}>
                {editing ? t('dermat_rnd.save', 'Save') : t('dermat_rnd.raise', 'Raise request')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(action)} onOpenChange={(value) => (value ? undefined : setAction(null))}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submitAction()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {action?.action === 'sample_sent' ? t('dermat_rnd.sentTitle', 'Sample sent for {code}', { code: action.request.code }) : action?.action === 'feedback' ? t('dermat_rnd.feedbackTitle', 'Client feedback on {code}', { code: action.request.code }) : t('dermat_rnd.dropTitle', 'Drop {code}?', { code: action?.request.code ?? '' })}
              </DialogTitle>
              <DialogDescription>{action?.action === 'feedback' ? t('dermat_rnd.feedbackHint', 'Approved closes the request. Changes send it back to R&D for the next round.') : ''}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {action?.action === 'sample_sent' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="rd-sent-on">{t('dermat_rnd.sentOnLabel', 'Sent on')}</Label>
                    <Input id="rd-sent-on" type="date" value={actionForm.sentOn} onChange={(event) => setActionForm({ ...actionForm, sentOn: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rd-sent-via">{t('dermat_rnd.via', 'Sent via')}</Label>
                    <Input id="rd-sent-via" value={actionForm.sentVia} placeholder={t('dermat_rnd.viaPlaceholder', 'Courier / hand delivery, docket no.')} onChange={(event) => setActionForm({ ...actionForm, sentVia: event.target.value })} />
                  </div>
                </div>
              ) : null}
              {action?.action === 'feedback' ? (
                <div className="flex gap-4 text-sm" role="radiogroup" aria-label={t('dermat_rnd.result', 'Result')}>
                  {(['approved', 'changes'] as const).map((result) => (
                    <label key={result} className={cn('flex cursor-pointer items-center gap-2', actionForm.result === result && 'font-medium')}>
                      <input type="radio" name="rd-result" className="h-4 w-4" checked={actionForm.result === result} onChange={() => setActionForm({ ...actionForm, result })} />
                      {result === 'approved' ? t('dermat_rnd.approvedOpt', 'Client approved') : t('dermat_rnd.changesOpt', 'Client wants changes')}
                    </label>
                  ))}
                </div>
              ) : null}
              {action?.action !== 'sample_sent' ? (
                <div className="space-y-1">
                  <Label htmlFor="rd-action-text">{action?.action === 'feedback' ? t('dermat_rnd.whatSaid', 'What the client said') : t('dermat_rnd.why', 'Why *')}</Label>
                  <Textarea id="rd-action-text" rows={3} value={actionForm.text} onChange={(event) => setActionForm({ ...actionForm, text: event.target.value })} />
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAction(null)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant={action?.action === 'drop' ? 'destructive' : 'default'} onClick={() => void submitAction()} disabled={busy}>
                {t('dermat_rnd.confirm', 'Save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default RdRequestsPage
