"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { AlarmClock, CalendarClock, Columns3, IndianRupee, List, Plus, Search, Settings2, Trophy } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { PageLoading } from '../../../cc_ui/components/PageLoading'
import { Dropdown } from '../../../cc_lists/components/Dropdown'
import { StageMoveDialog, type MoveTarget } from './StageMoveDialog'
import { TONE_DOT, TONE_SOFT, moveEnquiry, needsQuestions, useStages, type Answers, type PipelineStage } from './stageUi'

type BoardCard = {
  id: string
  enquiryNo: string
  subject: string
  partyName: string | null
  source: string
  ownerName: string | null
  stage: string
  receivedAt: string
  nextActionOn: string | null
  nextActionNote: string | null
  overdue: boolean
  dueToday: boolean
  lostReason: string | null
  orderId: string | null
  quote: { no: string; total: number; currency: string; status: string } | null
  daysInPipeline: number
  updatedAt: string
}

function rupees(value: number): string {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)} Cr`
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)} L`
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function initials(name: string | null): string {
  if (!name) return '—'
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '').concat(parts[1]?.[0] ?? '').toUpperCase() || name.slice(0, 2).toUpperCase()
}

function shortDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function CardBody({ card, dragging = false }: { card: BoardCard; dragging?: boolean }) {
  const t = useT()
  return (
    <div className={cn('space-y-2 rounded-lg border bg-card p-3 text-left shadow-xs transition-shadow', dragging ? 'rotate-1 shadow-lg ring-2 ring-primary' : 'hover:shadow-md', card.overdue && 'border-status-error-border')}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">{card.enquiryNo}</span>
        {card.quote ? (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">
            {card.quote.currency === 'INR' ? rupees(card.quote.total) : `${card.quote.currency} ${Math.round(card.quote.total).toLocaleString('en-IN')}`}
          </span>
        ) : null}
      </div>
      <div>
        <p className="truncate text-sm font-semibold">{card.partyName ?? t('cc_crm.pipeline.noParty', 'No party yet')}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{card.subject}</p>
      </div>
      {card.lostReason ? <p className="truncate text-xs text-status-error-text">{card.lostReason}</p> : null}
      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <span className="inline-flex min-w-0 items-center gap-1.5" title={card.ownerName ?? undefined}>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials(card.ownerName)}</span>
          <span className="truncate text-xs text-muted-foreground">{card.source}</span>
        </span>
        {card.nextActionOn ? (
          <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium', card.overdue ? 'bg-status-error-bg text-status-error-text' : card.dueToday ? 'bg-status-warning-bg text-status-warning-text' : 'text-muted-foreground')} title={card.nextActionNote ?? undefined}>
            {card.overdue ? <AlarmClock className="h-3 w-3" aria-hidden="true" /> : <CalendarClock className="h-3 w-3" aria-hidden="true" />}
            {card.dueToday ? t('cc_crm.pipeline.today', 'Today') : shortDate(card.nextActionOn)}
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">{t('cc_crm.pipeline.days', '{days} d', { days: card.daysInPipeline })}</span>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ card, disabled, onOpen }: { card: BoardCard; disabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('touch-manipulation', isDragging && 'opacity-30')}>
      <button type="button" className="block w-full cursor-grab active:cursor-grabbing" onClick={onOpen}>
        <CardBody card={card} />
      </button>
    </div>
  )
}

const PAGE = 15

function Column({ stage, cards, canMove, onOpen }: { stage: PipelineStage; cards: BoardCard[]; canMove: boolean; onOpen: (card: BoardCard) => void }) {
  const t = useT()
  const { setNodeRef, isOver } = useDroppable({ id: stage.key })
  const [shown, setShown] = React.useState(PAGE)
  const value = cards.reduce((sum, card) => sum + (card.quote?.currency === 'INR' ? card.quote.total : 0), 0)
  return (
    <section className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40" aria-label={stage.label}>
      <header className={cn('rounded-t-xl border-b px-3 py-2.5', TONE_SOFT[stage.tone] ?? TONE_SOFT.neutral)}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', TONE_DOT[stage.tone] ?? TONE_DOT.neutral)} />
            <span className="truncate">{stage.label}</span>
          </h2>
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">{cards.length}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {value ? rupees(value) : t('cc_crm.pipeline.noValue', 'No quoted value')}
          {stage.questions.length ? ` · ${t('cc_crm.pipeline.questions', '{count} questions on entry', { count: stage.questions.length })}` : ''}
        </p>
      </header>
      <div ref={setNodeRef} className={cn('cc-board-col flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors', isOver && 'bg-accent')}>
        {cards.slice(0, shown).map((card) => (
          <DraggableCard key={card.id} card={card} disabled={!canMove} onOpen={() => onOpen(card)} />
        ))}
        {cards.length > shown ? (
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setShown((current) => current + PAGE)}>
            {t('cc_crm.pipeline.showMore', 'Show {count} more', { count: Math.min(PAGE, cards.length - shown) })}
          </Button>
        ) : null}
        {!cards.length ? <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{isOver ? t('cc_crm.pipeline.dropHere', 'Drop here') : t('cc_crm.pipeline.empty', 'Nothing here')}</p> : null}
      </div>
    </section>
  )
}

