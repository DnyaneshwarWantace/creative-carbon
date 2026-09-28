/**
 * Seed all live Dermat India transactions (38 Active Orders, 456 Stage Workflows,
 * 2398 Audit Events, 65 Payments, 93 POs, 81 GRNs, 204 Quality Checks, BOMs, RM/PM Masters).
 *
 * Usage:
 *   node scripts/seed-dermat-transactions.js
 *   node scripts/seed-dermat-transactions.js --tenant <tenantId> --org <organizationId>
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../apps/mercato/.env') });

function parseArgs() {
  const args = process.argv.slice(2);
  let tenantId = null;
  let organizationId = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--tenant' || args[i] === '--tenantId') && args[i + 1]) tenantId = args[i + 1];
    if ((args[i] === '--org' || args[i] === '--organizationId') && args[i + 1]) organizationId = args[i + 1];
  }
  return { tenantId, organizationId };
}

async function run() {
  const dataPath = path.join(__dirname, '../apps/mercato/src/modules/dermat_orders/lib/dermat_live_seed_data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Master seed data file not found at:', dataPath);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { tenantId: targetTenant, organizationId: targetOrg } = parseArgs();

  // If no args provided, detect default tenant and organization
  let tenantId = targetTenant;
  let organizationId = targetOrg;
  if (!tenantId || !organizationId) {
    const orgRes = await client.query("SELECT id, tenant_id FROM organizations WHERE name ILIKE '%Dermat%' LIMIT 1");
    if (orgRes.rows.length > 0) {
      organizationId = orgRes.rows[0].id;
      tenantId = orgRes.rows[0].tenant_id;
      console.log(`Auto-detected Dermat organization (${organizationId}) and tenant (${tenantId})`);
    } else {
      const fallbackOrg = await client.query('SELECT id, tenant_id FROM organizations LIMIT 1');
      if (fallbackOrg.rows.length > 0) {
        organizationId = fallbackOrg.rows[0].id;
        tenantId = fallbackOrg.rows[0].tenant_id;
        console.log(`Using default organization (${organizationId}) and tenant (${tenantId})`);
      }
    }
  }

  const tableOrder = [
    'dermat_departments',
    'dermat_vendors',
    'dermat_rm_master',
    'dermat_pm_master',
    'dermat_boms',
    'dermat_bom_headers',
    'dermat_bom_items',
    'dermat_quality_rules',
    'dermat_orders',
    'dermat_order_lines',
    'dermat_order_stages',
    'dermat_order_events',
    'dermat_order_payments',
    'dermat_pos',
    'dermat_po_lines',
    'dermat_grns',
    'dermat_grn_lines',
    'dermat_quality_checks',
    'dermat_store_requests',
    'dermat_store_request_lines',
    'dermat_stock_reservations'
  ];

  await client.query('BEGIN');
  try {
    for (const table of tableOrder) {
      const rows = dump[table] || [];
      if (rows.length === 0) continue;

      let inserted = 0;
      for (const row of rows) {
        const item = { ...row };
        if (item.tenant_id && tenantId) item.tenant_id = tenantId;
        if (item.organization_id && organizationId) item.organization_id = organizationId;

        const keys = Object.keys(item);
        const values = Object.values(item).map(v => (v !== null && typeof v === 'object' && !(v instanceof Date)) ? JSON.stringify(v) : v);
        const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(', ');
        const quotedCols = keys.map(k => `"${k}"`).join(', ');

        const sql = `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING;`;
        const res = await client.query(sql, values);
        if (res.rowCount > 0) inserted++;
      }
      console.log(`✓ Table [${table}]: ${inserted}/${rows.length} records processed/inserted.`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 ALL LIVE DERMAT TRANSACTIONS & ORDER HISTORY SEEDED SUCCESSFULLY!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to seed transactions:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
