import type { EntityManager } from '@mikro-orm/postgresql'
import { SettingsChange, type ActivityChange, type SettingsArea } from '../data/entities'
import { diffSnapshot, recordActivity } from './activity'

type Scope = { em: EntityManager; tenantId: string; organizationId: string; userId?: string | null }

export const SETTINGS_UNDO_DAYS = 7

export class SettingsError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export const COMPANY_FIELDS = ['name', 'legalName', 'gstin', 'pan', 'address', 'phone', 'email', 'website', 'bankName', 'bankBranch', 'bankAccount', 'bankIfsc', 'upiId', 'signatory', 'piTerms', 'invoiceTerms', 'piValidityDays', 'grnOverPercent', 'iec', 'lutArn', 'lutValidTill'] as const

const COMPANY_LABELS: Record<string, string> = {
  name: 'Company name',
  legalName: 'Legal name',
  gstin: 'GSTIN',
  pan: 'PAN',
  bankAccount: 'Bank account',
  bankIfsc: 'IFSC',
  upiId: 'UPI ID',
  piTerms: 'Proforma terms',
  invoiceTerms: 'Invoice terms',
  piValidityDays: 'Proforma valid (days)',
  grnOverPercent: 'GRN over-receipt %',
  iec: 'IEC',
  lutArn: 'LUT ARN',
  lutValidTill: 'LUT valid till',
}

const STAGE_FIELDS = ['label', 'dayLimit', 'reopenHours', 'hiddenSteps', 'requiredFields', 'extraFields', 'documents', 'sharedFields', 'extraDocuments', 'defaultUserName'] as const

type Snapshot = Record<string, unknown> | null

type AreaDef = {
  label: string
  path: string
  features: (key: string) => string[]
  read: (scope: Scope, key: string) => Promise<Snapshot>
  apply: (scope: Scope, key: string, value: Snapshot, byName: string | null) => Promise<void>
  blocker?: (scope: Scope, change: SettingsChange) => Promise<string | null>
  labels?: Record<string, string>
}

const CRM_LISTS = ['enquiry_sources', 'lost_reasons', 'incoterms', 'currencies', 'ports', 'payment_remarks', 'product_forms', 'hold_parties']

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T
}

async function company(scope: Scope) {
  const { loadCompany } = await import('../../cc_accounts/lib/documents')
  const profile = await loadCompany(scope)
  if (!profile) throw new SettingsError('Save the company details first', 409)
  return profile
}

