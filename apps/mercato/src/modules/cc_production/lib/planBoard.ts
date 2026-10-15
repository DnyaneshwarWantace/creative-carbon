export type PlanArea = 'resin' | 'coating' | 'press' | 'moulding'
export type PlanUnit = 'kg' | 'nos' | 'sheets'

export type PlanDraftLine = { key: string; area: PlanArea; resource: string; item: string; plannedQty: string; unit: PlanUnit }

export const AREA_UNITS: Record<PlanArea, PlanUnit[]> = { resin: ['kg'], coating: ['kg'], press: ['sheets', 'kg'], moulding: ['nos', 'kg'] }

export const DEFAULT_UNIT: Record<PlanArea, PlanUnit> = { resin: 'kg', coating: 'kg', press: 'sheets', moulding: 'nos' }

export function usesPress(usage: string | null | undefined, area: 'press' | 'moulding'): boolean {
  if (usage === 'both' || !usage) return true
  return area === 'press' ? usage === 'laminate' : usage === 'moulding'
}

export function sameResource(left: string, right: string): boolean {
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  if (a === b) return true
  const na = a.match(/^\d+$/) ? a : a.match(/(\d+)$/)?.[1]
  const nb = b.match(/^\d+$/) ? b : b.match(/(\d+)$/)?.[1]
  return Boolean(na && nb && na === nb && a.replace(/\d+/g, '') === b.replace(/\d+/g, ''))
}

export function linesForMachine(lines: PlanDraftLine[], area: PlanArea, label: string): PlanDraftLine[] {
  return lines.filter((line) => line.area === area && sameResource(line.resource, label))
}

export function orphanLines(lines: PlanDraftLine[], machines: Array<{ area: PlanArea; label: string }>): PlanDraftLine[] {
  return lines.filter((line) => !machines.some((machine) => machine.area === line.area && sameResource(line.resource, machine.label)))
}

export type RecipeForPlan = { id: string; level: string; name: string; dieNo: string | null; outputQty: number; isActive: boolean; lines: Array<{ productId: string; title: string; kg: number }> }

const LEVEL_FOR_AREA: Record<PlanArea, string> = { resin: 'resin', coating: 'coating', press: 'laminate', moulding: 'moulded' }
const UNIT_FOR_LEVEL: Record<string, PlanUnit> = { resin: 'kg', coating: 'kg', laminate: 'sheets', moulded: 'nos' }

export function recipeForLine(line: Pick<PlanDraftLine, 'area' | 'item'>, recipes: RecipeForPlan[]): RecipeForPlan | null {
  const item = line.item.trim().toLowerCase()
  if (!item) return null
  const level = LEVEL_FOR_AREA[line.area]
  const own = recipes.filter((recipe) => recipe.isActive && recipe.level === level)
  return (line.area === 'moulding' ? own.find((recipe) => recipe.dieNo && recipe.dieNo.trim().toLowerCase() === item) : undefined) ?? own.find((recipe) => recipe.name.trim().toLowerCase() === item) ?? null
}

export type MaterialNeed = { productId: string; title: string; kg: number }

export function planMaterials(lines: PlanDraftLine[], recipes: RecipeForPlan[]): { needs: MaterialNeed[]; matched: number; unmatched: string[] } {
  const needs = new Map<string, MaterialNeed>()
  const unmatched: string[] = []
  let matched = 0
  for (const line of lines) {
    const qty = Number(line.plannedQty)
    if (!(qty > 0) || !line.item.trim()) continue
    const recipe = recipeForLine(line, recipes)
    if (!recipe || UNIT_FOR_LEVEL[recipe.level] !== line.unit || !(recipe.outputQty > 0)) {
      unmatched.push(`${line.item.trim()}${recipe ? ` (recipe is per ${UNIT_FOR_LEVEL[recipe.level]})` : ''}`)
      continue
    }
    matched += 1
    const factor = qty / recipe.outputQty
    for (const material of recipe.lines) {
      const current = needs.get(material.productId) ?? { productId: material.productId, title: material.title, kg: 0 }
      current.kg = Math.round((current.kg + material.kg * factor) * 1000) / 1000
      needs.set(material.productId, current)
    }
  }
  return { needs: [...needs.values()].sort((left, right) => left.title.localeCompare(right.title)), matched, unmatched: [...new Set(unmatched)] }
}
