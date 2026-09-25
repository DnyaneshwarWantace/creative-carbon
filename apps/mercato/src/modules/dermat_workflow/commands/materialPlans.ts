import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands/registry'
import type { ReservationMaterialKind } from '../data/entities'
import type { WorkflowScope } from '../lib/engine'
import {
  cancelStoreRequest,
  clearPlanReservations,
  issueStoreRequest,
  reserveForPlan,
  savePlan,
  sendStoreRequest,
  type PlanItemInput,
} from '../lib/materialPlans'

type Actor = { actorName?: string | null }

export type MaterialPlanSaveInput = WorkflowScope & Actor & {
  planId?: string | null
  name?: string | null
  notes?: string | null
  items: PlanItemInput[]
}

export type MaterialPlanActionInput = WorkflowScope & Actor & {
  planId: string
  action: 'reserve' | 'clear' | 'send_request' | 'cancel_request'
  store?: ReservationMaterialKind | null
  requestId?: string | null
  notes?: string | null
}

export type MaterialPlanActionResult = {
  reservedLines?: number
  shortMaterials?: number
  released?: number
  requestId?: string
  requestNumber?: string
}

export type MaterialRequestIssueInput = WorkflowScope & Actor & {
  requestId: string
  lines: Array<{ lineId: string; issuedQty: number }>
}

function actorOf(input: Actor, ctx: { auth?: { email?: string | null; sub?: string | null } | null }): string {
  return input.actorName || ctx.auth?.email || ctx.auth?.sub || 'User'
}

function scopeOf(input: WorkflowScope): WorkflowScope {
  return { organizationId: input.organizationId, tenantId: input.tenantId }
}

const saveCommand: CommandHandler<MaterialPlanSaveInput, { id: string; planNumber: string }> = {
  id: 'dermat_workflow.material_plan.save',
  async execute(input, ctx) {
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return em.transactional(async (tem) => {
      const plan = await savePlan(tem, scopeOf(input), input, actorOf(input, ctx))
      return { id: plan.id, planNumber: plan.planNumber }
    })
  },
}

const actionCommand: CommandHandler<MaterialPlanActionInput, MaterialPlanActionResult> = {
  id: 'dermat_workflow.material_plan.action',
  async execute(input, ctx) {
    const scope = scopeOf(input)
    const actor = actorOf(input, ctx)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return em.transactional(async (tem) => {
      if (input.action === 'reserve') return reserveForPlan(tem, scope, input.planId, actor)
      if (input.action === 'clear') return { released: await clearPlanReservations(tem, scope, input.planId, actor) }
      if (input.action === 'send_request') {
        const request = await sendStoreRequest(tem, scope, input.planId, input.store ?? 'raw_material', actor, input.notes)
        return { requestId: request.id, requestNumber: request.requestNumber }
      }
      const request = await cancelStoreRequest(tem, scope, input.requestId ?? '')
      return { requestId: request.id, requestNumber: request.requestNumber }
    })
  },
}

const issueCommand: CommandHandler<MaterialRequestIssueInput, { requestId: string; requestNumber: string }> = {
  id: 'dermat_workflow.material_request.issue',
  async execute(input, ctx) {
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return em.transactional(async (tem) => {
      const request = await issueStoreRequest(tem, scopeOf(input), input.requestId, input.lines, actorOf(input, ctx))
      return { requestId: request.id, requestNumber: request.requestNumber }
    })
  },
}

registerCommand(saveCommand)
registerCommand(actionCommand)
registerCommand(issueCommand)

export default saveCommand
