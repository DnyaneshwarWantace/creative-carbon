export type Workspace = 'erp' | 'crm'

export const CRM_HOME = '/backend/crm'
export const ERP_HOME = '/backend'

export const CRM_PREFIXES = ['/backend/crm', '/backend/orders', '/backend/customers', '/backend/masters/prices']

export function workspaceOf(pathname: string | null | undefined): Workspace {
  const path = pathname ?? ''
  return path === CRM_HOME || path.startsWith(`${CRM_HOME}/`) ? 'crm' : 'erp'
}

export function isCrmOnlyPath(href: string): boolean {
  return href === CRM_HOME || href.startsWith(`${CRM_HOME}/`)
}

export function isCrmPath(href: string): boolean {
  return CRM_PREFIXES.some((prefix) => href === prefix || href.startsWith(`${prefix}/`))
}
