"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
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
import { day, qty } from './shared'

type IndentStatus = 'submitted' | 'approved' | 'rejected' | 'ordered' | 'cancelled'
type Indent = {
  id: string
  code: string
  status: IndentStatus
  source: string
  department: string | null
  neededBy: string | null
  notes: string | null
  orderRefs: Array<{ orderId: string; orderNo: string }>
  requestedByName: string | null
  approvedByName: string | null
  decisionNote: string | null
  poRefs: Array<{ poId: string; code: string }>
  createdAt: string
  updatedAt: string
  lines: Array<{ productId: string; quantity: number; unit: string | null; note: string | null; title: string; code: string | null }>
}
type View = 'to_approve' | 'approved' | 'ordered' | 'closed' | 'all'
type ProductOption = { id: string; title: string; code: string | null; unit: string | null }
type DraftLine = { key: number; product: ProductOption | null; quantity: string; note: string }

const STATUS: Record<IndentStatus, { label: string; variant: StatusBadgeVariant }> = {
  submitted: { label: 'Waiting for approval', variant: 'warning' },
  approved: { label: 'Approved, to order', variant: 'info' },
  ordered: { label: 'PO raised', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

const SOURCE: Record<string, string> = { department: 'Department', planning: 'Planning shortage', low_stock: 'Low stock' }

let lineKey = 0

function NewIndentDialog({ open, onOpenChange, onCreated, prefill }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void; prefill: { lines: Array<{ productId: string; quantity: number }>; orderRefs: Array<{ orderId: string; orderNo: string }>; source: string } | null }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-indent-new' })
  const [department, setDepartment] = React.useState('')
  const [neededBy, setNeededBy] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [lines, setLines] = React.useState<DraftLine[]>([])
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState<ProductOption[]>([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setDepartment(prefill?.source === 'planning' ? 'Planning' : '')
    setNeededBy('')
    setNotes('')
    setSearch('')
    setOptions([])
    if (prefill?.lines.length) {
      apiCall<{ items?: ProductOption[] }>(`/api/dermat_products/search?kinds=raw_material,packing_material&limit=100&ids=${prefill.lines.map((line) => line.productId).join(',')}`, undefined, { fallback: { items: [] } }).then((call) => {
        const found = call.result?.items ?? []
        setLines(
          prefill.lines
            .map((line) => {
              lineKey += 1
              return { key: lineKey, product: found.find((item) => item.id === line.productId) ?? null, quantity: String(Math.ceil(line.quantity * 1000) / 1000), note: '' }
            })
            .filter((line) => line.product),
        )
      })
    } else setLines([])
  }, [open, prefill])

  React.useEffect(() => {
    if (!search.trim()) {
      setOptions([])
      return
    }
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items?: ProductOption[] }>(`/api/dermat_products/search?kinds=raw_material,packing_material&q=${encodeURIComponent(search.trim())}&limit=20`, undefined, { fallback: { items: [] } })
      setOptions(call.result?.items ?? [])
    }, 200)
    return () => window.clearTimeout(handle)
  }, [search])

  const add = (product: ProductOption) => {
    if (lines.some((line) => line.product?.id === product.id)) return
    lineKey += 1
    setLines((prev) => [...prev, { key: lineKey, product, quantity: '', note: '' }])
    setSearch('')
    setOptions([])
  }

  const save = async () => {
    const valid = lines.filter((line) => line.product && Number(line.quantity) > 0)
    if (!valid.length) return flash(t('dermat_purchase.indent.noLines', 'Add at least one material with a quantity'), 'error')
    const body = {
      department: department.trim() || null,
      source: prefill?.source ?? 'department',
      neededBy: neededBy || null,
      notes: notes.trim() || null,
      orderRefs: prefill?.orderRefs ?? [],
      lines: valid.map((line) => ({ productId: line.product!.id, quantity: Number(line.quantity), note: line.note.trim() || null })),
    }
    setSaving(true)
    try {
      const call = await runMutation({
        context: { resourceKind: 'dermat_purchase.indent', resourceId: 'new' },
        mutationPayload: body,
        operation: () => apiCall<{ code?: string; error?: string }>('/api/dermat_purchase/indents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('dermat_purchase.indent.saveError', 'Could not raise the indent.'), 'error')
        return
      }
      flash(t('dermat_purchase.indent.created', 'Indent {code} raised. Approvers have been told.', { code: call.result?.code ?? '' }), 'success')
      onOpenChange(false)
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('dermat_purchase.indent.newTitle', 'Raise a purchase indent')}</DialogTitle>
          <DialogDescription>{t('dermat_purchase.indent.newHint', 'Ask Purchase to buy material. An approver checks it, then Purchase raises the PO.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="indent-dept">{t('dermat_purchase.indent.department', 'For department')}</Label>
              <Input id="indent-dept" value={department} onChange={(event) => setDepartment(event.target.value)} placeholder={t('dermat_purchase.indent.deptPlaceholder', 'e.g. Production, R&D, Maintenance')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="indent-needed">{t('dermat_purchase.indent.neededBy', 'Needed by')}</Label>
              <Input id="indent-needed" type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="indent-search">{t('dermat_purchase.indent.materials', 'Materials *')}</Label>
            <Input id="indent-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_purchase.indent.search', 'Add material: search by code or name')} />
            {options.length ? (
              <ul className="max-h-40 overflow-auto rounded-md border">
                {options.map((option) => (
                  <li key={option.id}>
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => add(option)}>
                      <span className="font-mono text-xs text-muted-foreground">{option.code}</span>
                      <span className="truncate">{option.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {lines.length ? (
              <ul className="divide-y rounded-md border">
                {lines.map((line) => (
                  <li key={line.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{line.product?.code}</span>
                      {line.product?.title}
                    </span>
                    <Input className="w-28 text-right" type="number" min="0" step="any" value={line.quantity} aria-label={t('dermat_purchase.indent.qty', 'Quantity')} onChange={(event) => setLines((prev) => prev.map((entry) => (entry.key === line.key ? { ...entry, quantity: event.target.value } : entry)))} />
                    <span className="w-10 text-xs text-muted-foreground">{line.product?.unit}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label={t('dermat_purchase.indent.remove', 'Remove')} onClick={() => setLines((prev) => prev.filter((entry) => entry.key !== line.key))}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="indent-notes">{t('dermat_purchase.indent.notes', 'Why / notes')}</Label>
            <Textarea id="indent-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? t('dermat_purchase.indent.saving', 'Raising…') : t('dermat_purchase.indent.raise', 'Raise indent')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function IndentsPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-indents' })
  const [view, setView] = React.useState<View>('all')
  const [items, setItems] = React.useState<Indent[] | null>(null)
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [newOpen, setNewOpen] = React.useState(false)
  const [prefill, setPrefill] = React.useState<{ lines: Array<{ productId: string; quantity: number }>; orderRefs: Array<{ orderId: string; orderNo: string }>; source: string } | null>(null)
  const [decision, setDecision] = React.useState<{ indent: Indent; action: 'approve' | 'reject' | 'cancel' } | null>(null)
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const focusId = params?.get('id') ?? null

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items?: Indent[]; counts?: Record<string, number>; error?: string }>(`/api/dermat_purchase/indents?view=${view}`)
    if (!call.ok) {
      setError(call.result?.error ?? t('dermat_purchase.indent.loadError', 'Could not load indents.'))
      return
    }
    setError(null)
    setItems(call.result?.items ?? [])
    setCounts(call.result?.counts ?? {})
  }, [view, t])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    const raw = params?.get('items')
    if (!raw) return
    const lines = raw
      .split(',')
      .map((entry) => entry.split(':'))
      .filter(([id, amount]) => /^[0-9a-f-]{36}$/i.test(id ?? '') && Number(amount) > 0)
      .map(([productId, amount]) => ({ productId, quantity: Number(amount) }))
    const orderRefs = (params?.get('orders') ?? '')
      .split(',')
      .map((entry) => entry.split(':'))
      .filter(([id, no]) => /^[0-9a-f-]{36}$/i.test(id ?? '') && no)
      .map(([orderId, orderNo]) => ({ orderId, orderNo: decodeURIComponent(orderNo) }))
    if (lines.length) {
      setPrefill({ lines, orderRefs, source: params?.get('source') ?? 'planning' })
      setNewOpen(true)
    }
  }, [params])

  const act = async () => {
    if (!decision) return
    if (decision.action === 'reject' && !note.trim()) return flash(t('dermat_purchase.indent.reasonNeeded', 'Write why it is rejected'), 'error')
    const body = { id: decision.indent.id, action: decision.action, note: note.trim() || null }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { resourceKind: 'dermat_purchase.indent', resourceId: decision.indent.id },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(decision.indent.updatedAt), () =>
            apiCall<{ error?: string }>('/api/dermat_purchase/indents/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok) {
        flash(call.status === 409 && !call.result?.error ? t('dermat_purchase.indent.conflict', 'Someone else changed this indent. Reload.') : (call.result?.error ?? t('dermat_purchase.indent.actError', 'Could not update the indent.')), 'error')
        return
      }
      flash(decision.action === 'approve' ? t('dermat_purchase.indent.approved', '{code} approved. Purchase can raise the PO.', { code: decision.indent.code }) : decision.action === 'reject' ? t('dermat_purchase.indent.rejected', '{code} rejected', { code: decision.indent.code }) : t('dermat_purchase.indent.cancelled', '{code} cancelled', { code: decision.indent.code }), 'success')
      setDecision(null)
      setNote('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const makePo = (indents: Indent[]) => {
    const totals = new Map<string, number>()
    for (const indent of indents) for (const line of indent.lines) totals.set(line.productId, (totals.get(line.productId) ?? 0) + line.quantity)
    const orders = indents.flatMap((indent) => indent.orderRefs)
    const query = new URLSearchParams({
      items: [...totals.entries()].map(([id, amount]) => `${id}:${amount}`).join(','),
      indents: indents.map((indent) => indent.id).join(','),
    })
    if (orders.length) query.set('orders', orders.map((ref) => `${ref.orderId}:${encodeURIComponent(ref.orderNo)}`).join(','))
    router.push(`/backend/purchase/orders/new?${query.toString()}`)
  }

  const selectedIndents = (items ?? []).filter((indent) => selected.has(indent.id) && indent.status === 'approved')

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_purchase.indent.title', 'Purchase indents')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_purchase.indent.lede', 'Departments and Planning ask for material here. An approver checks each request, then Purchase turns approved indents into a PO.')}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {granted.has('dermat_purchase.manage') && selectedIndents.length ? (
                <Button type="button" variant="outline" onClick={() => makePo(selectedIndents)}>
                  <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('dermat_purchase.indent.makePoMany', 'One PO for {count} indents', { count: selectedIndents.length })}
                </Button>
              ) : null}
              {granted.has('dermat_purchase.indent') ? (
                <Button
                  type="button"
                  onClick={() => {
                    setPrefill(null)
                    setNewOpen(true)
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('dermat_purchase.indent.new', 'New indent')}
                </Button>
              ) : null}
            </div>
          </header>

          <SegmentedControl value={view} onValueChange={(value) => setView(value as View)} aria-label={t('dermat_purchase.indent.show', 'Show')}>
            <SegmentedControlItem value="all">{t('dermat_purchase.indent.all', 'All')}</SegmentedControlItem>
            <SegmentedControlItem value="to_approve">{t('dermat_purchase.indent.toApprove', 'To approve ({count})', { count: counts.submitted ?? 0 })}</SegmentedControlItem>
            <SegmentedControlItem value="approved">{t('dermat_purchase.indent.toOrder', 'To order ({count})', { count: counts.approved ?? 0 })}</SegmentedControlItem>
            <SegmentedControlItem value="ordered">{t('dermat_purchase.indent.ordered', 'PO raised')}</SegmentedControlItem>
            <SegmentedControlItem value="closed">{t('dermat_purchase.indent.closed', 'Rejected / cancelled')}</SegmentedControlItem>
          </SegmentedControl>

          {error ? <ErrorMessage label={error} /> : null}
          {!items && !error ? <LoadingMessage label={t('dermat_purchase.indent.loading', 'Loading indents…')} /> : null}
          {items && !items.length ? <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{t('dermat_purchase.indent.empty', 'No indents here.')}</p> : null}
          {items?.length ? (
            <ul className="space-y-3">
              {items.map((indent) => (
                <li key={indent.id} className={cn('rounded-lg border bg-card', focusId === indent.id && 'border-primary')}>
                  <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      {indent.status === 'approved' && granted.has('dermat_purchase.manage') ? (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded-sm border-input"
                          aria-label={t('dermat_purchase.indent.select', 'Select {code}', { code: indent.code })}
                          checked={selected.has(indent.id)}
                          onChange={(event) =>
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (event.target.checked) next.add(indent.id)
                              else next.delete(indent.id)
                              return next
                            })
                          }
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold">{indent.code}</span>
                          <StatusBadge variant={STATUS[indent.status].variant}>{STATUS[indent.status].label}</StatusBadge>
                          <span className="text-xs text-muted-foreground">{SOURCE[indent.source] ?? indent.source}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[indent.department, indent.requestedByName ? t('dermat_purchase.indent.by', 'by {name}', { name: indent.requestedByName }) : null, day(indent.createdAt), indent.neededBy ? t('dermat_purchase.indent.needed', 'needed by {date}', { date: day(indent.neededBy) }) : null].filter(Boolean).join(' · ')}
                        </p>
                        {indent.orderRefs.length ? (
                          <p className="text-xs">
                            {t('dermat_purchase.indent.forOrders', 'For:')}{' '}
                            {indent.orderRefs.map((ref, index) => (
                              <React.Fragment key={ref.orderId}>
                                {index ? ', ' : ''}
                                <Link href={`/backend/orders/${ref.orderId}`} className="font-mono hover:underline">
                                  {ref.orderNo}
                                </Link>
                              </React.Fragment>
                            ))}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {indent.status === 'submitted' && granted.has('dermat_purchase.approve') ? (
                        <>
                          <Button type="button" size="sm" onClick={() => setDecision({ indent, action: 'approve' })}>
                            <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('dermat_purchase.indent.approve', 'Approve')}
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setDecision({ indent, action: 'reject' })}>
                            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('dermat_purchase.indent.reject', 'Reject')}
                          </Button>
                        </>
                      ) : null}
                      {indent.status === 'approved' && granted.has('dermat_purchase.manage') ? (
                        <Button type="button" size="sm" onClick={() => makePo([indent])}>
                          <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t('dermat_purchase.indent.makePo', 'Make PO')}
                        </Button>
                      ) : null}
                      {(indent.status === 'submitted' || indent.status === 'approved') && granted.has('dermat_purchase.indent') ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDecision({ indent, action: 'cancel' })}>
                          {t('dermat_purchase.indent.cancel', 'Cancel')}
                        </Button>
                      ) : null}
                      {indent.poRefs.map((ref) => (
                        <Button key={ref.poId} asChild size="sm" variant="outline">
                          <Link href={`/backend/purchase/orders/${ref.poId}`}>{ref.code}</Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                  <ul className="divide-y text-sm">
                    {indent.lines.map((line) => (
                      <li key={line.productId} className="flex items-center justify-between gap-3 px-4 py-2">
                        <span className="min-w-0 truncate">
                          <span className="mr-2 font-mono text-xs text-muted-foreground">{line.code ?? ''}</span>
                          {line.title}
                          {line.note ? <span className="ml-2 text-xs text-muted-foreground">· {line.note}</span> : null}
                        </span>
                        <span className="shrink-0 tabular-nums">{qty(line.quantity, line.unit)}</span>
                      </li>
                    ))}
                  </ul>
                  {indent.notes || indent.decisionNote ? (
                    <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                      {[indent.notes, indent.decisionNote ? t('dermat_purchase.indent.decision', 'Decision: {note}', { note: indent.decisionNote }) : null].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <NewIndentDialog open={newOpen} onOpenChange={setNewOpen} onCreated={() => void load()} prefill={prefill} />
        <Dialog open={Boolean(decision)} onOpenChange={(open) => (open ? undefined : setDecision(null))}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void act()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {decision?.action === 'approve' ? t('dermat_purchase.indent.approveTitle', 'Approve {code}?', { code: decision.indent.code }) : decision?.action === 'reject' ? t('dermat_purchase.indent.rejectTitle', 'Reject {code}?', { code: decision.indent.code }) : t('dermat_purchase.indent.cancelTitle', 'Cancel {code}?', { code: decision?.indent.code ?? '' })}
              </DialogTitle>
              <DialogDescription>{decision?.action === 'reject' ? t('dermat_purchase.indent.rejectHint', 'The person who asked sees your reason.') : t('dermat_purchase.indent.noteHint', 'Add a note if useful.')}</DialogDescription>
            </DialogHeader>
            <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} aria-label={t('dermat_purchase.indent.note', 'Note')} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDecision(null)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant={decision?.action === 'approve' ? 'default' : 'destructive'} onClick={() => void act()} disabled={busy}>
                {decision?.action === 'approve' ? t('dermat_purchase.indent.approve', 'Approve') : decision?.action === 'reject' ? t('dermat_purchase.indent.reject', 'Reject') : t('dermat_purchase.indent.cancelConfirm', 'Cancel indent')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default IndentsPage
