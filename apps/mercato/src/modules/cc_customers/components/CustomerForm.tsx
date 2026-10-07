"use client"

import * as React from 'react'
import { useListOptions } from '../../cc_lists/components/useListOptions'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, MapPin, Plus, Save, Trash2, Truck, Users } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { GSTIN_PATTERN, GST_STATES, stateFromGstin } from '../../cc_accounts/lib/gstStates'
import { usePaymentTerms } from '../../cc_lists/components/usePaymentTerms'

type Row = Record<string, unknown> & { id: string }
type Contact = { key: string; id: string | null; name: string; phone: string; email: string }
type AddressForm = { id: string | null; street: string; pin: string; district: string; state: string; country: string }

const GST_TYPES = [
  { value: 'registered', label: 'Registered' },
  { value: 'unregistered', label: 'Unregistered' },
  { value: 'composition', label: 'Composition' },
  { value: 'overseas', label: 'Overseas' },
]
const NONE = '__none'
const EMPTY_ADDRESS: AddressForm = { id: null, street: '', pin: '', district: '', state: '', country: 'India' }

let contactCounter = 0
function newContact(partial?: Partial<Contact>): Contact {
  contactCounter += 1
  return { key: `c${contactCounter}`, id: null, name: '', phone: '', email: '', ...partial }
}

