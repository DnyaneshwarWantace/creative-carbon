import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'

// Departments (an app-local module, `cc_departments`) own a backing Role 1:1 —
// see `Department.roleId`. This module (`auth`, a core package) MUST NOT import
// app-local module code directly (architecture rule: no direct cross-module/app
// imports; core packages stay app-agnostic). Instead, resolve the department-backed
// role id set over HTTP through the department module's own CRUD API route, then
// cross-reference against `/api/auth/roles` for display names — mirrors
// `fetchRoleOptions` in `roleOptions.ts`.

type DepartmentListResponse = {
  items?: Array<{ id?: string | null; name?: string | null; role_id?: string | null }>
}

type RoleListResponse = {
  items?: Array<{ id?: string | null; name?: string | null }>
}

type FetchDepartmentOptionsParams = {
  tenantId?: string | null
}

export async function fetchDepartmentBackedRoleIds(): Promise<Set<string>> {
  try {
    const call = await apiCall<DepartmentListResponse>(
      '/api/cc_departments/departments?pageSize=100',
      undefined,
      { fallback: { items: [] } },
    )
    if (!call.ok || !Array.isArray(call.result?.items)) return new Set()
    const ids = call.result.items
      .map((item) => (typeof item?.role_id === 'string' ? item.role_id.trim() : ''))
      .filter((id) => id.length > 0)
    return new Set(ids)
  } catch {
    return new Set()
  }
}

export async function fetchDepartmentOptions(query?: string, params?: FetchDepartmentOptionsParams): Promise<CrudFieldOption[]> {
  const departmentRoleIds = await fetchDepartmentBackedRoleIds()
  if (departmentRoleIds.size === 0) return []

  const searchParams = new URLSearchParams({ page: '1', pageSize: '100' })
  if (query && query.trim()) searchParams.set('search', query.trim())
  const tenantId = typeof params?.tenantId === 'string' && params.tenantId.trim().length ? params.tenantId.trim() : null
  if (tenantId) searchParams.set('tenantId', tenantId)

  try {
    const call = await apiCall<RoleListResponse>(
      `/api/auth/roles?${searchParams.toString()}`,
      undefined,
      { fallback: { items: [] } },
    )
    if (!call.ok || !Array.isArray(call.result?.items)) return []
    return call.result.items
      .map((item) => {
        const id = typeof item?.id === 'string' ? item.id.trim() : ''
        const name = typeof item?.name === 'string' ? item.name.trim() : ''
        if (!id || !name) return null
        if (!departmentRoleIds.has(id)) return null
        return { value: id, label: name }
      })
      .filter((opt): opt is CrudFieldOption => !!opt)
  } catch {
    return []
  }
}
