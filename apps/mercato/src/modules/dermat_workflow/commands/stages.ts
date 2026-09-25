import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { registerCommand } from '@open-mercato/shared/lib/commands/registry'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { StageDefinition } from '../data/entities'
import type { StageFieldDefinition, StageDefinitionConfig } from '../data/entities'
import { performStageAction, type StageActionInput, type WorkflowScope } from '../lib/engine'

export type StageActionCommandInput = StageActionInput & WorkflowScope
export type StageActionCommandResult = { ok: true; stageCode: string | null }

const stageActionCommand: CommandHandler<StageActionCommandInput, StageActionCommandResult> = {
  id: 'dermat_workflow.stage.action',
  async execute(input, ctx) {
    const { organizationId, tenantId, ...action } = input
    if (!organizationId || !tenantId) throw new CrudHttpError(400, { error: '[internal] Scope is required' })
    return performStageAction(ctx, { organizationId, tenantId }, action)
  },
}

export type StageDefinitionUpdateInput = WorkflowScope & {
  id: string
  name?: string
  department?: string
  sequence?: number
  unit?: string | null
  phaseLabel?: string | null
  isOptional?: boolean
  isActive?: boolean
  fields?: StageFieldDefinition[]
  config?: StageDefinitionConfig
}

const stageDefinitionUpdateCommand: CommandHandler<StageDefinitionUpdateInput, { id: string }> = {
  id: 'dermat_workflow.stage_definition.update',
  async execute(input, ctx) {
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const definition = await em.findOne(StageDefinition, {
      id: input.id,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      deletedAt: null,
    })
    if (!definition) throw new CrudHttpError(404, { error: '[internal] Stage not found' })
    if (input.name !== undefined) definition.name = input.name
    if (input.department !== undefined) definition.department = input.department
    if (input.sequence !== undefined) definition.sequence = input.sequence
    if (input.unit !== undefined) definition.unit = input.unit
    if (input.phaseLabel !== undefined) definition.phaseLabel = input.phaseLabel
    if (input.isOptional !== undefined) definition.isOptional = input.isOptional
    if (input.isActive !== undefined) {
      if (definition.isAutomatic && !input.isActive) {
        throw new CrudHttpError(422, { error: '[internal] The Production stage cannot be switched off' })
      }
      definition.isActive = input.isActive
    }
    if (input.fields !== undefined) definition.fields = input.fields
    if (input.config !== undefined) definition.config = input.config
    await em.flush()
    return { id: definition.id }
  },
}

registerCommand(stageActionCommand)
registerCommand(stageDefinitionUpdateCommand)

export default stageActionCommand
