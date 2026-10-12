import type { OrderContext } from '../../cc_orders/lib/server'
import { CcEnquiry, CrmStage, type StageQuestion } from '../data/entities'
import { CrmError } from './server'

export const CLOSED_STAGES = ['won', 'lost']
export const STAGE_TONES = ['neutral', 'info', 'warning', 'success', 'error', 'pink'] as const

type Scope = Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>

function scope(ctx: Scope) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

const BUILT_IN: Array<Pick<CrmStage, 'key' | 'label' | 'kind' | 'tone' | 'description'> & { questions: StageQuestion[] }> = [
  { key: 'new', label: 'New', kind: 'open', tone: 'info', description: 'Just came in. Call back, understand the need.', questions: [] },
  {
    key: 'quoted',
    label: 'Quoted',
    kind: 'open',
    tone: 'warning',
    description: 'Rates sent to the customer.',
    questions: [
      { key: 'quoted_value', label: 'Quoted value (₹)', type: 'number', required: false, hint: 'Leave blank if the quotation is in the system.' },
      { key: 'quoted_on', label: 'Quoted on', type: 'date', required: false },
    ],
  },
  {
    key: 'negotiating',
    label: 'Negotiating',
    kind: 'open',
    tone: 'pink',
    description: 'Customer is discussing price, delivery or terms.',
    questions: [
      { key: 'negotiating_on', label: 'What are they negotiating?', type: 'select', required: true, options: ['Price', 'Delivery date', 'Payment terms', 'Specification', 'Quantity', 'Other'] },
      { key: 'target_rate', label: 'Their target rate (₹/kg)', type: 'number', required: false },
      { key: 'decision_by', label: 'Decision expected by', type: 'date', required: false },
    ],
  },
  {
    key: 'won',
    label: 'Won',
    kind: 'won',
    tone: 'success',
    description: 'Order confirmed. Book it from the quotation.',
    questions: [
      { key: 'customer_po', label: 'Customer PO no.', type: 'text', required: false },
      { key: 'po_date', label: 'PO date', type: 'date', required: false },
    ],
  },
  {
    key: 'lost',
    label: 'Lost',
    kind: 'lost',
    tone: 'neutral',
    description: 'Did not come through.',
    questions: [
      { key: 'lost_reason', label: 'Why was it lost?', type: 'select', required: true, options: [] },
      { key: 'lost_to', label: 'Who did they buy from?', type: 'text', required: false },
      { key: 'lost_rate', label: 'Their rate (₹/kg), if known', type: 'number', required: false },
    ],
  },
]

export type StageView = ReturnType<typeof stageView>

export function stageView(row: CrmStage) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description ?? null,
    kind: row.kind,
    tone: row.tone,
    position: row.position,
    system: row.system,
    isActive: row.isActive,
    questions: row.questions ?? [],
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function ensureStages(ctx: Scope): Promise<CrmStage[]> {
  const existing = await ctx.em.find(CrmStage, { ...scope(ctx), deletedAt: null }, { orderBy: { position: 'asc' } })
  const missing = BUILT_IN.filter((stage) => !existing.some((row) => row.key === stage.key))
  if (!missing.length) return existing.sort(boardOrder)
  for (const stage of missing) {
    const position = BUILT_IN.findIndex((entry) => entry.key === stage.key) * 100 + 100
    const row = ctx.em.create(CrmStage, { ...scope(ctx), key: stage.key, label: stage.label, description: stage.description, kind: stage.kind, tone: stage.tone, position, system: true, questions: stage.questions })
    ctx.em.persist(row)
    existing.push(row)
  }
  await ctx.em.flush()
  return existing.sort(boardOrder)
}

const KIND_RANK: Record<string, number> = { open: 0, won: 1, lost: 2 }

function boardOrder(left: CrmStage, right: CrmStage): number {
  return (KIND_RANK[left.kind] ?? 0) - (KIND_RANK[right.kind] ?? 0) || left.position - right.position
}

async function lostReasons(ctx: Scope): Promise<string[]> {
  const { activeOptions } = await import('../../cc_lists/lib/service')
  return activeOptions(ctx as never, 'lost_reasons')
}

export async function listStages(ctx: Scope, options: { includeInactive?: boolean } = {}) {
  const rows = await ensureStages(ctx)
  const reasons = await lostReasons(ctx)
  return rows
    .filter((row) => options.includeInactive || row.isActive)
    .map((row) => {
      const view = stageView(row)
      if (row.key === 'lost') view.questions = view.questions.map((question) => (question.key === 'lost_reason' ? { ...question, options: reasons } : question))
      return view
    })
}

export async function stageByKey(ctx: Scope, key: string): Promise<StageView> {
  const stage = (await listStages(ctx, { includeInactive: true })).find((row) => row.key === key)
  if (!stage) throw new CrmError('That stage does not exist', 404)
  if (!stage.isActive) throw new CrmError(`${stage.label} is switched off. Turn it on in Pipeline stages first.`, 409)
  return stage
}

export async function stagePositions(ctx: Scope): Promise<Map<string, number>> {
  return new Map((await ensureStages(ctx)).map((row) => [row.key, row.kind === 'open' ? row.position : row.kind === 'won' ? 1_000_000 : 1_000_001]))
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'stage'
}

function cleanQuestions(questions: StageQuestion[]): StageQuestion[] {
  const seen = new Set<string>()
  return questions
    .map((question) => {
      let key = question.key?.trim() || slug(question.label)
      while (seen.has(key)) key = `${key}_2`
      seen.add(key)
      const options = question.type === 'select' ? Array.from(new Set((question.options ?? []).map((option) => option.trim()).filter(Boolean))) : undefined
      if (question.type === 'select' && !options?.length && key !== 'lost_reason') throw new CrmError(`"${question.label}" is a choice; add its options`)
      return { key, label: question.label.trim(), type: question.type, required: Boolean(question.required), ...(options ? { options } : {}), hint: question.hint?.trim() || null }
    })
    .filter((question) => question.label)
}

