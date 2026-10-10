import { CompanyProfile, type GoLiveSettings } from '../../cc_accounts/data/entities'
import { settingsView } from '../../cc_accounts/lib/tallyPush'
import { LOCATION_CODES, PLACE_LABEL, type StockPlace } from '../../cc_products/lib/stock'
import { openingSummary } from '../../cc_store/lib/opening'
import { parallelSummary } from '../../cc_store/lib/parallel'
import type { StoreContext } from '../../cc_store/lib/server'

export type CheckState = 'done' | 'warn' | 'todo'
export type GoLiveCheck = { key: string; group: string; title: string; state: CheckState; detail: string; href: string | null; manual?: boolean; confirmedBy?: string | null; confirmedAt?: string | null }

export const MANUAL_CHECKS: Array<{ key: string; group: string; title: string; detail: string }> = [
  { key: 'series', group: 'Before cutover', title: 'Number series continue from the paper books', detail: 'Each document starts at the next number after the last paper one (Accounts → Number series).' },
  { key: 'training', group: 'Before cutover', title: 'Each department trained on site', detail: 'Resin, coating, press, moulding, finishing, QC, store, despatch, accounts, sales.' },
  { key: 'data_entry', group: 'Before cutover', title: 'Data-entry person in place', detail: 'Uploads the registers from the Excel templates until the plant enters on screen.' },
  { key: 'hosting', group: 'Before cutover', title: 'Hosting decided and backups checked', detail: 'Cloud or plant server (signal readings on the day); a nightly backup restored once as a test.' },
  { key: 'paper_closed', group: 'Cutover day', title: 'Paper books closed for the cutover day', detail: 'Every register signed off on the cutover date; opening stock counted from them.' },
]

const DEFAULT_TARGET_DAYS = 14

function count(rows: Array<{ count: string | number }>): number {
  return Number(rows[0]?.count ?? 0)
}

async function scalar(ctx: StoreContext, sql: string, params: unknown[]): Promise<number> {
  return count(await ctx.em.getConnection().execute<Array<{ count: string }>>(sql, params))
}

export function goLiveSettings(profile: CompanyProfile | null): Required<Pick<GoLiveSettings, 'targetDays'>> & GoLiveSettings {
  return { cutoverDate: profile?.goLive?.cutoverDate ?? null, targetDays: profile?.goLive?.targetDays ?? DEFAULT_TARGET_DAYS, confirmed: profile?.goLive?.confirmed ?? {} }
}

