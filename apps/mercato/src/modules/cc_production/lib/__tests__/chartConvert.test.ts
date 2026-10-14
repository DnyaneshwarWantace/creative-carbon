import { convertCavityList, convertChartWorkbook } from '../chartConvert'
import { findInChart, parseChartQuery, type ChartRecord } from '../chartFinder'

const BEARING_HEADER = ['NO.', 'CODE NO.', 'R1', 'R2', 'R3', 'R4', 'T', 'K', 'L1', 'L2', 'H1', 'H2', 'H3', 'WT.Kg', 'RF.', 'PAGE 1']

describe('convertChartWorkbook', () => {
  it('keeps the main code, moves the rest to a note, drops blank marks and tracks the page', () => {
    const rows = convertChartWorkbook([
      {
        name: 'FIBER BEARING',
        rows: [
          BEARING_HEADER,
          [1, 'CCPL-570\nnew punch/\n85-A\n', 40, 52, 72, 25, 20, 50, 20, 114, 6, 52, null, 0.5, null, null],
          [4, 'CCPL-438', 42.5, '…….', '……', 20, 18.5, '……..', 19, 80, '……..', 59, null, 0.6, null, null],
          [11, '85', 45, 50, 70, 25, 20, 50, 22, 116, 9, 50, null, 0.55, null, 'PAGE 2'],
          [12, '795 - AX ', 50, 67, 87, 28.5, 23, 50, 23, 141, 10, 59, '17 - WI ', 0.8, '11 - DIP', null],
        ],
      },
    ])
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ family: 'fibre_bearing', serialNo: '1', code: 'CCPL-570', note: 'new punch/ 85-A', r1: '40', weightKg: '0.5', chartPage: '1' })
    expect(rows[1]).not.toHaveProperty('r2')
    expect(rows[1]).not.toHaveProperty('k')
    expect(rows[2]).toMatchObject({ chartPage: '2' })
    expect(rows[3]).toMatchObject({ code: '795 - AX', h3: '17 - WI', customerRef: '11 - DIP', chartPage: '2' })
  })

  it('splits a weight like "0.675 FLAT" into kg and a note, and reads hanger H as H1', () => {
    const rows = convertChartWorkbook([
      {
        name: 'HANGER',
        rows: [
          ['NO.', 'CODE NO.', 'R', 'T', 'W', 'L1', 'L2', 'H', 'D', 'WT.Kg'],
          [17, '736 - H N/H', 105, 20, 120, '…..', '…..', 38.83, '…..', '0.675 FLAT'],
        ],
      },
    ])
    expect(rows[0]).toMatchObject({ family: 'hanger', r1: '105', h1: '38.83', weightKg: '0.675', note: 'FLAT' })
    expect(rows[0]).not.toHaveProperty('l1')
  })

  it('reads mould plates as counted tooling', () => {
    const rows = convertChartWorkbook([
      {
        name: 'Mold Plates for sheets',
        rows: [
          ['Mould Plates', 'Size', 'Grade ', 'Qty'],
          ['Glossy Finish Plates', '8 x 4', null, 46],
          ['Matt Finish Plates', '8 x 4', null, 85],
        ],
      },
    ])
    expect(rows).toEqual([
      { family: 'plate', code: 'Glossy Finish Plates', size: '8 x 4', quantity: '46' },
      { family: 'plate', code: 'Matt Finish Plates', size: '8 x 4', quantity: '85' },
    ])
  })
})

describe('convertCavityList', () => {
  const blank = [null, null, null]
  it('reads rod drawings on the left and both tube blocks on the right', () => {
    const rows = convertCavityList({
      name: 'Sheet1',
      rows: [
        [null, 'CCPL ROD & TUBE CAVITY LIST'],
        [1, 'CCPL - DWG - ROD-1 (∅30 X ∅16 LENGTH -680)', ...blank, '   SR.NO.', 'OD DIA', 'LENGTH', 'CAVITY', 'CUSTOMER', 'SR.NO.', 'OD DIA', 'LENGTH', 'CAVITY', 'CUSTOMER'],
        [2, 'CCPL - DWG - ROD-8  (∅210  LENGTH -460)', ...blank, 1, ' 3 , 4 , 5 ', 350, 17, null, 38, 205, 1050, 1, 'BOTIL'],
        [21, 'CCPL - DWG - ROD-18 (∅6-∅5-∅3 LENGTH -350)', ...blank, 2, 15, 660, 6, 'ASIAN SEALING ', null, null, null, null, null],
      ],
    })
    expect(rows).toContainEqual({ family: 'rod', code: 'CCPL-DWG-ROD-1', serialNo: '1', od: '30', idDia: '16', lengthMm: '680' })
    expect(rows).toContainEqual({ family: 'rod', code: 'CCPL-DWG-ROD-8', serialNo: '2', od: '210', lengthMm: '460' })
    expect(rows).toContainEqual(expect.objectContaining({ family: 'rod', serialNo: '21', od: '6', note: '∅6-∅5-∅3' }))
    expect(rows).toContainEqual({ family: 'tube', serialNo: '1', code: 'TUBE 3,4,5', od: '3 , 4 , 5', lengthMm: '350', cavities: '17' })
    expect(rows).toContainEqual({ family: 'tube', serialNo: '38', code: 'TUBE 205', od: '205', lengthMm: '1050', cavities: '1', customerRef: 'BOTIL' })
    expect(rows).toContainEqual({ family: 'tube', serialNo: '2', code: 'TUBE 15', od: '15', lengthMm: '660', cavities: '6', customerRef: 'ASIAN SEALING' })
  })
})

describe('findInChart', () => {
  const entries: ChartRecord[] = [
    { id: '1', family: 'fibre_bearing', code: '795 - AS', r1: '50', t: '25', note: null },
    { id: '2', family: 'fibre_bearing', code: '1143 N/P', r1: '50', t: '30' },
    { id: '3', family: 'fibre_bearing', code: '55 - A', r1: '55', t: '21.8' },
    { id: '4', family: 'fibre_key', code: '160', r1: '57.5', t: '22' },
  ]

  it('finds dies within the tolerance, nearest first', () => {
    const query = parseChartQuery(new URLSearchParams('r1=50&t=25&tol=5'))
    expect(findInChart(entries, query).map((match) => match.entry.code)).toEqual(['795 - AS', '1143 N/P', '55 - A'])
  })

  it('takes only exact sizes when the tolerance is zero, and filters by family', () => {
    expect(findInChart(entries, parseChartQuery(new URLSearchParams('r1=50&t=25'))).map((match) => match.entry.code)).toEqual(['795 - AS'])
    expect(findInChart(entries, parseChartQuery(new URLSearchParams('family=fibre_key&tol=10&r1=55'))).map((match) => match.entry.code)).toEqual(['160'])
  })

  it('reads ranges such as "9.7 to 10.4" as any of their numbers', () => {
    const ranged: ChartRecord[] = [{ id: '9', family: 'rod', code: 'R', od: '25 to 25.5' }]
    expect(findInChart(ranged, parseChartQuery(new URLSearchParams('od=25.5'))).length).toBe(1)
  })
})
