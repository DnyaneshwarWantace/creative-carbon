"use client"

import * as React from 'react'
import { Building2, ImageUp, Landmark, ScrollText, Save, Ship, Stamp } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

import type { CompanyView } from './types'
import { DEFAULT_LETTERHEAD, type LetterheadTextKey, type LetterheadView } from '../lib/letterhead'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { PageLoading } from '../../cc_ui/components/PageLoading'

type Field = { key: keyof CompanyView; label: string; placeholder?: string; wide?: boolean; area?: number; type?: string; upper?: boolean }

const SECTIONS: Array<{ title: string; hint: string; icon: typeof Building2; fields: Field[] }> = [
  {
    title: 'Company',
    hint: 'Printed at the top of every PI, invoice, challan, COA and PO.',
    icon: Building2,
    fields: [
      { key: 'name', label: 'Company name *', placeholder: 'Creative Carbon Composites' },
      { key: 'legalName', label: 'Legal / trade name', placeholder: 'As on the GST certificate' },
      { key: 'gstin', label: 'GSTIN', placeholder: '06AAPFD7375J1ZV', upper: true },
      { key: 'pan', label: 'PAN', upper: true },
      { key: 'address', label: 'Address', wide: true, area: 3 },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'website', label: 'Website' },
    ],
  },
  {
    title: 'Bank',
    hint: 'Shown on proforma and tax invoices so customers know where to pay.',
    icon: Landmark,
    fields: [
      { key: 'bankName', label: 'Bank name' },
      { key: 'bankBranch', label: 'Branch' },
      { key: 'bankAccount', label: 'Account no.' },
      { key: 'bankIfsc', label: 'IFSC', upper: true },
      { key: 'upiId', label: 'UPI ID' },
    ],
  },
  {
    title: 'Export',
    hint: 'Printed on export invoices. Under a LUT, exports go without IGST.',
    icon: Ship,
    fields: [
      { key: 'iec', label: 'IEC (import export code)', upper: true },
      { key: 'lutArn', label: 'LUT ARN', placeholder: 'e.g. AD240326012345X', upper: true },
      { key: 'lutValidTill', label: 'LUT valid till', type: 'date' },
    ],
  },
  {
    title: 'Documents',
    hint: 'Defaults for new documents. Each document can still be changed on its own page.',
    icon: ScrollText,
    fields: [
      { key: 'signatory', label: 'Authorised signatory', placeholder: 'Name and designation' },
      { key: 'piValidityDays', label: 'Proforma valid for (days)', type: 'number' },
      { key: 'grnOverPercent', label: 'Goods receiving: allow up to % more than the PO', type: 'number' },
      { key: 'piTerms', label: 'Proforma terms', wide: true, area: 5 },
      { key: 'invoiceTerms', label: 'Tax invoice terms', wide: true, area: 5 },
    ],
  },
]

const LETTERHEAD_FIELDS: Array<{ key: LetterheadTextKey; label: string; wide?: boolean; area?: number; placeholder?: string }> = [
  { key: 'letterheadAddress', label: 'Address on the letterhead (quotation, PO, TC)', wide: true, area: 2 },
  { key: 'worksAddress', label: 'Works / plant address (printed under the office address on bills)', wide: true },
  { key: 'mobile', label: 'Mobile' },
  { key: 'email2', label: 'Second e-mail' },
  { key: 'cin', label: 'CIN' },
  { key: 'udyam', label: 'UDYAM no. (with category)' },
  { key: 'stateName', label: 'State name' },
  { key: 'stateCode', label: 'State code' },
  { key: 'exciseNo', label: 'Excise registration no. (leave blank to hide)' },
  { key: 'jurisdiction', label: 'Jurisdiction (city)' },
  { key: 'bankLabel', label: 'Bank name as printed on bills', placeholder: 'Bank name and account as printed' },
  { key: 'certifications', label: 'Certificates under the badges (one per line)', area: 2 },
  { key: 'directors', label: 'Signatories (one per line: name, designation)', area: 3, placeholder: 'Full name, Director' },
  { key: 'labPeople', label: 'Lab people for test certificates (one per line)', area: 3 },
  { key: 'sisterConcern', label: 'Sister concern (printed at the foot of quotations)', wide: true, area: 3 },
  { key: 'declaration', label: 'Declaration on proforma and tax invoices', wide: true, area: 5 },
]

const MAX_IMAGE_BYTES = 500_000

