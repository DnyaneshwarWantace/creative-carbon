import { Client } from 'pg'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5437/creative_carbon_demo'

function makeSvgDataUri(bg, text, subtext = 'Demo Client') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90" viewBox="0 0 240 90">
    <rect width="240" height="90" rx="10" fill="${bg}"/>
    <circle cx="45" cy="45" r="26" fill="rgba(255,255,255,0.2)"/>
    <text x="45" y="53" font-family="system-ui, sans-serif" font-size="22" font-weight="900" fill="#ffffff" text-anchor="middle">${text.slice(0, 2).toUpperCase()}</text>
    <text x="85" y="42" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="#ffffff">${text.length > 15 ? text.slice(0, 15) + '…' : text}</text>
    <text x="85" y="60" font-family="system-ui, sans-serif" font-size="10" font-weight="500" fill="rgba(255,255,255,0.85)">${subtext}</text>
  </svg>`.trim()
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function makeCompanyLogoUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90" viewBox="0 0 300 90">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e293b"/>
      </linearGradient>
      <linearGradient id="acc" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#06b6d4"/>
        <stop offset="100%" stop-color="#10b981"/>
      </linearGradient>
    </defs>
    <rect width="300" height="90" rx="8" fill="url(#grad)"/>
    <polygon points="45,18 68,32 68,58 45,72 22,58 22,32" fill="none" stroke="url(#acc)" stroke-width="4"/>
    <circle cx="45" cy="45" r="10" fill="url(#acc)"/>
    <text x="82" y="42" font-family="system-ui, sans-serif" font-size="17" font-weight="800" fill="#f8fafc" letter-spacing="0.5">CREATIVE CARBON</text>
    <text x="82" y="62" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#94a3b8" letter-spacing="1.5">COMPOSITES (DEMO)</text>
  </svg>`.trim()
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function makeSignatureUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="60" viewBox="0 0 180 60">
    <path d="M 20 40 Q 40 10, 60 35 T 100 25 T 140 40 T 170 30" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>
    <text x="30" y="55" font-family="sans-serif" font-size="9" fill="#64748b">Demo Signatory</text>
  </svg>`.trim()
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function makeStampUri() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="4,2"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="#2563eb" stroke-width="1.5"/>
    <text x="50" y="32" font-family="sans-serif" font-size="6.5" font-weight="bold" fill="#2563eb" text-anchor="middle">CREATIVE CARBON</text>
    <text x="50" y="52" font-family="sans-serif" font-size="8" font-weight="bold" fill="#2563eb" text-anchor="middle">DEMO VERIFIED</text>
    <text x="50" y="70" font-family="sans-serif" font-size="6" fill="#2563eb" text-anchor="middle">SAMPLE STAMP</text>
  </svg>`.trim()
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

