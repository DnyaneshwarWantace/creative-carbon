"use client"

import * as React from 'react'
import { ChevronDown, Copy, Printer, Save } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { BillDetails, BillParty } from '../data/entities'
import { COPY_LABELS, type CopyKind } from '../../cc_ui/lib/printKit'

type HeaderKey = 'deliveryNote' | 'paymentTerms' | 'referenceNo' | 'otherReferences' | 'buyerOrderNo' | 'buyerOrderDate' | 'dispatchDocNo' | 'deliveryNoteDate' | 'dispatchedThrough' | 'destination' | 'placeOfSupply'

const HEADER_FIELDS: Array<{ key: HeaderKey; label: string; type?: string }> = [
  { key: 'deliveryNote', label: 'Delivery note' },
  { key: 'paymentTerms', label: 'Mode / terms of payment' },
  { key: 'referenceNo', label: 'Reference no. & date' },
  { key: 'otherReferences', label: 'Other references' },
  { key: 'buyerOrderNo', label: 'Buyer’s order no.' },
  { key: 'buyerOrderDate', label: 'Buyer’s order date', type: 'date' },
  { key: 'dispatchDocNo', label: 'Dispatch doc no.' },
  { key: 'deliveryNoteDate', label: 'Delivery note date', type: 'date' },
  { key: 'dispatchedThrough', label: 'Dispatched through' },
  { key: 'destination', label: 'Destination' },
  { key: 'placeOfSupply', label: 'Place of supply' },
]

const PARTY_FIELDS: Array<{ key: keyof BillParty; label: string; area?: boolean; upper?: boolean }> = [
  { key: 'name', label: 'Name' },
  { key: 'address', label: 'Address', area: true },
  { key: 'gstin', label: 'GSTIN/UIN', upper: true },
  { key: 'pan', label: 'PAN/IT No', upper: true },
  { key: 'stateName', label: 'State name' },
  { key: 'stateCode', label: 'State code' },
  { key: 'contact', label: 'Contact' },
  { key: 'email', label: 'E-mail' },
]

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-md border bg-background" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold">
        {title}
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 border-t p-3">{children}</div>
    </details>
  )
}

