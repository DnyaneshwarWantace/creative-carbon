import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../data/entities'
import { QcCheck } from '../../dermat_quality/data/entities'
import { StoreRequest, StoreRequestLine } from '../../dermat_store/data/entities'
import { awaitingReceipt } from '../../dermat_store/lib/service'
import { loadCustomers, loadProducts, type OrderContext } from './server'
import { stepStates } from './stages'

export const BOARD_COLUMNS = [
  { key: 'mfg_store', label: 'Material from RM store', stage: 'manufacturing' },
  { key: 'mfg_work', label: 'Manufacturing', stage: 'manufacturing' },
  { key: 'mfg_qc', label: 'Bulk QC', stage: 'manufacturing' },
  { key: 'fill_store', label: 'Bottles from PM store', stage: 'filling' },
  { key: 'fill_work', label: 'Filling', stage: 'filling' },
  { key: 'fill_qc', label: 'Filling QC', stage: 'filling' },
  { key: 'pack_sample', label: 'FG sample', stage: 'packing' },
  { key: 'pack_qc', label: 'Packing QC', stage: 'packing' },
  { key: 'pack_work', label: 'Packing', stage: 'packing' },
  { key: 'qa', label: 'QA release', stage: 'qc_qa' },
] as const

type ColumnKey = (typeof BOARD_COLUMNS)[number]['key']

const DAY_MS = 86400000

