"use client"

import * as React from 'react'
import Link from 'next/link'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, GripVertical, Lock, Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { PageLoading } from '../../../cc_ui/components/PageLoading'
import { Dropdown } from '../../../cc_lists/components/Dropdown'
import { TONES, TONE_DOT, TONE_LABEL, useStages, type PipelineStage, type QuestionType, type StageQuestion } from './stageUi'

const TYPE_LABEL: Record<QuestionType, string> = { text: 'Short text', textarea: 'Long text', number: 'Number', date: 'Date', select: 'Choice', yesno: 'Yes / No' }

type Draft = { label: string; description: string; tone: string; questions: Array<StageQuestion & { optionsText: string }> }

function toDraft(stage: PipelineStage): Draft {
  return { label: stage.label, description: stage.description ?? '', tone: stage.tone, questions: stage.questions.map((question) => ({ ...question, optionsText: (question.options ?? []).join(', ') })) }
}

function fromDraft(draft: Draft) {
  return {
    label: draft.label.trim(),
    description: draft.description.trim() || null,
    tone: draft.tone,
    questions: draft.questions
      .filter((question) => question.label.trim())
      .map((question) => ({ key: question.key, label: question.label.trim(), type: question.type, required: question.required, hint: question.hint ?? null, ...(question.type === 'select' ? { options: question.optionsText.split(',').map((option) => option.trim()).filter(Boolean) } : {}) })),
  }
}

