"use client"

import * as React from 'react'
import { ClipboardList, Save } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { PO_DOCUMENTS, customerPoSchema, type CustomerPo } from '../lib/customerPo'
import type { Order } from './types'

type TextKey = 'poDate' | 'offerRef' | 'vendorCode' | 'buyerName' | 'buyerPhone' | 'buyerEmail' | 'indentNo' | 'indentDate' | 'division' | 'priceBasis' | 'freight' | 'packing' | 'carrier' | 'insurance'

const HEADER: Array<{ key: TextKey; label: string; type?: string; placeholder?: string; wide?: boolean }> = [
  { key: 'poDate', label: 'PO date', type: 'date' },
  { key: 'offerRef', label: 'Our offer / quotation ref', placeholder: 'CCCPL/100' },
  { key: 'vendorCode', label: 'Our vendor code with them', placeholder: '1106246931' },
  { key: 'buyerName', label: 'Buyer name' },
  { key: 'buyerPhone', label: 'Buyer phone' },
  { key: 'buyerEmail', label: 'Buyer e-mail' },
  { key: 'indentNo', label: 'Their indent no.' },
  { key: 'indentDate', label: 'Indent date', type: 'date' },
  { key: 'division', label: 'Division / plant' },
  { key: 'priceBasis', label: 'Price basis', placeholder: 'Ex factory / EXW Ahmedabad' },
  { key: 'freight', label: 'Freight', placeholder: 'On actual' },
  { key: 'packing', label: 'P & F', placeholder: 'Nil' },
  { key: 'carrier', label: 'Carrier / transporter', placeholder: 'Door delivery TCI freight', wide: true },
  { key: 'insurance', label: 'Insurance / special instruction', wide: true },
]

type LineDraft = { lineId: string; itemCode: string; description: string; deliveryDate: string }

function linesOf(order: Order): LineDraft[] {
  return order.lines.map((line) => {
    const customer = (line.specs as Record<string, Record<string, string> | undefined>).customer ?? {}
    return { lineId: line.id, itemCode: customer.item_code ?? '', description: customer.description ?? '', deliveryDate: customer.delivery_date ?? '' }
  })
}

