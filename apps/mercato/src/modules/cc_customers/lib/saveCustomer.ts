import { z } from 'zod'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isValidPhoneNumber } from '@open-mercato/shared/lib/phone'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import type { StoreContext } from '../../cc_store/lib/server'
import { runCommand } from '../../cc_store/lib/server'
import { GSTIN_PATTERN, GST_STATES, gstinChecksumOk, stateFromGstin } from '../../cc_accounts/lib/gstStates'
import { activeOptions } from '../../cc_lists/lib/service'
import { paymentTermKey } from '../../cc_lists/lib/paymentTerms'
import { ensureCustomerNumber, refreshCustomerIndex } from './customerNumber'

export class CustomerSaveError extends Error {
  status: number
  fields: Record<string, string>
  constructor(message: string, fields: Record<string, string> = {}, status = 400) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

const text = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value?.trim() ?? '')

const addressSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  street: text(300),
  district: text(150),
  state: text(150),
  pin: text(20),
  country: text(150),
})

export const customerSaveSchema = z.object({
  id: z.string().uuid().optional(),
  category: z.enum(['business', 'individual']).default('business'),
  name: z.string().trim().min(2, 'Enter the customer name').max(200),
  legalName: text(200),
  gstType: z.enum(['registered', 'unregistered', 'composition', 'overseas']).default('registered'),
  gstin: text(20),
  phone: text(40),
  email: text(200),
  salesManager: text(120),
  paymentTerms: text(80),
  paymentRemarks: text(200),
  billing: addressSchema,
  shipping: addressSchema.nullable().optional(),
  contacts: z.array(z.object({ id: z.string().uuid().optional().nullable(), name: text(150), phone: text(40), email: text(200) })).max(20).default([]),
  allowSameName: z.boolean().default(false),
  reason: z.string().trim().max(500).optional().nullable(),
  source: z.enum(['form', 'import']).optional(),
})

export type CustomerSaveInput = z.infer<typeof customerSaveSchema>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export { gstinChecksumOk }

export function normalisePhone(raw: string, country: string): string | null {
  const value = raw.replace(/[\s\-().]/g, '')
  if (!value) return ''
  const india = !country || /^india$/i.test(country)
  const candidate = value.startsWith('+') ? value : india && /^0?[6-9]\d{9}$/.test(value) ? `+91${value.replace(/^0/, '')}` : value.startsWith('00') ? `+${value.slice(2)}` : india && /^91[6-9]\d{9}$/.test(value) ? `+${value}` : value
  return isValidPhoneNumber(candidate) ? candidate : null
}

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

type Existing = { entityId: string; name: string; gstin: string | null }

async function existingCustomers(ctx: StoreContext): Promise<Existing[]> {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const entities = await findWithDecryption(ctx.em, CustomerEntity, { ...scope, kind: 'company', deletedAt: null }, {}, scope)
  const gstins = await ctx.em.getConnection().execute<Array<{ entity_id: string; value_text: string | null }>>(
    `select c.entity_id, v.value_text from customer_companies c
       join custom_field_values v on v.record_id = c.id::text and v.entity_id = 'customers:customer_company_profile' and v.field_key = 'gstin' and v.deleted_at is null
      where c.tenant_id = ? and c.organization_id = ?`,
    [ctx.tenantId, ctx.organizationId],
  )
  const gstinOf = new Map(gstins.map((row) => [row.entity_id, (row.value_text ?? '').toUpperCase()]))
  return entities.map((entity) => ({ entityId: entity.id, name: entity.displayName, gstin: gstinOf.get(entity.id) || null }))
}

async function ownedChildIds(ctx: StoreContext, table: 'customer_contacts', entityId: string): Promise<Set<string>> {
  const rows = await ctx.em.getConnection().execute<Array<{ id: string }>>(`select id from ${table} where entity_id = ? and tenant_id = ? and organization_id = ?`, [entityId, ctx.tenantId, ctx.organizationId])
  return new Set(rows.map((row) => row.id))
}

