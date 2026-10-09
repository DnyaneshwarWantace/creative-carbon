"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BadgeCheck, Building2, CircleAlert, MapPin, Plus, Trash2, UserRound, Users, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { Dropdown } from '../../cc_lists/components/Dropdown'
import { useListOptions } from '../../cc_lists/components/useListOptions'
import { usePaymentTerms } from '../../cc_lists/components/usePaymentTerms'
import { GSTIN_PATTERN, GST_STATES, stateFromGstin } from '../../cc_accounts/lib/gstStates'

type Row = Record<string, unknown> & { id: string }
type GstType = 'registered' | 'unregistered' | 'composition' | 'overseas'
type Address = { id: string | null; street: string; district: string; state: string; pin: string; country: string }
type Contact = { key: string; id: string | null; name: string; phone: string; email: string }
type FormState = {
  category: 'business' | 'individual'
  name: string
  legalName: string
  gstType: GstType
  gstin: string
  phone: string
  email: string
  salesManager: string
  paymentTerms: string
  paymentRemarks: string
}

const EMPTY_FORM: FormState = { category: 'business', name: '', legalName: '', gstType: 'registered', gstin: '', phone: '', email: '', salesManager: '', paymentTerms: 'due_on_delivery', paymentRemarks: '' }
const EMPTY_ADDRESS: Address = { id: null, street: '', district: '', state: '', pin: '', country: 'India' }
const STATES = Object.values(GST_STATES).sort()
const GST_TYPES: Array<{ value: GstType; label: string; hint: string }> = [
  { value: 'registered', label: 'Registered', hint: 'Has a GSTIN' },
  { value: 'composition', label: 'Composition', hint: 'GSTIN, composition scheme' },
  { value: 'unregistered', label: 'Unregistered', hint: 'No GSTIN' },
  { value: 'overseas', label: 'Overseas', hint: 'Export customer' },
]

let contactSeq = 0
function newContact(partial?: Partial<Contact>): Contact {
  contactSeq += 1
  return { key: `c${contactSeq}`, id: null, name: '', phone: '', email: '', ...partial }
}

