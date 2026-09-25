import { Client } from 'pg'
import dotenv from 'dotenv'
import crypto from 'node:crypto'

dotenv.config({ path: 'apps/mercato/.env' })

const client = new Client({ connectionString: process.env.DATABASE_URL })

function parseEncryptionKey(raw: string | undefined): Buffer {
  const keyStr = raw || process.env.TENANT_DATA_ENCRYPTION_FALLBACK_KEY || process.env.ENCRYPTION_KEY
  if (!keyStr) throw new Error('TENANT_DATA_ENCRYPTION_FALLBACK_KEY missing')
  if (/^[0-9a-fA-F]{64}$/.test(keyStr)) return Buffer.from(keyStr, 'hex')
  const base64 = Buffer.from(keyStr, 'base64')
  if (base64.length === 32) return base64
  return crypto.createHash('sha256').update(keyStr).digest()
}

function encryptVal(text: string | null | undefined, key: Buffer): string | null {
  if (!text) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const tag = cipher.getAuthTag().toString('base64')
  return `${iv.toString('base64')}:${tag}:${encrypted}:v1`
}

function decryptVal(payload: string | null | undefined, key: Buffer): string | null {
  if (!payload || !payload.includes(':')) return payload ?? null
  try {
    const [ivB64, tagB64, cipherB64] = payload.split(':')
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    let dec = decipher.update(cipherB64, 'base64', 'utf8')
    dec += decipher.final('utf8')
    return dec
  } catch {
    return payload ?? null
  }
}

