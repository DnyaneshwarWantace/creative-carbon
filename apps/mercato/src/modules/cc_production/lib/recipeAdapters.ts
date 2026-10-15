import type { ActualUse } from './recipeCheck'

export type CoatingRowInput = {
  bstageProductId: string | null
  clothProductId: string
  resinProductId: string | null
  consumedKg: number | null
  bstageKg: number | null
  plannedBstageKg: number | null
  resinKg: number | null
  plannedResinKg: number | null
}

export type RecipeCheckInput = { key: string; outputProductId: string; outputQty: number; actual: ActualUse[] }

const round3 = (value: number) => Math.round(value * 1000) / 1000

function addUse(map: Map<string, number>, productId: string | null, kg: number | null) {
  if (!productId || !kg || kg <= 0) return
  map.set(productId, round3((map.get(productId) ?? 0) + kg))
}

export function coatingChecks(rows: CoatingRowInput[]): RecipeCheckInput[] {
  const groups = new Map<string, { output: number; use: Map<string, number> }>()
  for (const row of rows) {
    if (!row.bstageProductId) continue
    const output = row.bstageKg ?? row.plannedBstageKg ?? 0
    if (output <= 0) continue
    const group = groups.get(row.bstageProductId) ?? { output: 0, use: new Map<string, number>() }
    group.output = round3(group.output + output)
    addUse(group.use, row.clothProductId, row.consumedKg)
    addUse(group.use, row.resinProductId, row.resinKg ?? row.plannedResinKg)
    groups.set(row.bstageProductId, group)
  }
  return Array.from(groups, ([outputProductId, group]) => ({ key: outputProductId, outputProductId, outputQty: group.output, actual: Array.from(group.use, ([productId, kg]) => ({ productId, kg })) }))
}

export type PressPickInput = { grade: string; productId: string; kg: number }
export type PressOutputInput = { grade: string; productId: string; nos: number }

export function pressChecks(picks: PressPickInput[], outputs: PressOutputInput[]): RecipeCheckInput[] {
  const gradeCount = new Map<string, number>()
  for (const output of outputs) gradeCount.set(output.grade, (gradeCount.get(output.grade) ?? 0) + 1)
  return outputs
    .filter((output) => output.nos > 0 && gradeCount.get(output.grade) === 1)
    .map((output) => {
      const use = new Map<string, number>()
      for (const pick of picks) if (pick.grade === output.grade) addUse(use, pick.productId, pick.kg)
      return { key: `${output.grade}-${output.productId}`, outputProductId: output.productId, outputQty: output.nos, actual: Array.from(use, ([productId, kg]) => ({ productId, kg })) }
    })
    .filter((check) => check.actual.length > 0)
}
