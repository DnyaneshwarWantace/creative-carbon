"use client"

import * as React from 'react'
import { ClipboardCheck, Pencil } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PO_DOCUMENTS, type PoAmendment, type PoDetails, type PoDocumentCheck, type PoDocumentKey } from '../lib/poRules'

type PoLine = { lineId: string; position: number; title: string; quantity: number; itemCode: string | null; description: string | null; uom: string | null; deliveryDate: string | null }
type PoView = {
  orderId: string
  customerPoRef: string | null
  details: PoDetails
  lines: PoLine[]
  documents: PoDocumentCheck[]
  openDocuments: Array<{ key: string; label: string }>
  amendments: PoAmendment[]
  acknowledgedAt: string | null
  acknowledgedByName: string | null
  acknowledgement: { due: string | null; overdue: boolean; daysLeft: number | null }
  earliestDelivery: string | null
  lateLines: number
  updatedAt: string
}

const DETAIL_FIELDS: Array<{ key: keyof PoDetails; label: string; type?: 'date' }> = [
  { key: 'poDate', label: 'PO date', type: 'date' },
  { key: 'ourOfferRef', label: 'Our offer / quotation ref.' },
  { key: 'vendorCode', label: 'Our vendor code with them' },
  { key: 'buyerName', label: 'Buyer' },
  { key: 'buyerPhone', label: 'Buyer phone' },
  { key: 'buyerEmail', label: 'Buyer e-mail' },
  { key: 'indentNo', label: 'Indent No.' },
  { key: 'indentDate', label: 'Indent date', type: 'date' },
  { key: 'division', label: 'Division' },
  { key: 'priceBasis', label: 'Price basis' },
  { key: 'freight', label: 'Freight' },
  { key: 'packingForwarding', label: 'P & F' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'insurance', label: 'Insurance' },
]

function show(value: string | null | undefined): string {
  return value && value.trim() ? value : '—'
}

