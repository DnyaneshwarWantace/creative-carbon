import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { recipeCheckSchema } from '../../../data/validators'
import { checkRecipe } from '../../../lib/recipes'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.recipes.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = recipeCheckSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Send the recipe, the quantity made and what was used' }, { status: 400 })
  try {
    return NextResponse.json(await checkRecipe(ctx, parsed.data.recipeId, parsed.data.outputQty, parsed.data.actual))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Recipes',
  summary: 'Compare what was used with the recipe, scaled to the quantity made. A warning never blocks.',
  methods: { POST: { summary: 'Check an entry against a recipe', tags: ['Creative Carbon Recipes'], requestBody: { schema: recipeCheckSchema }, responses: [{ status: 200, description: 'Per-material expected, actual and deviation', schema: z.object({}).passthrough() }] } },
}

export { POST }