function QuestionsEditor({ draft, setDraft, lockedKeys }: { draft: Draft; setDraft: (next: Draft) => void; lockedKeys: string[] }) {
  const t = useT()
  const update = (index: number, patch: Partial<Draft['questions'][number]>) => setDraft({ ...draft, questions: draft.questions.map((question, position) => (position === index ? { ...question, ...patch } : question)) })
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cc_crm.stages.questions', 'Questions asked when an enquiry moves here')}</p>
      {draft.questions.map((question, index) => {
        const locked = lockedKeys.includes(question.key)
        return (
          <div key={`${question.key}-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border bg-background p-2 sm:grid-cols-12">
            <Input className="sm:col-span-5" value={question.label} disabled={locked} onChange={(event) => update(index, { label: event.target.value })} placeholder={t('cc_crm.stages.questionLabel', 'Question, e.g. Sample sent on')} aria-label={t('cc_crm.stages.questionLabel', 'Question')} />
            <Dropdown className="h-9 rounded-md border border-input bg-background px-2 text-sm sm:col-span-3" value={question.type} disabled={locked} onChange={(event) => update(index, { type: event.target.value as QuestionType })} aria-label={t('cc_crm.stages.type', 'Answer type')}>
              {(Object.keys(TYPE_LABEL) as QuestionType[]).map((type) => (
                <option key={type} value={type}>
                  {t(`cc_crm.stages.type.${type}`, TYPE_LABEL[type])}
                </option>
              ))}
            </Dropdown>
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <Switch checked={question.required} disabled={locked} onCheckedChange={(checked) => update(index, { required: checked })} />
              {t('cc_crm.stages.required', 'Must answer')}
            </label>
            <div className="flex justify-end sm:col-span-1">
              {locked ? (
                <Lock className="h-4 w-4 text-muted-foreground" aria-label={t('cc_crm.stages.lockedQuestion', 'Built-in question')} />
              ) : (
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, position) => position !== index) })} aria-label={t('cc_crm.stages.removeQuestion', 'Remove question')}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {question.type === 'select' && !locked ? (
              <Input className="sm:col-span-12" value={question.optionsText} onChange={(event) => update(index, { optionsText: event.target.value })} placeholder={t('cc_crm.stages.options', 'Choices, separated by commas')} aria-label={t('cc_crm.stages.options', 'Choices')} />
            ) : null}
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, questions: [...draft.questions, { key: '', label: '', type: 'text', required: false, optionsText: '' }] })}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('cc_crm.stages.addQuestion', 'Add a question')}
      </Button>
    </div>
  )
}

function StageEditor({ stage, onSaved, sortable }: { stage: PipelineStage; onSaved: () => void; sortable: boolean }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `cc-crm-stage-${stage.id}` })
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(stage))
  const [busy, setBusy] = React.useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id, disabled: !sortable })
  React.useEffect(() => setDraft(toDraft(stage)), [stage])

  const send = async (method: 'PUT' | 'DELETE', body: Record<string, unknown> | null, done: string) => {
    setBusy(true)
    try {
      const request = () =>
        method === 'DELETE'
          ? apiCall<{ error?: string }>(`/api/cc_crm/stages?id=${stage.id}`, { method: 'DELETE' })
          : apiCall<{ error?: string }>('/api/cc_crm/stages', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({ context: { resourceKind: 'cc_crm.stage', resourceId: stage.id }, mutationPayload: body ?? { id: stage.id }, operation: request })
      if (!call.ok || call.result?.error) {
        flash(call.result?.error ?? t('cc_crm.stages.saveError', 'Could not save the stage.'), 'error')
        return
      }
      flash(done, 'success')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const locked = stage.key === 'lost' ? ['lost_reason'] : []
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('rounded-xl border bg-card', isDragging && 'z-10 shadow-lg', !stage.isActive && 'opacity-60')}>
      <div className="flex items-center gap-3 p-3">
        {sortable ? (
          <button type="button" className="cursor-grab text-muted-foreground active:cursor-grabbing" {...attributes} {...listeners} aria-label={t('cc_crm.stages.drag', 'Drag to reorder')}>
            <GripVertical className="h-5 w-5" />
          </button>
        ) : (
          <Lock className="h-4 w-4 text-muted-foreground" aria-label={t('cc_crm.stages.fixedPlace', 'Always at the end')} />
        )}
        <span className={cn('h-3 w-3 shrink-0 rounded-full', TONE_DOT[stage.tone] ?? TONE_DOT.neutral)} />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <span className="font-semibold">{stage.label}</span>
          <span className="ml-2 text-xs text-muted-foreground">{stage.description}</span>
        </button>
        <span className="hidden text-xs text-muted-foreground sm:inline">{t('cc_crm.stages.questionCount', '{count} questions', { count: stage.questions.length })}</span>
        {stage.system ? <StatusBadge variant="neutral">{t('cc_crm.stages.builtIn', 'Built-in')}</StatusBadge> : null}
        {!stage.system ? <Switch checked={stage.isActive} disabled={busy} onCheckedChange={(checked) => void send('PUT', { id: stage.id, isActive: checked }, checked ? t('cc_crm.stages.on', 'Stage switched on') : t('cc_crm.stages.off', 'Stage switched off'))} aria-label={t('cc_crm.stages.active', 'On the board')} /> : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? t('cc_crm.stages.close', 'Close') : t('cc_crm.stages.edit', 'Edit')}
        </Button>
      </div>
      {open ? (
        <div className="space-y-4 border-t bg-muted/30 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`label-${stage.id}`}>{t('cc_crm.stages.name', 'Stage name')}</Label>
              <Input id={`label-${stage.id}`} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('cc_crm.stages.colour', 'Colour')}</Label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => (
                  <button key={tone} type="button" onClick={() => setDraft({ ...draft, tone })} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', draft.tone === tone ? 'border-primary ring-1 ring-primary' : 'border-border')}>
                    <span className={cn('h-2.5 w-2.5 rounded-full', TONE_DOT[tone])} />
                    {t(`cc_crm.stages.tone.${tone}`, TONE_LABEL[tone])}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`desc-${stage.id}`}>{t('cc_crm.stages.description', 'What happens in this stage (shown when moving here)')}</Label>
              <Input id={`desc-${stage.id}`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </div>
          </div>
          <QuestionsEditor draft={draft} setDraft={setDraft} lockedKeys={locked} />
          <div className="flex flex-wrap justify-between gap-2">
            {!stage.system ? (
              <Button type="button" variant="destructive-ghost" size="sm" disabled={busy} onClick={() => void send('DELETE', null, t('cc_crm.stages.removed', 'Stage removed'))}>
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_crm.stages.remove', 'Remove stage')}
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" disabled={busy || !draft.label.trim()} onClick={() => void send('PUT', { id: stage.id, ...fromDraft(draft) }, t('cc_crm.stages.saved', 'Stage saved'))}>
              {t('cc_crm.stages.save', 'Save stage')}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

export function StagesSettings() {
  const t = useT()
  const { stages, error, reload } = useStages(true)
  const { runMutation } = useGuardedMutation({ contextId: 'cc-crm-stages' })
  const [order, setOrder] = React.useState<string[]>([])
  const [newLabel, setNewLabel] = React.useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  React.useEffect(() => {
    if (stages) setOrder(stages.filter((stage) => stage.kind === 'open').map((stage) => stage.id))
  }, [stages])

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!stages) return <Page><PageBody><PageLoading label={t('cc_crm.loading', 'Loading…')} /></PageBody></Page>

  const openStages = order.map((id) => stages.find((stage) => stage.id === id)).filter((stage): stage is PipelineStage => Boolean(stage))
  const closed = stages.filter((stage) => stage.kind !== 'open')

  const onDragEnd = async (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const next = arrayMove(order, order.indexOf(String(event.active.id)), order.indexOf(String(event.over.id)))
    setOrder(next)
    const call = await runMutation({ context: { resourceKind: 'cc_crm.stage', resourceId: 'order' }, mutationPayload: { order: next }, operation: () => apiCall('/api/cc_crm/stages', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order: next }) }) })
    if (!call.ok) flash(t('cc_crm.stages.orderError', 'Could not save the order.'), 'error')
    await reload()
  }

  const add = async () => {
    const label = newLabel.trim()
    if (!label) return
    const call = await runMutation({ context: { resourceKind: 'cc_crm.stage', resourceId: 'new' }, mutationPayload: { label }, operation: () => apiCall<{ error?: string }>('/api/cc_crm/stages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label, tone: 'info' }) }) })
    if (!call.ok || call.result?.error) {
      flash(call.result?.error ?? t('cc_crm.stages.addError', 'Could not add the stage.'), 'error')
      return
    }
    setNewLabel('')
    flash(t('cc_crm.stages.added', '{label} added before Won. Open it to add its questions.', { label }), 'success')
    await reload()
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-12">
          <div>
            <Link href="/backend/crm/pipeline" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {t('cc_crm.stages.back', 'Pipeline board')}
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{t('cc_crm.stages.title', 'Pipeline stages')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_crm.stages.lede', 'The columns of the pipeline board, in order. Add your own stages between New and Won, and set the questions the team answers when an enquiry moves into a stage.')}</p>
          </div>
          <form
            className="flex flex-wrap gap-2 rounded-xl border bg-card p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <Input className="min-w-0 flex-1" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder={t('cc_crm.stages.newPlaceholder', 'New stage, e.g. Sample sent, Technical approval')} aria-label={t('cc_crm.stages.newStage', 'New stage')} />
            <Button type="submit" disabled={!newLabel.trim()}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_crm.stages.add', 'Add stage')}
            </Button>
          </form>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2">
                {openStages.map((stage) => (
                  <StageEditor key={stage.id} stage={stage} sortable onSaved={() => void reload()} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cc_crm.stages.closedTitle', 'Closing stages (always last)')}</p>
            <ol className="space-y-2">
              {closed.map((stage) => (
                <StageEditor key={stage.id} stage={stage} sortable={false} onSaved={() => void reload()} />
              ))}
            </ol>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default StagesSettings
