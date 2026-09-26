"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRightLeft, ChevronDown, ChevronRight, History, Minus, Plus, Search } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv } from '../../dermat_products/lib/csvExport'
import { ListSelectItems } from '../../dermat_lists/components/ListSelectItems'
import { ViewsButton } from '../../dermat_products/components/ViewsPanel'

type Place = 'rm' | 'pm' | 'production' | 'fg'
type View = 'all' | 'under_test' | 'expiring' | 'hold'
type Lot = { lotId: string | null; lotNumber: string | null; status: string; onHand: number; free: number; expiresAt: string | null; manufacturedAt: string | null; receivedAt: string | null; daysToExpiry: number | null }
type Item = { productId: string; code: string | null; title: string; kind: string | null; unit: string | null; lots: Lot[]; onHand: number; usable: number; underTest: number; onHold: number; reserved: number; free: number; nextExpiryDays: number | null }
type Book = { place: Place; label: string; summary: { items: number; lots: number; underTest: number; onHold: number; expiringSoon: number; expired: number }; items: Item[]; expiryWarningDays: number }
type ProductOption = { id: string; title: string; code: string | null; unit: string | null }

const PLACES: Array<{ value: Place; label: string; kinds: string }> = [
  { value: 'rm', label: 'RM store', kinds: 'raw_material' },
  { value: 'pm', label: 'PM store', kinds: 'packing_material' },
  { value: 'production', label: 'Production floor', kinds: 'bulk,raw_material,packing_material' },
  { value: 'fg', label: 'FG store', kinds: 'finished_goods' },
]

const LOT_STATUS: Record<string, { label: string; variant: StatusBadgeVariant }> = {
  available: { label: 'Approved', variant: 'success' },
  quarantine: { label: 'Under QC test', variant: 'warning' },
  hold: { label: 'Rejected / on hold', variant: 'error' },
  expired: { label: 'Expired', variant: 'error' },
}

function qty(value: number, unit?: string | null): string {
  const text = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
  return unit ? `${text} ${unit}` : text
}

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function expiryTone(days: number | null, warn: number): string {
  if (days === null) return ''
  if (days < 0) return 'font-medium text-status-error-text'
  if (days <= warn) return 'font-medium text-status-warning-text'
  return ''
}


type StockColumn = {
  key: string
  label: string
  align?: 'right'
  item: (item: Item) => React.ReactNode
  lot?: (lot: Lot, item: Item) => React.ReactNode
  itemClass?: (item: Item) => string
  lotClass?: (lot: Lot) => string
}

const DEFAULT_STOCK_COLUMNS = ['onHand', 'underTest', 'reserved', 'free', 'expiry']

function stockColumns(warnDays: number): StockColumn[] {
  return [
    { key: 'onHand', label: 'On hand', align: 'right', item: (item) => qty(item.onHand, item.unit), lot: (lot, item) => qty(lot.onHand, item.unit) },
    { key: 'underTest', label: 'Under QC test', align: 'right', item: (item) => (item.underTest ? qty(item.underTest, item.unit) : '—'), itemClass: (item) => (item.underTest ? 'text-status-warning-text' : 'text-muted-foreground'), lot: (lot, item) => (lot.status === 'quarantine' ? qty(lot.onHand, item.unit) : '') },
    { key: 'onHold', label: 'Rejected / on hold', align: 'right', item: (item) => (item.onHold ? qty(item.onHold, item.unit) : '—'), itemClass: (item) => (item.onHold ? 'text-status-error-text' : 'text-muted-foreground'), lot: (lot, item) => (lot.status === 'hold' || lot.status === 'expired' ? qty(lot.onHand, item.unit) : '') },
    { key: 'reserved', label: 'Reserved for orders', align: 'right', item: (item) => (item.reserved ? qty(item.reserved, item.unit) : '—'), itemClass: () => 'text-muted-foreground' },
    { key: 'free', label: 'Free to use', align: 'right', item: (item) => qty(item.free, item.unit), itemClass: () => 'font-semibold', lot: (lot, item) => qty(lot.free, item.unit) },
    {
      key: 'expiry',
      label: 'Next expiry',
      item: (item) => day(item.lots.map((lot) => lot.expiresAt).filter(Boolean).sort()[0] ?? null),
      itemClass: (item) => expiryTone(item.nextExpiryDays, warnDays),
      lot: (lot) => `${day(lot.expiresAt)}${lot.daysToExpiry !== null ? ` · ${lot.daysToExpiry < 0 ? 'expired' : `${lot.daysToExpiry} d`}` : ''}`,
      lotClass: (lot) => expiryTone(lot.daysToExpiry, warnDays),
    },
    { key: 'unit', label: 'Unit', item: (item) => item.unit ?? '—' },
    { key: 'batches', label: 'Batches', align: 'right', item: (item) => String(item.lots.length) },
    { key: 'mfg', label: 'Mfg date', item: () => '', lot: (lot) => day(lot.manufacturedAt) },
    { key: 'since', label: 'In store since', item: () => '', lot: (lot) => day(lot.receivedAt) },
  ]
}

