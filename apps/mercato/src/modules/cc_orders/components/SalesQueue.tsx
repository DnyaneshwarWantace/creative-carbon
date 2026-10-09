"use client"

import * as React from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { stageDef } from '../lib/stages'
import { PageLoading } from '../../cc_ui/components/PageLoading'

type Kind = 'client_hold' | 'advance' | 'delivery_late' | 'delivery_soon' | 'not_delivered'
type Task = { kind: Kind; orderId: string; orderNo: string; customer: string | null; priority: string; stageKey: string | null; detail: string; days: number | null }

const GROUPS: Array<{ kind: Kind; title: string; hint: string; tone: 'error' | 'warning' | 'info' }> = [
  { kind: 'delivery_late', title: 'Delivery late', hint: 'Tell the customer the new date or push the plant', tone: 'error' },
  { kind: 'client_hold', title: 'On hold with the customer', hint: 'Follow up with the customer to unblock the stage', tone: 'error' },
  { kind: 'advance', title: 'Advance / LC not received', hint: 'Chase the advance or the letter of credit', tone: 'warning' },
  { kind: 'delivery_soon', title: 'Delivery due this week', hint: 'Check stock is allocated and the order will make it', tone: 'info' },
  { kind: 'not_delivered', title: 'Despatched, delivery not confirmed', hint: 'Confirm with the customer and mark delivered', tone: 'info' },
]

export function SalesQueue() {
  const t = useT()
  const [tasks, setTasks] = React.useState<Task[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [mine, setMine] = React.useState('')

  React.useEffect(() => {
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ tasks?: Task[]; error?: string }>(`/api/cc_orders/sales-queue${mine.trim() ? `?mine=${encodeURIComponent(mine.trim())}` : ''}`)
      if (!call.ok) setError(call.result?.error ?? t('cc_orders.salesQueue.loadError', 'Could not load the sales queue.'))
      else {
        setError(null)
        setTasks(call.result?.tasks ?? [])
      }
    }, mine ? 300 : 0)
    return () => window.clearTimeout(handle)
  }, [mine, t])

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_orders.salesQueue.title', 'Sales work queue')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_orders.salesQueue.lede', 'Everything waiting on Sales: the client, the advance, samples, artwork and deliveries. Urgent orders first, oldest first.')}</p>
            </div>
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={mine} onChange={(event) => setMine(event.target.value)} placeholder={t('cc_orders.salesQueue.mine', 'Filter by sales person')} className="pl-9" aria-label={t('cc_orders.salesQueue.mine', 'Filter by sales person')} />
            </div>
          </header>
          {error ? <ErrorMessage label={error} /> : null}
          {!tasks && !error ? <PageLoading label={t('cc_orders.salesQueue.loading', 'Loading…')} /> : null}
          {tasks && !tasks.length ? <p className="rounded-lg border bg-card p-6 text-sm text-status-success-text">{t('cc_orders.salesQueue.empty', 'Nothing is waiting on Sales right now.')}</p> : null}
          {tasks ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {GROUPS.map((group) => {
                const items = tasks.filter((task) => task.kind === group.kind)
                if (!items.length) return null
                return (
                  <section key={group.kind} className="rounded-lg border bg-card" aria-labelledby={`sales-${group.kind}`}>
                    <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
                      <div>
                        <h2 id={`sales-${group.kind}`} className="text-sm font-semibold">
                          {group.title}
                        </h2>
                        <p className="text-xs text-muted-foreground">{group.hint}</p>
                      </div>
                      <StatusBadge variant={group.tone}>{items.length}</StatusBadge>
                    </header>
                    <ul className="divide-y">
                      {items.map((task, index) => (
                        <li key={`${task.orderId}-${index}`} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/30">
                          <div className="min-w-0">
                            <Link href={task.stageKey ? `/backend/orders/${task.orderId}?stage=${task.stageKey}` : `/backend/orders/${task.orderId}`} className="font-mono font-medium hover:underline">
                              {task.orderNo}
                            </Link>
                            {task.priority === 'urgent' ? <span className="ml-2 rounded-sm bg-status-error-bg px-1.5 py-0.5 text-xs font-medium text-status-error-text">{t('cc_orders.priority.urgent', 'Urgent')}</span> : null}
                            <span className="ml-2 text-muted-foreground">{task.customer ?? ''}</span>
                            <p className="truncate text-xs text-muted-foreground">
                              {task.stageKey ? `${stageDef(task.stageKey)?.label ?? task.stageKey}: ` : ''}
                              {task.detail}
                            </p>
                          </div>
                          {task.days !== null ? (
                            <span className={cn('shrink-0 text-xs tabular-nums', (task.days ?? 0) > 7 ? 'font-medium text-status-error-text' : 'text-muted-foreground')}>
                              {group.kind === 'delivery_soon' ? t('cc_orders.salesQueue.inDays', 'in {days} d', { days: task.days }) : t('cc_orders.salesQueue.days', '{days} d', { days: task.days })}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

export default SalesQueue
