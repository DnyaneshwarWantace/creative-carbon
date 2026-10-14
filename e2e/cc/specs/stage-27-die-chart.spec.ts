import ExcelJS from 'exceljs'
import { expect, test, type APIRequestContext } from '@playwright/test'

const stamp = Date.now()
const BASE = 900_000 + (stamp % 90_000)
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function workbook(build: (book: ExcelJS.Workbook) => void): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  build(book)
  return Buffer.from(await book.xlsx.writeBuffer())
}

async function upload(request: APIRequestContext, name: string, buffer: Buffer, dryRun: boolean) {
  const response = await request.post('/api/cc_production/masters/die-chart', { multipart: { dryRun: dryRun ? 'true' : 'false', file: { name, mimeType: XLSX, buffer } } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()) as { kind: string; created: number; updated: number; unchanged: number; byFamily: Record<string, number>; duplicates: Array<{ dieNo: string; count: number }> }
}

test.describe.serial('Phase O · die chart, cavity list and rod stock list from the client Excel files', () => {
  const chart = () =>
    workbook((book) => {
      const sheet = book.addWorksheet('FIBER BEARING ')
      sheet.addRow(['NO.', 'CODE NO.', 'R1', 'R2', 'R3', 'R4', 'T', 'K', 'L1', 'L2', 'H1', 'H2', 'H3', 'WT.Kg', 'RF.', 'PAGE 1'])
      sheet.addRow([BASE + 1, `E2E-${stamp}-A`, 501.5, 612, 733, 25, 77.5, 50, 20, 114, 6, 52, null, 0.5, `E2E REF ${stamp}`])
      sheet.addRow([BASE + 2, `E2E-${stamp}-A`, 509, 620, 740, 25, 79, 50, 20, 114, 6, 52, null, 0.7])
      const key = book.addWorksheet('FIBER KEY ')
      key.addRow(['NO.', 'CODE NO.', 'L1', 'L2', 'W', 'H1', 'H2', 'R1', 'R2', 'T', 'WT.Kg'])
      key.addRow([BASE + 3, `E2E-${stamp}-K`, 24, 137, 62, 30, 15, 91, 26, 24, 0.43])
    })
  const rods = () =>
    workbook((book) => {
      const sheet = book.addWorksheet('Sheet1')
      sheet.addRow(['CCPL TUBE ROD LIST'])
      sheet.addRow(['SR.NO.', 'ROD OD ', 'LENGTH ', 'QTY.'])
      sheet.addRow([BASE + 1, '977 to 978', 4321, 7])
    })
  const ids: string[] = []
  let rodId: string | null = null

  test('a die chart is checked, imported, and importing again changes nothing', async ({ request }) => {
    const buffer = await chart()
    const check = await upload(request, 'CCPL CHART.xlsx', buffer, true)
    expect(check).toMatchObject({ kind: 'die_chart', created: 3, updated: 0, byFamily: { fibre_bearing: 2, fibre_key: 1 } })
    expect(check.duplicates).toEqual([{ dieNo: `E2E-${stamp}-A`, count: 2 }])
    expect((await upload(request, 'CCPL CHART.xlsx', buffer, false)).created).toBe(3)
    expect(await upload(request, 'CCPL CHART.xlsx', buffer, false)).toMatchObject({ created: 0, updated: 0, unchanged: 3 })
  })

  test('the die finder finds the closest die by size, and by customer ref', async ({ request }) => {
    const bySize = (await (await request.get(`/api/cc_production/masters/die-finder?family=fibre_bearing&dim.R1=502&dim.T=78&tolerance=2`)).json()) as { items: Array<{ id: string; dieNo: string; chartNo: number; weightKg: number; dimensions: Record<string, number>; chartPage: string; customerRef: string | null }> }
    expect(bySize.items[0]).toMatchObject({ dieNo: `E2E-${stamp}-A`, chartNo: BASE + 1, weightKg: 0.5, chartPage: 'PAGE 1', customerRef: `E2E REF ${stamp}` })
    expect(bySize.items.some((item) => item.chartNo === BASE + 2)).toBeFalsy()
    const wide = (await (await request.get(`/api/cc_production/masters/die-finder?family=fibre_bearing&dim.R1=505&tolerance=5&search=E2E-${stamp}`)).json()) as { items: Array<{ id: string; chartNo: number }> }
    expect(wide.items.map((item) => item.chartNo).sort()).toEqual([BASE + 1, BASE + 2])
    const byRef = (await (await request.get(`/api/cc_production/masters/die-finder?search=E2E%20REF%20${stamp}`)).json()) as { items: Array<{ id: string }> }
    expect(byRef.items).toHaveLength(1)
    const all = (await (await request.get(`/api/cc_production/masters/die-finder?search=E2E-${stamp}`)).json()) as { items: Array<{ id: string }> }
    ids.push(...all.items.map((item) => item.id))
    expect(ids).toHaveLength(3)
    const die = (await (await request.get(`/api/cc_production/records/die?id=${bySize.items[0].id}`)).json()) as { family: string; dimensions: Record<string, number>; weightKg: number }
    expect(die).toMatchObject({ family: 'fibre_bearing', weightKg: 0.5 })
    expect(die.dimensions.R1).toBe(501.5)
  })

  test('the rod stock list is imported and searched by OD and length', async ({ request }) => {
    const buffer = await rods()
    expect(await upload(request, 'CCPL TUBE ROD LIST.xlsx', buffer, false)).toMatchObject({ kind: 'rod_stock', created: 1 })
    const found = (await (await request.get('/api/cc_production/rod-stock?od=977.5&length=4300')).json()) as { items: Array<{ id: string; odText: string; quantity: number }>; totalPieces: number }
    expect(found.items).toEqual([expect.objectContaining({ odText: '977 to 978', quantity: 7 })])
    rodId = found.items[0].id
    expect((await (await request.get('/api/cc_production/rod-stock?od=977.5&length=4000')).json()).items).toHaveLength(0)
  })

  test('the die chart page opens', async ({ page }) => {
    await page.goto('/backend/masters/die-chart')
    await expect(page.getByRole('heading', { name: 'Die chart & rod stock' })).toBeVisible({ timeout: 30_000 })
    await page.getByLabel('Code, drawing no. or customer ref').fill(`E2E-${stamp}`)
    await expect(page.getByRole('link', { name: `E2E-${stamp}-A` }).first()).toBeVisible()
  })

  test('cleanup: the test dies and rods are removed', async ({ request }) => {
    for (const id of ids) {
      const die = (await (await request.get(`/api/cc_production/records/die?id=${id}`)).json()) as { updatedAt: string }
      const removed = await request.delete(`/api/cc_production/masters?type=moulds&id=${id}`, { headers: { 'x-om-ext-optimistic-lock-expected-updated-at': die.updatedAt } })
      expect(removed.ok(), await removed.text()).toBeTruthy()
    }
    if (rodId) expect((await request.delete(`/api/cc_production/rod-stock?id=${rodId}`)).ok()).toBeTruthy()
  })
})
