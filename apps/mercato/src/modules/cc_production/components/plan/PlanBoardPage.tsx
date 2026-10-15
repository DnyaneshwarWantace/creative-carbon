"use client"

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SearchPicker, type PickerOption } from '../../../cc_orders/components/SearchPicker'
import { CorrectDialog } from '../../../cc_ui/components/CorrectDialog'
import { selectClass, useSend } from '../finishing/shared'
import { todayIso } from '../resin/shared'
import type { MachineTile } from '../../lib/floorBoard'
import { AREA_UNITS, DEFAULT_UNIT, linesForMachine, orphanLines, planMaterials, usesPress, type PlanArea, type PlanDraftLine, type PlanUnit, type RecipeForPlan } from '../../lib/planBoard'

type PlanView = { id: string | null; planDate: string; lines: Array<{ area: PlanArea; resource: string; item: string | null; plannedQty: number; unit: PlanUnit }>; notes: string | null; updatedAt: string | null }
type FloorMachines = { machines: { reactors: MachineTile[]; dryers: MachineTile[]; presses: MachineTile[] } }
type Section = { area: PlanArea; title: string; hint: string; tiles: MachineTile[] }

let seq = 0
const newKey = () => `l${(seq += 1)}`

function shiftDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function tomorrow(): string {
  return shiftDay(todayIso(), 1)
}

async function searchDies(search: string): Promise<PickerOption<null>[]> {
  const call = await apiCall<{ items?: Array<{ id: string; dieNo: string; description: string | null; customerName?: string | null }> }>(`/api/cc_production/masters?type=moulds&includeInactive=false&search=${encodeURIComponent(search.trim())}`, undefined, { fallback: { items: [] } })
  return (call.result?.items ?? []).slice(0, 20).map((die) => ({ id: die.dieNo, primary: die.dieNo, secondary: [die.description, die.customerName].filter(Boolean).join(' · ') || null, value: null }))
}

function LineRow({ line, area, grades, onChange, onRemove }: { line: PlanDraftLine; area: PlanArea; grades: string[]; onChange: (patch: Partial<PlanDraftLine>) => void; onRemove: () => void }) {
  const t = useT()
  const units = AREA_UNITS[area]
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        {area === 'moulding' ? (
          <SearchPicker
            value={line.item ? { id: line.item, primary: line.item, value: null } : null}
            placeholder={t('cc_production.planBoard.pickDie', 'Pick the die')}
            searchPlaceholder={t('cc_production.planBoard.searchDie', 'Search die no., item or customer')}
            load={searchDies}
            onSelect={(option) => onChange({ item: option.id })}
          />
        ) : (
          <>
            <Input value={line.item} list={`grades-${area}`} placeholder={area === 'press' ? t('cc_production.planBoard.grade', 'Grade') : area === 'coating' ? t('cc_production.planBoard.bstage', 'B-stage / grade') : t('cc_production.planBoard.resinGrade', 'Resin grade')} onChange={(event) => onChange({ item: event.target.value })} aria-label={t('cc_production.planBoard.item', 'Item')} />
            <datalist id={`grades-${area}`}>{grades.map((grade) => <option key={grade} value={grade} />)}</datalist>
          </>
        )}
      </div>
      <Input className="w-20 text-right" inputMode="decimal" value={line.plannedQty} onChange={(event) => onChange({ plannedQty: event.target.value })} aria-label={t('cc_production.planBoard.qty', 'Planned quantity')} />
      {units.length > 1 ? (
        <select className={cn(selectClass, 'w-20 px-1')} value={line.unit} onChange={(event) => onChange({ unit: event.target.value as PlanUnit })} aria-label={t('cc_production.planBoard.unit', 'Unit')}>
          {units.map((unit) => <option key={unit} value={unit}>{unit === 'nos' ? 'pcs' : unit}</option>)}
        </select>
      ) : (
        <span className="w-8 text-xs text-muted-foreground">{units[0]}</span>
      )}
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={t('cc_production.resin.removeLine', 'Remove row')}>
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )
}

