import { hasFeatures, type OrderContext } from './server'
import { STAGE_WORK_FEATURE, sharedFieldKeys } from './stages'
import type { StageOverrides } from './stageSettings'

export type OrderAccess = {
  full: boolean
  stages: Set<string>
  accounts: boolean
  dispatch: boolean
}

export async function resolveOrderAccess(ctx: OrderContext): Promise<OrderAccess> {
  if (await hasFeatures(ctx, ['cc_orders.full'])) {
    return { full: true, stages: new Set(Object.keys(STAGE_WORK_FEATURE)), accounts: true, dispatch: true }
  }
  const features = Array.from(new Set(Object.values(STAGE_WORK_FEATURE)))
  const granted = new Set<string>()
  for (const feature of features) if (await hasFeatures(ctx, [feature])) granted.add(feature)
  const stages = new Set(Object.entries(STAGE_WORK_FEATURE).filter(([, feature]) => granted.has(feature)).map(([key]) => key))
  return { full: false, stages, accounts: granted.has('cc_orders.work.accounts'), dispatch: granted.has('cc_orders.work.dispatch') }
}

export function canReadStage(access: OrderAccess, stageKey: string): boolean {
  return access.full || access.stages.has(stageKey)
}

export function visibleStageData(access: OrderAccess, stageKey: string, data: Record<string, unknown>, overrides?: StageOverrides): Record<string, unknown> {
  if (canReadStage(access, stageKey)) return data
  const shared = sharedFieldKeys(stageKey, overrides?.get(stageKey))
  return Object.fromEntries(Object.entries(data).filter(([key]) => shared.has(key) || key === '__started' || key === '__steps'))
}

type StageLike = { key: string; data: Record<string, unknown>; holdReason?: string | null }

export function trimStages<T extends StageLike>(access: OrderAccess, stages: T[], overrides?: StageOverrides): Array<T & { locked: boolean }> {
  return stages.map((stage) => {
    const readable = canReadStage(access, stage.key)
    return { ...stage, locked: !readable, data: visibleStageData(access, stage.key, stage.data, overrides) }
  })
}

type EventLike = { stageKey: string | null; note: string | null; changes: unknown[] }

export function trimEvents<T extends EventLike>(access: OrderAccess, events: T[]): T[] {
  if (access.full) return events
  return events.filter((event) => !event.stageKey || access.stages.has(event.stageKey)).map((event) => (event.stageKey ? event : { ...event, note: null, changes: [] }))
}