export function PoDetailsPanel({ orderId, canEdit }: { orderId: string; canEdit: boolean }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-order-po' })
  const [view, setView] = React.useState<PoView | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [details, setDetails] = React.useState<PoDetails | null>(null)
  const [lines, setLines] = React.useState<Record<string, Partial<PoLine>>>({})
  const [documents, setDocuments] = React.useState<PoDocumentCheck[]>([])
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const adopt = React.useCallback((next: PoView) => {
    setView(next)
    setDetails(next.details)
    setLines(Object.fromEntries(next.lines.map((line) => [line.lineId, line])))
    setDocuments(next.documents)
  }, [])

  React.useEffect(() => {
    void apiCall<PoView>(`/api/cc_orders/orders/po?orderId=${encodeURIComponent(orderId)}`).then((call) => {
      if (call.ok && call.result) adopt(call.result)
    })
  }, [orderId, adopt])

  const send = async (method: 'PUT' | 'POST', body: Record<string, unknown>): Promise<boolean> => {
    if (!view) return false
    setBusy(true)
    try {
      const request = () => apiCall<PoView & { error?: string }>('/api/cc_orders/orders/po', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({
        context: { resourceKind: 'cc_orders.order', resourceId: orderId },
        mutationPayload: body,
        operation: () => withScopedApiRequestHeaders(buildOptimisticLockHeader(view.updatedAt), request),
      })
      if (!call.ok || !call.result?.orderId) {
        flash(call.result?.error ?? t('cc_orders.po.saveError', 'Could not save the PO details.'), 'error')
        return false
      }
      adopt(call.result)
      return true
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!details) return
    const lineBody = Object.fromEntries(Object.entries(lines).map(([id, line]) => [id, { itemCode: line.itemCode ?? null, description: line.description ?? null, uom: line.uom ?? null, deliveryDate: line.deliveryDate ?? null }]))
    if (await send('PUT', { orderId, details, lines: lineBody, documents })) {
      setEditing(false)
      flash(t('cc_orders.po.saved', 'PO details saved.'), 'success')
    }
  }

  if (!view || !details) return null
  const hasAnything = Boolean(view.customerPoRef) || view.details.poDate || view.documents.length || view.amendments.length
  if (!hasAnything && !canEdit) return null

  const toggleDoc = (key: PoDocumentKey, on: boolean) => setDocuments((current) => (on ? [...current.filter((entry) => entry.key !== key), { key, state: 'pending' as const }] : current.filter((entry) => entry.key !== key)))
  const markDoc = (key: PoDocumentKey, state: 'pending' | 'sent') => setDocuments((current) => current.map((entry) => (entry.key === key ? { ...entry, state } : entry)))
  const stateOf = (key: PoDocumentKey) => documents.find((entry) => entry.key === key)?.state ?? null

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="order-po" onKeyDown={(event) => { if (!editing) return; if (event.key === 'Escape') setEditing(false); if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save() }}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="order-po" className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('cc_orders.po.title', 'Customer purchase order')}
        </h2>
        {canEdit && !editing ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('cc_orders.po.edit', 'Edit')}
          </Button>
        ) : null}
      </div>

      {view.acknowledgement.due && !view.acknowledgedAt ? (
        <div className={cn('flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm', view.acknowledgement.overdue ? 'border-status-error-border bg-status-error-bg text-status-error-text' : 'border-status-warning-border bg-status-warning-bg text-status-warning-text')}>
          <span>
            {view.acknowledgement.overdue
              ? t('cc_orders.po.ackOverdue', 'Acknowledge this PO now. It is taken as accepted after 7 days, and that passed {days} days ago.', { days: -(view.acknowledgement.daysLeft ?? 0) })
              : t('cc_orders.po.ackDue', 'Acknowledge or object by {date} ({days} days left). After 7 days the PO is taken as accepted.', { date: view.acknowledgement.due, days: view.acknowledgement.daysLeft ?? 0 })}
          </span>
          {canEdit ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void send('POST', { orderId, action: 'acknowledge' })}>
              {t('cc_orders.po.acknowledge', 'Mark acknowledged')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {view.acknowledgedAt ? <p className="text-xs text-muted-foreground">{t('cc_orders.po.ackDone', 'Acknowledged by {name} on {date}', { name: view.acknowledgedByName ?? '—', date: view.acknowledgedAt.slice(0, 10) })}</p> : null}

      {editing ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DETAIL_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={`po-${field.key}`} className="text-xs text-muted-foreground">{t(`cc_orders.po.f.${field.key}`, field.label)}</Label>
              <Input id={`po-${field.key}`} type={field.type ?? 'text'} value={details[field.key] ?? ''} onChange={(event) => setDetails({ ...details, [field.key]: event.target.value })} />
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{t('cc_orders.view.po', 'Customer PO')}</dt>
          <dd className="font-mono">{show(view.customerPoRef)}{view.details.amendmentNo ? ` · Amd ${view.details.amendmentNo}` : ''}</dd>
          {DETAIL_FIELDS.filter((field) => view.details[field.key]).map((field) => (
            <React.Fragment key={field.key}>
              <dt className="text-muted-foreground">{t(`cc_orders.po.f.${field.key}`, field.label)}</dt>
              <dd className="break-words">{show(view.details[field.key])}</dd>
            </React.Fragment>
          ))}
          {view.earliestDelivery ? (
            <>
              <dt className="text-muted-foreground">{t('cc_orders.po.earliest', 'Earliest line delivery')}</dt>
              <dd>{view.earliestDelivery}{view.lateLines ? <StatusBadge variant="error" className="ml-2">{t('cc_orders.po.late', '{count} late', { count: view.lateLines })}</StatusBadge> : null}</dd>
            </>
          ) : null}
        </dl>
      )}

      {view.lines.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">{t('cc_orders.po.item', 'Our item')}</th>
                <th className="py-1 pr-2">{t('cc_orders.po.itemCode', 'Their item code')}</th>
                <th className="py-1 pr-2">{t('cc_orders.po.uom', 'UoM')}</th>
                <th className="py-1 pr-2">{t('cc_orders.po.lineDelivery', 'Delivery')}</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((line) => {
                const draft = lines[line.lineId] ?? line
                const late = !editing && line.deliveryDate && view.lateLines > 0 && line.deliveryDate < new Date().toISOString().slice(0, 10)
                return (
                  <tr key={line.lineId} className="border-t border-border align-top">
                    <td className="py-1 pr-2 text-muted-foreground">{line.position}</td>
                    <td className="py-1 pr-2">{line.title}</td>
                    <td className="py-1 pr-2">{editing ? <Input value={draft.itemCode ?? ''} onChange={(event) => setLines((current) => ({ ...current, [line.lineId]: { ...draft, itemCode: event.target.value } }))} /> : show(line.itemCode)}</td>
                    <td className="py-1 pr-2">{editing ? <Input className="w-20" value={draft.uom ?? ''} onChange={(event) => setLines((current) => ({ ...current, [line.lineId]: { ...draft, uom: event.target.value } }))} /> : show(line.uom)}</td>
                    <td className={cn('py-1 pr-2', late && 'text-status-error-text')}>{editing ? <Input type="date" value={draft.deliveryDate ?? ''} onChange={(event) => setLines((current) => ({ ...current, [line.lineId]: { ...draft, deliveryDate: event.target.value } }))} /> : show(line.deliveryDate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold text-muted-foreground">{t('cc_orders.po.mustCome', 'The material must come with')}</h3>
        {editing ? (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {PO_DOCUMENTS.map((doc) => (
              <li key={doc.key} className="flex items-center gap-2 text-sm">
                <input id={`po-doc-${doc.key}`} type="checkbox" checked={stateOf(doc.key) !== null} onChange={(event) => toggleDoc(doc.key, event.target.checked)} />
                <label htmlFor={`po-doc-${doc.key}`}>{t(`cc_orders.po.doc.${doc.key}`, doc.label)}</label>
              </li>
            ))}
          </ul>
        ) : view.documents.length ? (
          <ul className="space-y-1">
            {view.documents.map((entry) => (
              <li key={entry.key} className="flex items-center justify-between gap-2 text-sm">
                <span>{PO_DOCUMENTS.find((doc) => doc.key === entry.key)?.label ?? entry.key}</span>
                {canEdit ? (
                  <Button type="button" size="sm" variant={entry.state === 'sent' ? 'ghost' : 'outline'} disabled={busy} onClick={() => { const next = view.documents.map((item) => (item.key === entry.key ? { ...item, state: item.state === 'sent' ? ('pending' as const) : ('sent' as const) } : item)); setDocuments(next); void send('PUT', { orderId, details: view.details, lines: Object.fromEntries(view.lines.map((line) => [line.lineId, { itemCode: line.itemCode, description: line.description, uom: line.uom, deliveryDate: line.deliveryDate }])), documents: next }) }}>
                    {entry.state === 'sent' ? t('cc_orders.po.sent', 'Sent ✓') : t('cc_orders.po.markSent', 'Mark sent')}
                  </Button>
                ) : (
                  <StatusBadge variant={entry.state === 'sent' ? 'success' : 'warning'}>{entry.state === 'sent' ? t('cc_orders.po.sent', 'Sent ✓') : t('cc_orders.po.pending', 'To send')}</StatusBadge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('cc_orders.po.noDocs', 'Nothing asked for.')}</p>
        )}
        {view.openDocuments.length ? <p className="text-xs text-muted-foreground">{t('cc_orders.po.blocks', 'Despatch cannot be closed until each of these is sent.')}</p> : null}
        {editing && documents.some((entry) => entry.state !== null) ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {documents.map((entry) => (
              <Button key={entry.key} type="button" size="sm" variant={entry.state === 'sent' ? 'secondary' : 'outline'} onClick={() => markDoc(entry.key, entry.state === 'sent' ? 'pending' : 'sent')}>
                {PO_DOCUMENTS.find((doc) => doc.key === entry.key)?.label}: {entry.state === 'sent' ? t('cc_orders.po.sent', 'Sent ✓') : t('cc_orders.po.pending', 'To send')}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold text-muted-foreground">{t('cc_orders.po.amendments', 'Amendments')}</h3>
        {view.amendments.length ? (
          <ul className="space-y-1 text-sm">
            {view.amendments.map((entry) => (
              <li key={entry.no}>
                <span className="font-mono">Amd {entry.no}</span>{entry.date ? ` · ${entry.date}` : ''}{entry.note ? ` · ${entry.note}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('cc_orders.po.noAmendments', 'None.')}</p>
        )}
        {canEdit && !editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-64" value={note} placeholder={t('cc_orders.po.amendNote', 'What changed in the amendment')} onChange={(event) => setNote(event.target.value)} />
            <Button type="button" size="sm" variant="outline" disabled={busy || !note.trim()} onClick={async () => { if (await send('POST', { orderId, action: 'amend', date: new Date().toISOString().slice(0, 10), note: note.trim() })) setNote('') }}>
              {t('cc_orders.po.addAmendment', 'Add amendment')}
            </Button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>{t('cc_orders.po.save', 'Save')}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { adopt(view); setEditing(false) }}>{t('cc_orders.po.cancel', 'Cancel')}</Button>
        </div>
      ) : null}
    </section>
  )
}
