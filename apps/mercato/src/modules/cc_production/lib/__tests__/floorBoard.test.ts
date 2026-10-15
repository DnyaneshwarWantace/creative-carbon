import { dryerTiles, pressTiles, reactorTiles, summariseTiles } from '../floorBoard'

const presses = [
  { id: 'p2', number: 2, pressType: 'small', usage: 'moulding', isWorking: true },
  { id: 'p1', number: 1, pressType: 'small', usage: 'laminate', isWorking: true },
  { id: 'p3', number: 3, pressType: 'big', usage: 'laminate', isWorking: false },
  { id: 'p4', number: 4, pressType: 'big', usage: 'laminate', isWorking: true },
]

describe('press tiles', () => {
  it('orders by number and works out each state and what it is doing', () => {
    const tiles = pressTiles(
      presses,
      [{ id: 'b1', pressNumber: 1, batchNo: 'F/01/10/2026', status: 'posted', sheets: 12, kg: 118 }, { id: 'b3', pressNumber: 3, batchNo: 'F/02/10/2026', status: 'draft', sheets: 4, kg: 30 }],
      [{ id: 'm2', pressNumber: 2, dieNo: '1155', shift: 1, status: 'draft', pieces: 240 }, { id: 'm2b', pressNumber: 2, dieNo: '1155', shift: 2, status: 'posted', pieces: 100 }],
    )
    expect(tiles.map((tile) => tile.label)).toEqual(['1', '2', '3', '4'])
    expect(tiles[0]).toMatchObject({ state: 'done', detail: 'F/01/10/2026 · 12 sheets · 118.000 kg', href: '/backend/press/batches/b1' })
    expect(tiles[1]).toMatchObject({ state: 'running', detail: 'Die 1155 · 340 pcs' })
    expect(tiles[2]).toMatchObject({ state: 'breakdown', detail: 'Out of order', sub: 'Big' })
    expect(tiles[3]).toMatchObject({ state: 'idle', detail: 'Free', href: '/backend/masters/plant/press/p4' })
  })

  it('ignores cancelled batches', () => {
    const [tile] = pressTiles([presses[1]], [{ id: 'b', pressNumber: 1, batchNo: 'X', status: 'cancelled', sheets: 5, kg: 40 }], [])
    expect(tile).toMatchObject({ state: 'idle', detail: 'Free' })
  })
})

describe('dryer and reactor tiles', () => {
  it('shows B-stage made on a dryer and whether it is still open', () => {
    const tiles = dryerTiles([{ id: 'd2', code: 'Dryer 2' }, { id: 'd1', code: 'Dryer 1' }], [{ id: 's1', dryerCode: 'Dryer 1', status: 'posted', bstageKg: 410.5 }, { id: 's2', dryerCode: 'Dryer 2', status: 'draft', bstageKg: 120 }])
    expect(tiles.map((tile) => [tile.label, tile.state, tile.detail])).toEqual([['Dryer 1', 'done', '410.500 kg B-stage'], ['Dryer 2', 'running', '120.000 kg B-stage']])
  })

  it('marks a reactor whose batch failed, unless another batch is open', () => {
    const reactors = [{ id: 'r1', code: 'CCCPL-VES-1' }, { id: 'r2', code: 'CCCPL-VES-2' }]
    const tiles = reactorTiles(reactors, [{ id: 'x', reactorCode: 'CCCPL-VES-1', batchNo: 'CCCPL/151026/01', grade: 'P2', status: 'failed', yieldKg: 0 }, { id: 'y', reactorCode: 'CCCPL-VES-2', batchNo: 'CCCPL/151026/02', grade: 'P2', status: 'posted', yieldKg: 900 }])
    expect(tiles[0]).toMatchObject({ state: 'breakdown', detail: 'Batch failed · CCCPL/151026/01' })
    expect(tiles[1]).toMatchObject({ state: 'done', detail: 'P2 · 900.000 kg' })
  })
})

describe('summary', () => {
  it('counts machines by state', () => {
    const tiles = pressTiles(presses, [], [])
    expect(summariseTiles(tiles)).toEqual({ total: 4, running: 0, done: 0, idle: 3, breakdown: 1 })
  })
})
