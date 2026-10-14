"use client"

import * as React from 'react'
import { FileBadge, Plus, Save, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { TC_TEMPLATES, judge, newCertificate, tcRowSchema, type Certificate } from '../../lib/testCertificate'

type HeaderKey = 'tcNo' | 'traceability' | 'customer' | 'product' | 'grade' | 'thickness' | 'standard'

const HEADER: Array<{ key: HeaderKey; label: string; placeholder?: string }> = [
  { key: 'tcNo', label: 'TC no. (blank = next number)' },
  { key: 'traceability', label: 'Production traceability', placeholder: 'F/110/7/2026-27/' },
  { key: 'customer', label: 'Customer' },
  { key: 'product', label: 'Product' },
  { key: 'grade', label: 'Grade' },
  { key: 'thickness', label: 'Thickness' },
  { key: 'standard', label: 'Specified as per' },
]

function PersonPicker({ id, label, value, options, disabled, onChange }: { id: string; label: string; value: string; options: string[]; disabled: boolean; onChange: (next: string) => void }) {
  const list = value && !options.includes(value) ? [value, ...options] : options
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {list.length ? (
        <Select value={value || undefined} disabled={disabled} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {list.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input id={id} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  )
}

export function CertificatePanel({
  certificate,
  seed,
  labPeople,
  directors,
  editable,
  busy,
  onSave,
}: {
  certificate: Certificate | null
  seed: { lotRefs: string | null; customer: string | null; itemTitle: string | null; thicknessMm: number | null; testedBy: string | null }
  labPeople: string[]
  directors: string[]
  editable: boolean
  busy: boolean
  onSave: (next: Certificate) => Promise<boolean>
}) {
  const t = useT()
  const [draft, setDraft] = React.useState<Certificate | null>(certificate)
  const [templateKey, setTemplateKey] = React.useState(TC_TEMPLATES[0].key)
  React.useEffect(() => setDraft(certificate), [certificate])

  if (!draft) {
    return (
      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-xs" aria-labelledby="tc-start">
        <h2 id="tc-start" className="flex items-center gap-2 text-sm font-semibold">
          <FileBadge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('cc_production.tc.title', 'Test certificate')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('cc_production.tc.startHint', 'Make the certificate here instead of uploading a scan. Pick the grade; the IS 2036 rows are filled in and you type the observed values.')}</p>
        {editable ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1">
              <Label htmlFor="tc-template" className="text-xs text-muted-foreground">
                {t('cc_production.tc.template', 'Grade template')}
              </Label>
              <Select value={templateKey} onValueChange={setTemplateKey}>
                <SelectTrigger id="tc-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TC_TEMPLATES.map((template) => (
                    <SelectItem key={template.key} value={template.key}>
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setDraft(
                  newCertificate({
                    templateKey,
                    tcNo: '',
                    lotRefs: seed.lotRefs,
                    customer: seed.customer,
                    itemTitle: seed.itemTitle,
                    thicknessMm: seed.thicknessMm,
                    testedBy: seed.testedBy && labPeople.includes(seed.testedBy) ? seed.testedBy : (labPeople[0] ?? ''),
                    verifiedBy: directors.find((name) => /dhairya/i.test(name)) ?? directors[0] ?? '',
                  }),
                )
              }
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.tc.make', 'Make test certificate')}
            </Button>
          </div>
        ) : null}
      </section>
    )
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(certificate)
  const setRow = (index: number, key: 'property' | 'condition' | 'specified' | 'unit' | 'observed' | 'criteria', value: string) =>
    setDraft((prev) => (prev ? { ...prev, rows: prev.rows.map((item, at) => (at === index ? { ...item, [key]: value } : item)) } : prev))
  const notOk = draft.rows.filter((item) => judge(item) === 'NOT OK').length
  const missing = draft.rows.filter((item) => !item.observed.trim()).length

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 shadow-xs" aria-labelledby="tc-edit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tc-edit" className="flex items-center gap-2 text-sm font-semibold">
          <FileBadge className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('cc_production.tc.title', 'Test certificate')}
          {draft.tcNo ? <span className="font-mono text-xs text-muted-foreground">{draft.tcNo}</span> : null}
        </h2>
        <div className="flex gap-1.5">
          {missing ? <StatusBadge variant="warning">{t('cc_production.tc.missing', '{n} values to enter', { n: missing })}</StatusBadge> : null}
          {notOk ? <StatusBadge variant="error">{t('cc_production.tc.notOk', '{n} Not OK', { n: notOk })}</StatusBadge> : null}
          {!missing && !notOk ? <StatusBadge variant="success">{t('cc_production.tc.allOk', 'All OK')}</StatusBadge> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {HEADER.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label htmlFor={`tc-${field.key}`} className="text-xs text-muted-foreground">
              {t(`cc_production.tc.${field.key}`, field.label)}
            </Label>
            <Input id={`tc-${field.key}`} disabled={!editable} placeholder={field.placeholder} value={draft[field.key]} onChange={(event) => setDraft((prev) => (prev ? { ...prev, [field.key]: event.target.value } : prev))} />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor="tc-lastColumn" className="text-xs text-muted-foreground">
            {t('cc_production.tc.lastColumn', 'Last column')}
          </Label>
          <Select value={draft.lastColumn} disabled={!editable} onValueChange={(value) => setDraft((prev) => (prev ? { ...prev, lastColumn: value as Certificate['lastColumn'] } : prev))}>
            <SelectTrigger id="tc-lastColumn">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remark">{t('cc_production.tc.remark', 'Remark (OK / Not OK)')}</SelectItem>
              <SelectItem value="criteria">{t('cc_production.tc.criteria', 'Test criteria code')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">{t('cc_production.tc.property', 'Test property')}</th>
              <th className="px-2 py-1.5 text-left">{t('cc_production.tc.observed', 'Observed value')}</th>
              <th className="px-2 py-1.5 text-left">{draft.lastColumn === 'criteria' ? t('cc_production.tc.criteria', 'Test criteria code') : t('cc_production.tc.remarkShort', 'Remark')}</th>
              <th className="px-2 py-1.5 text-left">{t('cc_production.tc.specified', 'Specified')}</th>
              <th className="px-2 py-1.5 text-left">{t('cc_production.tc.unit', 'Unit')}</th>
              {editable ? <th className="w-8" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {draft.rows.map((item, index) => {
              const verdict = judge(item)
              return (
                <tr key={`${item.property}-${index}`} className="align-top">
                  <td className="px-2 py-1.5">
                    <Input aria-label={t('cc_production.tc.property', 'Test property')} className="h-8" disabled={!editable} value={item.property} onChange={(event) => setRow(index, 'property', event.target.value)} />
                    <Input aria-label={t('cc_production.tc.condition', 'Condition')} className="mt-1 h-7 text-xs" disabled={!editable} placeholder={t('cc_production.tc.condition', 'Condition')} value={item.condition} onChange={(event) => setRow(index, 'condition', event.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={`${item.property} ${t('cc_production.tc.observed', 'Observed value')}`} className={cn('h-8 w-32', verdict === 'NOT OK' && 'border-status-error-border')} disabled={!editable} value={item.observed} onChange={(event) => setRow(index, 'observed', event.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    {draft.lastColumn === 'criteria' ? <Input aria-label={t('cc_production.tc.criteria', 'Test criteria code')} className="h-8 w-32" disabled={!editable} value={item.criteria} onChange={(event) => setRow(index, 'criteria', event.target.value)} /> : null}
                    {verdict ? <StatusBadge variant={verdict === 'OK' ? 'success' : 'error'}>{verdict}</StatusBadge> : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={t('cc_production.tc.specified', 'Specified')} className="h-8 w-32" disabled={!editable} value={item.specified} onChange={(event) => setRow(index, 'specified', event.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input aria-label={t('cc_production.tc.unit', 'Unit')} className="h-8 w-28" disabled={!editable} value={item.unit} onChange={(event) => setRow(index, 'unit', event.target.value)} />
                  </td>
                  {editable ? (
                    <td className="px-1 py-1.5">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('cc_production.tc.removeRow', 'Remove row')} onClick={() => setDraft((prev) => (prev ? { ...prev, rows: prev.rows.filter((_, at) => at !== index) } : prev))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editable ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setDraft((prev) => (prev ? { ...prev, rows: [...prev.rows, tcRowSchema.parse({ property: 'New test' })] } : prev))}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('cc_production.tc.addRow', 'Add a test')}
        </Button>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PersonPicker id="tc-testedBy" label={t('cc_production.tc.testedBy', 'Tested by (lab)')} value={draft.testedBy} options={labPeople} disabled={!editable} onChange={(next) => setDraft((prev) => (prev ? { ...prev, testedBy: next } : prev))} />
        <PersonPicker id="tc-verifiedBy" label={t('cc_production.tc.verifiedBy', 'Verified by')} value={draft.verifiedBy} options={directors} disabled={!editable} onChange={(next) => setDraft((prev) => (prev ? { ...prev, verifiedBy: next } : prev))} />
      </div>
      {editable ? (
        <div className="flex justify-end gap-2">
          {dirty ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(certificate)}>
              {t('common.reset', 'Reset')}
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy || !dirty} onClick={async () => void (await onSave(draft))}>
            <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_production.tc.save', 'Save test certificate')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
