import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { GSTIN_PATTERN, gstinChecksumOk, stateFromGstin } from '../../cc_accounts/lib/gstStates'
import { normalisePhone } from '../../cc_customers/lib/saveCustomer'
import type { VendorCategory } from '../data/entities'

type Scope = { tenantId: string; organizationId: string }

export type VendorValues = {
  name: string
  code: string | null
  gstNumber: string | null
  contactPerson: string | null
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  paymentTerms: string | null
  category: VendorCategory | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE = /^[A-Z0-9][A-Z0-9/_-]{0,29}$/

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export async function nextVendorCode(em: EntityManager, scope: Scope): Promise<string> {
  const [row] = await em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(substring(code from 4)::int) as max from cc_vendors where tenant_id = ? and organization_id = ? and code ~ '^VEN[0-9]+$'`,
    [scope.tenantId, scope.organizationId],
  )
  return `VEN${String(Number(row?.max ?? 0) + 1).padStart(3, '0')}`
}

export async function checkVendor(em: EntityManager, scope: Scope, values: VendorValues, current?: { id: string } & VendorValues): Promise<VendorValues> {
  const fields: Record<string, string> = {}
  const name = values.name.replace(/\s+/g, ' ').trim()
  if (name.length < 2) fields.name = 'Enter the vendor name'
  const gstNumber = values.gstNumber ? values.gstNumber.toUpperCase().replace(/\s/g, '') : null
  if (gstNumber) {
    if (!GSTIN_PATTERN.test(gstNumber)) fields.gstNumber = 'GSTIN must be 15 characters like 27AAACT1234A1Z5'
    else if (!gstinChecksumOk(gstNumber)) fields.gstNumber = 'This GSTIN is not valid (check digit does not match). Check for a typing mistake.'
    else if (!stateFromGstin(gstNumber)) fields.gstNumber = 'The first two digits are not an Indian state code'
  }
  if (gstNumber && !fields.gstNumber && !values.address) fields.address = 'A GST-registered vendor needs the address (it prints on the PO)'
  const code = values.code ? values.code.toUpperCase().replace(/\s+/g, '') : null
  if (code && !CODE.test(code)) fields.code = 'Vendor code: letters, digits, / - _ only (up to 30)'
  const contactEmail = values.contactEmail ? values.contactEmail.trim().toLowerCase() : null
  if (contactEmail && !EMAIL.test(contactEmail)) fields.contactEmail = 'Email is not valid'
  let contactPhone: string | null = null
  if (values.contactPhone) {
    const normalised = normalisePhone(values.contactPhone, 'India')
    if (normalised === null) {
      if (values.contactPhone === current?.contactPhone) contactPhone = values.contactPhone
      else fields.contactPhone = 'Phone number is not valid (10-digit mobile, or +country code)'
    } else contactPhone = normalised || null
  }

  const others = await em.getConnection().execute<Array<{ id: string; name: string; code: string | null; gst_number: string | null }>>(
    'select id, name, code, gst_number from cc_vendors where tenant_id = ? and organization_id = ? and deleted_at is null and id <> ?',
    [scope.tenantId, scope.organizationId, current?.id ?? '00000000-0000-0000-0000-000000000000'],
  )
  let conflict = false
  if (name && !fields.name && key(name) !== key(current?.name ?? '')) {
    const same = others.find((row) => key(row.name) === key(name))
    if (same) {
      fields.name = `A vendor called ${same.name} already exists`
      conflict = true
    }
  }
  if (gstNumber && !fields.gstNumber && gstNumber !== current?.gstNumber) {
    const same = others.find((row) => (row.gst_number ?? '').toUpperCase() === gstNumber)
    if (same) {
      fields.gstNumber = `${same.name} already has this GSTIN`
      conflict = true
    }
  }
  if (code && !fields.code) {
    const same = others.find((row) => (row.code ?? '').toUpperCase() === code)
    if (same) {
      fields.code = `${same.name} already uses code ${code}`
      conflict = true
    }
  }
  if (Object.keys(fields).length) {
    throw new CrudHttpError(conflict ? 409 : 400, { error: Object.keys(fields).length === 1 ? Object.values(fields)[0] : 'Some fields need fixing', fieldErrors: fields })
  }
  return {
    name,
    code: code ?? current?.code ?? null,
    gstNumber,
    contactPerson: values.contactPerson?.trim() || null,
    contactPhone,
    contactEmail,
    address: values.address?.trim() || null,
    paymentTerms: values.paymentTerms?.trim() || null,
    category: values.category ?? current?.category ?? 'both',
  }
}
