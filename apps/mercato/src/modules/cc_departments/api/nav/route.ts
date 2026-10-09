import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { BackendChromeNavGroup, BackendChromeNavItem, BackendChromePayload } from '@open-mercato/shared/modules/navigation/backendChrome'
import { GET as coreNav } from '@open-mercato/core/modules/auth/api/admin/nav'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { isCrmPath } from '../../lib/workspace'
import { resolveWorkspaceAccess } from '../../lib/workspaceAccess'

export const metadata = {
  GET: { requireAuth: true },
}

const querySchema = z.object({ workspace: z.enum(['erp', 'crm']).default('erp') })

function flatten(groups: BackendChromeNavGroup[]): BackendChromeNavItem[] {
  return groups.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])]))
}

const CRM_SECTIONS: Array<{ id: string; name: string; match: (href: string) => boolean }> = [
  { id: 'cc-crm.nav.overview', name: 'Overview', match: (href) => href === '/backend/crm' },
  { id: 'cc-crm.nav.pipeline', name: 'Sales pipeline', match: (href) => href.startsWith('/backend/crm/enquiries') || href.startsWith('/backend/crm/quotations') },
  { id: 'cc-crm.nav.customers', name: 'Customers & orders', match: (href) => href.startsWith('/backend/customers') || href.startsWith('/backend/orders/new') || href.startsWith('/backend/work/sales') },
  { id: 'cc-crm.nav.settings', name: 'CRM settings', match: () => true },
]

const CRM_ORDER = ['/backend/crm', '/backend/crm/enquiries', '/backend/crm/quotations', '/backend/customers/companies', '/backend/orders/new', '/backend/work/sales', '/backend/crm/lists', '/backend/masters/prices', '/backend/crm/team']

function crmRank(href: string): number {
  const index = CRM_ORDER.indexOf(href)
  return index < 0 ? CRM_ORDER.length : index
}

const CRM_TITLES: Record<string, string> = {
  '/backend/crm': 'CRM home',
  '/backend/customers/companies': 'Customers',
  '/backend/orders/new': 'Book an order',
  '/backend/work/sales': 'Orders to confirm',
}

function crmGroups(groups: BackendChromeNavGroup[]): BackendChromeNavGroup[] {
  const seen = new Set<string>()
  const items = flatten(groups)
    .filter((item) => isCrmPath(item.href) && !item.hidden)
    .filter((item) => (seen.has(item.href) ? false : (seen.add(item.href), true)))
    .map((item) => ({ ...item, title: CRM_TITLES[item.href] ?? item.title, children: (item.children ?? []).filter((child) => isCrmPath(child.href)) }))
    .sort((left, right) => crmRank(left.href) - crmRank(right.href) || (left.order ?? 0) - (right.order ?? 0))
  const placed = new Set<string>()
  return CRM_SECTIONS.map((section) => {
    const own = items.filter((item) => !placed.has(item.href) && section.match(item.href))
    own.forEach((item) => placed.add(item.href))
    return { id: section.id, name: section.name, defaultName: section.name, items: own }
  }).filter((group) => group.items.length > 0)
}

function erpGroups(groups: BackendChromeNavGroup[]): BackendChromeNavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !isCrmPath(item.href)).map((item) => ({ ...item, children: item.children?.filter((child) => !isCrmPath(child.href)) })) }))
    .filter((group) => group.items.length > 0)
    .map((group) => (group.id === 'cc-01-sales.nav.group' && group.items.every((item) => item.href.startsWith('/backend/orders')) ? { ...group, name: 'Orders', defaultName: 'Orders' } : group))
}

async function GET(req: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const response = await coreNav(req)
  if (!response.ok) return response
  const payload = (await response.json()) as BackendChromePayload
  const access = await resolveWorkspaceAccess(await getAuthFromRequest(req))
  const workspace = parsed.data.workspace === 'erp' && !access.erp ? 'crm' : parsed.data.workspace === 'crm' && !access.crm ? 'erp' : parsed.data.workspace
  const groups = !access.crm && !access.erp ? [] : workspace === 'crm' ? crmGroups(payload.groups) : erpGroups(payload.groups)
  return NextResponse.json({ ...payload, groups })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Departments',
  summary: 'Sidebar for the ERP or the CRM side of the app',
  methods: {
    GET: { summary: 'Admin sidebar narrowed to one side (?workspace=erp|crm)', tags: ['Creative Carbon Departments'], query: querySchema, responses: [{ status: 200, description: 'Backend chrome payload', schema: z.object({ groups: z.array(z.object({}).passthrough()) }).passthrough() }] },
  },
}

export { GET }