const standardCustomers = [
  {
    name: 'Mishkae',
    legal: 'Mishkae Wellness Pvt Ltd',
    phone: '+91 98201 12345',
    email: 'orders@mishkae.com',
    gstin: '27AABCM1234F1Z8',
    poc: 'Vikram Mehta',
    city: 'Mumbai',
    state: 'Maharashtra',
    address: 'Plot 42, MIDC Andheri East, Mumbai 400093',
    zip: '400093',
    paymentTerms: '30_days',
    paymentRemarks: '20% ADVANCE',
  },
  {
    name: 'Bioinovex Health',
    legal: 'Bioinovex Health Labs LLP',
    phone: '+91 98450 67890',
    email: 'procurement@bioinovex.com',
    gstin: '29AABCB5678G1ZP',
    poc: 'Dr. Ananya Rao',
    city: 'Bengaluru',
    state: 'Karnataka',
    address: '88 Electronic City Phase 1, Bengaluru 560100',
    zip: '560100',
    paymentTerms: '45_days',
    paymentRemarks: '25% Advance and 75% Before Dispatch',
  },
  {
    name: 'Sereneaura Sciences',
    legal: 'Sereneaura Sciences Pvt Ltd',
    phone: '+91 98110 54321',
    email: 'supply@sereneaura.com',
    gstin: '07AABCS9012H1ZU',
    poc: 'Rohit Sharma',
    city: 'New Delhi',
    state: 'Delhi',
    address: 'B-12 Okhla Industrial Area Phase 2, New Delhi 110020',
    zip: '110020',
    paymentTerms: '15_days',
    paymentRemarks: '50% advance and 50% before dispatch',
  },
  {
    name: 'Skin Theta Global',
    legal: 'Skin Theta Global Care LLP',
    phone: '+91 97690 98765',
    email: 'business@skintheta.com',
    gstin: '27AABCS3456J1ZR',
    poc: 'Priya Iyer',
    city: 'Pune',
    state: 'Maharashtra',
    address: 'Hinjewadi Tech Park Phase 3, Pune 411057',
    zip: '411057',
    paymentTerms: '30_days',
    paymentRemarks: 'As Discussed',
  },
  {
    name: 'Myndful Global',
    legal: 'Myndful Personal Care Ltd',
    phone: '+91 99000 11223',
    email: 'ops@myndfulglobal.com',
    gstin: '24AABCM7890K1ZW',
    poc: 'Amit Patel',
    city: 'Ahmedabad',
    state: 'Gujarat',
    address: 'SG Highway Titanium City Center, Ahmedabad 380054',
    zip: '380054',
    paymentTerms: 'due_on_delivery',
    paymentRemarks: '40% advance 60% before dispatch',
  },
  {
    name: 'Rudra Enterprises',
    legal: 'Rudra Enterprises & Derma',
    phone: '+91 94120 33445',
    email: 'rudra.derma@gmail.com',
    gstin: '09AABCR1122L1ZX',
    poc: 'Rajesh Gupta',
    city: 'Noida',
    state: 'Uttar Pradesh',
    address: 'Sector 63 Commercial Complex, Noida 201301',
    zip: '201301',
    paymentTerms: '15_days',
    paymentRemarks: '30% Advance 70% before Dispatch',
  },
  {
    name: 'Hyeoskin',
    legal: 'Hyeoskin Laboratories Pvt Ltd',
    phone: '+91 98840 99887',
    email: 'orders@hyeoskin.in',
    gstin: '33AABCH3344M1ZV',
    poc: 'Karthik Raja',
    city: 'Chennai',
    state: 'Tamil Nadu',
    address: 'Guindy Industrial Estate, Chennai 600032',
    zip: '600032',
    paymentTerms: '60_days',
    paymentRemarks: '60DAYS CREDIT',
  },
  {
    name: 'Heal n Cure',
    legal: 'Heal n Cure Healthcare Ltd',
    phone: '+91 98720 55667',
    email: 'pharma@healncure.com',
    gstin: '03AABCH5566N1ZT',
    poc: 'Harpreet Singh',
    city: 'Chandigarh',
    state: 'Punjab',
    address: 'Industrial Area Phase 1, Chandigarh 160002',
    zip: '160002',
    paymentTerms: '30_days',
    paymentRemarks: '20% ADVANCE',
  },
  {
    name: 'Baebbe Skin Care',
    legal: 'Baebbe Mother & Baby Care LLP',
    phone: '+91 98300 77889',
    email: 'hello@baebbe.com',
    gstin: '19AABCB7788P1ZS',
    poc: 'Sneha Bose',
    city: 'Kolkata',
    state: 'West Bengal',
    address: 'Salt Lake Sector V, Kolkata 700091',
    zip: '700091',
    paymentTerms: 'due_on_delivery',
    paymentRemarks: '50% advance and 50% before dispatch',
  },
  {
    name: 'Miganz K',
    legal: 'Miganz K Cosmetics India',
    phone: '+91 98490 22334',
    email: 'contact@miganzk.com',
    gstin: '36AABCM9900Q1ZR',
    poc: 'Suresh Reddy',
    city: 'Hyderabad',
    state: 'Telangana',
    address: 'HITEC City Madhapur, Hyderabad 500081',
    zip: '500081',
    paymentTerms: '90_days',
    paymentRemarks: '90 DAYS',
  },
]

