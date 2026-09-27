// Central place to enable modules and their source.
// - id: module id (plural snake_case; special cases: 'auth')
// - from: '@open-mercato/core' | '@app' | custom alias/path in future
// - overrides: optional unified per-app override surface — replace or
//   disable any contract a module presents: AI, routes, events, workers,
//   widgets, notifications, interceptors, setup, ACL, DI, encryption, etc.
//   See `.ai/specs/implemented/2026-05-04-modules-ts-unified-overrides.md` and
//   `apps/docs/docs/framework/modules/overrides.mdx`.
import { parseBooleanWithDefault } from '@open-mercato/shared/lib/boolean'
import type { ModuleOverrides } from '@open-mercato/shared/modules/overrides'
import { officialModuleEntries } from './official-modules.generated'

export type ModuleEntry = {
  id: string
  from?: '@open-mercato/core' | '@app' | string
  overrides?: ModuleOverrides
}

/**
 * Copyable examples for every wired `entry.overrides` domain.
 *
 * This object is intentionally not assigned to any enabled module. Use it as
 * a reference when a downstream app needs to disable or replace contracts
 * from a package-backed module without editing that module's source.
 */
export const moduleOverrideExamples: ModuleOverrides = {
  ai: {
    agents: { 'catalog.catalog_assistant': null },
    tools: { inbox_ops_accept_action: null },
    extensions: [], // additive AiAgentExtension[]; do not use null-map semantics
  },
  routes: {
    api: { 'DELETE /api/example/items': null },
    pages: { '/backend/example/reports': null },
  },
  events: {
    subscribers: { 'example.todo.audit': null },
  },
  workers: { 'example:sync': null },
  widgets: {
    injection: { 'example.sidebar': null },
    components: { 'page:/backend/example': null },
    dashboard: { 'example.kpi': null },
  },
  notifications: {
    types: { 'example.notice': null },
    handlers: { 'example.notice.toast': null },
  },
  interceptors: { 'example.items.interceptor': null },
  commandInterceptors: { 'example.command.interceptor': null },
  enrichers: { 'example.items.enricher': null },
  guards: { 'example.backend.guard': null },
  cli: { 'example seed': null },
  setup: {
    seedExamples: false,
  },
  acl: {
    features: { 'example.manage': null },
  },
  di: { exampleService: null },
  encryption: {
    maps: { 'example:item': null },
  },
  nav: {
    // Prepends sidebar nav group ids ahead of the built-in ordering; unnamed groups keep their
    // current position. Applied beneath role and per-user sidebar preferences.
    groupOrder: ['example.nav.group'],
  },
}

// Dermat's own workflow order for the main sidebar, ranked ahead of the
// framework's default alphabetical grouping: master setup, then master data,
// then who supplies it, then the recipe, then the customer order that drives
// it, then production/QC, then R&D. Ids not listed here keep their existing order.
// Sidebar is organised by department (client ask): each department group opens
// with its Work Queue, followed by that department's own pages.
const dermatSidebarGroupOrder = [
  'dermat-00-overview.nav.group',
  'dermat-01-sales.nav.group',
  'dermat-02-accounts.nav.group',
  'dermat-03-rnd.nav.group',
  'dermat-03b-artwork.nav.group',
  'dermat-04-planning.nav.group',
  'dermat-05-purchase.nav.group',
  'dermat-06-store.nav.group',
  'dermat-07-production.nav.group',
  'dermat-08-qc.nav.group',
  'dermat-09-qa.nav.group',
  'dermat-10-dispatch.nav.group',
  'dermat-11-masters.nav.group',
]