export async function createStage(ctx: Scope, input: { label: string; description?: string | null; tone?: string; questions?: StageQuestion[]; afterKey?: string | null }) {
  const rows = await ensureStages(ctx)
  const label = input.label.trim()
  if (rows.some((row) => row.label.toLowerCase() === label.toLowerCase())) throw new CrmError(`There is already a stage called ${label}`, 409)
  let key = slug(label)
  while (rows.some((row) => row.key === key)) key = `${key}_2`
  const open = rows.filter((row) => row.kind === 'open')
  const after = input.afterKey ? open.find((row) => row.key === input.afterKey) : open[open.length - 1]
  const next = after ? open.find((row) => row.position > after.position) : open[0]
  const position = after && next ? Math.floor((after.position + next.position) / 2) : after ? after.position + 100 : 50
  const row = ctx.em.create(CrmStage, { ...scope(ctx), key, label, description: input.description?.trim() || null, kind: 'open', tone: input.tone ?? 'neutral', position, system: false, questions: cleanQuestions(input.questions ?? []) })
  ctx.em.persist(row)
  await ctx.em.flush()
  if (after && next && next.position - after.position < 2) await reorderStages(ctx, rows.filter((entry) => entry.kind === 'open').map((entry) => entry.id))
  return row
}

export async function updateStage(ctx: Scope, id: string, input: { label?: string; description?: string | null; tone?: string; questions?: StageQuestion[]; isActive?: boolean }) {
  const row = await ctx.em.findOne(CrmStage, { id, ...scope(ctx), deletedAt: null })
  if (!row) throw new CrmError('Stage not found', 404)
  if (input.label !== undefined) {
    const label = input.label.trim()
    if (!label) throw new CrmError('Give the stage a name')
    const clash = await ctx.em.findOne(CrmStage, { ...scope(ctx), deletedAt: null, id: { $ne: id }, label: { $ilike: label } })
    if (clash) throw new CrmError(`There is already a stage called ${label}`, 409)
    row.label = label
  }
  if (input.description !== undefined) row.description = input.description?.trim() || null
  if (input.tone !== undefined) row.tone = input.tone
  if (input.questions !== undefined) row.questions = cleanQuestions(input.questions)
  if (input.isActive !== undefined) {
    if (row.system && !input.isActive) throw new CrmError(`${row.label} is a built-in stage and stays on`, 409)
    if (!input.isActive) {
      const used = await ctx.em.count(CcEnquiry, { ...scope(ctx), deletedAt: null, stage: row.key })
      if (used) throw new CrmError(`${used} enquiries are in ${row.label}. Move them to another stage first.`, 409)
    }
    row.isActive = input.isActive
  }
  await ctx.em.flush()
  return row
}

export async function reorderStages(ctx: Scope, ids: string[]) {
  const rows = await ensureStages(ctx)
  const open = rows.filter((row) => row.kind === 'open')
  const ordered = ids.map((id) => open.find((row) => row.id === id)).filter((row): row is CrmStage => Boolean(row))
  for (const row of open) if (!ordered.includes(row)) ordered.push(row)
  ordered.forEach((row, index) => {
    row.position = (index + 1) * 100
  })
  const closed = rows.filter((row) => row.kind !== 'open').sort((left, right) => (left.kind === right.kind ? 0 : left.kind === 'won' ? -1 : 1))
  closed.forEach((row, index) => {
    row.position = (ordered.length + index + 1) * 100
  })
  await ctx.em.flush()
}

export async function deleteStage(ctx: Scope, id: string) {
  const row = await ctx.em.findOne(CrmStage, { id, ...scope(ctx), deletedAt: null })
  if (!row) throw new CrmError('Stage not found', 404)
  if (row.system) throw new CrmError(`${row.label} is a built-in stage and cannot be removed`, 409)
  const used = await ctx.em.count(CcEnquiry, { ...scope(ctx), deletedAt: null, stage: row.key })
  if (used) throw new CrmError(`${used} enquiries are in ${row.label}. Move them to another stage first.`, 409)
  row.deletedAt = new Date()
  await ctx.em.flush()
}

export function checkAnswers(stage: StageView, raw: Record<string, unknown> | null | undefined): Record<string, string | number | boolean | null> {
  const answers: Record<string, string | number | boolean | null> = {}
  const missing: string[] = []
  for (const question of stage.questions) {
    const value = raw?.[question.key]
    let clean: string | number | boolean | null = null
    if (value !== undefined && value !== null && value !== '') {
      if (question.type === 'number') {
        const number = Number(value)
        if (!Number.isFinite(number)) throw new CrmError(`${question.label}: enter a number`)
        clean = number
      } else if (question.type === 'yesno') clean = value === true || value === 'yes' || value === 'true'
      else if (question.type === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new CrmError(`${question.label}: pick a date`)
        clean = String(value)
      } else {
        clean = String(value).trim().slice(0, 1000)
        if (question.type === 'select' && question.options?.length && !question.options.includes(clean)) throw new CrmError(`${question.label}: pick one of the choices`)
      }
    }
    if (question.required && (clean === null || clean === '')) missing.push(question.label)
    answers[question.key] = clean
  }
  if (missing.length) throw new CrmError(`Answer: ${missing.join(', ')}`)
  return answers
}