export async function validateCustomer(ctx: StoreContext, input: CustomerSaveInput) {
  const fields: Record<string, string> = {}
  const gstin = input.gstin.toUpperCase().replace(/\s/g, '')
  const billingCountry = input.billing.country || 'India'
  const needsGstin = input.gstType === 'registered' || input.gstType === 'composition'
  if (needsGstin && !gstin) fields.gstin = 'Enter the GSTIN (or change the GST type)'
  else if (gstin && !GSTIN_PATTERN.test(gstin)) fields.gstin = 'GSTIN must be 15 characters like 24ABCDE1234F1Z5'
  else if (gstin && !gstinChecksumOk(gstin)) fields.gstin = 'This GSTIN is not valid (check digit does not match). Check for a typing mistake.'
  if (input.gstType === 'overseas' && gstin) fields.gstin = 'An overseas customer has no GSTIN'
  if (input.gstType === 'overseas' && /^india$/i.test(billingCountry)) fields['billing.country'] = 'Enter the country of an overseas customer'
  const gstState = gstin && !fields.gstin ? stateFromGstin(gstin) : null
  if (gstin && !fields.gstin && !gstState) fields.gstin = 'The first two digits are not an Indian state code'
  let billingState = input.billing.state
  if (gstState) {
    if (!billingState) billingState = gstState.name
    else if (key(billingState) !== key(gstState.name)) fields['billing.state'] = `GSTIN is registered in ${gstState.name}; the billing state is ${billingState}`
  }
  if (billingState && /^india$/i.test(billingCountry) && !Object.values(GST_STATES).some((name) => key(name) === key(billingState))) fields['billing.state'] = 'Pick an Indian state'
  if (needsGstin && !input.billing.street) fields['billing.street'] = 'A GST-registered customer needs the billing address'
  for (const [label, address] of [['billing', input.billing], ['shipping', input.shipping]] as const) {
    if (!address) continue
    const india = /^india$/i.test(address.country || 'India')
    if (address.pin && india && !/^[1-9][0-9]{5}$/.test(address.pin)) fields[`${label}.pin`] = 'PIN code is 6 digits'
    if (label === 'shipping' && !address.street && (address.pin || address.district)) fields['shipping.street'] = 'Enter the shipping street address'
  }
  if (input.email && !EMAIL.test(input.email)) fields.email = 'Email is not valid'
  const phone = input.phone ? normalisePhone(input.phone, billingCountry) : ''
  if (phone === null) fields.phone = 'Phone number is not valid (10-digit mobile, or +country code)'
  const contacts = input.contacts
    .filter((contact) => contact.name || contact.phone || contact.email)
    .map((contact, index) => {
      if (!contact.name) fields[`contacts.${index}`] = 'Enter the contact name'
      if (contact.email && !EMAIL.test(contact.email)) fields[`contacts.${index}`] = `${contact.name || 'Contact'}: email is not valid`
      const contactPhone = contact.phone ? normalisePhone(contact.phone, billingCountry) : ''
      if (contactPhone === null) fields[`contacts.${index}`] = `${contact.name || 'Contact'}: phone is not valid`
      return { ...contact, phone: contactPhone ?? '' }
    })
  let paymentTerms = input.paymentTerms
  if (paymentTerms) {
    const allowed = (await activeOptions(ctx, 'payment_terms')).map(paymentTermKey)
    if (!allowed.includes(paymentTerms) && paymentTerms !== 'due_on_delivery') fields.paymentTerms = 'Pick payment terms from the list'
  } else paymentTerms = 'due_on_delivery'
  const others = (await existingCustomers(ctx)).filter((entry) => entry.entityId !== input.id)
  const sameGstin = gstin ? others.find((entry) => entry.gstin === gstin) : null
  if (sameGstin) fields.gstin = `${sameGstin.name} already has this GSTIN`
  const sameName = others.find((entry) => key(entry.name) === key(input.name))
  if (sameName && !input.allowSameName) fields.name = `A customer called ${sameName.name} already exists`
  if (Object.keys(fields).length) throw new CustomerSaveError('Some fields need fixing', fields, sameGstin || (sameName && !input.allowSameName) ? 409 : 400)
  return { gstin, phone: phone ?? '', billingState, contacts, paymentTerms, duplicateId: sameName?.entityId ?? null }
}