export const enabledModules: ModuleEntry[] = [
  { id: 'dashboards', from: '@open-mercato/core' },
  { id: 'auth', from: '@open-mercato/core' },
  { id: 'directory', from: '@open-mercato/core' },
  { id: 'customers', from: '@open-mercato/core' },
  { id: 'perspectives', from: '@open-mercato/core' },
  { id: 'entities', from: '@open-mercato/core' },
  { id: 'configs', from: '@open-mercato/core' },
  { id: 'query_index', from: '@open-mercato/core' },
  { id: 'audit_logs', from: '@open-mercato/core' },
  { id: 'attachments', from: '@open-mercato/core' },
  { id: 'catalog', from: '@open-mercato/core' },
  { id: 'sales', from: '@open-mercato/core' },
  // payment_gateways: disabled for Dermat (no online card payments).
  // Stock for every Dermat item kind: lots, balances, reservations, movement ledger.
  { id: 'wms', from: '@open-mercato/core' },
  // Required by wms (integration toggles); its admin pages are removed below.
  { id: 'feature_toggles', from: '@open-mercato/core' },
  { id: 'api_keys', from: '@open-mercato/core' },
  { id: 'dictionaries', from: '@open-mercato/core' },
  { id: 'search', from: '@open-mercato/search' },
  { id: 'currencies', from: '@open-mercato/core' },
  { id: 'events', from: '@open-mercato/events' },
  { id: 'notifications', from: '@open-mercato/core' },
  { id: 'progress', from: '@open-mercato/core' },
  { id: 'translations', from: '@open-mercato/core' },
  { id: 'widgets', from: '@open-mercato/core' },
  // Removed for Dermat (not just hidden): devices, content, api_docs, messages,
  // ai_assistant, scheduler, inbox_ops, integrations, workflows.
  // Dermat India custom modules — app-local (@app), not part of upstream core.
  // Rebuild in progress: only the modules that survive the 2026-09-25 cleanup
  // are listed here (departments, vendors, customer profile fields).
  {
    id: 'dermat_departments',
    from: '@app',
    overrides: {
      nav: { groupOrder: dermatSidebarGroupOrder },
    },
  },
  {
    id: 'dermat_customers',
    from: '@app',
    overrides: {
      routes: {
        pages: {
          '/backend/customers/companies': {
            metadata: {
              pageTitle: 'Customer',
              pageTitleKey: 'dermat_customers.nav.customer',
              pageGroup: 'Sales',
              pageGroupKey: 'dermat-01-sales.nav.group',
              pagePriority: 10,
              pageOrder: 20,
              breadcrumb: [{ label: 'Customer', labelKey: 'dermat_customers.nav.customer' }],
            },
          },
          '/backend/customers/companies/create': {
            load: () => import('./modules/dermat_customers/components/CustomerForm').then((mod) => mod.default),
            metadata: {
              pageTitle: 'Create Customer',
              pageTitleKey: 'dermat_customers.create.title',
              pageGroup: 'Sales',
              pageGroupKey: 'dermat-01-sales.nav.group',
              navHidden: true,
              breadcrumb: [
                { label: 'Customer', labelKey: 'dermat_customers.nav.customer', href: '/backend/customers/companies' },
                { label: 'Create', labelKey: 'dermat_customers.create.title' },
              ],
            },
          },
          '/backend/customers/companies/[id]': {
            load: () => import('./modules/dermat_customers/components/CustomerDetail').then((mod) => mod.default),
            metadata: {
              pageTitle: 'Customer',
              pageTitleKey: 'dermat_customers.nav.customer',
              pageGroup: 'Sales',
              pageGroupKey: 'dermat-01-sales.nav.group',
              navHidden: true,
              breadcrumb: [
                { label: 'Customer', labelKey: 'dermat_customers.nav.customer', href: '/backend/customers/companies' },
                { label: 'Details', labelKey: 'dermat_customers.nav.details' },
              ],
            },
          },
          '/backend/sales/quotes': null,
          '/backend/wms/location/[id]': null,
          '/backend/wms/lot/[id]': null,
          '/backend/wms/sku/[id]': null,
          '/backend/customers/companies-v2/[id]': null,
          '/backend/directory/tenants': null,
          '/backend/directory/tenants/[id]/edit': null,
          '/backend/directory/tenants/create': null,
          '/backend/entities/system/[entityId]': null,
          '/backend/entities/user/[entityId]': null,
          '/backend/entities/user/[entityId]/records/[recordId]': null,
          '/backend/entities/user/[entityId]/records/create': null,
          '/backend/sales/documents/[id]': null,
          '/backend/sales/quotes/[id]': null,
          '/backend/sales/orders': null,
          '/backend/config/system-status': null,
          '/backend/config/cache': null,
          '/backend/config/module-telemetry': null,
          '/backend/entities/system': null,
          '/backend/entities/user/create': null,
          '/backend/entities/user/[entityId]/records': null,
          '/backend/config/encryption': null,
          '/backend/query-indexes': null,
          '/backend/data-sync': null,
          '/backend/feature-toggles/global': null,
          '/backend/feature-toggles/overrides': null,
          '/backend/config/translations': null,
          '/backend/config/search': null,
          '/backend/webhooks': null,
          '/backend/config/sales': null,
          '/backend/config/customers/deals': null,
          '/backend/config/customers/pipeline-stages': null,
          '/backend/currencies': null,
          '/backend/currencies/create': null,
          '/backend/currencies/[id]': null,
          '/backend/exchange-rates': null,
          '/backend/exchange-rates/create': null,
          '/backend/exchange-rates/[id]': null,
          '/backend/config/currency-fetching': null,
          '/backend/wms/inventory': null,
          '/backend/wms/lots': null,
          '/backend/wms/movements': null,
          '/backend/wms/reservations': null,
          '/backend/wms/locations': null,
          '/backend/wms/warehouses': null,
          '/backend/wms/zones': null,
          '/backend/config/wms': null,
          '/backend/catalog/categories': null,
          '/backend/catalog/categories/[id]/edit': null,
          '/backend/catalog/categories/create': null,
          '/backend/catalog/products': null,
          '/backend/catalog/products/create': null,
          '/backend/catalog/products/[id]': {
            load: () => import('./modules/dermat_products/backend/products/[id]/page').then((mod) => mod.default),
            metadata: { navHidden: true },
          },
          '/backend/catalog/products/[productId]/variants/create': null,
          '/backend/catalog/products/[productId]/variants/[variantId]': null,
          '/backend/entities/user': null,
          '/backend/config/settings': { metadata: { navHidden: true } },
          '/backend/config/dictionaries': null,
          '/backend/config/attachments': { metadata: { navHidden: true } },
          '/backend/feature-toggles/global/create': null,
          '/backend/feature-toggles/global/[id]': null,
          '/backend/feature-toggles/global/[id]/edit': null,
          '/backend/config/catalog': null,
          '/backend/config/customers': null,
          '/backend/roles/create': { metadata: { navHidden: true } },
          '/backend/users/create': { metadata: { navHidden: true } },
        },
      },
    },
  },
  { id: 'dermat_products', from: '@app' },
  { id: 'dermat_boms', from: '@app' },
  { id: 'dermat_orders', from: '@app' },
  { id: 'dermat_quality', from: '@app' },
  { id: 'dermat_store', from: '@app' },
  { id: 'dermat_planning', from: '@app' },
  { id: 'dermat_purchase', from: '@app' },
  { id: 'dermat_dashboard', from: '@app' },
  { id: 'dermat_accounts', from: '@app' },
  { id: 'dermat_vendors', from: '@app' },
  { id: 'dermat_lists', from: '@app' },
  { id: 'dermat_rnd', from: '@app' },
]

