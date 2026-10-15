import { checkAgainstRecipe, pickRecipe, scaleFactor, type RecipeLine } from '../recipeCheck'

const lines: RecipeLine[] = [
  { productId: 'phenol', kg: 100, tolerancePct: 2 },
  { productId: 'formalin', kg: 80, tolerancePct: 2 },
  { productId: 'methanol', kg: 20, tolerancePct: 5 },
]

describe('recipe check', () => {
  it('scales the recipe to the quantity actually made', () => {
    expect(scaleFactor(100, 250)).toBe(2.5)
    expect(scaleFactor(0, 250)).toBeNull()
    expect(scaleFactor(100, 0)).toBeNull()
  })

  it('passes when every material is within its tolerance', () => {
    const result = checkAgainstRecipe(lines, 150, 300, [{ productId: 'phenol', kg: 201 }, { productId: 'formalin', kg: 160 }, { productId: 'methanol', kg: 41 }])!
    expect(result.warnings).toBe(0)
    expect(result.lines.map((line) => line.expectedKg)).toEqual([200, 160, 40])
    expect(result.lines[0]).toMatchObject({ status: 'ok', deviationPct: 0.5 })
  })

  it('flags high, low, missing and extra materials without blocking', () => {
    const result = checkAgainstRecipe(lines, 150, 150, [{ productId: 'phenol', kg: 110 }, { productId: 'formalin', kg: 70 }, { productId: 'water', kg: 5 }])!
    const byId = Object.fromEntries(result.lines.map((line) => [line.productId, line]))
    expect(byId.phenol).toMatchObject({ status: 'high', deviationPct: 10 })
    expect(byId.formalin).toMatchObject({ status: 'low', deviationPct: -12.5 })
    expect(byId.methanol).toMatchObject({ status: 'missing', actualKg: 0 })
    expect(byId.water).toMatchObject({ status: 'extra', expectedKg: 0 })
    expect(result.warnings).toBe(4)
  })

  it('adds up the same material used from several lots and returns null with no output', () => {
    const result = checkAgainstRecipe([{ productId: 'phenol', kg: 100, tolerancePct: 1 }], 100, 100, [{ productId: 'phenol', kg: 60 }, { productId: 'phenol', kg: 40.5 }])!
    expect(result.lines[0]).toMatchObject({ actualKg: 100.5, status: 'ok' })
    expect(checkAgainstRecipe(lines, 150, 0, [])).toBeNull()
  })
})

describe('pickRecipe', () => {
  const recipes = [
    { level: 'moulded', outputProductId: 'p1', dieNo: null, isActive: true, id: 'a' },
    { level: 'moulded', outputProductId: 'p1', dieNo: '1155', isActive: true, id: 'b' },
    { level: 'moulded', outputProductId: 'p2', dieNo: null, isActive: false, id: 'c' },
    { level: 'resin', outputProductId: 'r1', dieNo: null, isActive: true, id: 'd' },
  ]

  it('prefers the die recipe, then the product recipe, and ignores inactive or other levels', () => {
    expect(pickRecipe(recipes, 'moulded', { outputProductId: 'p1', dieNo: '1155' })?.id).toBe('b')
    expect(pickRecipe(recipes, 'moulded', { outputProductId: 'p1', dieNo: '9999' })?.id).toBe('a')
    expect(pickRecipe(recipes, 'moulded', { outputProductId: 'p2' })).toBeNull()
    expect(pickRecipe(recipes, 'resin', { outputProductId: 'r1' })?.id).toBe('d')
  })
})