export function PipelineBoard() {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const { stages, error: stageError } = useStages()
  const [cards, setCards] = React.useState<BoardCard[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [owner, setOwner] = React.useState('')
  const [dragging, setDragging] = React.useState<BoardCard | null>(null)
  const [pending, setPending] = React.useState<MoveTarget | null>(null)
  const canMove = granted.has('cc_crm.manage')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor))

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: BoardCard[]; error?: string }>('/api/cc_crm/enquiries?board=1')
    if (!call.ok || !call.result) setError(call.result?.error ?? t('cc_crm.pipeline.loadError', 'Could not load the pipeline.'))
    else setCards(call.result.items)
  }, [t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error || stageError) return <Page><PageBody><ErrorMessage label={error ?? stageError ?? ''} /></PageBody></Page>
  if (!cards || !stages) return <Page><PageBody><PageLoading label={t('cc_crm.loading', 'Loading…')} /></PageBody></Page>

  const owners = Array.from(new Set(cards.map((card) => card.ownerName).filter((name): name is string => Boolean(name)))).sort()
  const term = search.trim().toLowerCase()
  const visible = cards.filter((card) => (!owner || card.ownerName === owner) && (!term || [card.enquiryNo, card.subject, card.partyName ?? '', card.ownerName ?? ''].some((value) => value.toLowerCase().includes(term))))
  const stageOf = (key: string) => stages.find((stage) => stage.key === key) ?? null
  const open = visible.filter((card) => stageOf(card.stage)?.kind === 'open')
  const openValue = open.reduce((sum, card) => sum + (card.quote?.currency === 'INR' ? card.quote.total : 0), 0)
  const overdue = open.filter((card) => card.overdue).length
  const today = open.filter((card) => card.dueToday).length
  const won = visible.filter((card) => card.stage === 'won')
  const wonValue = won.reduce((sum, card) => sum + (card.quote?.currency === 'INR' ? card.quote.total : 0), 0)

  const commit = async (card: BoardCard, to: PipelineStage, answers: Answers | null): Promise<boolean> => {
    const previous = card.stage
    setCards((current) => current?.map((entry) => (entry.id === card.id ? { ...entry, stage: to.key } : entry)) ?? null)
    const call = await moveEnquiry(card, to.key, answers)
    if (!call.ok || !call.result || call.result.error) {
      setCards((current) => current?.map((entry) => (entry.id === card.id ? { ...entry, stage: previous } : entry)) ?? null)
      flash(call.result?.error ?? (call.status === 409 ? t('cc_crm.pipeline.conflict', 'Someone changed this enquiry. The board is reloaded.') : t('cc_crm.pipeline.moveError', 'Could not move the enquiry.')), 'error')
      if (call.status === 409) void load()
      return false
    }
    setCards((current) => current?.map((entry) => (entry.id === card.id ? { ...entry, stage: to.key, updatedAt: call.result!.updatedAt, ...(to.kind !== 'open' ? { nextActionOn: null, overdue: false, dueToday: false } : {}) } : entry)) ?? null)
    flash(t('cc_crm.pipeline.moved', '{no} moved to {stage}', { no: card.enquiryNo, stage: to.label }), 'success')
    return true
  }

  const onDragStart = (event: DragStartEvent) => setDragging(cards.find((card) => card.id === event.active.id) ?? null)
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null)
    const card = cards.find((entry) => entry.id === event.active.id)
    const to = event.over ? stageOf(String(event.over.id)) : null
    if (!card || !to || to.key === card.stage) return
    if (needsQuestions(to)) setPending({ enquiry: card, from: stageOf(card.stage), to })
    else void commit(card, to, null)
  }

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_crm.pipeline.title', 'Pipeline')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_crm.pipeline.lede', 'Every open enquiry by stage. Drag a card to move it; some stages ask a few questions first.')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t('cc_crm.pipeline.view', 'View')}>
                <Button type="button" size="sm" variant="default" className="h-7" aria-pressed="true">
                  <Columns3 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_crm.pipeline.board', 'Board')}
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => router.push('/backend/crm/enquiries')}>
                  <List className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_crm.pipeline.list', 'List')}
                </Button>
              </div>
              {granted.has('cc_crm.team') ? (
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href="/backend/crm/stages">
                    <Settings2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_crm.pipeline.stages', 'Stages & questions')}
                  </Link>
                </Button>
              ) : null}
              {canMove ? (
                <Button asChild size="sm">
                  <Link href="/backend/crm/enquiries/new">
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_crm.pipeline.newEnquiry', 'New enquiry')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">{t('cc_crm.pipeline.openCount', 'Open enquiries')}</p>
              <p className="text-2xl font-bold tabular-nums">{open.length}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <IndianRupee className="h-3 w-3" aria-hidden="true" />
                {t('cc_crm.pipeline.openValue', 'Quoted, still open')}
              </p>
              <p className="text-2xl font-bold tabular-nums">{rupees(openValue)}</p>
            </div>
            <div className={cn('rounded-xl border p-3', overdue ? 'border-status-error-border bg-status-error-bg' : 'bg-card')}>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <AlarmClock className="h-3 w-3" aria-hidden="true" />
                {t('cc_crm.pipeline.followUps', 'Follow-ups overdue / today')}
              </p>
              <p className="text-2xl font-bold tabular-nums">
                <span className={overdue ? 'text-status-error-text' : undefined}>{overdue}</span>
                <span className="text-muted-foreground"> / {today}</span>
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Trophy className="h-3 w-3" aria-hidden="true" />
                {t('cc_crm.pipeline.won30', 'Won in the last 30 days')}
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {won.length}
                {wonValue ? <span className="ml-2 text-sm font-semibold text-status-success-text">{rupees(wonValue)}</span> : null}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_crm.pipeline.search', 'Search party, subject, enquiry no.')} aria-label={t('cc_crm.pipeline.search', 'Search party, subject, enquiry no.')} />
            </div>
            <Dropdown className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={owner} onChange={(event) => setOwner(event.target.value)} aria-label={t('cc_crm.pipeline.owner', 'Owner')}>
              <option value="">{t('cc_crm.pipeline.everyone', 'Everyone')}</option>
              {owners.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Dropdown>
            {!canMove ? <span className="text-xs text-muted-foreground">{t('cc_crm.pipeline.viewOnly', 'View only: you cannot move enquiries.')}</span> : null}
          </div>

          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4">
              {stages.map((stage) => (
                <Column key={stage.key} stage={stage} cards={visible.filter((card) => card.stage === stage.key)} canMove={canMove} onOpen={(card) => router.push(`/backend/crm/enquiries/${card.id}`)} />
              ))}
            </div>
            <DragOverlay>{dragging ? <div className="w-68"><CardBody card={dragging} dragging /></div> : null}</DragOverlay>
          </DndContext>
        </div>
        <StageMoveDialog
          target={pending}
          onCancel={() => setPending(null)}
          onConfirm={async (answers) => {
            if (!pending) return false
            const card = cards.find((entry) => entry.id === pending.enquiry.id)
            if (!card) return false
            const done = await commit(card, pending.to, answers)
            if (done) setPending(null)
            return done
          }}
        />
      </PageBody>
    </Page>
  )
}

export default PipelineBoard