// Official modules activated via official-modules.json / official-modules.local.json
// (managed by `yarn official-modules`; backed by the external/official-modules submodule).
for (const entry of officialModuleEntries) {
  if (!enabledModules.some((existing) => existing.id === entry.id)) enabledModules.push(entry)
}

if (parseBooleanWithDefault(process.env.OM_ENABLE_STORAGE_S3, false)) {
  enabledModules.push({ id: 'storage_s3', from: '@open-mercato/storage-s3' })
}

const enterpriseModulesEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES, false)
const enterpriseSsoEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SSO, false)
const enterpriseSecurityEnabled = parseBooleanWithDefault(process.env.OM_ENABLE_ENTERPRISE_MODULES_SECURITY, false)

if (enterpriseModulesEnabled) {
  enabledModules.push(
    { id: 'record_locks', from: '@open-mercato/enterprise' },
    { id: 'system_status_overlays', from: '@open-mercato/enterprise' },
  )
}

if (enterpriseModulesEnabled && enterpriseSsoEnabled) {
  enabledModules.push({ id: 'sso', from: '@open-mercato/enterprise' })
}

if (enterpriseModulesEnabled && enterpriseSecurityEnabled) {
  enabledModules.push({ id: 'security', from: '@open-mercato/enterprise' })
}