export function PlanBoardPage() {
  const t = useT()
  const params = useSearchParams()
  const send = useSend('cc-plan')
  const [date, setDate] = React.useState(params?.get('date') ?? tomorrow())
  const [plan, setPlan] = React.useState<PlanView | null>(null)
  const [lines, setLines] = React.useState<PlanDraftLine[]>([])
  const [notes, setNotes] = React.useState('')
  const [floor, setFloor] = React.useState<FloorMachines | null>(null)
  const [recipes, setRecipes] = React.useState<RecipeForPlan[]>([])
  const [grades, setGrades] = React.useState<string[]>([])
  const [asking, setAsking] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)
  const yesterday = shiftDay(date, -1)

  React.useEffect(() => {
    setLoaded(false)
    void apiCall<PlanView>(`/api/cc_production/plan?date=${date}`).then((call) => {
      const view = call.result ?? null
      setPlan(view)
      setLines((view?.lines ?? []).map((line) => ({ key: newKey(), area: line.area, resource: line.resource, item: line.item ?? '', plannedQty: String(line.plannedQty), unit: line.unit })))
      setNotes(view?.notes ?? '')
      setLoaded(true)
    })
  }, [date])

  React.useEffect(() => {
    void apiCall<FloorMachines>(`/api/cc_production/floor?date=${yesterday}`).then((call) => setFloor(call.ok ? (call.result ?? null) : null))
  }, [yesterday])

  React.useEffect(() => {
    void apiCall<{ items: RecipeForPlan[] }>('/api/cc_production/recipes', undefined, { fallback: { items: [] } }).then((call) => setRecipes(call.result?.items ?? []))
    void apiCall<{ items: Array<{ grade?: string }> }>('/api/cc_production/masters?type=prices', undefined, { fallback: { items: [] } }).then((call) => setGrades([...new Set((call.result?.items ?? []).map((row) => row.grade).filter((grade): grade is string => Boolean(grade)))].sort()))
  }, [])

  const sections: Section[] = React.useMemo(() => {
    const machines = floor?.machines
    if (!machines) return []
    return [
      { area: 'resin', title: t('cc_production.planBoard.resin', 'Resin reactors'), hint: t('cc_production.planBoard.resinHint', 'Resin to make, in kg'), tiles: machines.reactors },
      { area: 'coating', title: t('cc_production.planBoard.coating', 'Dryers · B-stage'), hint: t('cc_production.planBoard.coatingHint', 'B-stage to coat, in kg'), tiles: machines.dryers },
      { area: 'press', title: t('cc_production.planBoard.press', 'Laminate presses'), hint: t('cc_production.planBoard.pressHint', 'Sheets to press, by grade'), tiles: machines.presses.filter((tile) => usesPress(tile.usage, 'press')) },
      { area: 'moulding', title: t('cc_production.planBoard.moulding', 'Moulding presses'), hint: t('cc_production.planBoard.mouldingHint', 'Pieces to mould, by die'), tiles: machines.presses.filter((tile) => usesPress(tile.usage, 'moulding')) },
    ]
  }, [floor, t])

  const machineList = sections.flatMap((section) => section.tiles.map((tile) => ({ area: section.area, label: tile.label })))
  const strays = loaded && floor ? orphanLines(lines, machineList) : []
  const filled = lines.filter((line) => Number(line.plannedQty) > 0)
  const usedMachines = new Set(filled.map((line) => `${line.area}|${line.resource.trim().toLowerCase()}`)).size
  const needs = React.useMemo(() => planMaterials(lines, recipes), [lines, recipes])
  const sameDayChange = Boolean(plan?.id) && date === todayIso()
  const closed = date < todayIso()

  const update = (lineKey: string, patch: Partial<PlanDraftLine>) => setLines((current) => current.map((line) => (line.key === lineKey ? { ...line, ...patch } : line)))
  const remove = (lineKey: string) => setLines((current) => current.filter((line) => line.key !== lineKey))
  const add = (area: PlanArea, resource: string) => setLines((current) => [...current, { key: newKey(), area, resource, item: '', plannedQty: '', unit: DEFAULT_UNIT[area] }])

  const save = async (reason: string | null = null) => {
    if (sameDayChange && !reason) {
      setAsking(true)
      return false
    }
    const body = { planDate: date, reason, notes: notes || null, lines: filled.map((line) => ({ area: line.area, resource: line.resource, item: line.item || null, plannedQty: Number(line.plannedQty), unit: line.unit })) }
    const saved = await send<PlanView>('/api/cc_production/plan', 'PUT', body, plan?.updatedAt ?? null)
    if (!saved) return false
    setPlan(saved)
    flash(t('cc_production.plan.saved', 'Plan saved.'), 'success')
    return true
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-16">
          <Link href="/backend/production" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('cc_production.floor.title', 'Production floor')}
          </Link>
          <header className="cc-band flex flex-wrap items-end justify-between gap-3 px-5 py-4">
            <div>
              <p className="cc-overline">{t('cc_production.planBoard.overline', 'Creative Carbon · plan for')}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">{new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('cc_production.planBoard.lede', 'Written the day before, because a die change takes a day. Each machine shows what it did yesterday. The Production floor compares today with this plan.')}</p>
            </div>
            <Input type="date" className="w-40" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
          </header>

          {!loaded || !floor ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="flex flex-col gap-6 xl:col-span-2">
                {sections.map((section) => (
                  <section key={section.area} className="space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold">{section.title}</h2>
                      <p className="text-xs text-muted-foreground">{section.hint}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {section.tiles.map((tile) => {
                        const own = linesForMachine(lines, section.area, tile.label)
                        return (
                          <div key={tile.key} className={cn('flex flex-col gap-2 rounded-md border p-3', own.some((line) => Number(line.plannedQty) > 0) ? 'border-status-info-border bg-status-info-bg' : 'border-border bg-card', tile.state === 'breakdown' && 'border-status-error-border bg-status-error-bg')}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-mono text-lg font-bold tabular-nums">{tile.label}{tile.sub ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{tile.sub}</span> : null}</span>
                              <span className="truncate text-xs text-muted-foreground" title={tile.detail}>{t('cc_production.planBoard.yesterday', 'Yesterday')}: {tile.detail}</span>
                            </div>
                            {tile.state === 'breakdown' && section.area !== 'resin' ? <p className="text-xs font-semibold text-status-error-text">{t('cc_production.planBoard.down', 'Marked out of order')}</p> : null}
                            {own.map((line) => (
                              <LineRow key={line.key} line={line} area={section.area} grades={grades} onChange={(patch) => update(line.key, patch)} onRemove={() => remove(line.key)} />
                            ))}
                            {closed ? null : (
                              <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => add(section.area, tile.label)}>
                                <Plus className="mr-1 size-4" aria-hidden="true" />
                                {own.length ? t('cc_production.planBoard.addMore', 'Add another') : t('cc_production.planBoard.plan', 'Plan this machine')}
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}

                {strays.length ? (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">{t('cc_production.planBoard.other', 'Other lines in this plan')}</h2>
                    <p className="text-xs text-muted-foreground">{t('cc_production.planBoard.otherHint', 'These were written with a machine name that is not in the machine list. They are kept; correct or remove them here.')}</p>
                    <div className="space-y-2 rounded-md border border-border bg-card p-3">
                      {strays.map((line) => (
                        <div key={line.key} className="grid grid-cols-12 items-center gap-1.5">
                          <select className={cn(selectClass, 'col-span-3')} value={line.area} onChange={(event) => update(line.key, { area: event.target.value as PlanArea, unit: DEFAULT_UNIT[event.target.value as PlanArea] })} aria-label="Area">
                            <option value="resin">Resin</option><option value="coating">Coating</option><option value="press">Press</option><option value="moulding">Moulding</option>
                          </select>
                          <Input className="col-span-2" value={line.resource} onChange={(event) => update(line.key, { resource: event.target.value })} aria-label="Machine" />
                          <Input className="col-span-3" value={line.item} onChange={(event) => update(line.key, { item: event.target.value })} aria-label="Item" />
                          <Input className="col-span-2 text-right" inputMode="decimal" value={line.plannedQty} onChange={(event) => update(line.key, { plannedQty: event.target.value })} aria-label="Planned" />
                          <span className="col-span-1 text-xs text-muted-foreground">{line.unit}</span>
                          <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => remove(line.key)} aria-label={t('cc_production.resin.removeLine', 'Remove row')}><Trash2 className="size-4" aria-hidden="true" /></Button>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>

              <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
                <section className="space-y-3 rounded-md border border-border bg-card p-4">
                  <h2 className="text-sm font-semibold">{t('cc_production.planBoard.summary', 'This plan')}</h2>
                  <p className="text-sm">{t('cc_production.planBoard.counts', '{lines} lines on {machines} machines', { lines: filled.length, machines: usedMachines })}</p>
                  <Input aria-label={t('cc_production.resin.notes', 'Remarks')} placeholder={t('cc_production.resin.notes', 'Remarks')} value={notes} onChange={(event) => setNotes(event.target.value)} />
                  <div className="flex flex-wrap items-center gap-2">
                    {closed ? <span className="text-xs text-muted-foreground">{t('cc_production.plan.closedHint', 'The day is over; the plan is kept as it was.')}</span> : null}
                    {plan?.id ? <Button asChild variant="ghost" size="sm"><Link href={`/backend/owner/plan/${date}`}>{t('cc_production.planBoard.history', 'Versions')}</Link></Button> : null}
                    <Button type="button" className="ml-auto" disabled={closed} onClick={() => void save()}>{t('cc_production.resin.save', 'Save')}</Button>
                  </div>
                </section>

                <section className="space-y-2 rounded-md border border-border bg-card p-4">
                  <h2 className="text-sm font-semibold">{t('cc_production.planBoard.needs', 'Raw material this plan needs')}</h2>
                  {needs.needs.length ? (
                    <ul className="divide-y divide-border text-sm">
                      {needs.needs.map((need) => (
                        <li key={need.productId} className="flex items-baseline justify-between gap-3 py-1.5"><span>{need.title}</span><span className="font-mono tabular-nums">{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(need.kg)} kg</span></li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{recipes.length ? t('cc_production.planBoard.needsNone', 'Plan a die or a recipe by name and the raw material it needs shows here.') : t('cc_production.planBoard.needsNoRecipes', 'No recipes yet. Add them under Raw material → Recipes and this fills in.')}</p>
                  )}
                  {needs.unmatched.length ? <p className="text-xs text-muted-foreground">{t('cc_production.planBoard.unmatched', 'No recipe worked out for: {list}', { list: needs.unmatched.join(', ') })}</p> : null}
                </section>
              </aside>
            </div>
          )}
        </div>
        <CorrectDialog
          open={asking}
          onOpenChange={setAsking}
          destructive={false}
          title={t('cc_production.plan.changeTitle', 'Change today’s plan')}
          description={t('cc_production.plan.changeHint', 'The plan is changed on the day itself. The old plan is kept as an earlier version.')}
          confirmLabel={t('cc_production.resin.save', 'Save')}
          onConfirm={(reason) => save(reason)}
        />
      </PageBody>
    </Page>
  )
}
