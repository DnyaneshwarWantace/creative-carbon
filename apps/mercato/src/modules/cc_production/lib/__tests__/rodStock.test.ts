import { findRods, looksLikeRodStock, parseRodStock, type RodStockRow } from '../rodStock'

const grid = [
  [null, null, 'CCPL TUBE ROD LIST'],
  ['SR.NO.', 'ROD OD ', 'LENGTH ', 'QTY.', 'SR.NO.', 'ROD OD ', 'LENGTH ', 'QTY.', 'SR.NO.', 'ROD OD ', 'LENGTH ', 'QTY.'],
  [1, '8 to 8.5', 500, 2, 51, '21 to 21.5', 880, 3, 101, '152 to 153', 1200, 1],
  [2, '9 to 9.5', 800, 5, 52, '21 to 21.5', 805, 1, 102, '347 to 349', 880, 1],
  [3, '10', 800, 3, 53, '', 880, 1, 110, '244 to 243', 1220, 1],
  [null, null, null, null, 111, '90 to 89', 1000, 1],
]

describe('rod stock list', () => {
  it('recognises the list and reads all three blocks per row', () => {
    expect(looksLikeRodStock(grid)).toBe(true)
    expect(looksLikeRodStock([['SR.NO.', 'OD DIA', 'LENGTH', 'CAVITY']])).toBe(false)
    const rods = parseRodStock(grid)
    expect(rods.map((rod) => rod.srNo)).toEqual([1, 51, 101, 2, 52, 102, 3, 110, 111])
    expect(rods[0]).toEqual({ srNo: 1, odText: '8 to 8.5', odFrom: 8, odTo: 8.5, lengthMm: 500, quantity: 2 })
  })

  it('treats a single OD as a point and puts a reversed range in order', () => {
    const rods = parseRodStock(grid)
    expect(rods.find((rod) => rod.srNo === 3)).toMatchObject({ odFrom: 10, odTo: null })
    expect(rods.find((rod) => rod.srNo === 110)).toMatchObject({ odFrom: 243, odTo: 244 })
    expect(rods.find((rod) => rod.srNo === 111)).toMatchObject({ odFrom: 89, odTo: 90 })
  })

  it('finds rods by OD inside a range and by length within a tolerance', () => {
    const rows: RodStockRow[] = parseRodStock(grid).map((rod, index) => ({ id: String(index), ...rod }))
    expect(findRods(rows, { od: 21.2, lengthTolerance: 0 }).map((rod) => rod.srNo)).toEqual([51, 52])
    expect(findRods(rows, { od: 21.2, length: 800, lengthTolerance: 10 }).map((rod) => rod.srNo)).toEqual([52])
    expect(findRods(rows, { length: 800, lengthTolerance: 0 }).map((rod) => rod.srNo)).toEqual([2, 3])
  })
})
