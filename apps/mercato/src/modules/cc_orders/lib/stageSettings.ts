import { AsyncLocalStorage } from 'node:async_hooks'
import { CcStageSetting } from '../data/entities'
import type { OrderContext } from './server'
import { STAGES, applyStageOverride, setStageOverrideResolver, type StageDef, type StageField, type StageOverride } from './stages'

export type StageOverrides = Map<string, StageOverride>

export function overrideOf(row: CcStageSetting): StageOverride {
  return {
    stageKey: row.stageKey,
    label: row.label ?? null,
    dayLimit: row.dayLimit ?? null,
    reopenHours: row.reopenHours ?? null,
    hiddenSteps: row.hiddenSteps ?? [],
    requiredFields: row.requiredFields ?? [],
    extraFields: (row.extraFields ?? []) as StageField[],
    documents: row.documents ?? {},
    extraDocuments: row.extraDocuments ?? [],
    sharedFields: row.sharedFields ?? null,
    defaultUserId: row.defaultUserId ?? null,
    defaultUserName: row.defaultUserName ?? null,
  }
}

export async function loadStageOverrides(ctx: Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>): Promise<StageOverrides> {
  const rows = await ctx.em.find(CcStageSetting, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  return new Map(rows.map((row) => [row.stageKey, overrideOf(row)]))
}

export function effectiveStageDef(key: string, overrides: StageOverrides): StageDef | undefined {
  const base = STAGES.find((stage) => stage.key === key)
  return base ? applyStageOverride(base, overrides.get(key)) : undefined
}

const requestOverrides = new AsyncLocalStorage<StageOverrides>()
setStageOverrideResolver(() => requestOverrides.getStore() ?? null)

export async function withStageOverrides<T>(ctx: Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>, run: () => Promise<T>): Promise<T> {
  const overrides = await loadStageOverrides(ctx)
  return requestOverrides.run(overrides, run)
}
