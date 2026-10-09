"use client"

import * as React from 'react'
import { Building2, Landmark, ScrollText, Save, Ship } from 'lucide-react'
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

export function CompanyPage() {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-company' })
  const [company, setCompany] = React.useState<CompanyView | null>(null)
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)

  const apply = (next: CompanyView) => {
    setCompany(next)
    setValues(Object.fromEntries(Object.entries(next).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)])))
  }

  React.useEffect(() => {
    apiCall<CompanyView>('/api/cc_accounts/company').then((call) => call.result && apply(call.result))
  }, [])

  const save = async () => {
    if (!company) return
    setBusy(true)
    try {
      const body = { ...values, piValidityDays: Number(values.piValidityDays || 15), grnOverPercent: Number(values.grnOverPercent || 0) }
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
        </form>
      </PageBody>
    </Page>
  )
}

export default CompanyPage
