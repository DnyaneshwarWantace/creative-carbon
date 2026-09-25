import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands/registry'
import { clearReservations, reserveForOrders } from '../lib/planning'
import type { WorkflowScope } from '../lib/engine'

export type ReservationCommandInput = WorkflowScope & {
  action: 'reserve' | 'clear'
  orderIds: string[]
  actorName?: string | null
}

export type ReservationCommandResult = { reservedLines: number; shortMaterials: number; released: number }

const reservationCommand: CommandHandler<ReservationCommandInput, ReservationCommandResult> = {
  id: 'dermat_workflow.reservations.action',
  async execute(input, ctx) {
    const scope = { organizationId: input.organizationId, tenantId: input.tenantId }
    const actor = input.actorName || ctx.auth?.email || ctx.auth?.sub || 'User'
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return em.transactional(async (tem) => {
      if (input.action === 'clear') {
        const released = await clearReservations(tem, scope, input.orderIds, actor)
        return { reservedLines: 0, shortMaterials: 0, released }
      }
      const result = await reserveForOrders(tem, scope, input.orderIds, actor)
      return { ...result, released: 0 }
    })
  },
}

registerCommand(reservationCommand)

export default reservationCommand
