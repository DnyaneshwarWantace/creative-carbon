export type Workspace = 'erp' | 'crm'
export type WorkspaceAccess = { crm: boolean; erp: boolean }
export type PathKind = Workspace | 'shared'

export const CRM_HOME = '/backend/crm'
export const ERP_HOME = '/backend'
export const CRM_FEATURE = 'cc_crm.view'
export const ERP_FEATURE = 'cc_departments.erp'

export const CRM_PREFIXES = ['/backend/crm', '/backend/customers', '/backend/orders/new', '/backend/work/sales', '/backend/masters/prices']
const SHARED_PATTERNS = [/^\/backend\/orders\/[0-9a-f-]{36}(\/.*)?$/i, /^\/backend\/profile(\/.*)?$/, /^\/backend\/notifications(\/.*)?$/]

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

export function isCrmPath(href: string): boolean {
  const path = href.split('?')[0]
  return CRM_PREFIXES.some((prefix) => under(path, prefix))
}

export function pathKind(pathname: string | null | undefined): PathKind {
  const path = (pathname ?? '').split('?')[0]
  if (SHARED_PATTERNS.some((pattern) => pattern.test(path))) return 'shared'
  return isCrmPath(path) ? 'crm' : 'erp'
}

export function workspaceOf(pathname: string | null | undefined, access?: WorkspaceAccess): Workspace {
  const kind = pathKind(pathname)
  if (kind === 'shared') return access && !access.erp ? 'crm' : 'erp'
  return kind
}

export function allowedOn(kind: PathKind, access: WorkspaceAccess): boolean {
  if (kind === 'shared') return access.crm || access.erp
  return kind === 'crm' ? access.crm : access.erp
}

export function homeFor(access: WorkspaceAccess): string | null {
  if (access.erp) return ERP_HOME
  if (access.crm) return CRM_HOME
  return null
}
