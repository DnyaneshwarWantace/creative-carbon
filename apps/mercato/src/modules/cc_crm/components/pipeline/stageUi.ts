"use client"

import * as React from 'react'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'

export type QuestionType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'yesno'
export type StageQuestion = { key: string; label: string; type: QuestionType; required: boolean; options?: string[]; hint?: string | null }
export type PipelineStage = { id: string; key: string; label: string; description: string | null; kind: 'open' | 'won' | 'lost'; tone: string; position: number; system: boolean; isActive: boolean; questions: StageQuestion[]; updatedAt: string }
export type Answers = Record<string, string | number | boolean | null>

export const TONES = ['neutral', 'info', 'warning', 'success', 'error', 'pink'] as const
export const TONE_LABEL: Record<string, string> = { neutral: 'Grey', info: 'Blue', warning: 'Amber', success: 'Green', error: 'Red', pink: 'Pink' }

export const TONE_DOT: Record<string, string> = {
  neutral: 'bg-status-neutral-icon',
  info: 'bg-status-info-icon',
  warning: 'bg-status-warning-icon',
  success: 'bg-status-success-icon',
  error: 'bg-status-error-icon',
  pink: 'bg-status-pink-icon',
}

export const TONE_SOFT: Record<string, string> = {
  neutral: 'bg-status-neutral-bg border-status-neutral-border',
  info: 'bg-status-info-bg border-status-info-border',
  warning: 'bg-status-warning-bg border-status-warning-border',
  success: 'bg-status-success-bg border-status-success-border',
  error: 'bg-status-error-bg border-status-error-border',
  pink: 'bg-status-pink-bg border-status-pink-border',
}

export const TONE_BADGE: Record<string, StatusBadgeVariant> = { neutral: 'neutral', info: 'info', warning: 'warning', success: 'success', error: 'error', pink: 'warning' }

export function stageBadge(stages: PipelineStage[] | null, key: string): { variant: StatusBadgeVariant; label: string } {
  const stage = stages?.find((entry) => entry.key === key)
  return { variant: TONE_BADGE[stage?.tone ?? 'neutral'] ?? 'neutral', label: stage?.label ?? key }
}

export function useStages(all = false) {
  const [stages, setStages] = React.useState<PipelineStage[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: PipelineStage[]; error?: string }>(`/api/cc_crm/stages${all ? '?all=1' : ''}`)
    if (!call.ok || !call.result) setError(call.result?.error ?? 'Could not load the pipeline stages.')
    else {
      setError(null)
      setStages(call.result.items)
    }
  }, [all])
  React.useEffect(() => {
    void load()
  }, [load])
  return { stages, error, reload: load }
}

export function needsQuestions(stage: PipelineStage): boolean {
  return stage.questions.length > 0
}

export async function moveEnquiry(enquiry: { id: string; updatedAt: string }, stage: string, answers: Answers | null) {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(enquiry.updatedAt), () =>
    apiCall<{ id: string; stage: string; updatedAt: string; error?: string }>('/api/cc_crm/enquiries/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: enquiry.id, action: 'stage', stage, ...(answers ? { answers } : {}) }),
    }),
  )
}

export function formatAnswer(question: StageQuestion, value: Answers[string]): string {
  if (value === null || value === undefined || value === '') return '—'
  if (question.type === 'yesno') return value === true ? 'Yes' : 'No'
  if (question.type === 'date') return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  if (question.type === 'number') return Number(value).toLocaleString('en-IN')
  return String(value)
}
