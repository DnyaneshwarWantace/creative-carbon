import ExcelJS from 'exceljs'
import { dimensionMatch, parseChartWorkbook } from '../dieChart'

async function book(build: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  build(workbook)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe('client die chart and rod lists', () => {
  it('reads every family sheet with its own sizes, pages, notes and weights', async () => {
    const buffer = await book((workbook) => {
      const bearing = workbook.addWorksheet('FIBER BEARING ')
      bearing.addRow(['NO.', 'CODE NO.', 'R1', 'R2', 'R3', 'R4', 'T', 'K', 'L1', 'L2', 'H1', 'H2', 'H3', 'WT.Kg', 'RF.', 'PAGE 1'])
      bearing.addRow([1, 'CCPL-570\nnew punch/\n85-A\n', 40, 52, 72, 25, 20, 50, 20, 114, 6, 52, null, 0.5])
      bearing.addRow([2, '795 - AX ', 50, 67, 87, 28.5, 23, 50, 23, 141, 10, 59, '17 - WI ', 0.8, '11 - DIP', 'PAGE 2'])
      bearing.addRow([3, 'CCPL-438', 42.5, '…….', '……', 20, 18.5, '……..', 19, 80, '……..', 59, null, 0.6])
      const inside = workbook.addWorksheet('IN SIDE FIBER BEARING ')
      inside.addRow(['NO.', 'CODE NO.', 'R1', 'R2', 'T', 'D', 'H1', 'H2', 'L1', 'CUT.DWG.NO'])
      inside.addRow([10, '………..', 140, 190, 50, 30, 140, 190, 360, 'BM - 71'])
      const plates = workbook.addWorksheet('Mold Plates for sheets')
      plates.addRow(['Mould Plates', 'Size', 'Grade ', 'Qty'])
      plates.addRow(['Glossy Finish Plates', '8 x 4', null, 46])
    })
    const parsed = await parseChartWorkbook(buffer)
    expect(parsed.kind).toBe('die_chart')
    const [first, second, third] = parsed.moulds.filter((item) => item.family === 'fibre_bearing')
    expect(first).toMatchObject({ chartNo: 1, dieNo: 'CCPL-570', description: 'Fibre bearing · new punch / 85-A', weightKg: 0.5, chartPage: 'PAGE 1' })
    expect(first.dimensions).toEqual({ R1: 40, R2: 52, R3: 72, R4: 25, T: 20, K: 50, L1: 20, L2: 114, H1: 6, H2: 52 })
    expect(second).toMatchObject({ dieNo: '795-AX', customerRef: '11 - DIP', chartPage: 'PAGE 2', description: 'Fibre bearing · 17 - WI' })
    expect(third.dimensions).toEqual({ R1: 42.5, R4: 20, T: 18.5, L1: 19, L2: 80, H2: 59 })
    expect(parsed.moulds.find((item) => item.family === 'inside_bearing')).toMatchObject({ dieNo: 'BM - 71', drawingNo: 'BM - 71' })
    expect(parsed.moulds.find((item) => item.family === 'sheet_plate')).toMatchObject({ mouldType: 'plate', finish: 'mirror', dimensions: { count: 46 } })
  })

  it('reads rod drawings and both tube cavity blocks', async () => {
    const buffer = await book((workbook) => {
      const sheet = workbook.addWorksheet('Sheet1')
      sheet.addRow([null, '    CCPL ROD & TUBE CAVITY LIST', null, null, null, null, '       CCPL TUBE CAVITY LIST'])
      sheet.addRow([1, 'CCPL - DWG - ROD-1 (∅30 X ∅16 LENGTH -680)', null, null, null, '  SR.NO.', '   OD DIA', '     LENGTH ', '  CAVITY', '    CUSTOMER', '  SR.NO.', '   OD DIA', '   LENGTH ', '  CAVITY', '  CUSTOMER'])
      sheet.addRow([2, 'CCPL - DWG - ROD-1 (∅38 X ∅16 LENGTH -680)', null, null, null, 1, ' 3 , 4 , 5 ', 350, 17, null, 38, 205, 1050, 1, 'BOTIL'])
    })
    const parsed = await parseChartWorkbook(buffer)
    expect(parsed.kind).toBe('cavity_list')
    expect(parsed.moulds.filter((item) => item.family === 'rod_drawing').map((item) => item.dimensions)).toEqual([
      { OD: 30, ID: 16, L: 680 },
      { OD: 38, ID: 16, L: 680 },
    ])
    expect(parsed.moulds.filter((item) => item.family === 'tube')).toEqual(
      expect.arrayContaining([expect.objectContaining({ chartNo: 1, cavities: 17, dimensions: { OD: '3 , 4 , 5', L: 350 } }), expect.objectContaining({ chartNo: 38, cavities: 1, customerRef: 'BOTIL' })]),
    )
  })

  it('reads the rod stock list blocks and matches dies by size', async () => {
    const buffer = await book((workbook) => {
      const sheet = workbook.addWorksheet('Sheet1')
      sheet.addRow(['              CCPL TUBE ROD LIST'])
      sheet.addRow(['SR.NO.', 'ROD OD ', 'LENGTH ', 'QTY.', 'SR.NO.', 'ROD OD ', 'LENGTH ', 'QTY.'])
      sheet.addRow([1, '8 to 8.5', 500, 2, 110, '244 to 243', 1220, 1])
    })
    const parsed = await parseChartWorkbook(buffer)
    expect(parsed.rods).toEqual([
      { srNo: 1, odText: '8 to 8.5', odFrom: 8, odTo: 8.5, lengthMm: 500, quantity: 2 },
      { srNo: 110, odText: '244 to 243', odFrom: 243, odTo: 244, lengthMm: 1220, quantity: 1 },
    ])
    expect(dimensionMatch({ R1: 50, T: 25 }, { R1: 51.5, T: 25 }, 2)).toBe(true)
    expect(dimensionMatch({ R1: 50, T: 25 }, { R1: 53, T: 25 }, 2)).toBe(false)
    expect(dimensionMatch({ R1: 50 }, { T: 25 }, 2)).toBe(false)
  })
})
