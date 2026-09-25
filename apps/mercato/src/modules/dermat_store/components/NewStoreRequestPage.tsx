"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, Search, Send, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { StageIcon, StockRoute, qty } from './shared'

type SuggestRow = {
  productId: string
  title: string
  code: string | null
  kind: string | null
  unit: string | null
  store: 'rm' | 'pm'
  required: number
  requested: number
  suggested: number
  inStore: number
  reservedForOrder: number
}
type Row = SuggestRow & { include: boolean; quantity: string; extra: boolean }
type OrderSummary = { id: string; orderNo: string; customer: { name: string } | null; lines: Array<{ product: { title: string } | null; quantity: number }>; stages: Array<{ key: string; label: string; status: string }> }
type SearchItem = { id: string; title: string; code: string | null; kind: string | null; unit: string | null }

const STAGE_WHAT: Record<string, string> = {
  manufacturing: 'Raw materials for the bulk batch, from the RM store',
  filling: 'Bottles, tubes, jars, caps and pumps, from the PM store',
  packing: 'Cartons, labels, leaflets and the sample kit, from the PM store',
}

export function NewStoreRequestPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const orderId = params?.get('orderId') ?? ''
  const stageKey = params?.get('stageKey') ?? 'manufacturing'
  const { runMutation } = useGuardedMutation({ contextId: `dermat-store-new-${orderId}-${stageKey}` })
  const [order, setOrder] = React.useState<OrderSummary | null>(null)
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [missingBoms, setMissingBoms] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [notes, setNotes] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState<SearchItem[]>([])
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!orderId) {
      setError(t('dermat_store.new.noOrder', 'Open this page from an order stage.'))
      return
    }
    ;(async () => {
      const [orderCall, suggestCall] = await Promise.all([
        apiCall<OrderSummary>(`/api/dermat_orders/orders?id=${encodeURIComponent(orderId)}`),
        apiCall<{ rows: SuggestRow[]; missingBoms: string[] }>(`/api/dermat_store/requests/suggest?orderId=${encodeURIComponent(orderId)}&stageKey=${encodeURIComponent(stageKey)}`),
      ])
      if (!orderCall.ok || !orderCall.result || !suggestCall.ok || !suggestCall.result) {
        setError(t('dermat_store.new.loadError', 'Could not load what this order needs.'))
        return
      }
      setOrder(orderCall.result)
      setMissingBoms(suggestCall.result.missingBoms ?? [])
      setRows(suggestCall.result.rows.map((row) => ({ ...row, include: row.suggested > 0, quantity: String(row.suggested || ''), extra: false })))
    })()
  }, [orderId, stageKey, t])

  React.useEffect(() => {
    if (!search.trim()) {
      setOptions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const kinds = stageKey === 'manufacturing' ? 'raw_material' : 'packing_material'
      const call = await apiCall<{ items?: SearchItem[] }>(`/api/dermat_products/search?kinds=${kinds}&limit=8&q=${encodeURIComponent(search.trim())}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setOptions((call.result?.items ?? []).filter((item) => !rows?.some((row) => row.productId === item.id)))
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [search, stageKey, rows])

  const patch = (productId: string, value: Partial<Row>) => setRows((prev) => (prev ?? []).map((row) => (row.productId === productId ? { ...row, ...value } : row)))

  const addExtra = (item: SearchItem) => {
    setRows((prev) => [
      ...(prev ?? []),
      {
        productId: item.id,
        title: item.title,
        code: item.code,
        kind: item.kind,
        unit: item.unit,
        store: item.kind === 'raw_material' ? 'rm' : 'pm',
        required: 0,
        requested: 0,
        suggested: 0,
        inStore: 0,
        reservedForOrder: 0,
        include: true,
        quantity: '',
        extra: true,
      },
    ])
    setSearch('')
    setOptions([])
  }

  const chosen = (rows ?? []).filter((row) => row.include && Number(row.quantity) > 0)

  const submit = async () => {
    if (!chosen.length) {
      flash(t('dermat_store.new.nothing', 'Tick at least one material and enter a quantity.'), 'error')
      return
    }
    const body = { orderId, stageKey, notes: notes.trim() || null, lines: chosen.map((row) => ({ productId: row.productId, quantity: Number(row.quantity) })) }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { orderId, stageKey },
        mutationPayload: body,
        operation: () => apiCall<{ items?: Array<{ id: string; code: string }>; error?: string }>('/api/dermat_store/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.items?.length) {
        flash(call.result?.error ?? t('dermat_store.new.error', 'Could not send the request.'), 'error')
        return
      }
      const created = call.result.items
      flash(t('dermat_store.new.sent', 'Sent to the store: {codes}', { codes: created.map((item) => item.code).join(', ') }), 'success')
      router.push(created.length === 1 ? `/backend/store/requests/${created[0].id}` : `/backend/orders/${orderId}/stages/${stageKey}`)
    } catch {
      flash(t('dermat_store.new.error', 'Could not send the request.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error} />
        </PageBody>
      </Page>
    )
  }
  if (!order || !rows) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_store.new.loading', 'Working out what this stage needs…')} />
        </PageBody>
      </Page>
    )
  }

  const stage = order.stages.find((entry) => entry.key === stageKey)
  const back = `/backend/orders/${orderId}/stages/${stageKey}`

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto flex max-w-5xl flex-col gap-6 pb-16"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            }
            if (event.key === 'Escape') router.push(back)
          }}
        >
          <div className="space-y-4">
            <Link href={back} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {order.orderNo} · {stage?.label ?? stageKey}
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-xs">
                  <StageIcon stageKey={stageKey} className="h-5 w-5 text-muted-foreground" />
                </span>
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight">{t('dermat_store.new.title', 'Ask the store for material')}</h1>
                  <p className="text-sm text-muted-foreground">{STAGE_WHAT[stageKey] ?? ''}</p>
                </div>
              </div>
              <StockRoute store={stageKey === 'manufacturing' ? 'rm' : 'pm'} />
            </div>
          </div>

          <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-3">
            <div>
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_store.new.order', 'Order')}</p>
              <p className="mt-1 font-mono text-sm font-semibold">{order.orderNo}</p>
            </div>
            <div>
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_store.new.customer', 'Customer')}</p>
              <p className="mt-1 truncate text-sm font-medium">{order.customer?.name ?? '—'}</p>
            </div>
            <div>
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_store.new.making', 'Making')}</p>
              <p className="mt-1 truncate text-sm">{order.lines.map((line) => `${line.product?.title ?? '—'} × ${qty(line.quantity)}`).join(', ')}</p>
            </div>
          </section>

          {missingBoms.length ? (
            <Alert status="warning" style="lighter" className="rounded-lg">
              <AlertTitle>{t('dermat_store.new.noBom', 'No approved BOM for some products')}</AlertTitle>
              <AlertDescription>{t('dermat_store.new.noBomBody', '{products}: add their materials by hand below.', { products: missingBoms.join(', ') })}</AlertDescription>
            </Alert>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">{t('dermat_store.new.materials', 'Materials from the BOM')}</h2>
                <p className="text-xs text-muted-foreground">{t('dermat_store.new.materialsHint', 'Already asked quantities are taken off. Change any quantity before sending.')}</p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
                {t('dermat_store.new.selected', '{count} selected', { count: chosen.length })}
              </span>
            </div>
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="w-10 px-5 py-2.5" />
                      <th className="px-3 py-2.5">{t('dermat_store.new.material', 'Material')}</th>
                      <th className="px-3 py-2.5 text-right">{t('dermat_store.new.bomNeeds', 'BOM needs')}</th>
                      <th className="px-3 py-2.5 text-right">{t('dermat_store.new.asked', 'Already asked')}</th>
                      <th className="px-3 py-2.5 text-right">{t('dermat_store.new.inStore', 'In store')}</th>
                      <th className="w-36 px-5 py-2.5 text-right">{t('dermat_store.new.askNow', 'Ask now')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => {
                      const short = Number(row.quantity) > row.inStore && !row.extra
                      return (
                        <tr key={row.productId} className={cn('transition-colors', !row.include && 'opacity-60')}>
                          <td className="px-5 py-3">
                            <Checkbox
                              id={`include-${row.productId}`}
                              checked={row.include}
                              onCheckedChange={(checked) => patch(row.productId, { include: checked === true })}
                              aria-label={t('dermat_store.new.include', 'Include {name}', { name: row.title })}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <label htmlFor={`include-${row.productId}`} className="block cursor-pointer font-medium">
                              {row.title}
                            </label>
                            <p className="font-mono text-xs text-muted-foreground">
                              {row.code ?? '—'}
                              {row.extra ? ` · ${t('dermat_store.new.added', 'added by hand')}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{row.extra ? '—' : qty(row.required, row.unit)}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{row.requested ? qty(row.requested) : '—'}</td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span className={cn(short && 'text-status-error-text')}>{row.extra ? '—' : qty(row.inStore, row.unit)}</span>
                            {row.reservedForOrder > 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {qty(row.reservedForOrder)} {t('dermat_store.new.reserved', 'reserved')}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Input
                                id={`qty-${row.productId}`}
                                aria-label={t('dermat_store.new.askNow', 'Ask now')}
                                className="h-9 w-24 text-right tabular-nums"
                                inputMode="decimal"
                                value={row.quantity}
                                onChange={(event) => patch(row.productId, { quantity: event.target.value, include: true })}
                              />
                              <span className="w-6 text-xs text-muted-foreground">{row.unit}</span>
                              {row.extra ? (
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-destructive"
                                  aria-label={t('dermat_store.new.remove', 'Remove')}
                                  onClick={() => setRows((prev) => (prev ?? []).filter((entry) => entry.productId !== row.productId))}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState className="py-12" variant="subtle" title={t('dermat_store.new.emptyTitle', 'The BOM has nothing for this stage')} description={t('dermat_store.new.emptyHint', 'Add materials by hand below.')} />
            )}
            <div className="relative border-t border-border bg-muted/30 px-5 py-4">
              <Label htmlFor="add-material" className="text-xs text-muted-foreground">
                {t('dermat_store.new.addMore', 'Add another material')}
              </Label>
              <div className="relative mt-1.5 sm:w-96">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="add-material" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_store.new.addPlaceholder', 'Internal ID or name')} />
                {options.length ? (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                    {options.map((item) => (
                      <li key={item.id}>
                        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => addExtra(item)}>
                          <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {item.code ? <span className="font-mono text-xs text-muted-foreground">{item.code}</span> : null}
                          <span className="truncate">{item.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <Label htmlFor="request-notes" className="text-sm font-medium">
              {t('dermat_store.new.notes', 'Note for the store')}
            </Label>
            <Textarea id="request-notes" className="mt-1.5" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t('dermat_store.new.notesPlaceholder', 'e.g. Needed by 10 am for batch 57001')} />
          </section>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
            <p className="text-sm text-muted-foreground">
              {t('dermat_store.new.footer', 'The store sees this at once. {stage} stays locked until you confirm you received it.', { stage: stage?.label ?? stageKey })}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" onClick={() => router.push(back)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={busy || !chosen.length}>
                <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {busy ? t('dermat_store.new.sending', 'Sending…') : t('dermat_store.new.send', 'Send to store')}
              </Button>
            </div>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}

export default NewStoreRequestPage