async function run() {
  console.log('Connecting to database:', DATABASE_URL)
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  const orgRes = await client.query('SELECT id, tenant_id FROM organizations LIMIT 1;')
  if (!orgRes.rows.length) {
    console.error('No organization found.')
    process.exit(1)
  }
  const { id: organizationId, tenant_id: tenantId } = orgRes.rows[0]
  console.log(`Using Org: ${organizationId}, Tenant: ${tenantId}`)

  // 1. UPDATE COMPANY PROFILE (100% DEMO / FICTIONAL DATA)
  console.log('\n[1/6] Updating Company Profile with Demo / Fictional values …')
  const companyLogo = makeCompanyLogoUri()
  const sigUri = makeSignatureUri()
  const stampUri = makeStampUri()

  await client.query(`
    UPDATE cc_company_profiles
    SET
      name = 'Creative Carbon Composites Pvt. Ltd. (Demo)',
      legal_name = 'Creative Carbon Composites Private Limited',
      gstin = '24DEMO0000001Z9',
      pan = 'DEMOP0000D',
      address = 'Plot 99, Demo Industrial Park, Phase-1, GIDC, Kheda - 387540, Gujarat',
      phone = '+91 99999 00001',
      email = 'demo-accounts@example.com',
      website = 'www.creativecarbon.demo',
      bank_name = 'Demo Commercial Bank',
      bank_branch = 'Demo Branch',
      bank_account = '00001234567890',
      bank_ifsc = 'DEMO0001234',
      signatory = 'Demo Authorised Signatory',
      pi_validity_days = 30,
      pi_terms = '1. 30% advance with Purchase Order; balance against proforma invoice before dispatch.\n2. Prices are ex-works demo plant.\n3. Demo terms for client presentation only.',
      invoice_terms = '1. Payment due within 30 days.\n2. Standard warranty as per test certificate.\n3. Subject to local jurisdiction.',
      letterhead = jsonb_build_object(
        'stateCode', '24',
        'stateName', 'Gujarat',
        'declaration', 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
        'jurisdiction', 'Ahmedabad / Kheda',
        'logoUrl', $1::text,
        'signatureUrl', $2::text,
        'stampUrl', $3::text,
        'worksAddress', 'Survey 99/A, Demo Highway, Kanera, Dist. Kheda - 387540',
        'cin', 'U00000GJ2026PTC000000',
        'udyam', 'UDYAM-GJ-00-0000000'
      ),
      updated_at = NOW()
    WHERE organization_id = $4::uuid AND tenant_id = $5::uuid;
  `, [companyLogo, sigUri, stampUri, organizationId, tenantId])
  console.log('  ✓ Company profile set with clean fictional/demo data.')

  // 2. SEED PARTY LOGOS (CUSTOMERS & VENDORS)
  console.log('\n[2/6] Seeding Customer & Supplier Logos in cc_party_logos …')
  const customers = await client.query('SELECT id FROM customer_entities WHERE organization_id = $1;', [organizationId])
  const colors = [
    { bg: '#0284c7', name: 'Shree Ganesh Switchgear' },
    { bg: '#4f46e5', name: 'Kanpur Electro' },
    { bg: '#b91c1c', name: 'Shakti Switchgear' },
    { bg: '#0d9488', name: 'Narmada Transformers' },
    { bg: '#7c3aed', name: 'Sai Electricals' },
    { bg: '#c2410c', name: 'Deccan Motor Works' },
    { bg: '#334155', name: 'Ambika Panel' },
    { bg: '#0369a1', name: 'Coastal Power' },
    { bg: '#15803d', name: 'Himalaya Insulators' },
    { bg: '#be185d', name: 'Apex Electricals' },
    { bg: '#0f766e', name: 'Prime Engineering' },
  ]

  for (let i = 0; i < customers.rows.length; i++) {
    const custId = customers.rows[i].id
    const meta = colors[i % colors.length]
    const logoUri = makeSvgDataUri(meta.bg, meta.name, 'Client Partner')
    await client.query(`
      INSERT INTO cc_party_logos (id, organization_id, tenant_id, party_kind, party_id, image_url, updated_by_name, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, 'customer', $3, $4, 'Demo Seed', NOW(), NOW())
      ON CONFLICT (organization_id, tenant_id, party_kind, party_id)
      DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = NOW();
    `, [organizationId, tenantId, custId, logoUri])
  }

  const vendors = await client.query('SELECT id, name FROM cc_vendors WHERE organization_id = $1;', [organizationId])
  for (let i = 0; i < vendors.rows.length; i++) {
    const v = vendors.rows[i]
    const logoUri = makeSvgDataUri('#1e293b', v.name || 'Vendor', 'Raw Material')
    await client.query(`
      INSERT INTO cc_party_logos (id, organization_id, tenant_id, party_kind, party_id, image_url, updated_by_name, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, 'vendor', $3, $4, 'Demo Seed', NOW(), NOW())
      ON CONFLICT (organization_id, tenant_id, party_kind, party_id)
      DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = NOW();
    `, [organizationId, tenantId, v.id, logoUri])
  }
  console.log(`  ✓ Seeded ${customers.rows.length} customer logos and ${vendors.rows.length} vendor logos.`)

  // 3. ENRICH TAX INVOICES WITH DEMO TRANSPORTER & LOGISTICS (FICTIONAL)
  console.log('\n[3/6] Setting Demo Transporters & Invoices …')
  const logistics = [
    { trans: 'Demo Freight Carriers', veh: 'GJ-07-XX-1111', lr: 'LR-DEMO-001', eway: '240000000001', pos: '24-Gujarat', state: false },
    { trans: 'FastTrack Cargo (Demo)', veh: 'UP-78-XX-2222', lr: 'LR-DEMO-002', eway: '240000000002', pos: '09-Uttar Pradesh', state: true },
    { trans: 'Express Roadlines (Demo)', veh: 'MH-04-XX-3333', lr: 'LR-DEMO-003', eway: '240000000003', pos: '27-Maharashtra', state: true },
    { trans: 'National Transport (Demo)', veh: 'GJ-01-XX-4444', lr: 'LR-DEMO-004', eway: '240000000004', pos: '24-Gujarat', state: false },
    { trans: 'Western Logistics (Demo)', veh: 'MP-09-XX-5555', lr: 'LR-DEMO-005', eway: '240000000005', pos: '23-Madhya Pradesh', state: true },
    { trans: 'Swift Transit (Demo)', veh: 'GJ-06-XX-6666', lr: 'LR-DEMO-006', eway: '240000000006', pos: '24-Gujarat', state: false },
  ]

  const invs = await client.query('SELECT id FROM cc_tax_invoices WHERE organization_id = $1 ORDER BY code;', [organizationId])
  for (let i = 0; i < invs.rows.length; i++) {
    const inv = invs.rows[i]
    const log = logistics[i % logistics.length]
    await client.query(`
      UPDATE cc_tax_invoices
      SET
        transporter = $1,
        vehicle_no = $2,
        lr_no = $3,
        eway_bill_no = $4,
        place_of_supply = $5,
        inter_state = $6,
        bank_details = 'Demo Bank | A/C: 00001234567890 | IFSC: DEMO0001234',
        terms = 'Payment due within 30 days. Fictional demo invoice.',
        notes = 'Demo Invoice. All values for sample presentation.',
        updated_at = NOW()
      WHERE id = $7;
    `, [log.trans, log.veh, log.lr, log.eway, log.pos, log.state, inv.id])
  }
  console.log(`  ✓ Updated ${invs.rows.length} tax invoices with demo transport fields.`)

  // 4. BALANCED STAGES - EVERY STAGE HAS DATA TO SHOW CLIENT
  console.log('\n[4/6] Setting Orders across EVERY STAGE …')
  const stageTargets = [
    { orderNo: 'CCCPL/SO/2627/0009', stage: 'advance', status: 'open', hold: null, orderStatus: 'booked', note: 'Advance OPEN - Waiting for demo advance verification' },
    { orderNo: 'CCCPL/SO/2627/0010', stage: 'advance', status: 'on_hold', hold: 'Customer requested 45-day LC in lieu of advance; pending director approval', orderStatus: 'booked', note: 'Advance ON HOLD' },
    { orderNo: 'CCCPL/SO/2627/0011', stage: 'allocation', status: 'open', hold: null, orderStatus: 'confirmed', note: 'Allocation OPEN - 30% advance received, raw sheets ready' },
    { orderNo: 'CCCPL/SO/2627/0008', stage: 'allocation', status: 'on_hold', hold: 'Shortage of 25mm 10x10 core sheet; currently in Dryer 2 coating batch', orderStatus: 'confirmed', note: 'Allocation ON HOLD' },
    { orderNo: 'CCCPL/SO/2627/0007', stage: 'qc', status: 'open', hold: null, orderStatus: 'confirmed', note: 'QC OPEN - Allocated, cutting done, dielectric test pending' },
    { orderNo: 'CCCPL/SO/2627/0006', stage: 'packing', status: 'open', hold: null, orderStatus: 'confirmed', note: 'Packing OPEN - QC passed, wooden crate packing underway' },
    { orderNo: 'CCCPL/SO/2627/0005', stage: 'invoice', status: 'open', hold: null, orderStatus: 'confirmed', note: 'Invoice OPEN - Packing done, proforma paid, generating tax invoice' },
    { orderNo: 'CCCPL/SO/2627/0004', stage: 'dispatch', status: 'open', hold: null, orderStatus: 'confirmed', note: 'Dispatch OPEN - Invoice issued, vehicle GJ-07-XX-1111 at loading bay' },
  ]

  for (const t of stageTargets) {
    const oRes = await client.query('SELECT id FROM cc_orders WHERE order_no = $1 AND organization_id = $2;', [t.orderNo, organizationId])
    if (!oRes.rows.length) continue
    const orderId = oRes.rows[0].id

    await client.query('UPDATE cc_orders SET status = $1, updated_at = NOW() WHERE id = $2;', [t.orderStatus, orderId])

    const STAGES = ['order', 'advance', 'allocation', 'qc', 'packing', 'invoice', 'dispatch']
    const targetIdx = STAGES.indexOf(t.stage)

    for (let si = 0; si < STAGES.length; si++) {
      const sKey = STAGES[si]
      let st = 'waiting'
      let holdReason = null
      let completedAt = null
      let openedAt = null

      if (si < targetIdx) {
        st = 'done'
        completedAt = new Date()
      } else if (si === targetIdx) {
        st = t.status
        holdReason = t.hold
        openedAt = new Date()
      }

      await client.query(`
        INSERT INTO cc_order_stages (id, organization_id, tenant_id, order_id, stage_key, status, hold_reason, opened_at, completed_at, updated_at, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (order_id, stage_key)
        DO UPDATE SET status = EXCLUDED.status, hold_reason = EXCLUDED.hold_reason, opened_at = EXCLUDED.opened_at, completed_at = EXCLUDED.completed_at, updated_at = NOW();
      `, [organizationId, tenantId, orderId, sKey, st, holdReason, openedAt, completedAt])
    }

    await client.query(`
      INSERT INTO cc_order_events (id, organization_id, tenant_id, order_id, stage_key, action, note, by_name, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'stage_updated', $5, 'Demo System', NOW());
    `, [organizationId, tenantId, orderId, t.stage, t.note])

    console.log(`  ✓ ${t.orderNo} -> ${t.stage.toUpperCase()} (${t.status})`)
  }

  // 5. ACTIVITY LOGS (FICTIONAL / DEMO LOGS)
  console.log('\n[5/6] Seeding activity feed in cc_activity_log …')
  const sampleActivities = [
    { type: 'order', action: 'order_booked', kind: 'sales', summary: 'Order CCCPL/SO/2627/0011 booked for Ambika Panel Builders', actor: 'Priya Sharma' },
    { type: 'order', action: 'advance_received', kind: 'finance', summary: 'Received ₹45,000 demo advance for order CCCPL/SO/2627/0008', actor: 'Accounts' },
    { type: 'order', action: 'qc_passed', kind: 'quality', summary: 'Dielectric breakdown & thickness test passed for CCCPL/SO/2627/0006', actor: 'Lab QC' },
    { type: 'invoice', action: 'invoice_issued', kind: 'accounts', summary: 'Demo Tax Invoice #006 issued to Deccan Motor Works', actor: 'Finance Desk' },
    { type: 'dispatch', action: 'dispatched', kind: 'logistics', summary: 'Dispatched 620 kg composite sheets via Demo Freight (LR #LR-DEMO-001)', actor: 'Despatch In-charge' },
    { type: 'production', action: 'batch_posted', kind: 'production', summary: 'Resin batch CCCPL/300926/01 completed in VES-2 (1,850 kg yield)', actor: 'Plant Supervisor' },
    { type: 'crm', action: 'quotation_sent', kind: 'sales', summary: 'Demo Quotation Q-2627-018 sent to client partner', actor: 'Sales Manager' },
    { type: 'crm', action: 'enquiry_received', kind: 'sales', summary: 'New enquiry received for High Temperature F-Class Rods (1000 pcs)', actor: 'Inbound Web' },
    { type: 'quality', action: 'test_certificate_issued', kind: 'quality', summary: 'Test Certificate TC/2627/004 signed and attached to Invoice #004', actor: 'QC Head' },
  ]

  for (const act of sampleActivities) {
    await client.query(`
      INSERT INTO cc_activity_log (id, organization_id, tenant_id, record_type, record_id, action, kind, summary, source, actor_name, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, gen_random_uuid()::text, $4, $5, $6, 'web', $7, NOW() - (random() * interval '3 days'));
    `, [organizationId, tenantId, act.type, act.action, act.kind, act.summary, act.actor])
  }
  console.log('  ✓ Added demo activity feed entries.')

  // 6. STAGE SUMMARY TABLE
  console.log('\n[6/6] Final Stage Breakdown (Demo Safe):')
  const stagesSummary = await client.query(`
    SELECT stage_key, status, count(*)
    FROM cc_order_stages
    WHERE organization_id = $1
    GROUP BY stage_key, status
    ORDER BY stage_key, status;
  `, [organizationId])
  console.table(stagesSummary.rows)

  await client.end()
  console.log('\n✅ DEMO SEED COMPLETE (All fake/demo GST, PAN, bank values applied).\n')
}

run().catch((err) => {
  console.error('Seed error:', err)
  process.exit(1)
})
