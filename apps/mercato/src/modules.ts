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
  'dermat-01-sales.nav.group',
  'dermat-02-accounts.nav.group',
  'dermat-03-rnd.nav.group',
  'dermat-04-planning.nav.group',
  'dermat-05-purchase.nav.group',
  'dermat-06-store.nav.group',
  'dermat-07-production.nav.group',
  'dermat-08-qc.nav.group',
  'dermat-09-qa.nav.group',
  'dermat-10-dispatch.nav.group',
  'catalog.nav.group',
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
  { id: 'payment_gateways', from: '@open-mercato/core' },
  // wms: disabled for now per request — re-add the entry above to bring
  // Inventory/Warehouses/Zones/Locations/Lots/Movements/Reservations back.
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
  { id: 'dermat_rm_master', from: '@app' },
  { id: 'dermat_pm_master', from: '@app' },
  { id: 'dermat_bom', from: '@app' },
  {
    id: 'dermat_departments',
    from: '@app',
    overrides: {
      nav: { groupOrder: dermatSidebarGroupOrder },
    },
  },
  // dermat_production (old batch register, 0 rows) is replaced by dermat_workflow's
  // per-product Manufacturing / Filling / Packing stages.
  { id: 'dermat_qc', from: '@app' },
  {
    id: 'dermat_sales_flow',
    from: '@app',
    // The generic Open Mercato "Orders" list/detail pages (previously at
    // packages/core/src/modules/sales/backend/sales/orders) were deleted
    // outright — superseded by our own order-book pages at
    // /backend/sales/order-book, which carry the Dermat fields (GST, advance,
    // proforma, etc) the generic pages never had.
    overrides: {
      // Customer capture lives inside the Order flow, not as its own
      // sidebar section. Dermat customers are businesses, not individuals,
      // so "Companies" is the one kept — relabeled "Customer" and folded
      // into the same sidebar group as Orders. "People" is hidden from nav
      // (route/data untouched, just not listed) since it doesn't apply here.
      routes: {
        pages: {
          '/backend/customers/companies': {
            metadata: {
              pageTitle: 'Customer',
              pageTitleKey: 'dermat_sales_flow.nav.customer',
              pageGroup: 'Sales',
              pageGroupKey: 'dermat-01-sales.nav.group',
              pagePriority: 10,
              pageOrder: 20,
              breadcrumb: [{ label: 'Customer', labelKey: 'dermat_sales_flow.nav.customer' }],
            },
          },
          // Generic CRM/commerce pages not used by Dermat's order-driven
          // flow — hidden from nav, routes/data untouched. (People, Deals,
          // Customer tasks, Calendar, and Create sales document were
          // deleted outright — see the removed page directories under
          // packages/core/src/modules/customers/backend and
          // packages/core/src/modules/sales/backend; no override needed
          // for a route that no longer exists.)
          // Generic platform pages Dermat never uses — removed as routes
          // (null), not merely hidden from the sidebar.
          '/backend/sales/quotes': null,
          '/backend/config/system-status': null,
          '/backend/config/cache': null,
          '/backend/config/module-telemetry': null,
          '/backend/entities/system': null,
          '/backend/config/encryption': null,
          '/backend/query-indexes': null,
          '/backend/data-sync': null,
          '/backend/feature-toggles/global': null,
          '/backend/feature-toggles/overrides': null,
          '/backend/config/translations': null,
          '/backend/payment-gateways': null,
          '/backend/config/search': null,
          '/backend/webhooks': null,
          '/backend/config/sales': null,
          '/backend/config/customers/deals': null,
          '/backend/config/customers/pipeline-stages': null,
          // Open Mercato's category tree is unused — a Dermat product's
          // category is its fieldset (Raw Material, Packing Material, …),
          // shown as tabs on the Products page.
          '/backend/catalog/categories': null,
          '/backend/catalog/categories/create': null,
          // Reached from the Products page's "Add product" button, not the sidebar.
          '/backend/catalog/products/create': { metadata: { navHidden: true } },
          // Admin tools Dermat does need (custom fields, dropdown lists,
          // attachment settings) stay reachable from Settings, off the main nav.
          '/backend/entities/user': { metadata: { navHidden: true } },
          '/backend/config/settings': { metadata: { navHidden: true } },
          '/backend/config/dictionaries': { metadata: { navHidden: true } },
          '/backend/config/attachments': { metadata: { navHidden: true } },
        },
      },
    },
  },
  { id: 'dermat_sampling', from: '@app' },
  { id: 'dermat_vendors', from: '@app' },
  // No sidebar entry — a Purchase Order is created and viewed from the BOM page,
  // not as a standalone navigable section (matches Procuzy: BOM and PO are one screen).
  { id: 'dermat_purchase_orders', from: '@app' },
  { id: 'dermat_workflow', from: '@app' },
  { id: 'ratelimit_probe', from: '@app' },
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
