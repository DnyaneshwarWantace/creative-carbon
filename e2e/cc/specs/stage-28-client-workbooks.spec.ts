import ExcelJS from 'exceljs'
import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const SR = 800_000 + (stamp % 90_000)
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

async function workbook(build: (book: ExcelJS.Workbook) => void): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  build(book)
  return Buffer.from(await book.xlsx.writeBuffer())
}

type Result = { total: number; created: number; failed: number; batchId: string | null; error?: string }

async function upload(request: APIRequestContext, register: string, name: string, buffer: Buffer, dryRun: boolean): Promise<Result> {
  const response = await request.post('/api/cc_production/upload', { multipart: { register, dryRun: dryRun ? 'true' : 'false', file: { name, mimeType: XLSX, buffer } } })
  expect(response.ok(), await response.text()).toBeTruthy()
  return response.json()
}

async function undo(request: APIRequestContext, id: string) {
  const batch = (await (await request.get(`/api/cc_production/upload/history?id=${id}`)).json()) as { updatedAt: string }
  return request.post('/api/cc_production/upload/undo', { data: { id, reason: 'E2E28 cleanup of the test workbook' }, headers: { [LOCK]: batch.updatedAt } })
}

test.describe.serial('Client workbooks go through the Upload Centre as they are', () => {
  let chartBatch: string | null = null
  let rodBatch: string | null = null

  test('the die chart in the client layout (one sheet per family, PAGE marks, blank rows) is read and imported', async ({ request }) => {
    const buffer = await workbook((book) => {
      const sheet = book.addWorksheet('FIBER BEARING ')
      sheet.addRow(['NO.', 'CODE NO.', 'R1', 'R2', 'R3', 'R4', 'T', 'K', 'L1', 'L2', 'H1', 'H2', 'H3', 'WT.Kg', 'RF.', 'PAGE 1'])
      sheet.addRow([SR + 1, `E2E28-${stamp}-A`, 40, 52, 72, 25, 20, 50, 20, 114, 6, 52, null, 0.5])
      sheet.addRow([SR + 2, `E2E28-${stamp}-B`, 45, 53, 71, 28, 20, 50, 21, 117, 9, 50, 9, 0.55, `E2E REF ${stamp}`])
      sheet.addRow([SR + 3])
    })
    const check = await upload(request, 'chart', 'CCPL CHART.xlsx', buffer, true)
    expect(check).toMatchObject({ total: 2, created: 2, failed: 0 })
    const done = await upload(request, 'chart', 'CCPL CHART.xlsx', buffer, false)
    expect(done.created).toBe(2)
    chartBatch = done.batchId
    expect(chartBatch).toBeTruthy()
  })

  test('the tube rod list in its side-by-side blocks is read, imported and found by OD and length', async ({ request }) => {
    const buffer = await workbook((book) => {
      const sheet = book.addWorksheet('Sheet1')
      sheet.addRow(['              CCPL TUBE ROD LIST'])
      sheet.addRow(['SR.NO.', 'ROD OD ', 'LENGTH ', 'QTY.', 'SR.NO.', 'ROD OD ', 'LENGTH ', 'QTY.'])
      sheet.addRow([SR + 1, '977 to 977.5', 4321, 7, SR + 2, '988', 4100, 3])
    })
    const done = await upload(request, 'rod_stock', 'CCPL TUBE ROD LIST.xlsx', buffer, false)
    expect(done).toMatchObject({ total: 2, created: 2, failed: 0 })
    rodBatch = done.batchId
    const found = (await (await request.get('/api/cc_production/rod-stock?od=977.2&length=4321')).json()) as { items: Array<{ odText: string; quantity: number }> }
    expect(found.items).toEqual([expect.objectContaining({ odText: '977 to 977.5', quantity: 7 })])
    expect((await upload(request, 'rod_stock', 'CCPL TUBE ROD LIST.xlsx', buffer, true)).created).toBe(0)
  })

  test('cleanup: both uploads are undone and their rows go away', async ({ request }) => {
    if (rodBatch) expect((await undo(request, rodBatch)).ok()).toBeTruthy()
    if (chartBatch) expect((await undo(request, chartBatch)).ok()).toBeTruthy()
    const rods = (await (await request.get('/api/cc_production/rod-stock?od=977.2&length=4321')).json()) as { items: unknown[] }
    expect(rods.items).toHaveLength(0)
  })
})