export async function goLiveReport(ctx: StoreContext) {
  const scope = [ctx.tenantId, ctx.organizationId]
  const profile = await ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  const settings = goLiveSettings(profile)
  const checks: GoLiveCheck[] = []
  const add = (check: GoLiveCheck) => checks.push(check)

  const missingCompany = [
    ['name', profile?.name],
    ['GSTIN', profile?.gstin],
    ['address', profile?.address],
    ['bank account', profile?.bankAccount],
    ['IFSC', profile?.bankIfsc],
    ['signatory', profile?.signatory],
  ].filter(([, value]) => !value).map(([label]) => label as string)
  add({ key: 'company', group: 'Masters', title: 'Company details', state: missingCompany.length ? 'todo' : 'done', detail: missingCompany.length ? `Missing: ${missingCompany.join(', ')}` : 'Name, GSTIN, address, bank and signatory are on every document', href: '/backend/accounts/company' })

  const kinds = await ctx.em.getConnection().execute<Array<{ kind: string | null; count: string }>>(
    `select custom_fieldset_code as kind, count(*) as count from catalog_products where tenant_id = ? and organization_id = ? and deleted_at is null group by 1`,
    scope,
  )
  const byKind = new Map(kinds.map((row) => [row.kind ?? '', Number(row.count)]))
  const needKinds: Array<[string, string]> = [['chemical', 'chemicals'], ['reinforcement', 'cloth / paper'], ['resin', 'resin grades'], ['bstage', 'B-stage items'], ['laminate', 'sheets, tubes, rods']]
  const emptyKinds = needKinds.filter(([kind]) => !byKind.get(kind)).map(([, label]) => label)
  add({ key: 'items', group: 'Masters', title: 'Item master', state: emptyKinds.length ? 'todo' : 'done', detail: emptyKinds.length ? `No ${emptyKinds.join(', ')} yet` : `${[...byKind.values()].reduce((sum, value) => sum + value, 0)} items across ${byKind.size} types`, href: '/backend/products' })

  const customers = await scalar(ctx, `select count(*) as count from customer_entities where tenant_id = ? and organization_id = ? and kind = 'company' and deleted_at is null`, scope)
  const vendors = await scalar(ctx, `select count(*) as count from cc_vendors where tenant_id = ? and organization_id = ? and deleted_at is null and name not like 'E2E%'`, scope)
  add({ key: 'parties', group: 'Masters', title: 'Customers and vendors', state: customers && vendors ? 'done' : 'todo', detail: `${customers} customers · ${vendors} vendors (import them from Excel on the Customers / Vendors pages)`, href: '/backend/customers/companies' })

  const plant = await ctx.em.getConnection().execute<Array<{ reactors: string; dryers: string; presses: string; moulds: string; tolerances: string; prices: string }>>(
    `select (select count(*) from cc_reactors where tenant_id = ? and organization_id = ? and deleted_at is null) as reactors,
            (select count(*) from cc_dryers where tenant_id = ? and organization_id = ? and deleted_at is null) as dryers,
            (select count(*) from cc_presses where tenant_id = ? and organization_id = ? and deleted_at is null) as presses,
            (select count(*) from cc_moulds where tenant_id = ? and organization_id = ? and deleted_at is null) as moulds,
            (select count(*) from cc_loading_tolerances where tenant_id = ? and organization_id = ? and deleted_at is null) as tolerances,
            (select count(*) from cc_price_rates where tenant_id = ? and organization_id = ? and deleted_at is null) as prices`,
    [...scope, ...scope, ...scope, ...scope, ...scope, ...scope],
  )
  const p = plant[0]
  const plantMissing = [['reactors', p?.reactors], ['dryers', p?.dryers], ['presses', p?.presses], ['moulds & dies', p?.moulds], ['loading tolerance', p?.tolerances], ['price list', p?.prices]].filter(([, value]) => !Number(value)).map(([label]) => label as string)
  add({ key: 'plant', group: 'Masters', title: 'Plant masters', state: plantMissing.length ? 'todo' : 'done', detail: plantMissing.length ? `Missing: ${plantMissing.join(', ')}` : `${p.reactors} reactors · ${p.dryers} dryers · ${p.presses} presses · ${p.moulds} moulds & dies · price list and tolerance set`, href: '/backend/masters/plant' })

  const departments = await ctx.em.getConnection().execute<Array<{ name: string; people: string }>>(
    `select d.name, (select count(distinct ur.user_id) from user_roles ur join users u on u.id = ur.user_id and u.deleted_at is null where ur.role_id = d.role_id and ur.deleted_at is null) as people
       from cc_departments d where d.tenant_id = ? and d.organization_id = ? and d.deleted_at is null order by d.name`,
    scope,
  ).catch(() => [] as Array<{ name: string; people: string }>)
  const empty = departments.filter((row) => !Number(row.people)).map((row) => row.name)
  add({ key: 'people', group: 'Masters', title: 'Everyone has a login in their department', state: !departments.length ? 'todo' : empty.length ? 'warn' : 'done', detail: !departments.length ? 'No departments yet' : empty.length ? `No one in: ${empty.join(', ')}` : `${departments.length} departments, each with at least one person`, href: '/backend/masters/access' })

  const opening = await openingSummary(ctx)
  const codeToPlace = new Map(Object.entries(LOCATION_CODES).map(([place, code]) => [code, place as StockPlace]))
  const loaded = opening.map((row) => ({ ...row, place: codeToPlace.get(row.code) ?? null }))
  const storesWithStock: StockPlace[] = ['wh_a', 'fg', 'floor', 'tank']
  const notLoaded = storesWithStock.filter((place) => !loaded.some((row) => row.place === place)).map((place) => PLACE_LABEL[place])
  add({
    key: 'opening',
    group: 'Cutover day',
    title: 'Opening stock loaded',
    state: !loaded.length ? 'todo' : notLoaded.length ? 'warn' : 'done',
    detail: loaded.length ? `${loaded.map((row) => `${row.place ? PLACE_LABEL[row.place] : row.code}: ${row.lots} lots`).join(' · ')}${notLoaded.length ? ` · nothing yet in ${notLoaded.join(', ')}` : ''}${loaded[0]?.cutoverDate ? ` · as on ${loaded[0].cutoverDate}` : ''}` : 'Upload centre → Opening stock: one row per lot per store',
    href: '/backend/upload',
  })

  const tally = settingsView(profile)
  const tallyReady = tally.mode === 'bridge' ? Boolean(tally.bridgeTokenHash) : Boolean(tally.url)
  const lastTest = (profile?.tallySettings as { lastTestOk?: boolean; lastTestAt?: string } | null) ?? null
  add({ key: 'tally', group: 'Before cutover', title: 'Tally connected and tested', state: !tallyReady ? 'todo' : lastTest?.lastTestOk ? 'done' : 'warn', detail: !tallyReady ? 'Set up the connection (direct or bridge) on the Tally page' : lastTest?.lastTestOk ? `Last test passed ${lastTest.lastTestAt?.slice(0, 10) ?? ''}` : 'Set up; press Test connection and send one invoice with the accountant', href: '/backend/accounts/tally' })

  const testData = await scalar(
    ctx,
    `select (select count(*) from cc_vendors where tenant_id = ? and organization_id = ? and deleted_at is null and name like 'E2E%')
          + (select count(*) from cc_tax_invoices where tenant_id = ? and organization_id = ? and deleted_at is null and customer_name like 'E2E%') as count`,
    [...scope, ...scope],
  )
  add({ key: 'test_data', group: 'Cutover day', title: 'No test data left', state: testData ? 'warn' : 'done', detail: testData ? `${testData} test records (names starting E2E) are still here. Go live on a fresh database, or clear them before cutover.` : 'Nothing named E2E found', href: null })

  const parallel = await parallelSummary(ctx, settings.targetDays)
  add({ key: 'parallel', group: 'Parallel run', title: `Paper and system agree ${settings.targetDays} days in a row`, state: parallel.ready ? 'done' : parallel.days.length ? 'warn' : 'todo', detail: parallel.days.length ? `${parallel.streak} of ${settings.targetDays} days so far · last check ${parallel.lastDate}` : 'Start the daily paper vs system check after cutover', href: '/backend/store/parallel' })

  for (const manual of MANUAL_CHECKS) {
    const confirmed = settings.confirmed?.[manual.key] ?? null
    add({ key: manual.key, group: manual.group, title: manual.title, state: confirmed ? 'done' : 'todo', detail: manual.detail, href: null, manual: true, confirmedBy: confirmed?.by ?? null, confirmedAt: confirmed?.at ?? null })
  }

  const order = ['Masters', 'Before cutover', 'Cutover day', 'Parallel run']
  checks.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
  const done = checks.filter((check) => check.state === 'done').length
  return { cutoverDate: settings.cutoverDate ?? loaded[0]?.cutoverDate ?? null, targetDays: settings.targetDays, done, total: checks.length, percent: Math.round((done / checks.length) * 100), checks, parallel }
}