function plain(value: unknown): string {
  if (typeof value !== 'string') return ''
  return /^[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:v\d+$/.test(value) ? '' : value
}

function addressFrom(row: Row | undefined): Address {
  if (!row) return { ...EMPTY_ADDRESS }
  return { id: row.id, street: plain(row.address_line1), district: plain(row.city), state: plain(row.region), pin: plain(row.postal_code), country: plain(row.country) || 'India' }
}

function Section({ icon, title, hint, children, actions }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-primary">{icon}</span>
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
        {actions}
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

function AddressFields({ prefix, value, onChange, errors, india }: { prefix: 'billing' | 'shipping'; value: Address; onChange: (patch: Partial<Address>) => void; errors: Record<string, string>; india: boolean }) {
  const t = useT()
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
      <Field label={t('cc_customers.form.street', 'Street address')} className="col-span-2 md:col-span-6" error={errors[`${prefix}.street`]} htmlFor={`${prefix}-street`}>
        <Input id={`${prefix}-street`} value={value.street} onChange={(event) => onChange({ street: event.target.value })} placeholder={t('cc_customers.form.streetHint', 'Plot / building, road, area')} />
      </Field>
      <Field label={t('cc_customers.form.district', 'City / district')} className="col-span-2 md:col-span-2" htmlFor={`${prefix}-district`}>
        <Input id={`${prefix}-district`} value={value.district} onChange={(event) => onChange({ district: event.target.value })} />
      </Field>
      <Field label={india ? t('cc_customers.form.state', 'State') : t('cc_customers.form.region', 'State / region')} className="col-span-2 md:col-span-2" error={errors[`${prefix}.state`]}>
        {india ? (
          <Dropdown value={value.state} onChange={(event) => onChange({ state: event.target.value })} placeholder={t('cc_customers.form.pickState', 'Pick the state')}>
            <option value="">—</option>
            {STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Dropdown>
        ) : (
          <Input value={value.state} onChange={(event) => onChange({ state: event.target.value })} />
        )}
      </Field>
      <Field label={india ? t('cc_customers.form.pin', 'PIN code') : t('cc_customers.form.postcode', 'Postcode')} className="col-span-1" error={errors[`${prefix}.pin`]} htmlFor={`${prefix}-pin`}>
        <Input id={`${prefix}-pin`} inputMode={india ? 'numeric' : 'text'} maxLength={india ? 6 : 12} className="font-mono" value={value.pin} onChange={(event) => onChange({ pin: india ? event.target.value.replace(/\D/g, '') : event.target.value })} />
      </Field>
      <Field label={t('cc_customers.form.country', 'Country')} className="col-span-1" error={errors[`${prefix}.country`]} htmlFor={`${prefix}-country`}>
        <Input id={`${prefix}-country`} value={value.country} onChange={(event) => onChange({ country: event.target.value })} />
      </Field>
    </div>
  )
}

export function CustomerForm({ customerId }: { customerId?: string }) {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `cc-customer-form-${customerId ?? 'new'}` })
  const [loading, setLoading] = React.useState(Boolean(customerId))
  const [saving, setSaving] = React.useState(false)
  const [version, setVersion] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [billing, setBilling] = React.useState<Address>({ ...EMPTY_ADDRESS })
  const [shipping, setShipping] = React.useState<Address>({ ...EMPTY_ADDRESS })
  const [separateShipping, setSeparateShipping] = React.useState(false)
  const [contacts, setContacts] = React.useState<Contact[]>(() => [newContact({ key: 'c-first' })])
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [duplicateName, setDuplicateName] = React.useState<string | null>(null)
  const termOptions = usePaymentTerms(form.paymentTerms)
  const remarkOptions = useListOptions('payment_remarks', form.paymentRemarks)

  React.useEffect(() => {
    if (!customerId) return
    let cancelled = false
    Promise.all([
      apiCall<{ items?: Row[] }>(`/api/customers/companies?id=${encodeURIComponent(customerId)}&pageSize=1`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: Row[] }>(`/api/customers/addresses?entityId=${encodeURIComponent(customerId)}&pageSize=20`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: Row[] }>(`/api/customers/contacts?entityId=${encodeURIComponent(customerId)}&pageSize=50`, undefined, { fallback: { items: [] } }),
    ]).then(([companyCall, addressCall, contactCall]) => {
      if (cancelled) return
      const row = companyCall.ok ? companyCall.result?.items?.[0] : undefined
      if (!row) {
        flash(t('cc_customers.form.notFound', 'Customer not found'), 'error')
        setLoading(false)
        return
      }
      setVersion(typeof row.updated_at === 'string' ? row.updated_at : null)
      const gstType = (plain(row.cf_gst_registration_type) || 'unregistered') as GstType
      setForm({
        category: plain(row.cf_customer_type_category) === 'individual' ? 'individual' : 'business',
        name: plain(row.display_name),
        legalName: plain(row.cf_legal_trade_name),
        gstType: GST_TYPES.some((entry) => entry.value === gstType) ? gstType : 'unregistered',
        gstin: plain(row.cf_gstin),
        phone: plain(row.primary_phone),
        email: plain(row.primary_email),
        salesManager: plain(row.cf_sales_manager),
        paymentTerms: plain(row.cf_payment_terms) || 'due_on_delivery',
        paymentRemarks: plain(row.cf_payment_remarks),
      })
      const addresses = addressCall.ok ? (addressCall.result?.items ?? []) : []
      const bill = addresses.find((entry) => entry.purpose === 'billing') ?? addresses.find((entry) => entry.purpose !== 'shipping')
      const ship = addresses.find((entry) => entry.purpose === 'shipping')
      setBilling(addressFrom(bill))
      setShipping(ship ? addressFrom(ship) : { ...EMPTY_ADDRESS })
      setSeparateShipping(Boolean(ship))
      const list = (contactCall.ok ? (contactCall.result?.items ?? []) : []).map((entry) => newContact({ id: entry.id, name: plain(entry.name), phone: plain(entry.phone), email: plain(entry.email) }))
      setContacts(list.length ? list : [newContact()])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [customerId, t])

  const patch = (value: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...value }))
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !(field in value))))
    if ('name' in value) setDuplicateName(null)
  }

  const gstin = form.gstin.toUpperCase().replace(/\s/g, '')
  const gstState = GSTIN_PATTERN.test(gstin) ? stateFromGstin(gstin) : null
  const needsGstin = form.gstType === 'registered' || form.gstType === 'composition'
  const overseas = form.gstType === 'overseas'
  const billingIndia = !overseas && (!billing.country || /^india$/i.test(billing.country))
  const shippingIndia = !shipping.country || /^india$/i.test(shipping.country)
  const backHref = customerId ? `/backend/customers/companies/${customerId}` : '/backend/customers/companies'

  React.useEffect(() => {
    if (gstState && !billing.state) setBilling((prev) => ({ ...prev, state: gstState.name }))
  }, [gstState, billing.state])

  React.useEffect(() => {
    if (overseas && /^india$/i.test(billing.country)) setBilling((prev) => ({ ...prev, country: '', state: '' }))
    if (!overseas && !billing.country) setBilling((prev) => ({ ...prev, country: 'India' }))
  }, [overseas, billing.country])

  const save = async (allowSameName = false) => {
    if (saving) return
    const local: Record<string, string> = {}
    if (form.name.trim().length < 2) local.name = t('cc_customers.form.errName', 'Enter the customer name')
    if (needsGstin && !gstin) local.gstin = t('cc_customers.form.errGstin', 'Enter the GSTIN (or change the GST type)')
    else if (gstin && !GSTIN_PATTERN.test(gstin)) local.gstin = t('cc_customers.form.errGstinFormat', 'GSTIN must be 15 characters like 24ABCDE1234F1Z5')
    if (Object.keys(local).length) {
      setErrors(local)
      flash(t('cc_customers.form.fix', 'Some fields need fixing.'), 'error')
      return
    }
    const body = {
      ...(customerId ? { id: customerId } : {}),
      ...form,
      gstin,
      billing,
      shipping: separateShipping ? shipping : null,
      contacts: contacts.filter((contact) => contact.name.trim() || contact.phone.trim() || contact.email.trim()).map(({ id, name, phone, email }) => ({ id, name, phone, email })),
      allowSameName,
    }
    setSaving(true)
    try {
      const call = await runMutation({
        context: { customerId: customerId ?? null },
        mutationPayload: body,
        operation: () => {
          const request = () => apiCall<{ id?: string; customerNo?: string | null; error?: string; fields?: Record<string, string> }>('/api/cc_customers/customers', { method: customerId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          return customerId && version ? withScopedApiRequestHeaders(buildOptimisticLockHeader(version), request) : request()
        },
      })
      if (!call.ok || !call.result?.id) {
        const fields = call.result?.fields ?? {}
        setErrors(fields)
        if (fields.name && !fields.gstin && call.status === 409) setDuplicateName(fields.name)
        flash(
          call.status === 409 && !Object.keys(fields).length
            ? t('cc_customers.form.conflict', 'Someone else changed this customer. Reload and try again.')
            : (call.result?.error ?? t('cc_customers.form.error', 'Could not save the customer.')),
          'error',
        )
        return
      }
      flash(customerId ? t('cc_customers.form.saved', 'Customer saved') : t('cc_customers.form.createdNo', 'Customer {no} created', { no: call.result.customerNo ?? '' }), 'success')
      router.push(`/backend/customers/companies/${call.result.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Page><PageBody><PageLoading label={t('cc_customers.form.loading', 'Loading customer…')} /></PageBody></Page>

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
            if (event.key === 'Escape' && !(event.target instanceof HTMLElement && event.target.closest('[role="listbox"]'))) router.push(backHref)
          }}
        >
          <div className="mb-5 flex items-start gap-3">
            <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0" aria-label={t('common.back', 'Back')}>
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('cc_customers.form.eyebrow', 'Customer')}</p>
              <h1 className="text-xl font-semibold sm:text-2xl">{customerId ? t('cc_customers.form.editTitle', 'Edit {name}', { name: form.name || '…' }) : t('cc_customers.form.newTitle', 'New customer')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('cc_customers.form.lede', 'Everything is checked before saving: GSTIN, state, PIN, phone, email and duplicates. A customer number is given when you save.')}</p>
            </div>
          </div>

          {duplicateName ? (
            <div className="mb-5">
              <Notice variant="warning" title={t('cc_customers.form.dupTitle', 'A customer with this name already exists')} message={duplicateName} />
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void save(true)}>
                  {t('cc_customers.form.dupSave', 'It is a different company — save anyway')}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Section icon={<Building2 className="h-4 w-4" />} title={t('cc_customers.form.company', 'Company')}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label={t('cc_customers.form.name', 'Customer name')} required error={errors.name} htmlFor="cu-name">
                    <Input id="cu-name" autoFocus={!customerId} value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="e.g. Shree Insulators" />
                  </Field>
                  <Field label={t('cc_customers.form.legalName', 'Legal / trade name')} hint={t('cc_customers.form.legalHint', 'As on the GST certificate, if different')} htmlFor="cu-legal">
                    <Input id="cu-legal" value={form.legalName} onChange={(event) => patch({ legalName: event.target.value })} />
                  </Field>
                </div>
                <Field label={t('cc_customers.form.category', 'Type')}>
                  <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="radiogroup" aria-label={t('cc_customers.form.category', 'Type')}>
                    {(['business', 'individual'] as const).map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={form.category === value} onClick={() => patch({ category: value })} className={cn('min-h-8 rounded-md px-3 text-sm', form.category === value ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                        {value === 'business' ? t('cc_customers.form.business', 'Business') : t('cc_customers.form.individual', 'Individual')}
                      </button>
                    ))}
                  </div>
                </Field>
              </Section>

              <Section icon={<BadgeCheck className="h-4 w-4" />} title={t('cc_customers.form.gst', 'GST')}>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4" role="radiogroup" aria-label={t('cc_customers.form.gstType', 'GST type')}>
                  {GST_TYPES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={form.gstType === option.value}
                      onClick={() => patch({ gstType: option.value, ...(option.value === 'unregistered' || option.value === 'overseas' ? { gstin: '' } : {}) })}
                      className={cn('rounded-lg border p-3 text-left transition-colors', form.gstType === option.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50')}
                    >
                      <span className="block text-sm font-medium">{t(`cc_customers.gstType.${option.value}`, option.label)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`cc_customers.gstType.${option.value}Hint`, option.hint)}</span>
                    </button>
                  ))}
                </div>
                {needsGstin ? (
                  <Field
                    label={t('cc_customers.form.gstin', 'GSTIN')}
                    required
                    error={errors.gstin}
                    htmlFor="cu-gstin"
                    hint={gstState ? t('cc_customers.form.gstinOk', '{state} · PAN {pan}', { state: gstState.name, pan: gstin.slice(2, 12) }) : t('cc_customers.form.gstinHint', '15 characters; the state and PAN are read from it and checked')}
                  >
                    <Input id="cu-gstin" maxLength={15} className="font-mono uppercase tracking-wider" value={form.gstin} onChange={(event) => patch({ gstin: event.target.value.toUpperCase() })} placeholder="24ABCDE1234F1Z5" />
                  </Field>
                ) : null}
              </Section>

              <Section icon={<MapPin className="h-4 w-4" />} title={t('cc_customers.form.billing', 'Bill-to address')} hint={needsGstin ? t('cc_customers.form.billingHint', 'Must be in the GSTIN’s state') : undefined}>
                <AddressFields prefix="billing" value={billing} onChange={(value) => { setBilling((prev) => ({ ...prev, ...value })); setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([field]) => !field.startsWith('billing')))) }} errors={errors} india={billingIndia} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 rounded-sm border-input" checked={separateShipping} onChange={(event) => setSeparateShipping(event.target.checked)} />
                  {t('cc_customers.form.separateShipping', 'Goods go to a different address')}
                </label>
                {separateShipping ? (
                  <div className="rounded-lg border border-dashed p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('cc_customers.form.shipping', 'Ship-to address')}</p>
                    <AddressFields prefix="shipping" value={shipping} onChange={(value) => setShipping((prev) => ({ ...prev, ...value }))} errors={errors} india={shippingIndia} />
                  </div>
                ) : null}
              </Section>

              <Section
                icon={<Users className="h-4 w-4" />}
                title={t('cc_customers.form.contacts', 'Contacts')}
                hint={t('cc_customers.form.contactsHint', 'Purchase, accounts, QC — whoever you talk to')}
                actions={
                  <Button type="button" variant="outline" size="sm" onClick={() => setContacts((prev) => [...prev, newContact()])}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t('cc_customers.form.addContact', 'Add')}
                  </Button>
                }
              >
                {contacts.map((contact, index) => (
                  <div key={contact.key} className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-12 sm:items-end">
                    <Field label={t('cc_customers.form.contactName', 'Name')} className="sm:col-span-4" htmlFor={`${contact.key}-n`}>
                      <Input id={`${contact.key}-n`} value={contact.name} onChange={(event) => setContacts((prev) => prev.map((entry) => (entry.key === contact.key ? { ...entry, name: event.target.value } : entry)))} />
                    </Field>
                    <Field label={t('cc_customers.form.phone', 'Phone / WhatsApp')} className="sm:col-span-3" htmlFor={`${contact.key}-p`}>
                      <Input id={`${contact.key}-p`} inputMode="tel" value={contact.phone} onChange={(event) => setContacts((prev) => prev.map((entry) => (entry.key === contact.key ? { ...entry, phone: event.target.value } : entry)))} />
                    </Field>
                    <Field label={t('cc_customers.form.email', 'Email')} className="sm:col-span-4" htmlFor={`${contact.key}-e`}>
                      <Input id={`${contact.key}-e`} type="email" value={contact.email} onChange={(event) => setContacts((prev) => prev.map((entry) => (entry.key === contact.key ? { ...entry, email: event.target.value } : entry)))} />
                    </Field>
                    <div className="flex justify-end sm:col-span-1">
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t('cc_customers.form.removeContact', 'Remove contact')} onClick={() => setContacts((prev) => (prev.length > 1 ? prev.filter((entry) => entry.key !== contact.key) : [newContact()]))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {errors[`contacts.${index}`] ? <p className="text-xs text-status-error-text sm:col-span-12">{errors[`contacts.${index}`]}</p> : null}
                  </div>
                ))}
              </Section>
            </div>

            <div className="space-y-5">
              <Section icon={<UserRound className="h-4 w-4" />} title={t('cc_customers.form.reach', 'Main phone & email')}>
                <Field label={t('cc_customers.form.phone', 'Phone / WhatsApp')} error={errors.phone} hint={t('cc_customers.form.phoneHint', '10-digit mobile, or +country code')} htmlFor="cu-phone">
                  <Input id="cu-phone" inputMode="tel" value={form.phone} onChange={(event) => patch({ phone: event.target.value })} placeholder="98250 12345" />
                </Field>
                <Field label={t('cc_customers.form.email', 'Email')} error={errors.email} htmlFor="cu-email">
                  <Input id="cu-email" type="email" value={form.email} onChange={(event) => patch({ email: event.target.value })} />
                </Field>
                <Field label={t('cc_customers.form.salesManager', 'Sales person')} htmlFor="cu-sales">
                  <Input id="cu-sales" value={form.salesManager} onChange={(event) => patch({ salesManager: event.target.value })} />
                </Field>
              </Section>

              <Section icon={<Wallet className="h-4 w-4" />} title={t('cc_customers.form.terms', 'Payment')} hint={t('cc_customers.form.termsHint', 'Copied onto new orders; can be changed per order')}>
                <Field label={t('cc_customers.form.paymentTerms', 'Payment terms')} error={errors.paymentTerms}>
                  <Dropdown value={form.paymentTerms} onChange={(event) => patch({ paymentTerms: event.target.value })}>
                    {termOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Dropdown>
                </Field>
                <Field label={t('cc_customers.form.paymentRemarks', 'Payment remarks')}>
                  <Dropdown value={form.paymentRemarks} onChange={(event) => patch({ paymentRemarks: event.target.value })}>
                    <option value="">—</option>
                    {remarkOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Dropdown>
                </Field>
              </Section>

              <div className="hidden lg:block">
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? t('cc_customers.form.saving', 'Saving…') : customerId ? t('cc_customers.form.save', 'Save customer') : t('cc_customers.form.create', 'Create customer')}
                </Button>
                <Button asChild type="button" variant="ghost" className="mt-2 w-full">
                  <Link href={backHref}>{t('common.cancel', 'Cancel')}</Link>
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">{t('cc_customers.form.keys', 'Ctrl/⌘ + Enter saves · Esc goes back')}</p>
              </div>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
            <Button asChild type="button" variant="outline" className="flex-1">
              <Link href={backHref}>{t('common.cancel', 'Cancel')}</Link>
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? t('cc_customers.form.saving', 'Saving…') : customerId ? t('cc_customers.form.save', 'Save customer') : t('cc_customers.form.create', 'Create customer')}
            </Button>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}

export default CustomerForm