async function cleanAndSeedCustomers() {
  await client.connect()
  const dek = parseEncryptionKey(process.env.ENCRYPTION_KEY)

  // 1. Fetch organization & tenant
  const orgRes = await client.query('SELECT id, tenant_id FROM organizations LIMIT 1;')
  if (orgRes.rows.length === 0) throw new Error('No organization found')
  const orgId = orgRes.rows[0].id
  const tenantId = orgRes.rows[0].tenant_id

  console.log(`Using Org: ${orgId}, Tenant: ${tenantId}`)

  // 1.5 Ensure customer_contacts table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS customer_contacts (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      entity_id uuid NOT NULL REFERENCES customer_entities(id) ON DELETE CASCADE,
      name text NOT NULL,
      phone text NULL,
      email text NULL,
      sort_order integer NOT NULL DEFAULT 0,
      is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz(6) NOT NULL DEFAULT now(),
      updated_at timestamptz(6) NOT NULL DEFAULT now(),
      PRIMARY KEY (id)
    );
    CREATE INDEX IF NOT EXISTS customer_contacts_entity_idx ON customer_contacts (entity_id);
  `)

  // 2. Find all existing customer entities
  const allCe = await client.query('SELECT id, display_name FROM customer_entities')
  const validNames = new Set(standardCustomers.map((c) => c.name.toLowerCase().trim()))

  for (const r of allCe.rows) {
    const dec = decryptVal(r.display_name, dek)
    const norm = (dec || '').toLowerCase().trim()
    if (!validNames.has(norm)) {
      console.log(`Removing incomplete/invalid customer entity: "${dec}" (${r.id})`)
      await client.query('DELETE FROM customer_contacts WHERE entity_id = $1', [r.id])
      await client.query('DELETE FROM customer_addresses WHERE entity_id = $1', [r.id])
      await client.query('DELETE FROM custom_field_values WHERE record_id = $1', [r.id])
      const compRes = await client.query('SELECT id FROM customer_companies WHERE entity_id = $1', [r.id])
      for (const comp of compRes.rows) {
        await client.query('DELETE FROM custom_field_values WHERE record_id = $1', [comp.id])
      }
      await client.query('DELETE FROM customer_companies WHERE entity_id = $1', [r.id])
      // Only delete customer entity if no orders attached
      const orders = await client.query('SELECT id FROM sales_orders WHERE customer_entity_id = $1', [r.id])
      if (orders.rows.length === 0) {
        await client.query('DELETE FROM customer_entities WHERE id = $1', [r.id])
      } else {
        await client.query("UPDATE customer_entities SET deleted_at = NOW() WHERE id = $1", [r.id])
      }
    }
  }

  // 3. Upsert standard customers with 100% complete data
  for (const c of standardCustomers) {
    const encName = encryptVal(c.name, dek)
    const encLegal = encryptVal(c.legal, dek)
    const encPhone = encryptVal(c.phone, dek)
    const encEmail = encryptVal(c.email, dek)

    // Check entity
    const existingEntities = await client.query('SELECT id, display_name FROM customer_entities')
    let entityId: string | null = null
    for (const r of existingEntities.rows) {
      const dec = decryptVal(r.display_name, dek)
      if (dec && dec.toLowerCase().trim() === c.name.toLowerCase().trim()) {
        entityId = r.id
        break
      }
    }

    if (!entityId) {
      entityId = crypto.randomUUID()
      await client.query(
        `INSERT INTO customer_entities (id, organization_id, tenant_id, kind, display_name, primary_email, primary_phone, status, source, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'company', $4, $5, $6, 'active', 'referral', true, NOW(), NOW())`,
        [entityId, orgId, tenantId, encName, encEmail, encPhone]
      )
    } else {
      await client.query(
        `UPDATE customer_entities SET display_name = $1, primary_email = $2, primary_phone = $3, status = 'active', source = 'referral', is_active = true, deleted_at = NULL, updated_at = NOW() WHERE id = $4`,
        [encName, encEmail, encPhone, entityId]
      )
    }

    // Company profile
    let compId: string
    const compCheck = await client.query('SELECT id FROM customer_companies WHERE entity_id = $1', [entityId])
    if (compCheck.rows.length === 0) {
      compId = crypto.randomUUID()
      await client.query(
        `INSERT INTO customer_companies (id, organization_id, tenant_id, entity_id, legal_name, brand_name, industry, size_bucket, annual_revenue, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'Cosmetics & Dermatology', 'mid-market', 5000000, NOW(), NOW())`,
        [compId, orgId, tenantId, entityId, encLegal, encName]
      )
    } else {
      compId = compCheck.rows[0].id
      await client.query(
        `UPDATE customer_companies SET legal_name = $1, brand_name = $2, industry = 'Cosmetics & Dermatology', size_bucket = 'mid-market', annual_revenue = 5000000, updated_at = NOW() WHERE entity_id = $3`,
        [encLegal, encName, entityId]
      )
    }

    // Address
    const encAddr1 = encryptVal(c.address, dek)
    const encCity = encryptVal(c.city, dek)
    const encRegion = encryptVal(c.state, dek)
    const encZip = encryptVal(c.zip, dek)
    const encCompName = encryptVal(c.legal, dek)

    const addrCheck = await client.query('SELECT id FROM customer_addresses WHERE entity_id = $1', [entityId])
    if (addrCheck.rows.length === 0) {
      const addrId = crypto.randomUUID()
      await client.query(
        `INSERT INTO customer_addresses (id, organization_id, tenant_id, entity_id, name, purpose, address_line1, city, region, postal_code, country, company_name, is_primary, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'Headquarters', 'billing', $5, $6, $7, $8, 'IN', $9, true, NOW(), NOW())`,
        [addrId, orgId, tenantId, entityId, encAddr1, encCity, encRegion, encZip, encCompName]
      )
    } else {
      await client.query(
        `UPDATE customer_addresses SET address_line1 = $1, city = $2, region = $3, postal_code = $4, company_name = $5, is_primary = true, updated_at = NOW() WHERE entity_id = $6`,
        [encAddr1, encCity, encRegion, encZip, encCompName, entityId]
      )
    }

    // Contact
    const encPocName = encryptVal(c.poc, dek)
    const contactCheck = await client.query('SELECT id FROM customer_contacts WHERE entity_id = $1', [entityId])
    if (contactCheck.rows.length === 0) {
      const contactId = crypto.randomUUID()
      await client.query(
        `INSERT INTO customer_contacts (id, organization_id, tenant_id, entity_id, name, phone, email, is_primary, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0, NOW(), NOW())`,
        [contactId, orgId, tenantId, entityId, encPocName, encPhone, encEmail]
      )
    } else {
      await client.query(
        `UPDATE customer_contacts SET name = $1, phone = $2, email = $3, is_primary = true, updated_at = NOW() WHERE entity_id = $4`,
        [encPocName, encPhone, encEmail, entityId]
      )
    }

    // Custom fields on customer_company_profile (using compId as record_id)
    const customFieldsToSet = [
      { key: 'customer_type_category', val: 'business' },
      { key: 'legal_trade_name', val: c.legal },
      { key: 'gst_registration_type', val: 'registered' },
      { key: 'gstin', val: c.gstin },
      { key: 'default_currency', val: 'INR' },
      { key: 'payment_terms', val: c.paymentTerms },
      { key: 'payment_remarks', val: c.paymentRemarks },
      { key: 'sales_manager', val: c.poc },
    ]

    for (const cf of customFieldsToSet) {
      const existingCf = await client.query(
        `SELECT id FROM custom_field_values WHERE entity_id = 'customers:customer_company_profile' AND record_id = $1 AND field_key = $2`,
        [compId, cf.key]
      )
      if (existingCf.rows.length === 0) {
        await client.query(
          `INSERT INTO custom_field_values (id, organization_id, tenant_id, entity_id, record_id, field_key, value_text, created_at)
           VALUES (gen_random_uuid(), $1, $2, 'customers:customer_company_profile', $3, $4, $5, NOW())`,
          [orgId, tenantId, compId, cf.key, cf.val]
        )
      } else {
        await client.query(
          `UPDATE custom_field_values SET value_text = $1, deleted_at = NULL WHERE id = $2`,
          [cf.val, existingCf.rows[0].id]
        )
      }
    }

    console.log(`✓ Customer fully seeded: ${c.name} (${c.legal}) - GST: ${c.gstin} - POC: ${c.poc} - Terms: ${c.paymentTerms}`)
  }

  // Remove old legacy cf keys like gst_number or sales_poc from custom_field_values
  await client.query(
    `DELETE FROM custom_field_values WHERE entity_id = 'customers:customer_company_profile' AND field_key IN ('gst_number', 'sales_poc', 'customer_type', 'address')`
  )

  console.log('\nAll customer data cleaned and synced!')
  await client.end()
}

cleanAndSeedCustomers().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
