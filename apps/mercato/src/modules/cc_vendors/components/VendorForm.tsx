"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BadgeCheck, Building2, CircleAlert, MapPin, UserRound } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { useListOptions } from '../../cc_lists/components/useListOptions'
import { GSTIN_PATTERN, gstinChecksumOk, stateFromGstin } from '../../cc_accounts/lib/gstStates'
import { VENDOR_CATEGORIES } from '../data/validators'
import { VENDOR_CATEGORY_LABEL } from '../lib/categories'

type Category = (typeof VENDOR_CATEGORIES)[number]
type FormState = {
  name: string
  code: string
  gstNumber: string
  category: Category
  contactPerson: string
  contactPhone: string
  contactEmail: string
  address: string
  paymentTerms: string
  isActive: boolean
}
type VendorRow = {
  name: string
  code: string | null
  gst_number: string | null
  category: Category | null
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  address: string | null
  payment_terms: string | null
  is_active: boolean | null
  updated_at: string | null
}

const EMPTY: FormState = { name: '', code: '', gstNumber: '', category: 'both', contactPerson: '', contactPhone: '', contactEmail: '', address: '', paymentTerms: '', isActive: true }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <header className="flex items-start gap-2.5 border-b px-4 py-3 sm:px-5">
        <span className="mt-0.5 text-primary">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  )
}