export function CustomerPoPanel({ order, editable, busy, onSave }: { order: Order; editable: boolean; busy: boolean; onSave: (body: { customerPo: CustomerPo; lines: LineDraft[]; amendmentNote?: string }) => Promise<boolean> }) {
  const t = useT()
  const saved = React.useMemo(() => order.customerPo ?? customerPoSchema.parse({}), [order.customerPo])
  const savedLines = React.useMemo(() => linesOf(order), [order])
  const [draft, setDraft] = React.useState<CustomerPo>(saved)
  const [lines, setLines] = React.useState<LineDraft[]>(savedLines)
  const [note, setNote] = React.useState('')
  React.useEffect(() => setDraft(saved), [saved])
  React.useEffect(() => setLines(savedLines), [savedLines])
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved) || JSON.stringify(lines) !== JSON.stringify(savedLines)
  const amending = draft.amendmentNo > (order.customerPo?.amendmentNo ?? 0)
  const unsent = draft.docsRequired.filter((doc) => !draft.docsSent.includes(doc))
  const toggle = (list: 'docsRequired' | 'docsSent', doc: string, on: boolean) =>
    setDraft((prev) => {
      const next = on ? [...new Set([...prev[list], doc])] : prev[list].filter((entry) => entry !== doc)
      return list === 'docsRequired' && !on ? { ...prev, docsRequired: next, docsSent: prev.docsSent.filter((entry) => entry !== doc) } : { ...prev, [list]: next }
    })

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-bold">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('cc_orders.po.title', 'Customer PO')}
          {order.customerPoRef ? <span className="font-mono text-xs text-muted-foreground">{order.customerPoRef}</span> : null}
          {draft.amendmentNo ? <StatusBadge variant="info">{t('cc_orders.po.amendment', 'Amendment {n}', { n: draft.amendmentNo })}</StatusBadge> : null}
          {draft.poDate && !draft.acknowledged ? <StatusBadge variant="warning">{t('cc_orders.po.notAcknowledged', 'Not acknowledged')}</StatusBadge> : null}
          {unsent.length ? <StatusBadge variant="warning">{t('cc_orders.po.docsToSend', '{n} documents to send', { n: unsent.length })}</StatusBadge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {HEADER.map((field) => (
            <div key={field.key} className={field.wide ? 'space-y-1 sm:col-span-3' : 'space-y-1'}>
              <Label htmlFor={`po-${field.key}`} className="text-xs text-muted-foreground">
                {t(`cc_orders.po.${field.key}`, field.label)}
              </Label>
              <Input id={`po-${field.key}`} type={field.type ?? 'text'} disabled={!editable} placeholder={field.placeholder} value={draft[field.key]} onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))} />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="po-amendmentNo" className="text-xs text-muted-foreground">
              {t('cc_orders.po.amendmentNo', 'Amendment no.')}
            </Label>
            <Input id="po-amendmentNo" type="number" min={0} max={99} disabled={!editable} value={String(draft.amendmentNo)} onChange={(event) => setDraft((prev) => ({ ...prev, amendmentNo: Math.max(0, Number(event.target.value) || 0) }))} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={draft.acknowledged} disabled={!editable} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, acknowledged: checked === true }))} />
            {t('cc_orders.po.acknowledged', 'PO acknowledged to the customer')}
          </label>
        </div>
        {amending ? (
          <div className="space-y-1 rounded-md border border-status-info-border bg-status-info-bg p-3">
            <Label htmlFor="po-amend-note" className="text-xs">
              {t('cc_orders.po.amendNote', 'What does amendment {n} change? (kept in the order history; the order revision goes up)', { n: draft.amendmentNo })}
            </Label>
            <Textarea id="po-amend-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
        ) : null}
        <div className="space-y-2">
          <p className="text-xs font-semibold">{t('cc_orders.po.docs', 'Documents the PO asks for with the goods')}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {PO_DOCUMENTS.map((doc) => {
              const required = draft.docsRequired.includes(doc)
              return (
                <div key={doc} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox checked={required} disabled={!editable} onCheckedChange={(checked) => toggle('docsRequired', doc, checked === true)} />
                    {t(`cc_orders.po.doc.${doc}`, doc)}
                  </label>
                  {required ? (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox checked={draft.docsSent.includes(doc)} disabled={!editable} onCheckedChange={(checked) => toggle('docsSent', doc, checked === true)} />
                      {t('cc_orders.po.sent', 'sent')}
                    </label>
                  ) : null}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">{t('cc_orders.po.docsHint', 'Despatch cannot be completed until each asked-for document is marked sent. An issued test certificate for this order ticks itself.')}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold">{t('cc_orders.po.lines', 'Their item code, description and delivery date per line')}</p>
          {order.lines.map((line, index) => (
            <div key={line.id} className="grid grid-cols-1 gap-2 rounded border p-2 sm:grid-cols-4">
              <p className="text-sm font-medium sm:col-span-4">
                {index + 1}. {line.product?.title ?? '—'}
              </p>
              <Input aria-label={t('cc_orders.po.itemCode', 'Their item code')} disabled={!editable} placeholder={t('cc_orders.po.itemCode', 'Their item code')} value={lines[index]?.itemCode ?? ''} onChange={(event) => setLines((prev) => prev.map((entry, at) => (at === index ? { ...entry, itemCode: event.target.value } : entry)))} />
              <Input aria-label={t('cc_orders.po.description', 'Their description')} className="sm:col-span-2" disabled={!editable} placeholder={t('cc_orders.po.description', 'Their description')} value={lines[index]?.description ?? ''} onChange={(event) => setLines((prev) => prev.map((entry, at) => (at === index ? { ...entry, description: event.target.value } : entry)))} />
              <Input aria-label={t('cc_orders.po.lineDelivery', 'Delivery date')} type="date" disabled={!editable} value={lines[index]?.deliveryDate ?? ''} onChange={(event) => setLines((prev) => prev.map((entry, at) => (at === index ? { ...entry, deliveryDate: event.target.value } : entry)))} />
            </div>
          ))}
        </div>
        {editable ? (
          <div className="flex justify-end gap-2">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(saved)
                  setLines(savedLines)
                  setNote('')
                }}
              >
                {t('common.reset', 'Reset')}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={busy || !dirty || (amending && note.trim().length < 3)}
              onClick={async () => {
                if (await onSave({ customerPo: draft, lines, ...(amending ? { amendmentNote: note.trim() } : {}) })) setNote('')
              }}
            >
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_orders.po.save', 'Save customer PO')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
