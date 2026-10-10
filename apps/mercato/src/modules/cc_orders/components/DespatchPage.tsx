"use client"

import * as React from 'react'
import { FileText, PackageOpen, Pencil, Truck, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'
import { MIN_REASON } from '../../cc_ui/components/CorrectDialog'
import { formatDate, formatDateTime } from './format'

type Shipped = { allocationId: string; lotId: string; lotNumber: string; productId: string; title: string; unit: string; shipped: number; returned: number; canReturn: number }
type SaleReturn = { id: string; allocationId: string; lotNumber: string; newLotId: string; newLotNumber: string; qty: number; unit: string; reason: string; at: string; by: string | null }
type Despatch = {
  id: string
  orderId: string
  orderNo: string
  customerId: string
  customer: string | null
  shippingAddress: string | null
  status: string
  despatchedAt: string | null
  despatchedBy: string | null
  dispatchDate: string | null
  transporter: string | null
  vehicleNo: string | null
  lrNumber: string | null
  containerNo: string | null
  sealNo: string | null
  port: string | null
  deliveredOn: string | null
  delivered: boolean
  loaded: boolean
  packType: string | null
  packages: number | null
  netKg: number | null
  grossKg: number | null
  ewayBillNo: string | null
  irn: string | null
  invoices: Array<{ id: string; code: string; kind: string; status: string; invoiceDate: string }>
  shipped: Shipped[]
  returns: SaleReturn[]
  correctUntil: string | null
  canCorrect: boolean
  updatedAt: string
}

const FIELDS: Array<{ key: string; label: string; pick: (record: Despatch) => string | null }> = [
  { key: 'transporter', label: 'Transporter', pick: (record) => record.transporter },
  { key: 'vehicle_no', label: 'Vehicle no.', pick: (record) => record.vehicleNo },
  { key: 'lr_number', label: 'LR / BL no.', pick: (record) => record.lrNumber },
  { key: 'container_no', label: 'Container no.', pick: (record) => record.containerNo },
  { key: 'seal_no', label: 'Seal no.', pick: (record) => record.sealNo },
  { key: 'port', label: 'Port', pick: (record) => record.port },
]

function qty(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

export function DespatchPage({ id }: { id: string }) {
  const t = useT()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: `cc-despatch-${id}` })
  const [record, setRecord] = React.useState<Despatch | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<'correct' | 'return' | null>(null)
  const [fields, setFields] = React.useState<Record<string, string>>({})
  const [reason, setReason] = React.useState('')
  const [returnLine, setReturnLine] = React.useState<string>('')
  const [returnQty, setReturnQty] = React.useState('')
  const [returnedOn, setReturnedOn] = React.useState(() => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10))
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<Despatch>(`/api/cc_orders/dispatches/detail?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) setError(t('cc_orders.despatch.loadError', 'Could not load the despatch.'))
    else setRecord(call.result)
  }, [id, t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (!record) return <RecordState error={error} loadingLabel={t('cc_orders.despatch.loading', 'Loading despatch…')} />

  const open = (next: 'correct' | 'return') => {
    setReason('')
    if (next === 'correct') setFields(Object.fromEntries(FIELDS.map((field) => [field.key, field.pick(record) ?? ''])))
    else {
      const first = record.shipped.find((line) => line.canReturn > 0)
      setReturnLine(first?.allocationId ?? '')
      setReturnQty(first ? String(first.canReturn) : '')
    }
    setMode(next)
  }

  const submit = async () => {
    if (!mode || reason.trim().length < MIN_REASON || busy) return
    const body =
      mode === 'correct'
        ? { action: 'correct', id: record.id, reason: reason.trim(), fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim() || null])) }
        : { action: 'return', id: record.id, reason: reason.trim(), allocationId: returnLine, qty: Number(returnQty), returnedOn }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { despatchId: record.id, action: mode },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(record.updatedAt), () =>
            apiCall<Despatch & { error?: string }>('/api/cc_orders/dispatches/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_orders.despatch.error', 'Could not save.'), 'error')
        return
      }
      setRecord(call.result)
      setMode(null)
      flash(mode === 'correct' ? t('cc_orders.despatch.corrected', 'Details corrected. The old values are kept in the history.') : t('cc_orders.despatch.returned', 'Return booked. The goods are in the FG store on hold.'), 'success')
    } finally {
      setBusy(false)
    }
  }

  const status = record.status === 'done' ? (record.delivered ? 'delivered' : 'despatched') : record.status === 'on_hold' ? 'on_hold' : 'ready'
  const STATUS_LABEL: Record<string, string> = { delivered: t('cc_orders.despatch.delivered', 'Delivered'), despatched: t('cc_orders.despatch.inTransit', 'Despatched'), on_hold: t('cc_orders.status.on_hold', 'On hold'), ready: t('cc_orders.despatch.ready', 'Ready to despatch') }
  const facts: Fact[] = [
    { label: t('cc_orders.despatch.invoice', 'Invoice'), value: record.invoices.find((entry) => entry.kind === 'invoice')?.code ?? '—' },
    { label: t('cc_orders.despatch.transporter', 'Transporter'), value: record.transporter ?? '—', hint: record.vehicleNo ?? undefined },
    { label: t('cc_orders.despatch.lr', 'LR / BL'), value: record.lrNumber ?? '—' },
    { label: t('cc_orders.despatch.packages', 'Pallets / bundles'), value: record.packages ?? '—', hint: record.packType ?? undefined },
    { label: t('cc_orders.despatch.weights', 'Gross / net kg'), value: `${qty(record.grossKg)} / ${qty(record.netKg)}` },
    { label: t('cc_orders.despatch.deliveredOn', 'Delivered'), value: record.deliveredOn ? formatDate(record.deliveredOn) : record.delivered ? t('common.yes', 'Yes') : '—', tone: record.delivered ? 'good' : record.status === 'done' ? 'warn' : undefined },
  ]
  const canCorrect = record.canCorrect && granted.has('cc_orders.work.dispatch')
  const canReturn = record.status === 'done' && granted.has('cc_orders.reopen') && record.shipped.some((line) => line.canReturn > 0)
  const chosen = record.shipped.find((line) => line.allocationId === returnLine)

  return (
    <RecordPage
      back={{ href: '/backend/dispatch/register', label: t('cc_orders.despatch.back', 'Despatch register') }}
      overline={t('cc_orders.despatch.overline', 'Despatch')}
      title={record.orderNo}
      badges={<StatusBadge variant={status === 'delivered' ? 'success' : status === 'on_hold' ? 'error' : status === 'despatched' ? 'info' : 'warning'}>{STATUS_LABEL[status]}</StatusBadge>}
      meta={[record.customer, record.dispatchDate ? t('cc_orders.despatch.on', 'Despatched {date}', { date: formatDate(record.dispatchDate) }) : null, record.despatchedBy].filter(Boolean).join(' · ')}
      actions={
        <>
          {canCorrect ? (
            <Button type="button" size="sm" variant="outline" onClick={() => open('correct')}>
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_orders.despatch.correct', 'Correct vehicle / LR')}
            </Button>
          ) : null}
          {canReturn ? (
            <Button type="button" size="sm" variant="outline" onClick={() => open('return')}>
              <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_orders.despatch.return', 'Sales return')}
            </Button>
          ) : null}
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_orders.despatch.details', 'Vehicle and documents')} icon={Truck}>
              <FieldList
                fields={[
                  [t('cc_orders.despatch.date', 'Despatch date'), record.dispatchDate ? formatDate(record.dispatchDate) : '—'],
                  [t('cc_orders.despatch.transporter', 'Transporter'), record.transporter ?? '—'],
                  [t('cc_orders.despatch.vehicle', 'Vehicle no.'), record.vehicleNo ?? '—'],
                  [t('cc_orders.despatch.lr', 'LR / BL'), record.lrNumber ?? '—'],
                  [t('cc_orders.despatch.container', 'Container / seal'), [record.containerNo, record.sealNo].filter(Boolean).join(' / ') || '—'],
                  [t('cc_orders.despatch.port', 'Port'), record.port ?? '—'],
                  [t('cc_orders.despatch.eway', 'E-way bill'), record.ewayBillNo ?? '—'],
                  [t('cc_orders.despatch.irn', 'IRN'), record.irn ?? '—'],
                  [t('cc_orders.despatch.shipTo', 'Ship to'), record.shippingAddress ?? '—'],
                  [t('cc_orders.despatch.left', 'Left the gate'), record.despatchedAt ? formatDateTime(record.despatchedAt) : '—'],
                ]}
              />
              {record.correctUntil ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {record.canCorrect ? t('cc_orders.despatch.correctUntil', 'Vehicle and LR details can be corrected until {at}.', { at: formatDateTime(record.correctUntil) }) : t('cc_orders.despatch.correctClosed', 'The 48-hour window to correct these details has closed.')}
                </p>
              ) : null}
            </Panel>
            <Panel title={t('cc_orders.despatch.lots', 'Lots that went out')} icon={PackageOpen} count={record.shipped.length} flush>
              <LinkRows
                empty={t('cc_orders.despatch.noLots', 'Nothing has gone out yet.')}
                rows={record.shipped.map((line) => ({
                  key: line.allocationId,
                  href: recordHref.lot(line.lotId),
                  primary: `${line.lotNumber} · ${line.title}`,
                  secondary: line.returned ? t('cc_orders.despatch.returnedPart', '{qty} {unit} came back', { qty: qty(line.returned), unit: line.unit }) : undefined,
                  value: `${qty(line.shipped)} ${line.unit}`,
                }))}
              />
            </Panel>
            {record.returns.length ? (
              <Panel title={t('cc_orders.despatch.returns', 'Sales returns')} icon={Undo2} count={record.returns.length} flush>
                <LinkRows
                  empty=""
                  rows={record.returns.map((entry) => ({
                    key: entry.id,
                    href: recordHref.lot(entry.newLotId),
                    primary: t('cc_orders.despatch.returnRow', '{lot} back as {newLot}', { lot: entry.lotNumber, newLot: entry.newLotNumber }),
                    secondary: [formatDateTime(entry.at), entry.by, entry.reason].filter(Boolean).join(' · '),
                    value: `${qty(entry.qty)} ${entry.unit}`,
                    badge: <StatusBadge variant="warning">{t('cc_orders.despatch.onHold', 'On hold')}</StatusBadge>,
                  }))}
                />
              </Panel>
            ) : null}
          </>
        }
        side={
          <>
            <Panel title={t('cc_orders.despatch.cameFrom', 'Came from')} flush>
              <LinkRows
                empty=""
                rows={[
                  { key: 'order', href: recordHref.order(record.orderId), primary: t('cc_orders.despatch.order', 'Order {no}', { no: record.orderNo }), secondary: record.customer ?? undefined },
                  { key: 'packing', href: `/backend/orders/${record.orderId}/stages/packing`, primary: t('cc_orders.despatch.packing', 'Packing & weighment'), secondary: [record.packType, record.packages ? t('cc_orders.despatch.packagesCount', '{count} packages', { count: record.packages }) : null].filter(Boolean).join(' · ') || undefined },
                  ...record.invoices.map((entry) => ({ key: entry.id, href: recordHref.invoice(entry.id), primary: `${entry.kind === 'credit_note' ? t('cc_orders.despatch.creditNote', 'Credit note') : t('cc_orders.despatch.invoice', 'Invoice')} ${entry.code}`, secondary: formatDate(entry.invoiceDate), badge: entry.status === 'draft' ? <StatusBadge variant="neutral">{t('cc_orders.despatch.draft', 'Draft')}</StatusBadge> : undefined })),
                ]}
              />
            </Panel>
            <Panel title={t('cc_orders.despatch.wentTo', 'Went to')} icon={FileText} flush>
              <LinkRows
                empty=""
                rows={[
                  { key: 'delivery', href: `/backend/orders/${record.orderId}/stages/dispatch`, primary: t('cc_orders.despatch.delivery', 'Delivery confirmation'), secondary: record.delivered ? (record.deliveredOn ? formatDate(record.deliveredOn) : t('common.yes', 'Yes')) : t('cc_orders.despatch.notConfirmed', 'Not confirmed yet') },
                  ...record.returns.map((entry) => ({ key: `r-${entry.id}`, href: recordHref.lot(entry.newLotId), primary: t('cc_orders.despatch.returnLot', 'Sales return {lot}', { lot: entry.newLotNumber }) })),
                ]}
              />
            </Panel>
          </>
        }
      />
      <Attachments type="dispatch" id={record.id} hint={t('cc_orders.despatch.filesHint', 'LR copy, loading photos, e-way bill, signed POD.')} />
      <Comments type="dispatch" id={record.id} />
      <Timeline type="dispatch" id={record.id} refreshKey={record.updatedAt} />

      <Dialog open={mode !== null} onOpenChange={(next) => !busy && !next && setMode(null)}>
        <DialogContent
          className="sm:max-w-lg"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void submit()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === 'correct' ? t('cc_orders.despatch.correctTitle', 'Correct vehicle and LR details') : t('cc_orders.despatch.returnTitle', 'Book a sales return')}</DialogTitle>
            <DialogDescription>
              {mode === 'correct'
                ? t('cc_orders.despatch.correctHint', 'The old values stay in the history with your reason.')
                : t('cc_orders.despatch.returnHint', 'The goods go back into the FG store as a new lot on hold, to be checked before they are sold again.')}
            </DialogDescription>
          </DialogHeader>
          {mode === 'correct' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={`d-${field.key}`}>{t(`cc_orders.despatch.field.${field.key}`, field.label)}</Label>
                  <Input id={`d-${field.key}`} value={fields[field.key] ?? ''} onChange={(event) => setFields((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                </div>
              ))}
            </div>
          ) : mode === 'return' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor="r-lot">{t('cc_orders.despatch.returnLotLabel', 'Lot')}</Label>
                <Select value={returnLine} onValueChange={setReturnLine}>
                  <SelectTrigger id="r-lot">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {record.shipped
                      .filter((line) => line.canReturn > 0)
                      .map((line) => (
                        <SelectItem key={line.allocationId} value={line.allocationId}>
                          {`${line.lotNumber} · ${line.title} (${qty(line.canReturn)} ${line.unit})`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="r-qty">{t('cc_orders.despatch.returnQty', 'Quantity ({unit})', { unit: chosen?.unit ?? '' })}</Label>
                <Input id="r-qty" type="number" min={0} max={chosen?.canReturn} step="any" value={returnQty} onChange={(event) => setReturnQty(event.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="r-date">{t('cc_orders.despatch.returnedOn', 'Came back on')}</Label>
                <Input id="r-date" type="date" value={returnedOn} onChange={(event) => setReturnedOn(event.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="d-reason">{t('cc_ui.correct.reason', 'Why? (kept in the history)')} *</Label>
            <Textarea id="d-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setMode(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="button" disabled={busy || reason.trim().length < MIN_REASON || (mode === 'return' && (!returnLine || !(Number(returnQty) > 0)))} onClick={() => void submit()}>
              {busy ? t('cc_ui.correct.working', 'Working…') : mode === 'correct' ? t('cc_orders.despatch.saveCorrection', 'Save correction') : t('cc_orders.despatch.bookReturn', 'Book return')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RecordPage>
  )
}

export default DespatchPage
