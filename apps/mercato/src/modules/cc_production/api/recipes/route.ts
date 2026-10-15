import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../cc_orders/lib/server'
import { recipeListSchema, recipeWriteSchema } from '../../data/validators'
import { findRecipe, listRecipes, recipeViews, saveRecipe } from '../../lib/recipes'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.recipes.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.recipes.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.recipes.manage'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = recipeListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Check the request' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json((await recipeViews(ctx, [await findRecipe(ctx, parsed.data.id)]))[0])
    return NextResponse.json({ items: await listRecipes(ctx, parsed.data.level) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function write(req: Request, creating: boolean) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = recipeWriteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || (!creating && !parsed.data.id)) return NextResponse.json({ error: parsed.success ? 'Send the recipe id' : (parsed.error.issues[0]?.message ?? 'Check the recipe') }, { status: 400 })
  try {
    if (!creating) {
      const current = await findRecipe(ctx, parsed.data.id!)
      enforceCommandOptimisticLock({ resourceKind: 'cc_production.recipe', resourceId: current.id, current: current.updatedAt, request: req })
    }
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.recipe', resourceId: parsed.data.id ?? 'new', operation: creating ? 'create' : 'update', payload: parsed.data }, async () => (await recipeViews(ctx, [await saveRecipe(ctx, parsed.data, byName)]))[0])
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: creating ? 201 : 200 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

const POST = (req: Request) => write(req, true)
const PUT = (req: Request) => write(req, false)

const viewSchema = z.object({}).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Recipes',
  summary: 'Recipes: the standard raw material for a resin batch, B-stage, laminate sheet or moulded part',
  methods: {
    GET: { summary: 'List recipes (?level=) or one (?id=)', tags: ['Creative Carbon Recipes'], query: recipeListSchema, responses: [{ status: 200, description: 'Recipes', schema: viewSchema }] },
    POST: { summary: 'Add a recipe', tags: ['Creative Carbon Recipes'], requestBody: { schema: recipeWriteSchema }, responses: [{ status: 201, description: 'Created', schema: viewSchema }] },
    PUT: { summary: 'Change a recipe', tags: ['Creative Carbon Recipes'], requestBody: { schema: recipeWriteSchema }, responses: [{ status: 200, description: 'Saved', schema: viewSchema }], errors: [{ status: 409, description: 'Changed by someone else' }] },
  },
}

export { GET, POST, PUT }
