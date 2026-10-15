import { coatingChecks, pressChecks } from '../recipeAdapters'

const row = (over: Partial<Parameters<typeof coatingChecks>[0][number]>) => ({ bstageProductId: 'bs1', clothProductId: 'cloth', resinProductId: 'resin', consumedKg: 50, bstageKg: 100, plannedBstageKg: null, resinKg: 50, plannedResinKg: null, ...over })

describe('coating check input', () => {
  it('adds up cloth and resin by the B-stage made, using posted figures over planned ones', () => {
    const [group] = coatingChecks([row({}), row({ consumedKg: 30, bstageKg: null, plannedBstageKg: 60, resinKg: null, plannedResinKg: 30 })])
    expect(group).toMatchObject({ outputProductId: 'bs1', outputQty: 160 })
    expect(group.actual).toEqual([{ productId: 'cloth', kg: 80 }, { productId: 'resin', kg: 80 }])
  })

  it('keeps different B-stage products apart and skips rows with no output or no product', () => {
    const groups = coatingChecks([row({}), row({ bstageProductId: 'bs2' }), row({ bstageProductId: null }), row({ bstageKg: 0 })])
    expect(groups.map((group) => group.outputProductId).sort()).toEqual(['bs1', 'bs2'])
  })
})

describe('press check input', () => {
  const picks = [{ grade: 'F2', productId: 'bs-f2', kg: 120 }, { grade: 'F2', productId: 'bs-f2', kg: 30 }, { grade: 'F3', productId: 'bs-f3', kg: 90 }]

  it('checks each pressed output against the B-stage picked for its grade', () => {
    const checks = pressChecks(picks, [{ grade: 'F2', productId: 'sheet-f2', nos: 10 }, { grade: 'F3', productId: 'sheet-f3', nos: 6 }])
    expect(checks).toEqual([
      { key: 'F2-sheet-f2', outputProductId: 'sheet-f2', outputQty: 10, actual: [{ productId: 'bs-f2', kg: 150 }] },
      { key: 'F3-sheet-f3', outputProductId: 'sheet-f3', outputQty: 6, actual: [{ productId: 'bs-f3', kg: 90 }] },
    ])
  })

  it('skips a grade pressed to more than one output, since its picks cannot be split', () => {
    expect(pressChecks(picks, [{ grade: 'F2', productId: 'a', nos: 5 }, { grade: 'F2', productId: 'b', nos: 5 }])).toEqual([])
  })
})