export function BillDetailsPanel({
  bill,
  lineTitles,
  editable,
  einvoice,
  busy,
  onSave,
}: {
  bill: BillDetails
  lineTitles: string[]
  editable: boolean
  einvoice: boolean
  busy: boolean
  onSave: (next: BillDetails) => Promise<boolean>
}) {
  const t = useT()
  const [draft, setDraft] = React.useState<BillDetails>(bill)
  React.useEffect(() => setDraft(bill), [bill])
  const dirty = JSON.stringify(draft) !== JSON.stringify(bill)
  const setText = (key: keyof BillDetails, value: string) => setDraft((prev) => ({ ...prev, [key]: value }))
  const setParty = (side: 'buyer' | 'consignee', key: keyof BillParty, value: string) => setDraft((prev) => ({ ...prev, [side]: { ...prev[side], [key]: value } }))
  const dateValue = (value: string | null) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '')

  const party = (side: 'buyer' | 'consignee') => (
    <div className="grid grid-cols-2 gap-2">
      {PARTY_FIELDS.map((field) => (
        <div key={field.key} className={field.area || field.key === 'name' ? 'col-span-2 space-y-1' : 'space-y-1'}>
          <Label htmlFor={`bill-${side}-${field.key}`} className="text-xs text-muted-foreground">
            {t(`cc_accounts.bill.party.${field.key}`, field.label)}
          </Label>
          {field.area ? (
            <Textarea id={`bill-${side}-${field.key}`} rows={3} disabled={!editable} value={draft[side][field.key] ?? ''} onChange={(event) => setParty(side, field.key, event.target.value)} />
          ) : (
            <Input id={`bill-${side}-${field.key}`} disabled={!editable} className={field.upper ? 'uppercase' : undefined} value={draft[side][field.key] ?? ''} onChange={(event) => setParty(side, field.key, field.upper ? event.target.value.toUpperCase() : event.target.value)} />
          )}
        </div>
      ))}
    </div>
  )

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-xs" aria-labelledby="bill-details">
      <div>
        <h2 id="bill-details" className="text-sm font-semibold">
          {t('cc_accounts.bill.title', 'Printed bill details')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('cc_accounts.bill.hint', 'The boxes, parties and lines printed in the Tally layout. Filled from the order and customer; change anything before printing.')}</p>
      </div>
      <Section title={t('cc_accounts.bill.header', 'Header boxes')} open>
        <div className="grid grid-cols-2 gap-2">
          {HEADER_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label htmlFor={`bill-${field.key}`} className="text-xs text-muted-foreground">
                {t(`cc_accounts.bill.${field.key}`, field.label)}
              </Label>
              <Input id={`bill-${field.key}`} type={field.type ?? 'text'} disabled={!editable} value={field.type === 'date' ? dateValue(draft[field.key]) : (draft[field.key] ?? '')} onChange={(event) => setText(field.key, event.target.value)} />
            </div>
          ))}
          <div className="col-span-2 space-y-1">
            <Label htmlFor="bill-termsOfDelivery" className="text-xs text-muted-foreground">
              {t('cc_accounts.bill.termsOfDelivery', 'Terms of delivery')}
            </Label>
            <Textarea id="bill-termsOfDelivery" rows={2} disabled={!editable} value={draft.termsOfDelivery ?? ''} onChange={(event) => setText('termsOfDelivery', event.target.value)} />
          </div>
        </div>
      </Section>
      <Section title={t('cc_accounts.bill.buyer', 'Buyer (bill to)')}>{party('buyer')}</Section>
      <Section title={t('cc_accounts.bill.consignee', 'Consignee (ship to)')}>
        {editable ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft((prev) => ({ ...prev, consignee: { ...prev.buyer } }))}>
            <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('cc_accounts.bill.sameAsBuyer', 'Same as buyer')}
          </Button>
        ) : null}
        {party('consignee')}
      </Section>
      <Section title={t('cc_accounts.bill.lines', 'Second line under each item')}>
        {lineTitles.map((title, index) => (
          <div key={`${title}-${index}`} className="space-y-1">
            <Label htmlFor={`bill-line-${index}`} className="text-xs text-muted-foreground">
              {index + 1}. {title}
            </Label>
            <Input
              id={`bill-line-${index}`}
              disabled={!editable}
              placeholder={t('cc_accounts.bill.linePlaceholder', 'e.g. 4X2X0.7MM or AS PER YOUR DRG')}
              value={draft.lineNotes?.[index] ?? ''}
              onChange={(event) =>
                setDraft((prev) => {
                  const notes = [...(prev.lineNotes ?? [])]
                  while (notes.length < lineTitles.length) notes.push('')
                  notes[index] = event.target.value
                  return { ...prev, lineNotes: notes }
                })
              }
            />
          </div>
        ))}
      </Section>
      <Section title={t('cc_accounts.bill.remarks', 'Remarks')}>
        <Textarea id="bill-remarks" aria-label={t('cc_accounts.bill.remarks', 'Remarks')} rows={2} disabled={!editable} value={draft.remarks ?? ''} onChange={(event) => setText('remarks', event.target.value)} />
      </Section>
      {einvoice ? (
        <Section title={t('cc_accounts.bill.einvoice', 'e-Invoice (IRN, Ack, QR)')}>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="bill-irn" className="text-xs text-muted-foreground">IRN</Label>
              <Input id="bill-irn" disabled={!editable} value={draft.irn ?? ''} onChange={(event) => setText('irn', event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bill-ackNo" className="text-xs text-muted-foreground">{t('cc_accounts.bill.ackNo', 'Ack no.')}</Label>
              <Input id="bill-ackNo" disabled={!editable} value={draft.ackNo ?? ''} onChange={(event) => setText('ackNo', event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bill-ackDate" className="text-xs text-muted-foreground">{t('cc_accounts.bill.ackDate', 'Ack date')}</Label>
              <Input id="bill-ackDate" type="date" disabled={!editable} value={dateValue(draft.ackDate)} onChange={(event) => setText('ackDate', event.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="bill-signedQr" className="text-xs text-muted-foreground">{t('cc_accounts.bill.signedQr', 'Signed QR code text (from the e-invoice portal or Tally)')}</Label>
              <Textarea id="bill-signedQr" rows={3} disabled={!editable} value={draft.signedQr ?? ''} onChange={(event) => setText('signedQr', event.target.value)} />
            </div>
          </div>
        </Section>
      ) : null}
      {editable ? (
        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(bill)}>
              {t('common.reset', 'Reset')}
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy || !dirty} onClick={async () => void (await onSave(draft))}>
            <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_accounts.bill.save', 'Save bill details')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

export function PrintCopiesButton({ defaultCopies, onPrint }: { defaultCopies: CopyKind[]; onPrint: (copies: CopyKind[]) => Promise<boolean> }) {
  const t = useT()
  const [copies, setCopies] = React.useState<CopyKind[]>(defaultCopies)
  const [open, setOpen] = React.useState(false)
  const print = async (picked: CopyKind[]) => {
    if (!picked.length) return
    if (!(await onPrint(picked))) flash(t('cc_accounts.inv.popup', 'Allow pop-ups to print'), 'error')
    setOpen(false)
  }
  return (
    <div className="inline-flex">
      <Button type="button" variant="outline" size="sm" className="rounded-r-none" onClick={() => void print(copies)}>
        <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('cc_accounts.bill.print', 'Print / PDF')}
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="rounded-l-none border-l-0 px-2" aria-label={t('cc_accounts.bill.copies', 'Choose copies')}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-2">
          <p className="text-xs font-semibold">{t('cc_accounts.bill.copies', 'Choose copies')}</p>
          {(Object.keys(COPY_LABELS) as CopyKind[]).map((copy) => (
            <label key={copy} className="flex items-center gap-2 text-sm">
              <Checkbox checked={copies.includes(copy)} onCheckedChange={(checked) => setCopies((prev) => (checked ? [...prev, copy].sort((a, b) => Object.keys(COPY_LABELS).indexOf(a) - Object.keys(COPY_LABELS).indexOf(b)) : prev.filter((entry) => entry !== copy)))} />
              {COPY_LABELS[copy]}
            </label>
          ))}
          <Button type="button" size="sm" className="w-full" disabled={!copies.length} onClick={() => void print(copies)}>
            {t('cc_accounts.bill.printCopies', 'Print {count} copies', { count: copies.length })}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
