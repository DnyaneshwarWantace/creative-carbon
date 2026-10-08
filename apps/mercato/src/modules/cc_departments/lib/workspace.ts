export type Workspace = 'erp' | 'crm'

export const CRM_HOME = '/backend/crm'
export const ERP_HOME = '/backend'

export const CRM_PREFIXES = ['/backend/crm', '/backend/customers', '/backend/orders/new', '/backend/work/sales', '/backend/masters/prices']

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

export function isCrmPath(href: string): boolean {
  const path = href.split('?')[0]
  return CRM_PREFIXES.some((prefix) => under(path, prefix))
}

export function workspaceOf(pathname: string | null | undefined): Workspace {
  return isCrmPath(pathname ?? '') ? 'crm' : 'erp'
}
