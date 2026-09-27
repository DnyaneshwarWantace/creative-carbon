import { DermatStageSetting } from '../data/entities'
import type { OrderContext } from './server'
import { STAGES, applyStageOverride, type StageDef, type StageField, type StageOverride } from './stages'

export type StageOverrides = Map<string, StageOverride>

export function overrideOf(row: DermatStageSetting): StageOverride {
  return {
    stageKey: row.stageKey,
    label: row.label ?? null,
    dayLimit: row.dayLimit ?? null,
    hiddenSteps: row.hiddenSteps ?? [],
    requiredFields: row.requiredFields ?? [],
    extraFields: (row.extraFields ?? []) as StageField[],
    documents: row.documents ?? {},
    extraDocuments: row.extraDocuments ?? [],
  }
}

export async function loadStageOverrides(ctx: Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>): Promise<StageOverrides> {
  const rows = await ctx.em.find(DermatStageSetting, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  return new Map(rows.map((row) => [row.stageKey, overrideOf(row)]))
}

export function effectiveStageDef(key: string, overrides: StageOverrides): StageDef | undefined {
  const base = STAGES.find((stage) => stage.key === key)
  return base ? applyStageOverride(base, overrides.get(key)) : undefined
}