export async function productionBoard(ctx: OrderContext) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const openStages = await ctx.em.find(DermatOrderStage, { ...scope, stageKey: { $in: ['manufacturing', 'filling', 'packing', 'qc_qa'] }, status: { $in: ['open', 'on_hold'] } })
  const orderIds = [...new Set(openStages.map((stage) => stage.orderId))]
  const planned = await ctx.em.find(DermatOrderStage, { ...scope, stageKey: { $in: ['planning', 'manufacturing'] } }, { limit: 1000 })
  const scheduleIds = [...new Set(planned.filter((stage) => stage.data?.planned_for || stage.data?.mfg_date).map((stage) => stage.orderId))]
  const allIds = [...new Set([...orderIds, ...scheduleIds])]
  if (!allIds.length) return { columns: BOARD_COLUMNS, cards: [], schedule: [] }
  const [orders, lines, requests, checks, allStages] = await Promise.all([
    ctx.em.find(DermatOrder, { id: { $in: allIds }, ...scope, deletedAt: null, status: { $nin: ['cancelled'] } }),
    ctx.em.find(DermatOrderLine, { orderId: { $in: allIds } }, { orderBy: { position: 'asc' } }),
    ctx.em.find(StoreRequest, { orderId: { $in: orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'] }, ...scope, status: { $ne: 'cancelled' } }),
    ctx.em.find(QcCheck, { orderId: { $in: orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'] }, ...scope }),
    ctx.em.find(DermatOrderStage, { orderId: { $in: allIds } }),
  ])
  const requestLines = requests.length ? await ctx.em.find(StoreRequestLine, { requestId: { $in: requests.map((request) => request.id) } }) : []
  const [customers, products] = await Promise.all([loadCustomers(ctx, orders.map((order) => order.customerId)), loadProducts(ctx, lines.map((line) => line.productId))])

  const storeDone = (orderId: string, stageKey: string) => {
    const own = requests.filter((request) => request.orderId === orderId && request.stageKey === stageKey)
    return own.length > 0 && own.every((request) => (request.status === 'received' || request.status === 'used') && !awaitingReceipt(requestLines.filter((line) => line.requestId === request.id)))
  }
  const storeNote = (orderId: string, stageKey: string) => {
    const own = requests.filter((request) => request.orderId === orderId && request.stageKey === stageKey)
    if (!own.length) return 'Not asked from the store yet'
    return own.map((request) => `${request.code} ${awaitingReceipt(requestLines.filter((line) => line.requestId === request.id)) && request.status !== 'requested' ? 'sent, not received' : request.status.replace('_', ' ')}`).join(' · ')
  }
  const qcState = (orderId: string, stageKey: string): 'none' | 'pending' | 'failed' | 'passed' => {
    const own = checks.filter((check) => check.orderId === orderId && check.stageKey === stageKey && check.status !== 'reworked' && check.status !== 'rejected')
    if (!own.length) return 'none'
    if (own.some((check) => check.status === 'failed')) return 'failed'
    if (own.every((check) => check.status === 'passed')) return 'passed'
    return 'pending'
  }

  const cards = []
  for (const stage of openStages) {
    const order = orders.find((entry) => entry.id === stage.orderId)
    if (!order) continue
    const ticks = stepStates(stage.data)
    const mfg = allStages.find((entry) => entry.orderId === order.id && entry.stageKey === 'manufacturing')?.data ?? {}
    let column: ColumnKey
    let note: string | null = null
    if (stage.stageKey === 'manufacturing') {
      const reusing = stage.data?.bulk_source === 'Use bulk already made'
      if (!reusing && !storeDone(order.id, 'manufacturing')) {
        column = 'mfg_store'
        note = storeNote(order.id, 'manufacturing')
      } else if (!ticks.manufactured?.done) column = 'mfg_work'
      else {
        column = 'mfg_qc'
        const state = qcState(order.id, 'manufacturing')
        note = state === 'failed' ? 'QC failed: rework or reject' : state === 'passed' ? 'QC passed, complete the stage' : 'Waiting for chemical / micro results'
      }
    } else if (stage.stageKey === 'filling') {
      if (!storeDone(order.id, 'filling')) {
        column = 'fill_store'
        note = storeNote(order.id, 'filling')
      } else if (!ticks.filled?.done) column = 'fill_work'
      else {
        column = 'fill_qc'
        const state = qcState(order.id, 'filling')
        note = state === 'none' ? 'No filling QC: complete the stage' : state === 'failed' ? 'QC failed' : state === 'passed' ? 'QC passed' : 'Waiting for QC'
      }
    } else if (stage.stageKey === 'packing') {
      if (!ticks.sample?.done) column = 'pack_sample'
      else if (qcState(order.id, 'packing') === 'pending' || qcState(order.id, 'packing') === 'failed') {
        column = 'pack_qc'
        note = qcState(order.id, 'packing') === 'failed' ? 'QC failed' : 'Waiting for FG QC'
      } else column = 'pack_work'
    } else {
      column = 'qa'
      note = typeof stage.data?.qc_result === 'string' ? `Decision: ${stage.data.qc_result}` : null
    }
    const own = lines.filter((line) => line.orderId === order.id)
    cards.push({
      orderId: order.id,
      orderNo: order.orderNo,
      customer: customers.get(order.customerId)?.name ?? null,
      priority: order.priority,
      column,
      stageKey: stage.stageKey,
      onHold: stage.status === 'on_hold',
      holdReason: stage.holdReason ?? null,
      batchNo: typeof mfg.batch_no === 'string' || typeof mfg.batch_no === 'number' ? String(mfg.batch_no) : own[0]?.batchNo ?? null,
      products: own.map((line) => ({ title: products.get(line.productId)?.title ?? '', quantity: Number(line.quantity) })),
      responsibleName: stage.responsibleName ?? null,
      days: stage.openedAt ? Math.floor((Date.now() - stage.openedAt.getTime()) / DAY_MS) : null,
      deliveryDate: order.deliveryDate ?? null,
      note,
    })
  }
  cards.sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || String(a.deliveryDate ?? '9999').localeCompare(String(b.deliveryDate ?? '9999')))

  const schedule = []
  for (const order of orders) {
    const planning = allStages.find((entry) => entry.orderId === order.id && entry.stageKey === 'planning')?.data ?? {}
    const manufacturing = allStages.find((entry) => entry.orderId === order.id && entry.stageKey === 'manufacturing')
    const mfgData = manufacturing?.data ?? {}
    const date = (typeof mfgData.mfg_date === 'string' && mfgData.mfg_date) || (typeof planning.planned_for === 'string' && planning.planned_for) || null
    if (!date) continue
    const own = lines.filter((line) => line.orderId === order.id)
    schedule.push({
      orderId: order.id,
      orderNo: order.orderNo,
      customer: customers.get(order.customerId)?.name ?? null,
      priority: order.priority,
      date,
      vessel: (typeof mfgData.machine === 'string' && mfgData.machine) || (typeof planning.planned_vessel === 'string' && planning.planned_vessel) || null,
      batchNo: typeof mfgData.batch_no === 'string' || typeof mfgData.batch_no === 'number' ? String(mfgData.batch_no) : own[0]?.batchNo ?? null,
      kg: typeof mfgData.batch_size === 'number' || typeof mfgData.batch_size === 'string' ? Number(mfgData.batch_size) : null,
      products: own.map((line) => products.get(line.productId)?.title ?? '').filter(Boolean),
      state: manufacturing?.status === 'done' ? 'made' : manufacturing?.status === 'open' || manufacturing?.status === 'on_hold' ? 'in_progress' : 'planned',
    })
  }
  return { columns: BOARD_COLUMNS, cards, schedule }
}
