import { linesForMachine, orphanLines, planMaterials, recipeForLine, sameResource, usesPress, type PlanDraftLine, type RecipeForPlan } from '../planBoard'

const line = (over: Partial<PlanDraftLine>): PlanDraftLine => ({ key: 'k', area: 'moulding', resource: '12', item: '1155', plannedQty: '100', unit: 'nos', ...over })

describe('plan board machines', () => {
  it('matches a typed resource to a machine the way the old free-text plans wrote it', () => {
    expect(sameResource('12', '12')).toBe(true)
    expect(sameResource('Dryer 2', 'dryer 2')).toBe(true)
    expect(sameResource('2', 'Dryer 2')).toBe(false)
    expect(sameResource('CCCPL-VES-1', 'ccc-ves-1')).toBe(false)
    expect(sameResource('13', '12')).toBe(false)
  })

  it('sends a press to the laminate or moulding section by its usage', () => {
    expect(usesPress('laminate', 'press')).toBe(true)
    expect(usesPress('laminate', 'moulding')).toBe(false)
    expect(usesPress('moulding', 'moulding')).toBe(true)
    expect(usesPress('both', 'press')).toBe(true)
    expect(usesPress('both', 'moulding')).toBe(true)
  })

  it('keeps lines that match no machine so no old plan line is lost', () => {
    const lines = [line({ key: 'a', resource: '12' }), line({ key: 'b', resource: '99' }), line({ key: 'c', area: 'coating', resource: 'Dryer 2' })]
    const machines = [{ area: 'moulding' as const, label: '12' }, { area: 'coating' as const, label: 'Dryer 2' }]
    expect(linesForMachine(lines, 'moulding', '12').map((entry) => entry.key)).toEqual(['a'])
    expect(orphanLines(lines, machines).map((entry) => entry.key)).toEqual(['b'])
  })
})

describe('raw material needed by the plan', () => {
  const recipes: RecipeForPlan[] = [
    { id: 'r1', level: 'moulded', name: 'Bush 1155', dieNo: '1155', outputQty: 1, isActive: true, lines: [{ productId: 'bs', title: 'B-stage F2', kg: 0.25 }, { productId: 'ch', title: 'Chindi', kg: 0.05 }] },
    { id: 'r2', level: 'resin', name: 'Resin P2', dieNo: null, outputQty: 1000, isActive: true, lines: [{ productId: 'ph', title: 'Phenol', kg: 450 }, { productId: 'bs', title: 'B-stage F2', kg: 10 }] },
    { id: 'r3', level: 'moulded', name: 'Old', dieNo: '777', outputQty: 1, isActive: false, lines: [] },
  ]

  it('finds a recipe by die number for moulding and by name for the rest, ignoring inactive ones', () => {
    expect(recipeForLine({ area: 'moulding', item: ' 1155 ' }, recipes)?.id).toBe('r1')
    expect(recipeForLine({ area: 'resin', item: 'resin p2' }, recipes)?.id).toBe('r2')
    expect(recipeForLine({ area: 'moulding', item: '777' }, recipes)).toBeNull()
    expect(recipeForLine({ area: 'press', item: '1155' }, recipes)).toBeNull()
  })

  it('scales each recipe to the planned quantity and adds the same material up across lines', () => {
    const result = planMaterials([line({ plannedQty: '200' }), line({ key: 'b', area: 'resin', resource: 'R1', item: 'Resin P2', plannedQty: '500', unit: 'kg' })], recipes)
    expect(result.matched).toBe(2)
    expect(result.needs).toEqual([{ productId: 'bs', title: 'B-stage F2', kg: 55 }, { productId: 'ch', title: 'Chindi', kg: 10 }, { productId: 'ph', title: 'Phenol', kg: 225 }])
    expect(result.unmatched).toEqual([])
  })

  it('reports lines it cannot work out, such as a unit that does not match the recipe', () => {
    const result = planMaterials([line({ unit: 'kg' }), line({ key: 'z', item: '5555' })], recipes)
    expect(result.matched).toBe(0)
    expect(result.unmatched).toEqual(['1155 (recipe is per nos)', '5555'])
  })
})