export const SETTINGS_AREAS: Record<SettingsArea, AreaDef> = {
  list: {
    label: 'Dropdown list',
    path: '/backend/masters/dropdowns',
    features: (key) => (CRM_LISTS.includes(key) ? ['cc_lists.manage', 'cc_crm.team'] : ['cc_lists.manage']),
    read: async (scope, key) => {
      const { listViews } = await import('../../cc_lists/lib/service')
      const [view] = await listViews(scope, key)
      if (!view) return null
      return { customised: Boolean(view.customised), options: view.options.map((option) => ({ value: option.value, active: option.active })) }
    },
    apply: async (scope, key, value, byName) => {
      const { cleanOptions, resetList, saveList } = await import('../../cc_lists/lib/service')
      const { listDef } = await import('../../cc_lists/lib/lists')
      const def = listDef(key)
      if (!def) throw new SettingsError('Unknown list', 404)
      const before = value as { customised: boolean; options: Array<{ value: string; active: boolean }> } | null
      if (!before?.customised) await resetList(scope, def)
      else await saveList(scope, def, cleanOptions(def, before.options), byName)
    },
  },
  series: {
    label: 'Number series',
    path: '/backend/accounts/number-series',
    features: () => ['cc_accounts.series'],
    read: async (scope, key) => {
      const { mergeSeries } = await import('../../cc_accounts/lib/numberSeries')
      const merged = mergeSeries((await company(scope)).numberSeries ?? null) as Record<string, unknown>
      return plain(merged[key] as Record<string, unknown>) ?? null
    },
    apply: async (scope, key, value) => {
      const { mergeSeries } = await import('../../cc_accounts/lib/numberSeries')
      const profile = await company(scope)
      const merged = mergeSeries(profile.numberSeries ?? null) as Record<string, { prefix: string; suffix: string; pad: number; startAt: number }>
      merged[key] = value as { prefix: string; suffix: string; pad: number; startAt: number }
      profile.numberSeries = merged
      profile.updatedAt = new Date()
      await scope.em.flush()
    },
    blocker: async (scope, change) => {
      const { SERIES_DEFS, lastSeriesNumber } = await import('../../cc_accounts/lib/numberSeries')
      const def = SERIES_DEFS.find((entry) => entry.key === change.settingKey)
      if (!def || def.kind === 'template') return null
      const used = await lastSeriesNumber(scope, def, change.after as never, new Date())
      const atChange = Number(change.meta?.lastUsedAfter ?? 0)
      return used > atChange ? `Numbers were already issued in the new form (up to ${used}). Changing back now could repeat or skip numbers.` : null
    },
    labels: { prefix: 'Prefix', suffix: 'Suffix', pad: 'Digits', startAt: 'Start at' },
  },
  company: {
    label: 'Company details',
    path: '/backend/accounts/company',
    features: () => ['cc_accounts.record'],
    read: async (scope) => {
      const profile = await company(scope)
      const source = profile as unknown as Record<string, unknown>
      return plain(Object.fromEntries(COMPANY_FIELDS.map((field) => [field, source[field] ?? null])))
    },
    apply: async (scope, _key, value) => {
      const profile = await company(scope)
      const target = profile as unknown as Record<string, unknown>
      for (const field of COMPANY_FIELDS) if (value && field in value) target[field] = value[field] ?? null
      profile.updatedAt = new Date()
      await scope.em.flush()
    },
    labels: COMPANY_LABELS,
  },
  tally: {
    label: 'Tally settings',
    path: '/backend/accounts/tally',
    features: () => ['cc_accounts.tally'],
    read: async (scope) => {
      const { settingsView } = await import('../../cc_accounts/lib/tallyPush')
      const view = settingsView(await company(scope))
      return plain({ mode: view.mode, url: view.url, company: view.company, ledgers: view.ledgers })
    },
    apply: async (scope, _key, value) => {
      const profile = await company(scope)
      const before = value as { mode: 'direct' | 'bridge'; url: string | null; company: string | null; ledgers: Record<string, string> }
      profile.tallySettings = { ...(profile.tallySettings ?? {}), mode: before.mode, url: before.url, company: before.company, ledgers: before.ledgers } as typeof profile.tallySettings
      await scope.em.flush()
    },
    labels: { mode: 'Connection', url: 'Tally address', company: 'Tally company', ledgers: 'Ledger' },
  },
  stage: {
    label: 'Order stage settings',
    path: '/backend/orders/settings',
    features: () => ['cc_orders.settings'],
    read: async (scope, key) => {
      const { CcStageSetting } = await import('../../cc_orders/data/entities')
      const row = await scope.em.findOne(CcStageSetting, { tenantId: scope.tenantId, organizationId: scope.organizationId, stageKey: key })
      if (!row) return null
      const source = row as unknown as Record<string, unknown>
      return plain(Object.fromEntries(STAGE_FIELDS.map((field) => [field, source[field] ?? null])))
    },
    apply: async (scope, key, value, byName) => {
      const { CcStageSetting } = await import('../../cc_orders/data/entities')
      const row = await scope.em.findOne(CcStageSetting, { tenantId: scope.tenantId, organizationId: scope.organizationId, stageKey: key })
      if (!value) {
        if (row) scope.em.remove(row)
        await scope.em.flush()
        return
      }
      const target = (row ?? scope.em.create(CcStageSetting, { organizationId: scope.organizationId, tenantId: scope.tenantId, stageKey: key })) as unknown as Record<string, unknown>
      for (const field of STAGE_FIELDS) target[field] = value[field] ?? null
      target.updatedByName = byName
      target.updatedAt = new Date()
      scope.em.persist(target)
      await scope.em.flush()
    },
    labels: { label: 'Stage name', dayLimit: 'Day limit', reopenHours: 'Reopen within (hours)', hiddenSteps: 'Hidden steps', requiredFields: 'Required fields', extraFields: 'Extra field', documents: 'Document rules', sharedFields: 'Shared fields', extraDocuments: 'Extra document', defaultUserName: 'Default person' },
  },
}

async function actorName(scope: Scope): Promise<string | null> {
  if (!scope.userId) return null
  const { userNames } = await import('../../cc_orders/lib/server')
  return (await userNames(scope as Parameters<typeof userNames>[0], [scope.userId])).get(scope.userId) ?? null
}