function addressBody(entityId: string, address: CustomerSaveInput['billing'], purpose: 'billing' | 'shipping', state: string) {
  return {
    entityId,
    purpose,
    name: purpose === 'billing' ? 'Billing' : 'Shipping',
    addressLine1: address.street,
    city: address.district || undefined,
    region: state || undefined,
    postalCode: address.pin || undefined,
    country: address.country || 'India',
    isPrimary: purpose === 'billing',
  }
}

export async function saveCustomer(ctx: StoreContext, input: CustomerSaveInput): Promise<{ id: string; customerNo: string | null }> {
  const checked = await validateCustomer(ctx, input)
  const company = {
    displayName: input.name,
    primaryPhone: checked.phone || null,
    primaryEmail: input.email || null,
    cf_customer_type_category: input.category,
    cf_legal_trade_name: input.legalName || null,
    cf_gst_registration_type: input.gstType,
    cf_gstin: checked.gstin || null,
    cf_sales_manager: input.salesManager || null,
    cf_payment_terms: checked.paymentTerms,
    cf_payment_remarks: input.paymentRemarks || null,
    cf_default_currency: input.gstType === 'overseas' ? 'USD' : 'INR',
  }
  let entityId = input.id ?? null
  const created = !entityId
  try {
    if (entityId) {
      await runCommand(ctx, 'customers.companies.update', { id: entityId, ...company })
    } else {
      const result = await runCommand<{ entityId: string }>(ctx, 'customers.companies.create', company)
      entityId = result.entityId
    }
    const id = entityId!
    const addressRows = await ctx.em.getConnection().execute<Array<{ id: string; purpose: string | null }>>(
      'select id, purpose from customer_addresses where entity_id = ? and tenant_id = ? and organization_id = ? order by created_at asc',
      [id, ctx.tenantId, ctx.organizationId],
    )
    const ownAddresses = new Set(addressRows.map((row) => row.id))
    const existingOf = (purpose: 'billing' | 'shipping', given?: string | null) => (given && ownAddresses.has(given) ? given : (addressRows.find((row) => (row.purpose ?? 'billing') === purpose)?.id ?? null))
    const billing = input.billing
    if (billing.street) {
      const billingId = existingOf('billing', billing.id)
      if (billingId) await runCommand(ctx, 'customers.addresses.update', { id: billingId, ...addressBody(id, billing, 'billing', checked.billingState) })
      else await runCommand(ctx, 'customers.addresses.create', addressBody(id, billing, 'billing', checked.billingState))
    }
    const shipping = input.shipping
    if (shipping?.street) {
      const shippingId = existingOf('shipping', shipping.id)
      if (shippingId) await runCommand(ctx, 'customers.addresses.update', { id: shippingId, ...addressBody(id, shipping, 'shipping', shipping.state) })
      else await runCommand(ctx, 'customers.addresses.create', addressBody(id, shipping, 'shipping', shipping.state))
    } else if (shipping === null) {
      for (const row of addressRows.filter((entry) => entry.purpose === 'shipping')) await runCommand(ctx, 'customers.addresses.delete', { id: row.id })
    }
    const ownContacts = await ownedChildIds(ctx, 'customer_contacts', id)
    const kept = new Set<string>()
    for (const [index, contact] of checked.contacts.entries()) {
      const body = { entityId: id, name: contact.name, phone: contact.phone || undefined, email: contact.email || undefined, sortOrder: index }
      if (contact.id && ownContacts.has(contact.id)) {
        kept.add(contact.id)
        await runCommand(ctx, 'customers.contacts.update', { id: contact.id, ...body })
      } else await runCommand(ctx, 'customers.contacts.create', body)
    }
    for (const contactId of ownContacts) if (!kept.has(contactId)) await runCommand(ctx, 'customers.contacts.delete', { id: contactId })
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    await ctx.em.nativeUpdate(CustomerEntity, { id, ...scope }, { updatedAt: new Date() })
    const assigned = await ctx.em.transactional((em) => ensureCustomerNumber(em, scope, id))
    if (assigned) await refreshCustomerIndex(ctx.container.resolve('eventBus'), scope, assigned.profileId)
    return { id, customerNo: assigned?.number ?? null }
  } catch (error) {
    if (created && entityId) await runCommand(ctx, 'customers.companies.delete', { id: entityId }).catch(() => undefined)
    throw error
  }
}