function ImagePicker({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (next: string) => void }) {
  const t = useT()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const pick = (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      flash(t('cc_accounts.company.imageType', 'Pick a PNG, JPG or WebP image.'), 'error')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      flash(t('cc_accounts.company.imageSize', 'The image must be under 500 KB.'), 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => onChange(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-24 w-40 items-center justify-center rounded-md border bg-background p-2">
          {value || fallback ? <img src={value || fallback} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">{t('cc_accounts.company.noImage', 'None yet')}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => pick(event.target.files?.[0])} />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <ImageUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_accounts.company.replaceImage', 'Replace')}
          </Button>
          {value && value !== fallback ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(fallback)}>
              {fallback ? t('cc_accounts.company.resetImage', 'Use the original') : t('cc_accounts.company.removeImage', 'Remove')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function CompanyPage() {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-company' })
  const [company, setCompany] = React.useState<CompanyView | null>(null)
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [letterhead, setLetterhead] = React.useState<LetterheadView>(DEFAULT_LETTERHEAD)
  const [busy, setBusy] = React.useState(false)

  const apply = (next: CompanyView) => {
    setCompany(next)
    setValues(Object.fromEntries(Object.entries(next).filter(([key]) => key !== 'letterhead').map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)])))
    setLetterhead(next.letterhead ?? DEFAULT_LETTERHEAD)
  }

  React.useEffect(() => {
    apiCall<CompanyView>('/api/cc_accounts/company').then((call) => call.result && apply(call.result))
  }, [])

  const save = async () => {
    if (!company) return
    setBusy(true)
    try {
      const body = { ...values, piValidityDays: Number(values.piValidityDays || 15), grnOverPercent: Number(values.grnOverPercent || 0), letterhead }
      const request = () => apiCall<CompanyView & { error?: string }>('/api/cc_accounts/company', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({
        context: { company: company.id },
        mutationPayload: body,
        operation: () => (company.updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(company.updatedAt), request) : request()),
      })
      if (!call.ok || !call.result) {
        flash(call.result?.error ?? t('cc_accounts.company.error', 'Could not save the company details.'), 'error')
        return
      }
      apply(call.result)
      flash(t('cc_accounts.company.saved', 'Company details saved'), 'success')
    } finally {
      setBusy(false)
    }
  }

  if (!company) {
    return (
      <Page>
        <PageBody>
          <PageLoading label={t('cc_accounts.company.loading', 'Loading company details…')} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto flex max-w-4xl flex-col gap-6 pb-16"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void save()
            }
          }}
        >
          <header className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_accounts.company.eyebrow', 'Masters')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_accounts.company.title', 'Company details')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">{t('cc_accounts.company.lede', 'Set once; every document the system prints uses these.')}</p>
            </div>
            <Button type="submit" disabled={busy || !values.name?.trim()}>
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {busy ? t('cc_accounts.company.saving', 'Saving…') : t('cc_accounts.company.save', 'Save')}
            </Button>
          </header>
          {SECTIONS.map((section) => (
            <section key={section.title} className="space-y-4 rounded-lg border bg-card p-5 shadow-xs">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <section.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">{t(`cc_accounts.company.section.${section.title}`, section.title)}</h2>
                  <p className="text-xs text-muted-foreground">{section.hint}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <div key={field.key} className={field.wide ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
                    <Label htmlFor={`company-${field.key}`} className="text-xs text-muted-foreground">
                      {field.label}
                    </Label>
                    {field.area ? (
                      <Textarea id={`company-${field.key}`} rows={field.area} value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                    ) : (
                      <Input
                        id={`company-${field.key}`}
                        type={field.type ?? 'text'}
                        value={values[field.key] ?? ''}
                        placeholder={field.placeholder}
                        className={field.upper ? 'uppercase' : undefined}
                        onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: field.upper ? event.target.value.toUpperCase() : event.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
          <section className="space-y-4 rounded-lg border bg-card p-5 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Stamp className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">{t('cc_accounts.company.section.letterhead', 'Letterhead and printed papers')}</h2>
                <p className="text-xs text-muted-foreground">{t('cc_accounts.company.letterheadHint', 'Logo, badges and the lines printed on quotations, proforma and tax invoices, purchase orders and test certificates.')}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ImagePicker label={t('cc_accounts.company.logo', 'Company logo')} value={letterhead.logoUrl} fallback={DEFAULT_LETTERHEAD.logoUrl} onChange={(next) => setLetterhead((prev) => ({ ...prev, logoUrl: next }))} />
              <div className="space-y-2">
                <ImagePicker label={t('cc_accounts.company.badges', 'ISO / TÜV / IAF badges')} value={letterhead.badgesUrl} fallback={DEFAULT_LETTERHEAD.badgesUrl} onChange={(next) => setLetterhead((prev) => ({ ...prev, badgesUrl: next }))} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={letterhead.showBadges} onCheckedChange={(checked) => setLetterhead((prev) => ({ ...prev, showBadges: checked }))} />
                  {t('cc_accounts.company.showBadges', 'Print the badges on the letterhead')}
                </label>
              </div>
              <ImagePicker label={t('cc_accounts.company.signature', 'Signature (optional, printed above "Authorised Signatory")')} value={letterhead.signatureUrl} fallback="" onChange={(next) => setLetterhead((prev) => ({ ...prev, signatureUrl: next }))} />
              <ImagePicker label={t('cc_accounts.company.stamp', 'Company stamp (optional)')} value={letterhead.stampUrl} fallback="" onChange={(next) => setLetterhead((prev) => ({ ...prev, stampUrl: next }))} />
              {LETTERHEAD_FIELDS.map((field) => (
                <div key={field.key} className={field.wide ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
                  <Label htmlFor={`letterhead-${field.key}`} className="text-xs text-muted-foreground">
                    {t(`cc_accounts.company.lh.${field.key}`, field.label)}
                  </Label>
                  {field.area ? (
                    <Textarea id={`letterhead-${field.key}`} rows={field.area} value={letterhead[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setLetterhead((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                  ) : (
                    <Input id={`letterhead-${field.key}`} value={letterhead[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setLetterhead((prev) => ({ ...prev, [field.key]: event.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          </section>
        </form>
      </PageBody>
    </Page>
  )
}

export default CompanyPage
