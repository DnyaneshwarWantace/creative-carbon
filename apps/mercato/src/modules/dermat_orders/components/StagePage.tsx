"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { History, Info, Layers, ListChecks, Package } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { stageDef } from '../lib/stages'
import { StageWorkArea, type StageActionRequest } from './StageSheet'
import { useOrderMaterials } from './useOrderMaterials'
import { useStageAction } from './useStageAction'
import type { Order, Stage } from './types'
import { useStageSettings } from './useStageSettings'
import { BeforeStagePanel } from './stage/BeforeStagePanel'
import { LockedStagePanel } from './stage/LockedStagePanel'
import { StageBar } from './stage/StageBar'
import { StageContext } from './stage/StageNeeds'
import { StageHistoryPanel } from './stage/StageHistoryPanel'
import { StagePageHeader } from './stage/StagePageHeader'
import { StagePanel } from './stage/StagePanel'

function useStageOrder(orderId: string) {
  const t = useT()
  const [order, setOrder] = React.useState<Order | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([])

  const load = React.useCallback(async () => {
    const call = await apiCall<Order>(`/api/dermat_orders/orders?id=${encodeURIComponent(orderId)}`)
    if (!call.ok || !call.result) {
      setError(t('dermat_orders.errors.load', 'Could not load the order.'))
      return
    }
    setOrder(call.result)
  }, [orderId, t])

  React.useEffect(() => {
    void load()
    apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/dermat_orders/people', undefined, { fallback: { items: [] } }).then((call) => setPeople(call.result?.items ?? []))
  }, [load])

  return { order, setOrder, error, people, load }
}

export function StagePage({ orderId, stageKey }: { orderId: string; stageKey: string }) {
  const t = useT()
  useStageSettings()
  const router = useRouter()
  const { order, setOrder, error, people, load } = useStageOrder(orderId)
  const runner = useStageAction(`dermat-stage-page-${orderId}-${stageKey}`)
  const def = stageDef(stageKey)
  const stage = order?.stages.find((entry) => entry.key === stageKey) ?? null
  const materials = useOrderMaterials(order && !stage?.locked && (stageKey === 'planning' || stageKey === 'manufacturing') ? order : null)

  const onAction = async (target: Stage, request: StageActionRequest): Promise<boolean> => {
    if (!order) return false
    const result = await runner.run(order, target, request)
    if (result.order) {
      setOrder(result.order)
      if (request.action === 'complete' || request.action === 'skip') {
        const nextOpen = result.order.stages.find((entry) => !entry.locked && entry.status === 'open' && order.stages.find((before) => before.key === entry.key)?.status === 'waiting')
        if (nextOpen) router.push(`/backend/orders/${order.id}/stages/${nextOpen.key}`)
      }
      return true
    }
    if (result.conflict) await load()
    return false
  }

  if (!def) return <Page><PageBody><ErrorMessage label={t('dermat_orders.stagePage.unknown', 'Unknown stage.')} /></PageBody></Page>
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!order || !stage) return <Page><PageBody><LoadingMessage label={t('dermat_orders.loading', 'Loading order…')} /></PageBody></Page>

  const history = order.events.filter((event) => event.stageKey === stageKey)
  const openedNext = order.stages.filter((entry) => stageDef(entry.key)?.after.includes(stageKey))
  const shortCount = materials ? materials.rows.filter((row) => row.quantity > row.onHand).length : null

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-16">
          <StagePageHeader order={order} stage={stage} def={def} />
          <StageBar order={order} current={stageKey} />

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
            <StagePanel className="lg:col-span-8" title={stage.locked ? t('dermat_orders.stagePage.where', 'Where this stage is') : t('dermat_orders.stagePage.work', 'Your work on this stage')} icon={<ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />}>
              {stage.locked ? (
                <LockedStagePanel stage={stage} />
              ) : (
                <StageWorkArea order={order} stage={stage} people={people} canWork busy={runner.busy} shortCount={shortCount} onAction={onAction} variant="page" />
              )}
              {!stage.locked && stage.status === 'done' && openedNext.length ? (
                <div className="border-t bg-status-success-bg px-4 py-3 text-sm text-status-success-text">
                  {t('dermat_orders.stagePage.movedOn', 'Moved on to: ')}
                  {openedNext.map((entry, position) => (
                    <React.Fragment key={entry.key}>
                      {position > 0 ? ', ' : ''}
                      <Link href={`/backend/orders/${order.id}/stages/${entry.key}`} className="font-semibold underline">
                        {entry.label} ({entry.department})
                      </Link>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
            </StagePanel>

            <div className="flex flex-col gap-4 lg:col-span-4">
              {!stage.locked ? (
                <StagePanel
                  title={t('dermat_orders.stagePage.needs', 'What this stage needs')}
                  icon={stageKey === 'planning' || stageKey === 'manufacturing' ? <Layers className="size-4 text-muted-foreground" aria-hidden="true" /> : <Package className="size-4 text-muted-foreground" aria-hidden="true" />}
                  bodyClassName="p-4"
                >
                  <StageContext order={order} stage={stage} materials={materials} />
                </StagePanel>
              ) : null}
              {def.after.length ? (
                <StagePanel title={t('dermat_orders.stagePage.before', 'Before this stage')} icon={<Info className="size-4 text-muted-foreground" aria-hidden="true" />}>
                  <BeforeStagePanel order={order} def={def} />
                </StagePanel>
              ) : null}
              {!stage.locked ? (
                <StagePanel title={t('dermat_orders.stagePage.history', 'History of this stage')} icon={<History className="size-4 text-muted-foreground" aria-hidden="true" />}>
                  <StageHistoryPanel events={history} />
                </StagePanel>
              ) : null}
            </div>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default StagePage
