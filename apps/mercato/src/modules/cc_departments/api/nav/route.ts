import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { BackendChromeNavGroup, BackendChromeNavItem, BackendChromePayload } from '@open-mercato/shared/modules/navigation/backendChrome'
import { GET as coreNav } from '@open-mercato/core/modules/auth/api/admin/nav'
import { CRM_PREFIXES, isCrmOnlyPath, isCrmPath } from '../../lib/workspace'

export const metadata = {
  GET: { requireAuth: true },
}

const querySchema = z.object({ workspace: z.enum(['erp', 'crm']).default('erp') })

function flatten(groups: BackendChromeNavGroup[]): BackendChromeNavItem[] {
  return groups.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])]))
}

function crmGroups(groups: BackendChromeNavGroup[]): BackendChromeNavGroup[] {
  const items = flatten(groups).filter((item) => isCrmPath(item.href) && !item.hidden)
  const rank = (href: string) => {
    const index = CRM_PREFIXES.findIndex((prefix) => href === prefix || href.startsWith(`${prefix}/`))
    return index < 0 ? CRM_PREFIXES.length : index
  }
  const seen = new Set<string>()
  const ordered = items
    .filter((item) => (seen.has(item.href) ? false : (seen.add(item.href), true)))
    .map((item) => ({ ...item, children: (item.children ?? []).filter((child) => isCrmPath(child.href)) }))
    .sort((left, right) => rank(left.href) - rank(right.href) || (left.order ?? 0) - (right.order ?? 0))
  return ordered.length ? [{ id: 'cc-crm.nav.group', name: 'CRM', defaultName: 'CRM', items: ordered }] : []
}

function erpGroups(groups: BackendChromeNavGroup[]): BackendChromeNavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !isCrmOnlyPath(item.href)).map((item) => ({ ...item, children: item.children?.filter((child) => !isCrmOnlyPath(child.href)) })) }))
    .filter((group) => group.items.length > 0)
}

async function GET(req: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const response = await coreNav(req)
  if (!response.ok) return response
  const payload = (await response.json()) as BackendChromePayload
  const groups = parsed.data.workspace === 'crm' ? crmGroups(payload.groups) : erpGroups(payload.groups)
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
