import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import type { StoreContext } from '../../cc_store/lib/server'
import { runCommand } from '../../cc_store/lib/server'
import { diffFields, logCorrection, recordActivity, type FieldSpec } from '../../cc_audit/lib/activity'
import type { ActivitySource } from '../../cc_audit/data/entities'

export class CustomerActionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export const CUSTOMER_FIELDS: Record<string, FieldSpec> = {
  name: { label: 'Name' },
  legalName: { label: 'Legal / trade name' },
  category: { label: 'Customer type' },
  gstType: { label: 'GST type' },
  gstin: { label: 'GSTIN' },
  phone: { label: 'Phone' },
  email: { label: 'Email' },
  salesManager: { label: 'Sales manager' },
  paymentTerms: { label: 'Payment terms' },
  paymentRemarks: { label: 'Payment remarks' },
  billing: { label: 'Billing address' },
  shipping: { label: 'Shipping address' },
  contacts: { label: 'Contacts' },
  status: { label: 'Status' },
}

export type CustomerSnapshot = Record<keyof typeof CUSTOMER_FIELDS, string | null>

const CF: Record<string, keyof CustomerSnapshot> = {
  legal_trade_name: 'legalName',
  customer_type_category: 'category',
  gst_registration_type: 'gstType',
  gstin: 'gstin',
  sales_manager: 'salesManager',
  payment_terms: 'paymentTerms',
  payment_remarks: 'paymentRemarks',
}

function joined(parts: Array<string | null | undefined>): string | null {
  const text = parts.map((part) => (part ?? '').trim()).filter(Boolean).join(', ')
  return text || null
}

export async function customerSnapshot(ctx: StoreContext, entityId: string): Promise<CustomerSnapshot | null> {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const entity = await findOneWithDecryption(ctx.em, CustomerEntity, { id: entityId, ...scope, deletedAt: null }, {}, scope)
  if (!entity) return null
  const connection = ctx.em.getConnection()
  const [values, addresses, contacts] = await Promise.all([
    connection.execute<Array<{ field_key: string; value_text: string | null }>>(
      `select v.field_key, v.value_text from customer_companies c
         join custom_field_values v on v.record_id = c.id::text and v.entity_id = 'customers:customer_company_profile' and v.deleted_at is null
        where c.entity_id = ? and c.tenant_id = ? and c.organization_id = ?`,
      [entityId, ctx.tenantId, ctx.organizationId],
    ),
    connection.execute<Array<{ purpose: string | null; address_line1: string | null; city: string | null; region: string | null; postal_code: string | null; country: string | null }>>(
      'select purpose, address_line1, city, region, postal_code, country from customer_addresses where entity_id = ? and tenant_id = ? and organization_id = ? order by created_at asc',
      [entityId, ctx.tenantId, ctx.organizationId],
    ),
    connection.execute<Array<{ name: string | null; phone: string | null; email: string | null }>>(
      'select name, phone, email from customer_contacts where entity_id = ? and tenant_id = ? and organization_id = ? order by sort_order asc, created_at asc',
      [entityId, ctx.tenantId, ctx.organizationId],
    ),
  ])
  const snapshot: CustomerSnapshot = {
    name: entity.displayName ?? null,
    legalName: null,
    category: null,
    gstType: null,
    gstin: null,
    phone: entity.primaryPhone ?? null,
    email: entity.primaryEmail ?? null,
    salesManager: null,
    paymentTerms: null,
    paymentRemarks: null,
    billing: null,
    shipping: null,
    contacts: null,
    status: entity.status ?? null,
  }
  for (const row of values) {
    const key = CF[row.field_key]
    if (key) snapshot[key] = row.value_text?.trim() || null
  }
  const address = (purpose: string) => addresses.find((row) => (row.purpose ?? 'billing') === purpose)
  const billing = address('billing')
  const shipping = address('shipping')
  snapshot.billing = billing ? joined([billing.address_line1, billing.city, billing.region, billing.postal_code, billing.country]) : null
  snapshot.shipping = shipping ? joined([shipping.address_line1, shipping.city, shipping.region, shipping.postal_code, shipping.country]) : null
  snapshot.contacts = contacts.length ? contacts.map((row) => [row.name, row.phone, row.email].filter(Boolean).join(' ')).join('; ') : null
  return snapshot
}

export function logCustomerSave(ctx: StoreContext, entityId: string, before: CustomerSnapshot | null, after: CustomerSnapshot | null, options: { userName: string | null; reason?: string | null; source?: ActivitySource }) {
  if (!after) return
  const changes = diffFields(before, after, CUSTOMER_FIELDS)
  if (before && !changes.length) return
  recordActivity(ctx.em, ctx, {
    recordType: 'customer',
    recordId: entityId,
    action: before ? 'edited' : 'created',
    kind: 'change',
    summary: before ? null : options.source === 'upload' ? 'Created from the Excel import' : 'Created from the customer form',
    reason: options.reason ?? null,
    changes,
    source: options.source ?? 'screen',
    actorUserId: ctx.userId ?? null,
    actorName: options.userName,
  })
}

