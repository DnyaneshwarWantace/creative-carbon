export const RECIPE_LEVELS = [
  { value: 'resin', label: 'Resin', basis: 'per batch', hint: 'Chemicals for one resin batch. Output is the resin yield in kg.' },
  { value: 'coating', label: 'Coating / B-stage', basis: 'per kg of B-stage', hint: 'Cloth or paper and resin for each kg of B-stage made.' },
  { value: 'laminate', label: 'Laminate sheet', basis: 'per sheet', hint: 'B-stage for one sheet of a thickness and grade.' },
  { value: 'moulded', label: 'Moulded part', basis: 'per piece', hint: 'B-stage, chindi and cloth for one moulded piece of a die.' },
] as const

export type RecipeLevel = (typeof RECIPE_LEVELS)[number]['value']

export type RecipeLine = { productId: string; kg: number; tolerancePct: number }

export type ActualUse = { productId: string; kg: number }

export type LineCheck = {
  productId: string
  expectedKg: number
  actualKg: number
  deviationPct: number | null
  status: 'ok' | 'high' | 'low' | 'missing' | 'extra'
}

export type RecipeCheckResult = { lines: LineCheck[]; warnings: number }

const round3 = (value: number) => Math.round(value * 1000) / 1000

export function scaleFactor(recipeOutputQty: number, actualOutputQty: number): number | null {
  if (!(recipeOutputQty > 0) || !(actualOutputQty > 0)) return null
  return actualOutputQty / recipeOutputQty
}

export function checkAgainstRecipe(recipeLines: RecipeLine[], recipeOutputQty: number, actualOutputQty: number, actual: ActualUse[]): RecipeCheckResult | null {
  const factor = scaleFactor(recipeOutputQty, actualOutputQty)
  if (factor === null) return null
  const used = new Map<string, number>()
  for (const entry of actual) used.set(entry.productId, round3((used.get(entry.productId) ?? 0) + entry.kg))
  const lines: LineCheck[] = recipeLines.map((line) => {
    const expectedKg = round3(line.kg * factor)
    const actualKg = used.get(line.productId) ?? 0
    used.delete(line.productId)
    if (actualKg === 0) return { productId: line.productId, expectedKg, actualKg, deviationPct: null, status: 'missing' }
    const deviationPct = expectedKg === 0 ? null : Math.round(((actualKg - expectedKg) / expectedKg) * 1000) / 10
    const status = deviationPct === null || Math.abs(deviationPct) <= line.tolerancePct ? 'ok' : deviationPct > 0 ? 'high' : 'low'
    return { productId: line.productId, expectedKg, actualKg, deviationPct, status }
  })
  for (const [productId, kg] of used) lines.push({ productId, expectedKg: 0, actualKg: kg, deviationPct: null, status: 'extra' })
  return { lines, warnings: lines.filter((line) => line.status !== 'ok').length }
}

export function pickRecipe<T extends { level: string; outputProductId: string | null; dieNo: string | null; isActive: boolean }>(recipes: T[], level: RecipeLevel, match: { outputProductId?: string | null; dieNo?: string | null }): T | null {
  const active = recipes.filter((recipe) => recipe.isActive && recipe.level === level)
  const byDie = match.dieNo ? active.find((recipe) => recipe.dieNo && recipe.dieNo.toLowerCase() === match.dieNo!.toLowerCase()) : undefined
  if (byDie) return byDie
  const byProduct = match.outputProductId ? active.find((recipe) => recipe.outputProductId === match.outputProductId && !recipe.dieNo) : undefined
  return byProduct ?? null
}