export async function readSetting(scope: Scope, area: SettingsArea, key: string): Promise<Snapshot> {
  return SETTINGS_AREAS[area].read(scope, key)
}

export async function logSettingsChange(scope: Scope, input: { area: SettingsArea; key: string; label: string; before: Snapshot; after: Snapshot; meta?: Record<string, unknown> | null }): Promise<SettingsChange | null> {
  const def = SETTINGS_AREAS[input.area]
  const changes = diffSnapshot(input.before ?? {}, input.after ?? {}, def.labels ?? {})
  if (!changes.length) return null
  const name = await actorName(scope)
  const change = scope.em.create(SettingsChange, {
    organizationId: scope.organizationId,
    tenantId: scope.tenantId,
    area: input.area,
    settingKey: input.key,
    label: input.label,
    before: plain(input.before),
    after: plain(input.after),
    changes,
    meta: input.meta ?? null,
    actorUserId: scope.userId ?? null,
    actorName: name,
  })
  scope.em.persist(change)
  await scope.em.flush()
  recordActivity(scope.em, scope, { recordType: 'settings_change', recordId: change.id, action: 'changed', kind: 'change', summary: `${def.label}: ${input.label}`, changes, actorUserId: scope.userId ?? null, actorName: name })
  await scope.em.flush()
  return change
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]))
  return value ?? null
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonical(plain(left))) === JSON.stringify(canonical(plain(right)))
}

export async function undoAvailability(scope: Scope, change: SettingsChange): Promise<{ unavailable: string | null; blockedBy: string[] }> {
  if (change.status === 'undone') return { unavailable: 'This change is already undone', blockedBy: [] }
  if (Date.now() - change.createdAt.getTime() > SETTINGS_UNDO_DAYS * 86_400_000) return { unavailable: `Settings changes can be undone for ${SETTINGS_UNDO_DAYS} days`, blockedBy: [] }
  const def = SETTINGS_AREAS[change.area]
  const blockedBy: string[] = []
  const current = await def.read(scope, change.settingKey)
  const relevant = (value: Snapshot) => (change.area === 'company' && value ? Object.fromEntries(change.changes.map((entry) => [entry.field, value[entry.field] ?? null])) : value)
  if (!same(relevant(current), relevant(change.after))) blockedBy.push('Changed again since. Undo the later change first.')
  const extra = def.blocker ? await def.blocker(scope, change) : null
  if (extra) blockedBy.push(extra)
  return { unavailable: null, blockedBy }
}

export async function undoSettingsChange(scope: Scope, change: SettingsChange, reason: string): Promise<ActivityChange[]> {
  const check = await undoAvailability(scope, change)
  if (check.unavailable) throw new SettingsError(check.unavailable, 409)
  if (check.blockedBy.length) throw new SettingsError(check.blockedBy.join(' '), 409)
  const def = SETTINGS_AREAS[change.area]
  const name = await actorName(scope)
  let target = change.before
  if (change.area === 'company' && change.before) {
    const current = (await def.read(scope, change.settingKey)) ?? {}
    target = { ...current, ...Object.fromEntries(change.changes.map((entry) => [entry.field, (change.before as Record<string, unknown>)[entry.field] ?? null])) }
  }
  await def.apply(scope, change.settingKey, target, name)
  change.status = 'undone'
  change.undoneAt = new Date()
  change.undoneByName = name
  change.undoReason = reason
  await scope.em.flush()
  const reverted = change.changes.map((entry) => ({ ...entry, from: entry.to, to: entry.from }))
  recordActivity(scope.em, scope, { recordType: 'settings_change', recordId: change.id, action: 'undone', kind: 'correction', summary: `${def.label}: ${change.label} put back`, reason, changes: reverted, actorUserId: scope.userId ?? null, actorName: name })
  await scope.em.flush()
  return reverted
}

export function settingsChangeView(change: SettingsChange) {
  const def = SETTINGS_AREAS[change.area]
  return {
    id: change.id,
    area: change.area,
    areaLabel: def.label,
    areaPath: def.path,
    key: change.settingKey,
    label: change.label,
    changes: change.changes,
    by: change.actorName ?? null,
    at: change.createdAt.toISOString(),
    status: change.status,
    undoneAt: change.undoneAt ? change.undoneAt.toISOString() : null,
    undoneByName: change.undoneByName ?? null,
    undoReason: change.undoReason ?? null,
    updatedAt: change.updatedAt.toISOString(),
  }
}