export async function invoiceCount(ctx: StoreContext, entityId: string): Promise<number> {
  const [row] = await ctx.em.getConnection().execute<Array<{ total: string }>>(
    `select count(*) as total from cc_tax_invoices where customer_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null and status <> 'cancelled'`,
    [entityId, ctx.tenantId, ctx.organizationId],
  )
  return Number(row?.total ?? 0)
}

const OPEN_ORDER = `status in ('booked', 'confirmed')`

export async function setCustomerActive(ctx: StoreContext, entityId: string, active: boolean, reason: string) {
  const before = await customerSnapshot(ctx, entityId)
  if (!before) throw new CustomerActionError('Customer not found', 404)
  if (!active) {
    if (before.status === 'inactive') throw new CustomerActionError('Already inactive', 409)
    const [open] = await ctx.em.getConnection().execute<Array<{ order_no: string }>>(
      `select order_no from cc_orders where customer_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null and ${OPEN_ORDER} limit 1`,
      [entityId, ctx.tenantId, ctx.organizationId],
    )
    if (open) throw new CustomerActionError(`Order ${open.order_no} is still open. Finish or cancel it first.`, 409)
  } else if (before.status !== 'inactive') throw new CustomerActionError('The customer is already active', 409)
  await runCommand(ctx, 'customers.companies.update', { id: entityId, status: active ? 'active' : 'inactive' })
  await logCorrection(ctx, { recordType: 'customer', recordId: entityId, action: active ? 'activated' : 'deactivated', summary: active ? 'Set active again; shows in new orders and quotations' : 'Set inactive; hidden from new orders and quotations', reason, changes: [{ field: 'status', label: 'Status', from: before.status ?? 'active', to: active ? 'active' : 'inactive' }] })
}

const MOVES: Array<{ table: string; label: string; nameColumn?: string }> = [
  { table: 'cc_enquiries', label: 'enquiries' },
  { table: 'cc_quotations', label: 'quotations' },
  { table: 'cc_orders', label: 'orders' },
  { table: 'cc_proforma_invoices', label: 'proformas', nameColumn: 'customer_name' },
  { table: 'cc_tax_invoices', label: 'invoices', nameColumn: 'customer_name' },
  { table: 'cc_lab_tests', label: 'lab reports', nameColumn: 'customer_name' },
  { table: 'cc_moulds', label: 'dies' },
]

export async function mergeCustomers(ctx: StoreContext, keepId: string, dropId: string, reason: string) {
  if (keepId === dropId) throw new CustomerActionError('Pick another customer to merge into this one')
  const [keep, drop] = await Promise.all([customerSnapshot(ctx, keepId), customerSnapshot(ctx, dropId)])
  if (!keep || !drop) throw new CustomerActionError('Customer not found', 404)
  if (drop.status === 'merged') throw new CustomerActionError(`${drop.name} is already merged`, 409)
  const connection = ctx.em.getConnection()
  const [clash] = await connection.execute<Array<{ month: string }>>(
    `select to_char(a.invoice_date::date, 'YYYY-MM') as month from cc_tax_invoices a
       join cc_tax_invoices b on to_char(a.invoice_date::date, 'YYYY-MM') = to_char(b.invoice_date::date, 'YYYY-MM') and b.customer_id = ? and b.tenant_id = a.tenant_id and b.organization_id = a.organization_id and b.deleted_at is null and b.status <> 'cancelled'
      where a.customer_id = ? and a.tenant_id = ? and a.organization_id = ? and a.deleted_at is null and a.status <> 'cancelled' limit 1`,
    [dropId, keepId, ctx.tenantId, ctx.organizationId],
  )
  if (clash) throw new CustomerActionError(`Both customers have invoices in ${clash.month}. GST returns for that month already show two parties; merge after Accounts sorts it out.`, 409)
  const moved: string[] = []
  await ctx.em.transactional(async (em) => {
    const tx = em.getConnection()
    for (const move of MOVES) {
      const rows = await tx.execute<Array<{ id: string }>>(
        `update ${move.table} set customer_id = ?${move.nameColumn ? `, ${move.nameColumn} = ?` : ''} where customer_id = ? and tenant_id = ? and organization_id = ? returning id`,
        [keepId, ...(move.nameColumn ? [keep.name] : []), dropId, ctx.tenantId, ctx.organizationId],
        'all',
        em.getTransactionContext(),
      )
      if (rows.length) moved.push(`${rows.length} ${move.label}`)
    }
  })
  await runCommand(ctx, 'customers.companies.update', { id: dropId, status: 'merged' })
  const summary = moved.length ? `Moved ${moved.join(', ')}` : 'Nothing to move'
  await logCorrection(ctx, { recordType: 'customer', recordId: keepId, action: 'merged_in', summary: `${drop.name} merged into this customer. ${summary}.`, reason, links: [{ type: 'customer', id: dropId, label: drop.name }] })
  await logCorrection(ctx, { recordType: 'customer', recordId: dropId, action: 'merged_away', summary: `Merged into ${keep.name}. ${summary}; this record is kept for history and hidden from lists.`, reason, links: [{ type: 'customer', id: keepId, label: keep.name }] })
  return { moved }
}
