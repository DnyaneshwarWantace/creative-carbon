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

const STORE_WORDS: Record<string, string> = { requested: 'requested', partly_issued: 'partly issued', issued: 'sent, not received', received: 'received', used: 'used', cancelled: 'cancelled' }

function storeSub(order: Order, stage: Stage, label: string): Omit<SubStage, 'status'> & { done: boolean } {
  const requests = (order.store?.[stage.key] ?? []).filter((request) => request.status !== 'cancelled')
  const done = requests.length > 0 && requests.every((request) => (request.status === 'received' || request.status === 'used') && !request.awaitingReceipt)
  return {
    key: 'store',
    label,
    kind: 'store',
    optional: false,
    by: null,
    at: null,
    done,
    detail: requests.length ? requests.map((request) => `${request.code} ${request.awaitingReceipt && request.status !== 'requested' ? 'sent, not received' : STORE_WORDS[request.status] ?? request.status}`).join(' · ') : 'Not asked yet',
    links: requests.map((request) => ({ href: `/backend/store/requests/${request.id}`, label: request.code })),
  }
}

function qcSub(order: Order, stage: Stage, label: string): (Omit<SubStage, 'status'> & { done: boolean }) | null {
  const checks = order.qc?.[stage.key] ?? []
  if (!checks.length) return null
  return {
    key: 'qc',
    label,
    kind: 'qc',
    optional: false,
    by: null,
    at: null,
    done: checks.every((check) => check.status === 'passed'),
    detail: checks.map((check) => `${check.code} ${check.status === 'passed' ? 'passed' : check.status === 'failed' ? 'failed' : `chemical ${check.chemicalStatus}${check.microStatus !== 'na' ? `, micro ${check.microStatus}` : ''}`}`).join(' · '),
    links: checks.map((check) => ({ href: `/backend/qc/checks/${check.id}`, label: check.code })),
  }
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
  let items: Array<Omit<SubStage, 'status'> & { done: boolean; na?: boolean; naText?: string }>
  const reusing = stage.key === 'manufacturing' && stage.data?.bulk_source === 'Use bulk already made'
  if (stage.key === 'manufacturing') {
    items = [
      reusing ? { ...storeSub(order, stage, 'Requirement given to store'), na: true, naText: `Bulk taken from batch ${String(stage.data?.batch_no ?? '')}` } : storeSub(order, stage, 'Requirement given to store'),
      step('manufactured'),
      reusing ? { key: 'qc', label: 'QC testing', kind: 'qc', optional: false, by: null, at: null, done: true, detail: null, links: [], na: true, naText: 'Batch already QC-approved' } : (qcSub(order, stage, 'QC testing') ?? { key: 'qc', label: 'QC testing', kind: 'qc', optional: false, by: null, at: null, done: false, detail: 'Check is created when the stage opens', links: [] }),
    ]
  } else if (stage.key === 'filling') {
    const qc = qcSub(order, stage, 'QC testing')
    items = [storeSub(order, stage, 'Bottle requirement given to store'), step('filled'), qc ?? { key: 'qc', label: 'QC testing', kind: 'qc', optional: false, by: null, at: null, done: true, detail: null, links: [], na: true, naText: 'QC after filling is switched off' }]
  } else if (stage.key === 'packing') {
    const qc = qcSub(order, stage, 'QC testing')
    items = [step('sample'), qc ?? { key: 'qc', label: 'QC testing', kind: 'qc', optional: false, by: null, at: null, done: true, detail: null, links: [], na: true, naText: 'No packing QC rule' }, step('packed')]
  } else {
    items = def.steps.map((entry) => step(entry.key))
  }
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
