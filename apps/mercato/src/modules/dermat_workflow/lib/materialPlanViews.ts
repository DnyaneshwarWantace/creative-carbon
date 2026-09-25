import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import type { MaterialRequest } from '../data/entities'
import type { WorkflowScope } from './engine'
import { calculatePlan, findPlan, planItems, planRequests, toItemInput } from './materialPlans'

export const planItemSchema = z.object({
  bomId: z.string().uuid(),
  quantityPcs: z.coerce.number().min(0),
  packSizeGrams: z.coerce.number().positive().nullable().optional(),
  bulkKg: z.coerce.number().positive().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
  orderNumber: z.string().nullable().optional(),
})

export const planSaveSchema = z.object({
  name: z.string().max(200).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  items: z.array(planItemSchema).max(100),
})

export function serializeRequest(request: MaterialRequest) {
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    planId: request.planId,
    planNumber: request.planNumber ?? null,
    store: request.store,
    status: request.status,
    requestedBy: request.requestedBy ?? null,
    issuedBy: request.issuedBy ?? null,
    issuedAt: request.issuedAt ? request.issuedAt.toISOString() : null,
    notes: request.notes ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  }
}

export async function planDetail(em: EntityManager, scope: WorkflowScope, planId: string) {
  const plan = await findPlan(em, scope, planId)
  const [items, requests] = await Promise.all([planItems(em, scope, planId), planRequests(em, scope, planId)])
  const calculation = await calculatePlan(em, scope, items.map(toItemInput), plan.id)
  return {
    plan: {
      id: plan.id,
      planNumber: plan.planNumber,
      name: plan.name ?? null,
      notes: plan.notes ?? null,
      status: plan.status,
      createdBy: plan.createdBy ?? null,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    },
    ...calculation,
    requests: requests.map(serializeRequest),
  }
}