function Field({ label, required, error, hint, children, className, htmlFor }: { label: string; required?: boolean; error?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-status-error-text"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-xs text-status-error-text">
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function VendorForm({ vendorId }: { vendorId?: string }) {
  const t = useT()
  const router = useRouter()
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: `cc-vendor-form-${vendorId ?? 'new'}` })
  const [loading, setLoading] = React.useState(Boolean(vendorId))
  const [saving, setSaving] = React.useState(false)
  const [version, setVersion] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const termOptions = useListOptions('payment_terms')
  const backHref = vendorId ? `/backend/cc_vendors/${vendorId}` : '/backend/cc_vendors'

  React.useEffect(() => {
    if (!vendorId) return
    let cancelled = false
    void apiCall<{ items?: VendorRow[] }>(`/api/cc_vendors/vendors?id=${encodeURIComponent(vendorId)}`).then((call) => {
      if (cancelled) return
      const row = call.result?.items?.[0]
      if (row) {
        setForm({
          name: row.name ?? '',
          code: row.code ?? '',
          gstNumber: row.gst_number ?? '',
          category: row.category ?? 'both',
          contactPerson: row.contact_person ?? '',
          contactPhone: row.contact_phone ?? '',
          contactEmail: row.contact_email ?? '',
          address: row.address ?? '',
          paymentTerms: row.payment_terms ?? '',
          isActive: row.is_active !== false,
        })
        setVersion(row.updated_at ?? null)
      } else flash(t('cc_vendors.form.notFound', 'Vendor not found'), 'error')
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [vendorId, t])

  const patch = (next: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...next }))
    setErrors((prev) => {
      const copy = { ...prev }
      for (const key of Object.keys(next)) delete copy[key]
      return copy
    })
  }

  const gstin = form.gstNumber.trim().toUpperCase().replace(/\s/g, '')
  const gstState = gstin && GSTIN_PATTERN.test(gstin) ? stateFromGstin(gstin) : null
  const gstHint = !gstin
    ? t('cc_vendors.form.gstHintEmpty', 'Leave empty for an unregistered vendor')
    : !GSTIN_PATTERN.test(gstin)
      ? t('cc_vendors.form.gstTyping', '15 characters, like 27AAACT1234A1Z5')
      : !gstinChecksumOk(gstin)
        ? null
        : t('cc_vendors.form.gstOk', 'State: {state} · PAN: {pan}', { state: gstState?.name ?? '—', pan: gstin.slice(2, 12) })
  const gstLocalError = gstin.length === 15 && GSTIN_PATTERN.test(gstin) && !gstinChecksumOk(gstin) ? t('cc_vendors.form.gstChecksum', 'This GSTIN is not valid (check digit does not match)') : undefined

  const save = async () => {
    const local: Record<string, string> = {}
    if (form.name.trim().length < 2) local.name = t('cc_vendors.form.errName', 'Enter the vendor name')
    if (gstin && !GSTIN_PATTERN.test(gstin)) local.gstNumber = t('cc_vendors.form.gstTyping', '15 characters, like 27AAACT1234A1Z5')
    else if (gstLocalError) local.gstNumber = gstLocalError
    if (gstin && !form.address.trim()) local.address = t('cc_vendors.form.errAddress', 'A GST-registered vendor needs the address (it prints on the PO)')
    if (form.contactEmail.trim() && !EMAIL.test(form.contactEmail.trim())) local.contactEmail = t('cc_vendors.form.errEmail', 'Email is not valid')
    if (Object.keys(local).length) {
      setErrors(local)
      flash(t('cc_vendors.form.fix', 'Some fields need fixing.'), 'error')
      return
    }
    const body = { ...(vendorId ? { id: vendorId } : {}), ...form, gstNumber: gstin }
    setSaving(true)
    try {
      const call = await runMutation({
        context: { formId: `cc-vendor-form-${vendorId ?? 'new'}`, resourceKind: 'cc_vendors.vendor', resourceId: vendorId ?? 'new', retryLastMutation },
        mutationPayload: body,
        operation: () => {
          const request = () => apiCall<{ id?: string | null; ok?: boolean; error?: string; fieldErrors?: Record<string, string>; code?: string }>('/api/cc_vendors/vendors', { method: vendorId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          return vendorId && version ? withScopedApiRequestHeaders(buildOptimisticLockHeader(version), request) : request()
        },
      })
      if (!call.ok) {
        const fields = call.result?.fieldErrors ?? {}
        setErrors(fields)
        flash(
          call.status === 409 && !Object.keys(fields).length
            ? t('cc_vendors.form.conflict', 'Someone else changed this vendor. Reload and try again.')
            : (call.result?.error ?? t('cc_vendors.form.error', 'Could not save the vendor.')),
          'error',
        )
        return
      }
      const id = vendorId ?? call.result?.id
      flash(vendorId ? t('cc_vendors.flash.saved', 'Vendor saved') : t('cc_vendors.flash.created', 'Vendor created'), 'success')
      router.push(id ? `/backend/cc_vendors/${id}` : '/backend/cc_vendors')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Page><PageBody><PageLoading label={t('cc_vendors.form.loading', 'Loading vendor…')} /></PageBody></Page>

  const submitLabel = saving ? t('cc_vendors.form.saving', 'Saving…') : vendorId ? t('cc_vendors.form.save', 'Save vendor') : t('cc_vendors.form.action.create', 'Create vendor')

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto max-w-6xl pb-28 lg:pb-10"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape') router.push(backHref)
          }}
        >
          <div className="mb-5 flex items-start gap-3">
            <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0" aria-label={t('common.back', 'Back')}>
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{t('cc_vendors.form.eyebrow', 'Vendor')}</p>
              <h1 className="text-xl font-semibold sm:text-2xl">{vendorId ? t('cc_vendors.form.editTitle', 'Edit {name}', { name: form.name || '…' }) : t('cc_vendors.create.title', 'New vendor')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('cc_vendors.form.lede', 'Checked before saving: GSTIN, phone, email and duplicates. A vendor code is given when you save, if you leave it empty.')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Section icon={<Building2 className="h-4 w-4" />} title={t('cc_vendors.form.group.details', 'Vendor details')}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field label={t('cc_vendors.form.field.name', 'Vendor name')} required error={errors.name} className="md:col-span-2" htmlFor="ve-name">
                    <Input id="ve-name" autoFocus={!vendorId} value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder={t('cc_vendors.form.field.namePlaceholder', 'e.g. Sunshine Chemicals Pvt Ltd')} />
                  </Field>
                  <Field label={t('cc_vendors.form.field.code', 'Vendor code')} error={errors.code} hint={vendorId ? undefined : t('cc_vendors.form.codeHint', 'Empty: given on save (VEN001…)')} htmlFor="ve-code">
                    <Input id="ve-code" className="font-mono uppercase" value={form.code} onChange={(event) => patch({ code: event.target.value.toUpperCase() })} maxLength={30} />
                  </Field>
                </div>
                <Field label={t('cc_vendors.form.field.category', 'Supplies')}>
                  <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-0.5 sm:inline-flex" role="radiogroup" aria-label={t('cc_vendors.form.field.category', 'Supplies')}>
                    {VENDOR_CATEGORIES.map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={form.category === value} onClick={() => patch({ category: value })} className={cn('min-h-8 rounded-md px-3 text-sm', form.category === value ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                        {t(`cc_vendors.category.${value}`, VENDOR_CATEGORY_LABEL[value])}
                      </button>
                    ))}
                  </div>
                </Field>
              </Section>

              <Section icon={<UserRound className="h-4 w-4" />} title={t('cc_vendors.form.group.contact', 'Contact')} hint={t('cc_vendors.form.contactHint', 'Who Purchase calls about orders and deliveries')}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field label={t('cc_vendors.form.field.contactPerson', 'Contact person')} htmlFor="ve-person">
                    <Input id="ve-person" value={form.contactPerson} onChange={(event) => patch({ contactPerson: event.target.value })} placeholder="e.g. Rakesh Sharma" />
                  </Field>
                  <Field label={t('cc_vendors.form.field.contactPhone', 'Phone')} error={errors.contactPhone} hint={t('cc_vendors.form.phoneHint', '10-digit mobile gets +91')} htmlFor="ve-phone">
                    <Input id="ve-phone" type="tel" inputMode="tel" value={form.contactPhone} onChange={(event) => patch({ contactPhone: event.target.value })} placeholder="98765 43210" />
                  </Field>
                  <Field label={t('cc_vendors.form.field.contactEmail', 'Email')} error={errors.contactEmail} htmlFor="ve-email">
                    <Input id="ve-email" type="email" value={form.contactEmail} onChange={(event) => patch({ contactEmail: event.target.value })} placeholder="sales@vendor.com" />
                  </Field>
                </div>
              </Section>

              <Section icon={<MapPin className="h-4 w-4" />} title={t('cc_vendors.form.group.address', 'Address')} hint={t('cc_vendors.form.addressHint', 'Printed on every purchase order')}>
                <Field label={t('cc_vendors.form.field.address', 'Address')} required={Boolean(gstin)} error={errors.address} htmlFor="ve-address">
                  <Textarea id="ve-address" rows={3} value={form.address} onChange={(event) => patch({ address: event.target.value })} placeholder={t('cc_vendors.form.addressPlaceholder', 'Plot / building, road, area, city, state, PIN')} />
                </Field>
              </Section>
            </div>

            <div className="space-y-5">
              <Section icon={<BadgeCheck className="h-4 w-4" />} title={t('cc_vendors.form.group.gst', 'GST and terms')}>
                <Field label={t('cc_vendors.form.field.gstNumber', 'GSTIN')} error={errors.gstNumber ?? gstLocalError} hint={gstHint} htmlFor="ve-gst">
                  <Input id="ve-gst" className="font-mono uppercase" maxLength={15} value={form.gstNumber} onChange={(event) => patch({ gstNumber: event.target.value.toUpperCase() })} placeholder="27AAACT1234A1Z5" />
                </Field>
                <Field label={t('cc_vendors.form.field.paymentTerms', 'Payment terms')} hint={t('cc_vendors.form.termsHint', 'Copied to each new PO; pick or type')} htmlFor="ve-terms">
                  <Input id="ve-terms" list="ve-terms-list" value={form.paymentTerms} onChange={(event) => patch({ paymentTerms: event.target.value })} placeholder="e.g. 30 days credit" />
                  <datalist id="ve-terms-list">
                    {termOptions.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded-sm border-input" checked={form.isActive} onChange={(event) => patch({ isActive: event.target.checked })} />
                  {t('cc_vendors.form.field.isActive', 'Active (shown when raising a PO)')}
                </label>
              </Section>

              <div className="hidden lg:block">
                <Button type="submit" className="w-full" disabled={saving}>
                  {submitLabel}
                </Button>
                <Button asChild type="button" variant="ghost" className="mt-2 w-full">
                  <Link href={backHref}>{t('common.cancel', 'Cancel')}</Link>
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">{t('cc_vendors.form.keys', 'Ctrl/⌘ + Enter saves · Esc goes back')}</p>
              </div>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur pb-safe lg:hidden">
            <Button asChild type="button" variant="outline" className="flex-1">
              <Link href={backHref}>{t('common.cancel', 'Cancel')}</Link>
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}

export default VendorForm
