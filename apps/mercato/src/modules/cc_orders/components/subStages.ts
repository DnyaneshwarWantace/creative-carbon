import { stageDef, stepStates } from '../lib/stages'
import type { Order, Stage } from './types'

export type SubStage = {
  key: string
  label: string
  kind: 'step' | 'store' | 'qc'
  status: 'done' | 'current' | 'pending' | 'na'
  optional: boolean
  by: string | null
  at: string | null
  detail: string | null
  links: Array<{ href: string; label: string }>
}

export function subStages(order: Order, stage: Stage): SubStage[] {
  const def = stageDef(stage.key)
  if (!def) return []
  const states = stepStates(stage.data)
  const step = (key: string): Omit<SubStage, 'status'> & { done: boolean } => {
    const entry = def.steps.find((candidate) => candidate.key === key)
    const state = states[key]
    return { key, label: entry?.label ?? key, kind: 'step', optional: Boolean(entry?.optional), by: state?.by ?? null, at: state?.at ?? null, done: Boolean(state?.done), detail: null, links: [] }
  }
  const items: Array<Omit<SubStage, 'status'> & { done: boolean; na?: boolean; naText?: string }> = def.steps.map((entry) => step(entry.key))
  const working = stage.status === 'open' || stage.status === 'on_hold'
  let currentGiven = false
  return items.map((item) => {
    let status: SubStage['status']
    if (item.na) status = 'na'
    else if (item.done || stage.status === 'done') status = 'done'
    else if (working && !currentGiven && !item.optional) {
      status = 'current'
      currentGiven = true
    } else status = 'pending'
    return { key: item.key, label: item.label, kind: item.kind, optional: item.optional, by: item.by, at: item.at, detail: item.na ? (item.naText ?? null) : item.detail, links: item.links, status }
  })
}

export function subStageProgress(order: Order, stage: Stage): { done: number; total: number; current: string | null } {
  const list = subStages(order, stage).filter((item) => item.status !== 'na' && !item.optional)
  return { done: list.filter((item) => item.status === 'done').length, total: list.length, current: list.find((item) => item.status === 'current')?.label ?? null }
}
