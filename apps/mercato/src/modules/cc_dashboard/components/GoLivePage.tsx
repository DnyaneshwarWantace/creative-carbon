"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, CircleAlert, Rocket } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'

type State = 'done' | 'warn' | 'todo'
type Check = { key: string; group: string; title: string; state: State; detail: string; href: string | null; manual?: boolean; confirmedBy?: string | null; confirmedAt?: string | null }
type Report = { cutoverDate: string | null; targetDays: number; done: number; total: number; percent: number; checks: Check[] }

const ICON: Record<State, React.ReactNode> = {
  done: <CheckCircle2 className="h-5 w-5 text-status-success-icon" aria-hidden="true" />,
  warn: <CircleAlert className="h-5 w-5 text-status-warning-icon" aria-hidden="true" />,
  todo: <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />,
}

export function GoLivePage() {
  const t = useT()
  const granted = useGranted()
  const canEdit = granted.has('cc_dashboard.golive')
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: 'cc-golive' })
  const [report, setReport] = React.useState<Report | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [cutover, setCutover] = React.useState('')
  const [target, setTarget] = React.useState('')

  const load = React.useCallback(async () => {
    const call = await apiCall<Report>('/api/cc_dashboard/golive')
    if (!call.ok || !call.result) return flash(t('cc_dashboard.golive.loadError', 'Could not load the checklist.'), 'error')
    setReport(call.result)
    setCutover(call.result.cutoverDate ?? '')
    setTarget(String(call.result.targetDays))
  }, [t])

  React.useEffect(() => {
    void load()
  }, [load])

  const update = async (body: Record<string, unknown>, success: string) => {
    setBusy(true)
    try {
      const call = await runMutation({
        context: { formId: 'cc-golive', resourceKind: 'cc_dashboard.golive', resourceId: 'golive', retryLastMutation },
        mutationPayload: body,
        operation: () => apiCall<Report & { error?: string }>('/api/cc_dashboard/golive', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result) return flash(call.result?.error ?? t('cc_dashboard.golive.saveError', 'Could not save.'), 'error')
      setReport(call.result)
      flash(success, 'success')
    } finally {
      setBusy(false)
    }
  }

  if (!report) {
    return (
      <Page>
        <PageBody>
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        </PageBody>
      </Page>
    )
  }

  const groups = [...new Set(report.checks.map((check) => check.group))]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-5xl space-y-5">
          <header className="space-y-3 border-b pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                  <Rocket className="h-6 w-6 text-primary" aria-hidden="true" />
                  {t('cc_dashboard.golive.title', 'Go-live')}
                </h1>
                <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_dashboard.golive.lede', 'Everything that has to be true before the paper books stop. Most items check themselves from the live data; the on-site ones are ticked by the person who did them.')}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums">{report.percent}%</p>
                <p className="text-xs text-muted-foreground">{t('cc_dashboard.golive.count', '{done} of {total} done', { done: report.done, total: report.total })}</p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className={cn('h-full rounded-full', report.percent === 100 ? 'bg-status-success-icon' : 'bg-primary')} style={{ width: `${report.percent}%` }} />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="golive-cutover" className="text-xs text-muted-foreground">{t('cc_dashboard.golive.cutover', 'Cutover day')}</Label>
                <Input id="golive-cutover" type="date" className="w-44" value={cutover} disabled={!canEdit} onChange={(event) => setCutover(event.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="golive-target" className="text-xs text-muted-foreground">{t('cc_dashboard.golive.target', 'Parallel run: days in a row that must agree')}</Label>
                <Input id="golive-target" type="number" min={1} max={90} className="w-28" value={target} disabled={!canEdit} onChange={(event) => setTarget(event.target.value)} />
              </div>
              {canEdit ? (
                <Button type="button" variant="outline" disabled={busy || (cutover === (report.cutoverDate ?? '') && target === String(report.targetDays))} onClick={() => void update({ cutoverDate: cutover || null, targetDays: Number(target) || report.targetDays }, t('cc_dashboard.golive.saved', 'Saved'))}>
                  {t('cc_dashboard.golive.save', 'Save')}
                </Button>
              ) : null}
            </div>
          </header>

          {groups.map((group) => (
            <section key={group} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{t(`cc_dashboard.golive.group.${group}`, group)}</h2>
              <ul className="divide-y rounded-lg border bg-card">
                {report.checks
                  .filter((check) => check.group === group)
                  .map((check) => (
                    <li key={check.key} className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <span className="mt-0.5">{ICON[check.state]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{check.title}</p>
                        <p className={cn('text-xs', check.state === 'warn' ? 'text-status-warning-text' : 'text-muted-foreground')}>{check.detail}</p>
                        {check.manual && check.confirmedAt ? (
                          <p className="text-xs text-muted-foreground">{t('cc_dashboard.golive.ticked', 'Ticked by {by} on {date}', { by: check.confirmedBy ?? '—', date: check.confirmedAt.slice(0, 10) })}</p>
                        ) : null}
                      </div>
                      {check.manual && canEdit ? (
                        <Button type="button" size="sm" variant={check.state === 'done' ? 'ghost' : 'outline'} disabled={busy} onClick={() => void update({ confirm: { key: check.key, done: check.state !== 'done' } }, check.state === 'done' ? t('cc_dashboard.golive.unticked', 'Unticked') : t('cc_dashboard.golive.tickedOk', 'Ticked'))}>
                          {check.state === 'done' ? t('cc_dashboard.golive.undo', 'Undo') : t('cc_dashboard.golive.tick', 'Mark done')}
                        </Button>
                      ) : check.href ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={check.href}>
                            {check.state === 'done' ? t('cc_dashboard.golive.open', 'Open') : t('cc_dashboard.golive.fix', 'Do it')}
                            <ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </PageBody>
    </Page>
  )
}

export default GoLivePage