type DialogState =
  | { kind: 'in'; item: Item | null; lot: Lot | null }
  | { kind: 'out'; item: Item; lot: Lot }
  | { kind: 'move'; item: Item; lot: Lot }
  | null

function StockDialog({ state, place, onClose, onDone }: { state: DialogState; place: Place; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-store-stock' })
  const [product, setProduct] = React.useState<ProductOption | null>(null)
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState<ProductOption[]>([])
  const [quantity, setQuantity] = React.useState('')
  const [lotNumber, setLotNumber] = React.useState('')
  const [expiry, setExpiry] = React.useState('')
  const [mfg, setMfg] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [target, setTarget] = React.useState<Place>(place === 'production' ? 'rm' : 'production')
  const [note, setNote] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!state) return
    setProduct(state.item ? { id: state.item.productId, title: state.item.title, code: state.item.code, unit: state.item.unit } : null)
    setSearch('')
    setOptions([])
    setQuantity('')
    setLotNumber('')
    setExpiry('')
    setMfg('')
    setReason(state.kind === 'in' ? 'Opening stock' : '')
    setNote('')
    setTarget(place === 'production' ? 'rm' : 'production')
  }, [state, place])

  React.useEffect(() => {
    if (!state || state.kind !== 'in' || product || !search.trim()) {
      setOptions([])
      return
    }
    const kinds = PLACES.find((entry) => entry.value === place)?.kinds ?? 'raw_material'
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items?: ProductOption[] }>(`/api/dermat_products/search?kinds=${kinds}&q=${encodeURIComponent(search.trim())}&limit=20`, undefined, { fallback: { items: [] } })
      setOptions(call.result?.items ?? [])
    }, 200)
    return () => window.clearTimeout(handle)
  }, [search, product, state, place])

  if (!state) return null
  const unit = product?.unit ?? state.item?.unit ?? null
  const title = state.kind === 'in' ? t('dermat_store.stock.addTitle', 'Add stock to the {place}', { place: PLACES.find((entry) => entry.value === place)?.label ?? '' }) : state.kind === 'out' ? t('dermat_store.stock.removeTitle', 'Remove stock') : t('dermat_store.stock.moveTitle', 'Move stock')

  const save = async () => {
    const amount = Number(quantity)
    if (!product) return flash(t('dermat_store.stock.pickProduct', 'Pick the material'), 'error')
    if (!(amount > 0)) return flash(t('dermat_store.stock.qtyError', 'Enter a quantity above zero'), 'error')
    if (state.kind !== 'move' && !reason) return flash(t('dermat_store.stock.reasonError', 'Pick a reason'), 'error')
    if (state.kind === 'in' && !state.lot && !lotNumber.trim()) return flash(t('dermat_store.stock.lotError', 'Enter the batch / lot number'), 'error')
    const url = state.kind === 'move' ? '/api/dermat_store/stock/transfer' : '/api/dermat_store/stock/adjust'
    const body =
      state.kind === 'move'
        ? { productId: product.id, lotId: state.lot.lotId, from: place, to: target, quantity: amount, note: note.trim() || null }
        : {
            place,
            productId: product.id,
            direction: state.kind,
            quantity: amount,
            lotId: state.lot?.lotId ?? null,
            newLot: state.kind === 'in' && !state.lot ? { lotNumber: lotNumber.trim(), expiryDate: expiry || null, mfgDate: mfg || null } : null,
            reason,
            note: note.trim() || null,
          }
    setSaving(true)
    try {
      const call = await runMutation({
        context: { resourceKind: 'dermat_store.stock', resourceId: product.id },
        mutationPayload: body,
        operation: () => apiCall<{ ok?: boolean; error?: string }>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('dermat_store.stock.saveError', 'Could not change the stock.'), 'error')
        return
      }
      flash(
        state.kind === 'move'
          ? t('dermat_store.stock.moved', 'Moved {qty}', { qty: qty(amount, unit) })
          : state.kind === 'in'
            ? t('dermat_store.stock.added', 'Added {qty} of {name}', { qty: qty(amount, unit), name: product.title })
            : t('dermat_store.stock.removed', 'Removed {qty} of {name}', { qty: qty(amount, unit), name: product.title }),
        'success',
      )
      onClose()
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {state.kind === 'in'
              ? t('dermat_store.stock.addHint', 'For opening stock, count differences or material found in the store. Stock bought from a vendor comes in through a GRN instead.')
              : state.kind === 'out'
                ? t('dermat_store.stock.removeHint', 'For damage, expiry, count differences or material given out without an order. It leaves the stock for good.')
                : t('dermat_store.stock.moveHint', 'Only QC-approved stock can be moved. Production usually gets material through store requests.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {state.item ? (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="mr-2 font-mono text-xs text-muted-foreground">{state.item.code}</span>
              <span className="font-medium">{state.item.title}</span>
              {state.lot ? <span className="block text-xs text-muted-foreground">{t('dermat_store.stock.batchFree', 'Batch {lot}: {free} free of {onHand}', { lot: state.lot.lotNumber ?? '—', free: qty(state.lot.free, unit), onHand: qty(state.lot.onHand, unit) })}</span> : null}
            </p>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="stock-product">{t('dermat_store.stock.material', 'Material *')}</Label>
              {product ? (
                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{product.code}</span>
                    {product.title}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setProduct(null)}>
                    {t('dermat_store.stock.change', 'Change')}
                  </Button>
                </div>
              ) : (
                <>
                  <Input id="stock-product" value={search} placeholder={t('dermat_store.stock.searchMaterial', 'Search by code or name')} onChange={(event) => setSearch(event.target.value)} />
                  {options.length ? (
                    <ul className="max-h-48 overflow-auto rounded-md border">
                      {options.map((option) => (
                        <li key={option.id}>
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setProduct(option)}>
                            <span className="font-mono text-xs text-muted-foreground">{option.code}</span>
                            <span className="truncate">{option.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="stock-qty">{t('dermat_store.stock.quantity', 'Quantity *')}{unit ? ` (${unit})` : ''}</Label>
              <Input id="stock-qty" type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
            {state.kind === 'move' ? (
              <div className="space-y-1">
                <Label>{t('dermat_store.stock.to', 'Move to *')}</Label>
                <Select value={target} onValueChange={(value) => setTarget(value as Place)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLACES.filter((entry) => entry.value !== place).map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>{t('dermat_store.stock.reason', 'Reason *')}</Label>
                <Select value={reason || '__none'} onValueChange={(value) => setReason(value === '__none' ? '' : value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    <ListSelectItems listKey="stock_adjust_reasons" current={reason || null} />
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {state.kind === 'in' && !state.lot ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="stock-lot">{t('dermat_store.stock.lot', 'Batch / lot no. *')}</Label>
                <Input id="stock-lot" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="stock-mfg">{t('dermat_store.stock.mfg', 'Mfg date')}</Label>
                <Input id="stock-mfg" type="date" value={mfg} onChange={(event) => setMfg(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="stock-expiry">{t('dermat_store.stock.expiry', 'Expiry date')}</Label>
                <Input id="stock-expiry" type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="stock-note">{t('dermat_store.stock.note', 'Note')}</Label>
            <Textarea id="stock-note" rows={2} value={note} placeholder={state.kind === 'out' ? t('dermat_store.stock.notePlaceholder', 'e.g. given to R&D for trial batch RD-12') : undefined} onChange={(event) => setNote(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" variant={state.kind === 'out' ? 'destructive' : 'default'} onClick={() => void save()} disabled={saving}>
            {saving ? t('dermat_store.stock.saving', 'Saving…') : state.kind === 'in' ? t('dermat_store.stock.add', 'Add stock') : state.kind === 'out' ? t('dermat_store.stock.remove', 'Remove stock') : t('dermat_store.stock.move', 'Move stock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function StockPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const initialPlace = (params?.get('place') as Place | null) ?? 'rm'
  const [place, setPlace] = React.useState<Place>(PLACES.some((entry) => entry.value === initialPlace) ? initialPlace : 'rm')
  const [view, setView] = React.useState<View>('all')
  const [search, setSearch] = React.useState('')
  const [book, setBook] = React.useState<Book | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const [dialog, setDialog] = React.useState<DialogState>(null)
  const [canAdjust, setCanAdjust] = React.useState(false)
  const [columnKeys, setColumnKeys] = React.useState<string[]>(DEFAULT_STOCK_COLUMNS)
  const allColumns = React.useMemo(() => stockColumns(book?.expiryWarningDays ?? 90), [book?.expiryWarningDays])
  const shownColumns = columnKeys.map((key) => allColumns.find((column) => column.key === key)).filter((column): column is StockColumn => Boolean(column))

  const load = React.useCallback(async () => {
    const call = await apiCall<Book & { error?: string }>(`/api/dermat_store/stock?place=${place}&view=${view}${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''}`)
    if (!call.ok || !call.result) {
      setError(call.result?.error ?? t('dermat_store.stock.loadError', 'Could not load stock.'))
      return
    }
    setError(null)
    setBook(call.result)
  }, [place, view, search, t])

  React.useEffect(() => {
    const handle = window.setTimeout(() => void load(), search ? 250 : 0)
    return () => window.clearTimeout(handle)
  }, [load, search])

  React.useEffect(() => {
    apiCall<{ ok?: boolean; granted?: string[] }>('/api/auth/feature-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ features: ['dermat_store.adjust'] }) }, { fallback: { ok: false } }).then((call) =>
      setCanAdjust(Boolean(call.result?.ok ?? call.result?.granted?.includes('dermat_store.adjust'))),
    )
  }, [])

  const choosePlace = (value: Place) => {
    setPlace(value)
    setOpen(new Set())
    router.replace(`/backend/store/stock?place=${value}`)
  }

  const exportCsv = () => {
    if (!book) return
    const rows = book.items.flatMap((item) => item.lots.map((lot) => ({ item, lot })))
    downloadCsv(`stock-${place}`, [
      { header: 'Code', value: (row) => row.item.code },
      { header: 'Material', value: (row) => row.item.title },
      { header: 'Unit', value: (row) => row.item.unit },
      { header: 'Batch', value: (row) => row.lot.lotNumber },
      { header: 'QC status', value: (row) => LOT_STATUS[row.lot.status]?.label ?? row.lot.status },
      { header: 'On hand', value: (row) => row.lot.onHand },
      { header: 'Free', value: (row) => row.lot.free },
      { header: 'Mfg date', value: (row) => row.lot.manufacturedAt },
      { header: 'Expiry', value: (row) => row.lot.expiresAt },
      { header: 'Reserved for orders (material total)', value: (row) => row.item.reserved },
    ], rows)
  }

  const tiles = book
    ? [
        { label: t('dermat_store.stock.tileItems', 'Materials in stock'), value: String(book.summary.items), hint: t('dermat_store.stock.tileLots', '{count} batches', { count: book.summary.lots }), tone: '' },
        { label: t('dermat_store.stock.tileTest', 'Under QC test'), value: String(book.summary.underTest), hint: t('dermat_store.stock.tileTestHint', 'Cannot be issued yet'), tone: book.summary.underTest ? 'text-status-warning-text' : '' },
        { label: t('dermat_store.stock.tileExpiring', 'Expiring in {days} days', { days: book.expiryWarningDays }), value: String(book.summary.expiringSoon), hint: t('dermat_store.stock.tileExpired', '{count} already expired', { count: book.summary.expired }), tone: book.summary.expired ? 'text-status-error-text' : book.summary.expiringSoon ? 'text-status-warning-text' : '' },
        { label: t('dermat_store.stock.tileHold', 'Rejected / on hold'), value: String(book.summary.onHold), hint: t('dermat_store.stock.tileHoldHint', 'Return to vendor or write off'), tone: book.summary.onHold ? 'text-status-error-text' : '' },
      ]
    : []

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_store.stock.title', 'Stock')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_store.stock.lede', 'What is in each store, batch by batch: QC status, what is reserved for orders and what is free, and when it expires.')}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/backend/store/ledger?place=${place}`}>
                  <History className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('dermat_store.stock.ledger', 'Stock ledger')}
                </Link>
              </Button>
              <ViewsButton
                tableId="dermat_store.stock"
                columns={allColumns.map((column) => ({ key: column.key, label: column.label, group: t('dermat_store.stock.columnsGroup', 'Stock') }))}
                visible={columnKeys}
                onChange={setColumnKeys}
                builtIn={[
                  { id: 'standard', name: t('dermat_store.stock.viewStandard', 'Standard'), columns: DEFAULT_STOCK_COLUMNS },
                  { id: 'qc', name: t('dermat_store.stock.viewQc', 'QC status'), columns: ['onHand', 'underTest', 'onHold', 'free'] },
                  { id: 'expiry', name: t('dermat_store.stock.viewExpiry', 'Batches and expiry'), columns: ['onHand', 'batches', 'mfg', 'since', 'expiry'] },
                ]}
              />
              <ExportButton size="sm" label={t('dermat_store.stock.export', 'Export')} onExport={exportCsv} disabled={!book?.items.length} />
              {canAdjust ? (
                <Button type="button" size="sm" onClick={() => setDialog({ kind: 'in', item: null, lot: null })}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('dermat_store.stock.addStock', 'Add stock')}
                </Button>
              ) : null}
            </div>
          </header>

          <SegmentedControl value={place} onValueChange={(value) => choosePlace(value as Place)} aria-label={t('dermat_store.stock.place', 'Store')}>
            {PLACES.map((entry) => (
              <SegmentedControlItem key={entry.value} value={entry.value}>
                {entry.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>

          {book ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map((tile) => (
                <div key={tile.label} className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
                  <p className={cn('mt-1 text-xl font-semibold tabular-nums', tile.tone)}>{tile.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_store.stock.search', 'Code, name or batch')} className="pl-9" aria-label={t('dermat_store.stock.search', 'Code, name or batch')} />
            </div>
            <SegmentedControl value={view} onValueChange={(value) => setView(value as View)} aria-label={t('dermat_store.stock.filter', 'Show')}>
              <SegmentedControlItem value="all">{t('dermat_store.stock.viewAll', 'All')}</SegmentedControlItem>
              <SegmentedControlItem value="under_test">{t('dermat_store.stock.viewTest', 'Under QC test')}</SegmentedControlItem>
              <SegmentedControlItem value="expiring">{t('dermat_store.stock.viewExpiring', 'Expiring')}</SegmentedControlItem>
              <SegmentedControlItem value="hold">{t('dermat_store.stock.viewHold', 'Rejected')}</SegmentedControlItem>
            </SegmentedControl>
          </div>

          {error ? <ErrorMessage label={error} /> : null}
          {!book && !error ? <LoadingMessage label={t('dermat_store.stock.loading', 'Loading stock…')} /> : null}
          {book ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_store.stock.colMaterial', 'Material')}</th>
                    {shownColumns.map((column) => (
                      <th key={column.key} className={cn('px-3 py-2 font-semibold', column.align === 'right' ? 'text-right' : 'text-left')}>
                        {column.label}
                      </th>
                    ))}
                    {canAdjust ? <th className="w-28 px-3 py-2" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {book.items.map((item) => {
                    const expanded = open.has(item.productId)
                    return (
                      <React.Fragment key={item.productId}>
                        <tr className="hover:bg-muted/30">
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={expanded ? t('dermat_store.stock.hideBatches', 'Hide batches') : t('dermat_store.stock.showBatches', 'Show batches')}
                              className="rounded p-1 hover:bg-muted"
                              onClick={() =>
                                setOpen((prev) => {
                                  const nextSet = new Set(prev)
                                  if (nextSet.has(item.productId)) nextSet.delete(item.productId)
                                  else nextSet.add(item.productId)
                                  return nextSet
                                })
                              }
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <Link href={`/backend/products/${item.productId}`} className="font-medium hover:underline">
                              {item.title}
                            </Link>
                            <span className="block font-mono text-xs text-muted-foreground">{item.code ?? '—'}</span>
                          </td>
                          {shownColumns.map((column) => (
                            <td key={column.key} className={cn('px-3 py-2 tabular-nums', column.align === 'right' && 'text-right', column.itemClass?.(item))}>
                              {column.item(item)}
                            </td>
                          ))}
                          {canAdjust ? <td /> : null}
                        </tr>
                        {expanded
                          ? item.lots.map((lot) => (
                              <tr key={`${item.productId}-${lot.lotId ?? 'none'}`} className="bg-muted/20 text-xs">
                                <td />
                                <td className="px-3 py-2">
                                  <span className="font-mono">{lot.lotNumber ?? t('dermat_store.stock.noLot', 'no batch no.')}</span>{' '}
                                  <StatusBadge variant={LOT_STATUS[lot.status]?.variant ?? 'neutral'}>{LOT_STATUS[lot.status]?.label ?? lot.status}</StatusBadge>
                                </td>
                                {shownColumns.map((column) => (
                                  <td key={column.key} className={cn('px-3 py-2 tabular-nums', column.align === 'right' && 'text-right', column.lotClass?.(lot))}>
                                    {column.lot ? column.lot(lot, item) : null}
                                  </td>
                                ))}
                                {canAdjust ? (
                                  <td className="px-3 py-2">
                                    <span className="flex justify-end gap-1">
                                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDialog({ kind: 'in', item, lot })} aria-label={t('dermat_store.stock.addTo', 'Add to batch {lot}', { lot: lot.lotNumber ?? '' })}>
                                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={lot.free <= 0} onClick={() => setDialog({ kind: 'out', item, lot })} aria-label={t('dermat_store.stock.removeFrom', 'Remove from batch {lot}', { lot: lot.lotNumber ?? '' })}>
                                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={lot.status !== 'available' || lot.free <= 0} onClick={() => setDialog({ kind: 'move', item, lot })} aria-label={t('dermat_store.stock.moveBatch', 'Move batch {lot}', { lot: lot.lotNumber ?? '' })}>
                                        <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                      </Button>
                                    </span>
                                  </td>
                                ) : null}
                              </tr>
                            ))
                          : null}
                      </React.Fragment>
                    )
                  })}
                  {!book.items.length ? (
                    <tr>
                      <td colSpan={shownColumns.length + (canAdjust ? 3 : 2)} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        {search || view !== 'all' ? t('dermat_store.stock.noMatch', 'Nothing matches this filter.') : t('dermat_store.stock.empty', 'Nothing is in the {place} yet. Stock arrives through GRNs, production, or Add stock.', { place: book.label })}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <StockDialog state={dialog} place={place} onClose={() => setDialog(null)} onDone={() => void load()} />
      </PageBody>
    </Page>
  )
}

export default StockPage
