import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { listDefinitions, serializeDefinition } from '../../lib/engine'
import { resolveWorkflowRequest, withMutationGuards, workflowErrorResponse } from '../../lib/request'
import type { StageDefinitionUpdateInput } from '../../commands/stages'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_workflow.stages.manage'] },
}

export async function GET(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const includeInactive = new URL(req.url).searchParams.get('includeInactive') === 'true'
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const items = await listDefinitions(em, scope, { includeInactive })
    return NextResponse.json({ items: items.map(serializeDefinition) })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.definitions.list')
  }
}

const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'checkbox']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  unit: z.string().nullable().optional(),
})

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  sequence: z.number().int().optional(),
  unit: z.string().nullable().optional(),
  phaseLabel: z.string().nullable().optional(),
  isOptional: z.boolean().optional(),
  isActive: z.boolean().optional(),
  fields: z.array(fieldSchema).optional(),
  config: z
    .object({
      qcParameters: z
        .array(z.object({ parameter: z.string().min(1), classification: z.string(), specification: z.string() }))
        .optional(),
    })
    .optional(),
})

export async function PUT(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const body = updateSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    const result = await withMutationGuards(
      req,
      ctx,
      { resourceKind: 'dermat_workflow.stage_definition', resourceId: body.id, operation: 'update' },
      async () => {
        const commandBus = ctx.container.resolve<CommandBus>('commandBus')
        await commandBus.execute<StageDefinitionUpdateInput, { id: string }>('dermat_workflow.stage_definition.update', {
          input: { ...scope, ...body },
          ctx,
        })
        return { ok: true as const }
      },
    )
    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.definitions.update')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Workflow stage definitions',
  methods: {
    GET: {
      summary: 'List stage definitions',
      description: 'Order and production stages in sequence, with their department, form fields and QC parameters. Seeds the Dermat defaults on first use.',
      responses: [{ status: 200, description: 'Definitions', schema: z.object({ items: z.array(z.object({ id: z.string(), code: z.string() }).passthrough()) }) }],
    },
    PUT: {
      summary: 'Update a stage definition',
      description: 'Rename a stage, change its department, switch it on/off, mark it optional, and edit its form fields or QC parameters.',
      requestBody: { contentType: 'application/json', schema: updateSchema },
      responses: [{ status: 200, description: 'Updated', schema: z.object({ ok: z.boolean() }) }],
    },
  },
}
