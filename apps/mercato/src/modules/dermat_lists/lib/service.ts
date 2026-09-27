import type { EntityManager } from '@mikro-orm/postgresql'
import { ListOption } from '../data/entities'
import { LIST_DEFS, listDef, type ListDef } from './lists'
import { paymentTermKey } from './paymentTerms'

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

export class ListError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export type ListOptionView = { value: string; active: boolean; locked: boolean }

export type ListView = {
  key: string
  label: string
  department: string
  usedIn: string
  fixed: string | null
  customised: boolean
  options: ListOptionView[]
  updatedAt: string | null
  updatedByName: string | null
}

const MAX_OPTIONS = 100
const MAX_LENGTH = 80

function defaultOptions(def: ListDef): ListOptionView[] {
  return def.defaults.map((value) => ({ value, active: true, locked: Boolean(def.locked?.includes(value)) }))
}

function view(def: ListDef, rows: ListOption[]): ListView {
  if (!rows.length || def.fixed) {
    return { key: def.key, label: def.label, department: def.department, usedIn: def.usedIn, fixed: def.fixed ?? null, customised: false, options: defaultOptions(def), updatedAt: null, updatedByName: null }
  }
  const sorted = [...rows].sort((a, b) => a.position - b.position)
  const options = sorted.map((row) => ({ value: row.value, active: row.isActive, locked: Boolean(def.locked?.includes(row.value)) }))
  for (const value of def.locked ?? []) {
    if (!options.some((option) => option.value === value)) options.push({ value, active: true, locked: true })
  }
  const latest = sorted.reduce((best, row) => (row.updatedAt > best.updatedAt ? row : best), sorted[0])
  return {
    key: def.key,
    label: def.label,
    department: def.department,
    usedIn: def.usedIn,
    fixed: null,
    customised: true,
    options,
    updatedAt: latest.updatedAt.toISOString(),
    updatedByName: latest.updatedByName ?? null,
  }
}

async function rowsFor(scope: Scope, keys: string[]): Promise<ListOption[]> {
  if (!keys.length) return []
  return scope.em.find(ListOption, { tenantId: scope.tenantId, organizationId: scope.organizationId, listKey: { $in: keys }, deletedAt: null })
}

export async function listViews(scope: Scope, key?: string): Promise<ListView[]> {
  const defs = key ? LIST_DEFS.filter((def) => def.key === key) : LIST_DEFS
  if (key && !defs.length) throw new ListError('Unknown list', 404)
  const rows = await rowsFor(scope, defs.map((def) => def.key))
  return defs.map((def) => view(def, rows.filter((row) => row.listKey === def.key)))
}

export async function activeOptions(scope: Scope, key: string): Promise<string[]> {
  const [list] = await listViews(scope, key)
  return list.options.filter((option) => option.active).map((option) => option.value)
}

export function listVersion(list: ListView): Date | null {
  return list.updatedAt ? new Date(list.updatedAt) : null
}

export function cleanOptions(def: ListDef, input: Array<{ value: string; active: boolean }>): Array<{ value: string; active: boolean }> {
  if (def.fixed) throw new ListError(`${def.label} is fixed: ${def.fixed}`, 409)
  const seen = new Set<string>()
  const cleaned: Array<{ value: string; active: boolean }> = []
  for (const entry of input) {
    const value = entry.value.replace(/\s+/g, ' ').trim()
    if (!value) continue
    if (value.length > MAX_LENGTH) throw new ListError(`"${value.slice(0, 20)}…" is longer than ${MAX_LENGTH} characters`)
    const folded = value.toLowerCase()
    if (seen.has(folded)) throw new ListError(`"${value}" is in the list twice`)
    seen.add(folded)
    cleaned.push({ value, active: entry.active })
  }
  if (cleaned.length > MAX_OPTIONS) throw new ListError(`A list can hold up to ${MAX_OPTIONS} choices`)
  for (const value of def.locked ?? []) {
    const match = cleaned.find((entry) => entry.value === value)
    if (!match) throw new ListError(`"${value}" cannot be removed: the system uses it`, 409)
    if (!match.active) throw new ListError(`"${value}" cannot be hidden: the system uses it`, 409)
  }
  if (!cleaned.some((entry) => entry.active)) throw new ListError('Keep at least one choice switched on')
  return cleaned
}

export async function saveList(scope: Scope, def: ListDef, options: Array<{ value: string; active: boolean }>, userName: string | null): Promise<void> {
  const existing = await rowsFor(scope, [def.key])
  const now = new Date()
  for (const row of existing) row.deletedAt = now
  options.forEach((option, index) => {
    scope.em.persist(
      scope.em.create(ListOption, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        listKey: def.key,
        value: option.value,
        position: index,
        isActive: option.active,
        updatedByName: userName,
        createdAt: now,
        updatedAt: now,
      }),
    )
  })
  await scope.em.flush()
  if (def.customField) {
    await scope.em.getConnection().execute(
      `update custom_field_defs
          set config_json = jsonb_set(coalesce(config_json, '{}'::jsonb), '{options}', ?::jsonb), updated_at = now()
        where entity_id = ? and key = ? and deleted_at is null and (tenant_id = ? or tenant_id is null)`,
      [JSON.stringify(customFieldValues(def, options.filter((option) => option.active).map((option) => option.value))), def.customField.entityId, def.customField.key, scope.tenantId],
    )
  }
}

export async function resetList(scope: Scope, def: ListDef): Promise<void> {
  if (def.fixed) throw new ListError(`${def.label} is fixed`, 409)
  const existing = await rowsFor(scope, [def.key])
  const now = new Date()
  for (const row of existing) row.deletedAt = now
  await scope.em.flush()
  if (def.customField) {
    await scope.em.getConnection().execute(
      `update custom_field_defs
          set config_json = jsonb_set(coalesce(config_json, '{}'::jsonb), '{options}', ?::jsonb), updated_at = now()
        where entity_id = ? and key = ? and deleted_at is null and (tenant_id = ? or tenant_id is null)`,
      [JSON.stringify(customFieldValues(def, def.defaults)), def.customField.entityId, def.customField.key, scope.tenantId],
    )
  }
}

function customFieldValues(def: ListDef, values: string[]): string[] {
  return def.customField?.valueOf === 'paymentTermKey' ? values.map(paymentTermKey) : values
}

export { listDef }
