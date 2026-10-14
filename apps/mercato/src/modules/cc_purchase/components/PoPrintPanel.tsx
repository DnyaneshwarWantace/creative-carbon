"use client"

import * as React from 'react'
import { Save } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Switch } from '@open-mercato/ui/primitives/switch'
import type { PoPrintDetails } from '../lib/poPrint'

type TextKey = Exclude<keyof PoPrintDetails, 'needsTc'>

const FIELDS: Array<{ key: TextKey; label: string; area?: boolean; wide?: boolean }> = [
  { key: 'formNo', label: 'Form no.' },
  { key: 'deliverAt', label: 'Deliver at' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'packing', label: 'P & F' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'through', label: 'Through' },
  { key: 'payment', label: 'Payment', wide: true },
  { key: 'instructions', label: 'Special instructions (one per line, printed with #)', area: true, wide: true },
  { key: 'warranty', label: 'Guarantee / warranty', area: true, wide: true },
]

export function PoPrintPanel({ details, editable, busy, onSave }: { details: PoPrintDetails; editable: boolean; busy: boolean; onSave: (next: PoPrintDetails) => Promise<boolean> }) {
  const t = useT()
  const [draft, setDraft] = React.useState<PoPrintDetails>(details)
  React.useEffect(() => setDraft(details), [details])
  const dirty = JSON.stringify(draft) !== JSON.stringify(details)
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-xs" aria-labelledby="po-print">
      <div>
        <h2 id="po-print" className="text-sm font-semibold">
          {t('cc_purchase.print.title', 'Printed purchase order')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('cc_purchase.print.hint', 'Form no., instructions, delivery place and terms printed on the letterhead.')}</p>
      </div>
      <label className="flex items-start gap-2 rounded-md border bg-background p-2 text-xs">
        <Switch checked={draft.needsTc} disabled={!editable} onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, needsTc: checked }))} />
        <span>
          <span className="font-medium">{t('cc_purchase.print.needsTc', 'Supplier must send a test certificate')}</span>
          <span className="block text-muted-foreground">{t('cc_purchase.print.needsTcHint', 'Printed on the PO; goods receiving asks for it.')}</span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((field) => (
          <div key={field.key} className={field.wide ? 'col-span-2 space-y-1' : 'space-y-1'}>
            <Label htmlFor={`po-print-${field.key}`} className="text-xs text-muted-foreground">
              {t(`cc_purchase.print.${field.key}`, field.label)}
            </Label>
            {field.area ? (
              <Textarea id={`po-print-${field.key}`} rows={2} disabled={!editable} value={draft[field.key]} onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))} />
            ) : (
              <Input id={`po-print-${field.key}`} disabled={!editable} value={draft[field.key]} onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))} />
            )}
          </div>
        ))}
      </div>
      {editable ? (
        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(details)}>
              {t('common.reset', 'Reset')}
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy || !dirty} onClick={async () => void (await onSave(draft))}>
            <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_purchase.print.save', 'Save print details')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
