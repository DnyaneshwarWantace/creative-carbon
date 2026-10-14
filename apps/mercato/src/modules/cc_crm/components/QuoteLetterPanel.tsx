"use client"

import * as React from 'react'
import { ChevronDown, Save } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Switch } from '@open-mercato/ui/primitives/switch'
import type { QuoteLetter } from '../lib/quoteLetter'

type TextKey = 'toDesignation' | 'toCompany' | 'toAddress' | 'kindAttn' | 'refLine' | 'grade' | 'delivery' | 'taxes' | 'packing' | 'freight' | 'validity' | 'payment'

const TO_FIELDS: Array<{ key: TextKey; label: string; area?: boolean; placeholder?: string }> = [
  { key: 'toDesignation', label: 'Designation', placeholder: 'DY. MANAGER, MECHANICAL, SHOPS, D&D' },
  { key: 'toCompany', label: 'Company' },
  { key: 'toAddress', label: 'Address', area: true },
  { key: 'kindAttn', label: 'Kind attention', placeholder: 'HARISH R.' },
  { key: 'refLine', label: 'Reference line', area: true, placeholder: 'With Ref. To your Mail Dated: 29/08/2026 by Mr. Harish R.. MO: 9480829173' },
  { key: 'grade', label: 'Grade (in "Grade … as under")' },
]

const TERM_FIELDS: Array<{ key: TextKey; label: string }> = [
  { key: 'delivery', label: 'Delivery' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'packing', label: 'P & F' },
  { key: 'freight', label: 'Freight' },
  { key: 'validity', label: 'Validity' },
  { key: 'payment', label: 'Payment' },
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

export function QuoteLetterPanel({ letter, lineTitles, editable, busy, onSave }: { letter: QuoteLetter; lineTitles: string[]; editable: boolean; busy: boolean; onSave: (next: QuoteLetter) => Promise<boolean> }) {
  const t = useT()
  const [draft, setDraft] = React.useState<QuoteLetter>(letter)
  React.useEffect(() => setDraft(letter), [letter])
  const dirty = JSON.stringify(draft) !== JSON.stringify(letter)
  const text = (key: TextKey, label: string, area?: boolean, placeholder?: string) => (
    <div key={key} className="space-y-1">
      <Label htmlFor={`qt-letter-${key}`} className="text-xs text-muted-foreground">
        {t(`cc_crm.letter.${key}`, label)}
      </Label>
      {area ? (
        <Textarea id={`qt-letter-${key}`} rows={2} disabled={!editable} placeholder={placeholder} value={draft[key]} onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))} />
      ) : (
        <Input id={`qt-letter-${key}`} disabled={!editable} placeholder={placeholder} value={draft[key]} onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))} />
      )}
    </div>
  )
  const setLine = (index: number, key: 'drawing' | 'unit' | 'ratePer', value: string) =>
    setDraft((prev) => {
      const lines = lineTitles.map((_, at) => prev.lines[at] ?? { drawing: '', unit: '', ratePer: '' })
      lines[index] = { ...lines[index], [key]: value }
      return { ...prev, lines }
    })

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-xs" aria-labelledby="qt-letter">
      <div>
        <h2 id="qt-letter" className="text-sm font-semibold">
          {t('cc_crm.letter.title', 'Printed quotation')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('cc_crm.letter.hint', 'What prints on the letterhead: who it goes to, the reference line, drawing numbers and terms.')}</p>
      </div>
      <div className="flex rounded-md border bg-background p-0.5" role="radiogroup" aria-label={t('cc_crm.letter.type', 'Quotation type')}>
        {(['budgetary', 'firm'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={draft.quoteType === value}
            disabled={!editable}
            onClick={() => setDraft((prev) => ({ ...prev, quoteType: value }))}
            className={draft.quoteType === value ? 'h-8 flex-1 rounded bg-primary text-xs font-medium text-primary-foreground' : 'h-8 flex-1 rounded text-xs text-muted-foreground'}
          >
            {value === 'budgetary' ? t('cc_crm.letter.budgetary', 'Budgetary') : t('cc_crm.letter.firm', 'Firm')}
          </button>
        ))}
      </div>
      <Section title={t('cc_crm.letter.to', 'To, attention and reference')} open>
        {TO_FIELDS.map((field) => text(field.key, field.label, field.area, field.placeholder))}
      </Section>
      <Section title={t('cc_crm.letter.lines', 'Drawing no. and units per line')}>
        {lineTitles.map((title, index) => (
          <div key={`${title}-${index}`} className="space-y-1.5 rounded border p-2">
            <p className="text-xs font-medium">
              {index + 1}. {title}
            </p>
            <Input aria-label={t('cc_crm.letter.drawing', 'Drawing line')} disabled={!editable} placeholder={t('cc_crm.letter.drawingPlaceholder', 'AS PER YOUR DRAWING NO: SW 675124/1')} value={draft.lines[index]?.drawing ?? ''} onChange={(event) => setLine(index, 'drawing', event.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input aria-label={t('cc_crm.letter.unit', 'Unit')} disabled={!editable} placeholder="NOS" value={draft.lines[index]?.unit ?? ''} onChange={(event) => setLine(index, 'unit', event.target.value.toUpperCase())} />
              <Input aria-label={t('cc_crm.letter.ratePer', 'Rate per')} disabled={!editable} placeholder="EACH" value={draft.lines[index]?.ratePer ?? ''} onChange={(event) => setLine(index, 'ratePer', event.target.value.toUpperCase())} />
            </div>
          </div>
        ))}
      </Section>
      <Section title={t('cc_crm.letter.terms', 'Terms & conditions')}>
        <div className="grid grid-cols-2 gap-2">{TERM_FIELDS.map((field) => text(field.key, field.label))}</div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={draft.showTotal} disabled={!editable} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, showTotal: checked }))} />
          {t('cc_crm.letter.showTotal', 'Print the total under the lines')}
        </label>
      </Section>
      {editable ? (
        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(letter)}>
              {t('common.reset', 'Reset')}
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy || !dirty} onClick={async () => void (await onSave(draft))}>
            <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_crm.letter.save', 'Save quotation letter')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
