import { loadProducts, type OrderContext } from '../../cc_orders/lib/server'
import { Recipe } from '../data/entities'
import type { RecipeWriteInput } from '../data/validators'
import { PlantError } from './server'
import { RECIPE_LEVELS, checkAgainstRecipe, type ActualUse } from './recipeCheck'

type Scope = Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>

function where(ctx: Scope) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
}

export async function recipeViews(ctx: OrderContext, rows: Recipe[]) {
  const ids = rows.flatMap((row) => [...(row.outputProductId ? [row.outputProductId] : []), ...row.lines.map((line) => line.productId)])
  const products = await loadProducts(ctx, ids)
  return rows.map((row) => ({
    id: row.id,
    level: row.level,
    levelLabel: RECIPE_LEVELS.find((entry) => entry.value === row.level)?.label ?? row.level,
    basis: RECIPE_LEVELS.find((entry) => entry.value === row.level)?.basis ?? '',
    name: row.name,
    outputProductId: row.outputProductId ?? null,
    outputProductTitle: row.outputProductId ? (products.get(row.outputProductId)?.title ?? null) : null,
    dieNo: row.dieNo ?? null,
    outputQty: Number(row.outputQty),
    lines: row.lines.map((line) => ({ ...line, title: products.get(line.productId)?.title ?? '—', unit: products.get(line.productId)?.unit ?? null })),
    notes: row.notes ?? null,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName ?? null,
  }))
}

export async function listRecipes(ctx: OrderContext, level?: string) {
  const rows = await ctx.em.find(Recipe, { ...where(ctx), ...(level ? { level } : {}) } as never, { orderBy: { level: 'asc', name: 'asc' } })
  return recipeViews(ctx, rows)
}

export async function findRecipe(ctx: Scope, id: string): Promise<Recipe> {
  const row = await ctx.em.findOne(Recipe, { id, ...where(ctx) })
  if (!row) throw new PlantError('Recipe not found', 404)
  return row
}

export async function saveRecipe(ctx: OrderContext, input: RecipeWriteInput, byName: string | null): Promise<Recipe> {
  const duplicate = await ctx.em.findOne(Recipe, { ...where(ctx), level: input.level, name: input.name } as never)
  if (duplicate && duplicate.id !== input.id) throw new PlantError(`A ${input.level} recipe called "${input.name}" already exists`, 409)
  const products = await loadProducts(ctx, [...input.lines.map((line) => line.productId), ...(input.outputProductId ? [input.outputProductId] : [])])
  const unknown = input.lines.find((line) => !products.has(line.productId))
  if (unknown) throw new PlantError('One of the materials is not in the product list', 400)
  if (input.outputProductId && !products.has(input.outputProductId)) throw new PlantError('The output item is not in the product list', 400)
  const seen = new Set<string>()
  for (const line of input.lines) {
    if (seen.has(line.productId)) throw new PlantError('A material is listed twice. Add its quantities together.', 400)
    seen.add(line.productId)
  }
  const row = input.id ? await findRecipe(ctx, input.id) : ctx.em.create(Recipe, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, level: input.level, name: input.name, outputQty: input.outputQty.toFixed(3) })
  row.level = input.level
  row.name = input.name
  row.outputProductId = input.outputProductId ?? null
  row.dieNo = input.dieNo?.trim() || null
  row.outputQty = input.outputQty.toFixed(3)
  row.lines = input.lines.map((line) => ({ productId: line.productId, kg: Math.round(line.kg * 1000) / 1000, tolerancePct: line.tolerancePct }))
  row.notes = input.notes?.trim() || null
  row.isActive = input.isActive
  row.updatedByName = byName
  ctx.em.persist(row)
  await ctx.em.flush()
  return row
}

export async function checkRecipe(ctx: OrderContext, recipeId: string, outputQty: number, actual: ActualUse[]) {
  const recipe = await findRecipe(ctx, recipeId)
  const result = checkAgainstRecipe(recipe.lines, Number(recipe.outputQty), outputQty, actual)
  if (!result) throw new PlantError('Give the quantity made', 400)
  const products = await loadProducts(ctx, result.lines.map((line) => line.productId))
  return { recipeId: recipe.id, recipeName: recipe.name, basis: RECIPE_LEVELS.find((entry) => entry.value === recipe.level)?.basis ?? '', warnings: result.warnings, lines: result.lines.map((line) => ({ ...line, title: products.get(line.productId)?.title ?? '—' })) }
}