function text(value: unknown): string {
  if (typeof value !== 'string') return ''
  return /^[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:v\d+$/.test(value) ? '' : value
}

function addressFrom(row: Row | undefined): AddressForm {
  if (!row) return { ...EMPTY_ADDRESS }
  return { id: row.id, street: text(row.address_line1), pin: text(row.postal_code), district: text(row.city), state: text(row.region), country: text(row.country) || 'India' }
}

export function CustomerForm({ customerId }: { customerId?: string }) {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `cc-customer-form-${customerId ?? 'new'}` })
  const [loading, setLoading] = React.useState(Boolean(customerId))
  const [saving, setSaving] = React.useState(false)
  const [company, setCompany] = React.useState<Row | null>(null)
  const [form, setForm] = React.useState({
    category: 'business',
    name: '',
    legalName: '',
    gstType: 'registered',
    gstin: '',
    salesManager: '',
    paymentTerms: 'due_on_delivery',
    paymentRemarks: '',
    phone: '',
    email: '',
  })
  const [contacts, setContacts] = React.useState<Contact[]>([newContact()])
  const [removed, setRemoved] = React.useState<string[]>([])
  const [billing, setBilling] = React.useState<AddressForm>({ ...EMPTY_ADDRESS })
  const [shipping, setShipping] = React.useState<AddressForm>({ ...EMPTY_ADDRESS })
  const [sameAsBilling, setSameAsBilling] = React.useState(true)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const remarkOptions = useListOptions('payment_remarks', form.paymentRemarks)
  const termOptions = usePaymentTerms(form.paymentTerms)

  React.useEffect(() => {
    if (!customerId) return
    let cancelled = false
    Promise.all([
      apiCall<{ items?: Row[] }>(`/api/customers/companies?id=${encodeURIComponent(customerId)}&pageSize=1`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: Row[] }>(`/api/customers/addresses?entityId=${encodeURIComponent(customerId)}&pageSize=20`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: Row[] }>(`/api/customers/contacts?entityId=${encodeURIComponent(customerId)}&pageSize=50`, undefined, { fallback: { items: [] } }),
    ]).then(([companyCall, addressCall, contactCall]) => {
      if (cancelled) return
      const row = companyCall.result?.items?.[0]
      if (!row) {
        flash(t('cc_customers.form.notFound', 'Customer not found'), 'error')
        setLoading(false)
        return
      }
      setCompany(row)
      setForm({
        category: text(row.cf_customer_type_category) || 'business',
        name: text(row.display_name),
        legalName: text(row.cf_legal_trade_name),
        gstType: text(row.cf_gst_registration_type) || 'unregistered',
        gstin: text(row.cf_gstin),
        salesManager: text(row.cf_sales_manager),
        paymentTerms: text(row.cf_payment_terms) || 'due_on_delivery',
        paymentRemarks: text(row.cf_payment_remarks),
        phone: text(row.primary_phone),
        email: text(row.primary_email),
      })
      const addresses = addressCall.result?.items ?? []
      const bill = addresses.find((entry) => entry.purpose === 'billing') ?? addresses[0]
      const ship = addresses.find((entry) => entry.purpose === 'shipping')
      setBilling(addressFrom(bill))
      setShipping(ship ? addressFrom(ship) : { ...EMPTY_ADDRESS })
      setSameAsBilling(!ship)
      const list = (contactCall.result?.items ?? []).map((entry) => newContact({ id: entry.id, name: text(entry.name), phone: text(entry.phone), email: text(entry.email) }))
      setContacts(list.length ? list : [newContact()])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [customerId, t])

  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'gstin') {
        const state = stateFromGstin(value.toUpperCase())
        if (state && !billing.state) setBilling((current) => ({ ...current, state: state.name }))
      }
      return next
    })
    setErrors((prev) => ({ ...prev, [key]: '' }))
  }

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = t('cc_customers.form.errName', 'Enter the customer name')
    if (form.category === 'business' && !form.legalName.trim()) next.legalName = t('cc_customers.form.errLegal', 'Enter the legal / trade name')
    if (form.gstType === 'registered' && !GSTIN_PATTERN.test(form.gstin.trim().toUpperCase())) next.gstin = t('cc_customers.form.errGstin', 'A registered customer needs a valid 15-character GSTIN')
    if (form.gstin.trim() && !GSTIN_PATTERN.test(form.gstin.trim().toUpperCase())) next.gstin = t('cc_customers.form.errGstinFormat', 'GSTIN format is not right (e.g. 27AAACT1234A1Z5)')
    if (!billing.street.trim()) next.billingStreet = t('cc_customers.form.errStreet', 'Enter the street')
    if (!/^\d{6}$/.test(billing.pin.trim())) next.billingPin = t('cc_customers.form.errPin', 'PIN code is 6 digits')
    if (!billing.district.trim()) next.billingDistrict = t('cc_customers.form.errDistrict', 'Enter the district / city')
    if (!billing.state.trim()) next.billingState = t('cc_customers.form.errState', 'Pick the state')
    if (!sameAsBilling) {
      if (!shipping.street.trim()) next.shippingStreet = t('cc_customers.form.errStreet', 'Enter the street')
      if (!/^\d{6}$/.test(shipping.pin.trim())) next.shippingPin = t('cc_customers.form.errPin', 'PIN code is 6 digits')
    }
    contacts.forEach((contact, index) => {
      if (!contact.name.trim() && (contact.phone.trim() || contact.email.trim())) next[`contact${index}`] = t('cc_customers.form.errContact', 'Enter the contact name')
      if (contact.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) next[`contact${index}`] = t('cc_customers.form.errEmail', 'Email is not valid')
    })
    setErrors(next)
    if (Object.keys(next).length) flash(t('cc_customers.form.fix', 'Some fields need fixing.'), 'error')
    return !Object.keys(next).length
  }

  const call = async <T,>(url: string, method: string, body: Record<string, unknown>, lock?: string | null) => {
    const request = () => apiCall<T & { error?: string; id?: string }>(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return runMutation({ context: { url, method }, mutationPayload: body, operation: () => (lock ? withScopedApiRequestHeaders(buildOptimisticLockHeader(lock), request) : request()) })
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        displayName: form.name.trim(),
        primaryPhone: form.phone.trim() || null,
        primaryEmail: form.email.trim() || null,
        cf_customer_type_category: form.category,
        cf_legal_trade_name: form.legalName.trim() || null,
        cf_gst_registration_type: form.gstType,
        cf_gstin: form.gstin.trim().toUpperCase() || null,
        cf_sales_manager: form.salesManager.trim() || null,
        cf_payment_terms: form.paymentTerms,
        cf_payment_remarks: form.paymentRemarks || null,
        cf_default_currency: 'INR',
      }
      const saved = customerId
        ? await call('/api/customers/companies', 'PUT', { id: customerId, ...body }, typeof company?.updated_at === 'string' ? company.updated_at : null)
        : await call<{ id?: string }>('/api/customers/companies', 'POST', body)
      if (!saved.ok) {
        flash(saved.status === 409 ? t('cc_customers.form.conflict', 'Someone else changed this customer. Reload and try again.') : (saved.result?.error ?? t('cc_customers.form.error', 'Could not save the customer.')), 'error')
        return
      }
      const id = customerId ?? saved.result?.id
      if (!id) return
      const addressBody = (address: AddressForm, purpose: string) => ({
        entityId: id,
        purpose,
        name: purpose === 'billing' ? 'Billing' : 'Shipping',
        addressLine1: address.street.trim(),
        city: address.district.trim() || undefined,
        region: address.state.trim() || undefined,
        postalCode: address.pin.trim() || undefined,
        country: address.country.trim() || 'India',
        isPrimary: purpose === 'billing',
      })
      const problems: string[] = []
      const bill = billing.id ? await call('/api/customers/addresses', 'PUT', { id: billing.id, ...addressBody(billing, 'billing') }) : await call('/api/customers/addresses', 'POST', addressBody(billing, 'billing'))
      if (!bill.ok) problems.push(t('cc_customers.form.billingFailed', 'billing address'))
      if (sameAsBilling) {
        if (shipping.id) await call(`/api/customers/addresses?id=${encodeURIComponent(shipping.id)}`, 'DELETE', { id: shipping.id })
      } else {
        const ship = shipping.id ? await call('/api/customers/addresses', 'PUT', { id: shipping.id, ...addressBody(shipping, 'shipping') }) : await call('/api/customers/addresses', 'POST', addressBody(shipping, 'shipping'))
        if (!ship.ok) problems.push(t('cc_customers.form.shippingFailed', 'shipping address'))
      }
      for (const contactId of removed) await call(`/api/customers/contacts?id=${encodeURIComponent(contactId)}`, 'DELETE', { id: contactId })
      for (const [index, contact] of contacts.entries()) {
        if (!contact.name.trim()) continue
        const contactBody = { entityId: id, name: contact.name.trim(), phone: contact.phone.trim() || undefined, email: contact.email.trim() || undefined, sortOrder: index }
        const result = contact.id ? await call('/api/customers/contacts', 'PUT', { id: contact.id, ...contactBody }) : await call('/api/customers/contacts', 'POST', contactBody)
        if (!result.ok) problems.push(`${contact.name}: ${result.result?.error ?? t('cc_customers.form.contactFailed', 'contact not saved')}`)
      }
      await call('/api/cc_customers/number', 'POST', { customerId: id })
      if (problems.length) flash(t('cc_customers.form.partial', 'Customer saved, but check: {list}', { list: problems.join('; ') }), 'error')
      else flash(customerId ? t('cc_customers.form.saved', 'Customer saved') : t('cc_customers.form.created', 'Customer created'), 'success')
      router.push(`/backend/customers/companies/${id}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('cc_customers.form.loading', 'Loading customer…')} />
        </PageBody>
      </Page>
    )
  }

  const field = (key: keyof typeof form, label: string, props: { required?: boolean; placeholder?: string; upper?: boolean; wide?: boolean } = {}) => (
    <div className={cn('space-y-1', props.wide && 'sm:col-span-2')}>
      <Label htmlFor={`cust-${key}`} className="text-xs text-muted-foreground">
        {label}
        {props.required ? ' *' : ''}
      </Label>
      <Input
        id={`cust-${key}`}
        value={form[key]}
        placeholder={props.placeholder}
        className={cn(props.upper && 'uppercase', errors[key] && 'border-status-error-border')}
        onChange={(event) => set(key, props.upper ? event.target.value.toUpperCase() : event.target.value)}
      />
      {errors[key] ? <p className="text-xs text-status-error-text">{errors[key]}</p> : null}
    </div>
  )

  const select = (key: keyof typeof form, label: string, options: Array<{ value: string; label: string }>, allowNone = false) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={form[key] || NONE} onValueChange={(value) => set(key, value === NONE ? '' : value)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNone ? <SelectItem value={NONE}>—</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const addressBlock = (prefix: 'billing' | 'shipping', value: AddressForm, onChange: (next: AddressForm) => void) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <div className="space-y-1 sm:col-span-4">
        <Label htmlFor={`${prefix}-street`} className="text-xs text-muted-foreground">{t('cc_customers.form.street', 'Street *')}</Label>
        <Input id={`${prefix}-street`} value={value.street} className={cn(errors[`${prefix}Street`] && 'border-status-error-border')} onChange={(event) => onChange({ ...value, street: event.target.value })} placeholder="e.g. Plot 14, MIDC Taloja" />
        {errors[`${prefix}Street`] ? <p className="text-xs text-status-error-text">{errors[`${prefix}Street`]}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-pin`} className="text-xs text-muted-foreground">{t('cc_customers.form.pin', 'PIN code *')}</Label>
        <Input id={`${prefix}-pin`} inputMode="numeric" maxLength={6} value={value.pin} className={cn(errors[`${prefix}Pin`] && 'border-status-error-border')} onChange={(event) => onChange({ ...value, pin: event.target.value.replace(/\D/g, '') })} />
        {errors[`${prefix}Pin`] ? <p className="text-xs text-status-error-text">{errors[`${prefix}Pin`]}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-district`} className="text-xs text-muted-foreground">{t('cc_customers.form.district', 'District / city *')}</Label>
        <Input id={`${prefix}-district`} value={value.district} className={cn(errors[`${prefix}District`] && 'border-status-error-border')} onChange={(event) => onChange({ ...value, district: event.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t('cc_customers.form.state', 'State *')}</Label>
        <Select value={value.state || NONE} onValueChange={(next) => onChange({ ...value, state: next === NONE ? '' : next })}>
          <SelectTrigger className={cn(errors[`${prefix}State`] && 'border-status-error-border')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {Object.values(GST_STATES)
              .sort()
              .map((state) => (
                <SelectItem key={state} value={state}>
                  {state}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-country`} className="text-xs text-muted-foreground">{t('cc_customers.form.country', 'Country')}</Label>
        <Input id={`${prefix}-country`} value={value.country} onChange={(event) => onChange({ ...value, country: event.target.value })} />
      </div>
    </div>
  )

  const gstState = stateFromGstin(form.gstin)
  const backHref = customerId ? `/backend/customers/companies/${customerId}` : '/backend/customers/companies'

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto flex max-w-5xl flex-col gap-5 pb-16"
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
          <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                {customerId ? t('cc_customers.form.backCustomer', 'Customer') : t('cc_customers.form.backList', 'Customers')}
              </Link>
              <h1 className="text-2xl font-bold tracking-tight">{customerId ? t('cc_customers.form.editTitle', 'Edit customer') : t('cc_customers.form.newTitle', 'Add new customer')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_customers.form.lede', 'The customer number (CTR…) is given when you save. Payment terms and sales manager fill new orders.')}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={saving}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {saving ? t('cc_customers.form.saving', 'Saving…') : customerId ? t('cc_customers.form.save', 'Save customer') : t('cc_customers.form.add', 'Add customer')}
              </Button>
            </div>
          </header>

          <section className="space-y-4 rounded-lg border bg-card p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t('cc_customers.form.customer', 'Customer')}
            </h2>
            <div className="flex gap-4 text-sm" role="radiogroup" aria-label={t('cc_customers.form.category', 'Customer type')}>
              {[
                { value: 'business', label: t('cc_customers.form.business', 'Business') },
                { value: 'individual', label: t('cc_customers.form.individual', 'Individual') },
              ].map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="customer-category" value={option.value} checked={form.category === option.value} onChange={() => set('category', option.value)} className="h-4 w-4" />
                  {option.label}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('name', t('cc_customers.form.name', 'Customer name'), { required: true })}
              {field('legalName', t('cc_customers.form.legal', 'Legal / trade name'), { required: form.category === 'business' })}
              {select('gstType', t('cc_customers.form.gstType', 'GST treatment'), GST_TYPES)}
              <div className="space-y-1">
                {field('gstin', t('cc_customers.form.gstin', 'GSTIN'), { required: form.gstType === 'registered', upper: true, placeholder: '27AAACT1234A1Z5' })}
                {gstState ? <p className="text-xs text-muted-foreground">{t('cc_customers.form.gstState', 'State from GSTIN: {state}', { state: gstState.name })}</p> : null}
              </div>
              {field('salesManager', t('cc_customers.form.salesManager', 'Sales manager'))}
              {select('paymentTerms', t('cc_customers.form.terms', 'Payment terms'), termOptions)}
              {select('paymentRemarks', t('cc_customers.form.remarks', 'Payment remarks'), remarkOptions.map((value) => ({ value, label: value })), true)}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t('cc_customers.form.currency', 'Currency')}</Label>
                <Input value="INR (₹)" disabled />
              </div>
              {field('phone', t('cc_customers.form.phone', 'Main phone'), { placeholder: '+91 98200 11111' })}
              {field('email', t('cc_customers.form.email', 'Main email'))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border bg-card p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t('cc_customers.form.contacts', 'Contact information')}
              </h2>
              <Button type="button" variant="outline" size="sm" onClick={() => setContacts((prev) => [...prev, newContact()])}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_customers.form.addContact', 'Add contact')}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_customers.form.cName', 'Name')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_customers.form.cPhone', 'Phone')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_customers.form.cEmail', 'Email')}</th>
                    <th className="w-12 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {contacts.map((contact, index) => (
                    <tr key={contact.key} className="align-top">
                      <td className="px-3 py-2">
                        <Input aria-label={t('cc_customers.form.cName', 'Name')} value={contact.name} onChange={(event) => setContacts((prev) => prev.map((entry) => (entry.key === contact.key ? { ...entry, name: event.target.value } : entry)))} />
                        {errors[`contact${index}`] ? <p className="mt-1 text-xs text-status-error-text">{errors[`contact${index}`]}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label={t('cc_customers.form.cPhone', 'Phone')} value={contact.phone} placeholder="+91" onChange={(event) => setContacts((prev) => prev.map((entry) => (entry.key === contact.key ? { ...entry, phone: event.target.value } : entry)))} />
                      </td>
                      <td className="px-3 py-2">
                        <Input aria-label={t('cc_customers.form.cEmail', 'Email')} type="email" value={contact.email} onChange={(event) => setContacts((prev) => prev.map((entry) => (entry.key === contact.key ? { ...entry, email: event.target.value } : entry)))} />
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('cc_customers.form.removeContact', 'Remove contact')}
                          onClick={() => {
                            if (contact.id) setRemoved((prev) => [...prev, contact.id as string])
                            setContacts((prev) => (prev.length > 1 ? prev.filter((entry) => entry.key !== contact.key) : [newContact()]))
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border bg-card p-5 shadow-xs">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t('cc_customers.form.billing', 'Billing address')}
            </h2>
            {addressBlock('billing', billing, setBilling)}
          </section>

          <section className="space-y-4 rounded-lg border bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t('cc_customers.form.shipping', 'Shipping address')}
              </h2>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" className="h-4 w-4 rounded-sm border-input" checked={sameAsBilling} onChange={(event) => setSameAsBilling(event.target.checked)} />
                {t('cc_customers.form.same', 'Same as billing address')}
              </label>
            </div>
            {sameAsBilling ? <p className="text-sm text-muted-foreground">{t('cc_customers.form.sameHint', 'Goods ship to the billing address.')}</p> : addressBlock('shipping', shipping, setShipping)}
          </section>
        </form>
      </PageBody>
    </Page>
  )
}

export default CustomerForm
