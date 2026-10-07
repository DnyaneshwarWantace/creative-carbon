import { expect, test, type APIRequestContext } from '@playwright/test'
import ExcelJS from 'exceljs'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type Report = {
  dryRun: boolean
  total: number
  created: number
  updated: number
  failed: number
  plan: string[]
  errors: Array<{ row: number; error: string }>
  failedRows: Array<{ row: number; values: Record<string, string>; reason: string }>
  previousUpload: { at: string } | null
}

async function workbookFrom(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  return workbook
}

async function upload(request: APIRequestContext, register: string, name: string, buffer: Buffer, dryRun: boolean) {
  return request.post('/api/cc_production/upload', {
    multipart: { register, dryRun: String(dryRun), file: { name, mimeType: name.endsWith('.csv') ? 'text/csv' : XLSX, buffer } },
  })
}

async function moulds(request: APIRequestContext) {
  const response = await request.get('/api/cc_production/masters?type=moulds')
  return ((await response.json()) as { items: Array<Record<string, unknown> & { id: string; updatedAt: string }> }).items
}

test.describe('Stage 2 · upload centre', () => {
  test('the upload centre lists the registers with their columns', async ({ request }) => {
    const response = await request.get('/api/cc_production/upload')
    expect(response.ok()).toBeTruthy()
    const { items } = (await response.json()) as { items: Array<{ key: string; canUpload: boolean; columns: Array<{ label: string; required: boolean }> }> }
    expect(items.map((item) => item.key)).toEqual(expect.arrayContaining(['moulds', 'tolerances', 'prices']))
    const mouldTile = items.find((item) => item.key === 'moulds')!
    expect(mouldTile.canUpload).toBe(true)
    expect(mouldTile.columns[0]).toEqual({ key: 'dieNo', label: 'Die No.', required: true })
  })

  test('the template has the register columns in order, dropdown cells and a how-to sheet', async ({ request }) => {
    const response = await request.get('/api/cc_production/upload/template?register=moulds')
    expect(response.ok()).toBeTruthy()
    expect(response.headers()['content-type']).toContain('spreadsheetml')
    const workbook = await workbookFrom(await response.body())
    const sheet = workbook.getWorksheet('Moulds & dies')!
    const headers = (sheet.getRow(1).values as unknown[]).slice(1)
    expect(headers.slice(0, 4)).toEqual(['Die No. *', 'Die / plate *', 'Description', 'Size'])
    expect(sheet.getCell('B2').dataValidation?.type).toBe('list')
    expect(workbook.getWorksheet('How to fill')).toBeTruthy()
    expect(workbook.getWorksheet('Lists')?.state).toBe('veryHidden')
  })

  test('an Excel upload is checked first, then posted; problems come back per row; posting again does not duplicate', async ({ request }) => {
    const stamp = Date.now()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Moulds')
    sheet.addRow(['Creative Carbon mould list — written by the store'])
    sheet.addRow(['Die No.', 'Die / plate', 'Description', 'Thickness (mm)', 'Customer', 'Remarks'])
    sheet.addRow([`E2E2-${stamp}-1`, 'Die', 'Bush', '34', '', 'first'])
    sheet.addRow([`E2E2-${stamp}-2`, '"', 'Washer', 'NIL', '', 'ditto type'])
    sheet.addRow(['', 'Plate', 'No number', '', '', 'missing die no'])
    sheet.addRow([`E2E2-${stamp}-3`, 'Plate', 'Unknown party', '', 'Nobody Like This Ltd', ''])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const check = await upload(request, 'moulds', `moulds-${stamp}.xlsx`, buffer, true)
    expect(check.ok(), await check.text()).toBeTruthy()
    const preview = (await check.json()) as Report
    expect(preview.dryRun).toBe(true)
    expect(preview.total).toBe(4)
    expect(preview.created).toBe(2)
    expect(preview.failed).toBe(2)
    expect(preview.errors.find((entry) => entry.row === 5)?.error).toMatch(/Die No/)
    expect(preview.errors.find((entry) => entry.row === 6)?.error).toMatch(/customer list/)
    expect((await moulds(request)).some((row) => String(row.dieNo).startsWith(`E2E2-${stamp}`))).toBeFalsy()

    const post = await upload(request, 'moulds', `moulds-${stamp}.xlsx`, buffer, false)
    const posted = (await post.json()) as Report
    expect(posted.created).toBe(2)
    expect(posted.previousUpload).toBeNull()
    const saved = (await moulds(request)).filter((row) => String(row.dieNo).startsWith(`E2E2-${stamp}`))
    expect(saved).toHaveLength(2)
    const second = saved.find((row) => row.dieNo === `E2E2-${stamp}-2`)
    expect(second?.mouldType).toBe('die')
    expect(second?.thicknessMm).toBe(0)

    const again = await upload(request, 'moulds', `moulds-${stamp}.xlsx`, buffer, false)
    const repeated = (await again.json()) as Report
    expect(repeated.created).toBe(0)
    expect(repeated.updated).toBe(2)
    expect(repeated.previousUpload).not.toBeNull()
    expect((await moulds(request)).filter((row) => String(row.dieNo).startsWith(`E2E2-${stamp}`))).toHaveLength(2)

    const errorFile = await request.post('/api/cc_production/upload/errors', { data: { register: 'moulds', rows: posted.failedRows } })
    expect(errorFile.ok()).toBeTruthy()
    const errorBook = await workbookFrom(await errorFile.body())
    const errorSheet = errorBook.worksheets[0]
    expect(errorSheet.rowCount).toBe(3)
    const lastHeader = (errorSheet.getRow(1).values as unknown[]).slice(-1)[0]
    expect(lastHeader).toBe('Reason')
    expect(String(errorSheet.getRow(3).getCell(errorSheet.getRow(1).cellCount).value)).toMatch(/customer list/)

    const history = (await (await request.get('/api/cc_production/upload/history?register=moulds')).json()) as { items: Array<{ fileName: string; created: number; failed: number }> }
    expect(history.items.filter((item) => item.fileName === `moulds-${stamp}.xlsx`)).toHaveLength(2)

    for (const row of (await moulds(request)).filter((entry) => String(entry.dieNo).startsWith(`E2E2-${stamp}`))) {
      await request.delete(`/api/cc_production/masters?type=moulds&id=${row.id}`, { headers: { [LOCK]: row.updatedAt } })
    }
  })

  test('a CSV upload works too, and pasted rows can be checked', async ({ request }) => {
    const thickness = (90 + (Date.now() % 9) / 10).toFixed(1)
    const csv = `Thickness (mm),Min kg,Max kg,Notes\n${thickness},"1,000.500",1001.250,e2e\n`
    const check = await upload(request, 'tolerances', 'tolerance.csv', Buffer.from(csv), true)
    const report = (await check.json()) as Report
    expect(report.created).toBe(1)
    const pasted = await request.post('/api/cc_production/upload', { data: { register: 'tolerances', dryRun: true, rows: [{ 'Thickness (mm)': thickness, 'Min kg': 'NIL', 'Max kg': '5' }] } })
    expect(((await pasted.json()) as Report).created).toBe(1)
    const post = await upload(request, 'tolerances', 'tolerance.csv', Buffer.from(csv), false)
    expect(((await post.json()) as Report).created).toBe(1)
    const list = ((await (await request.get('/api/cc_production/masters?type=tolerances')).json()) as { items: Array<{ id: string; updatedAt: string; thicknessMm: number; minKg: number }> }).items
    const row = list.find((entry) => entry.thicknessMm === Number(thickness))
    expect(row?.minKg).toBe(1000.5)
    await request.delete(`/api/cc_production/masters?type=tolerances&id=${row!.id}`, { headers: { [LOCK]: row!.updatedAt } })
  })

  test('a sheet without the required columns, or the wrong file type, is refused with a clear reason', async ({ request }) => {
    const missing = await upload(request, 'moulds', 'wrong.csv', Buffer.from('Description,Size\nBush,8x4\n'), true)
    expect(missing.status()).toBe(400)
    expect(((await missing.json()) as { error: string }).error).toMatch(/Die No/)
    const wrongType = await upload(request, 'moulds', 'moulds.pdf', Buffer.from('%PDF'), true)
    expect(wrongType.status()).toBe(400)
    const unknown = await request.post('/api/cc_production/upload', { data: { register: 'nothing', rows: [{ a: '1' }] } })
    expect(unknown.status()).toBe(404)
  })

  test('upload pages open', async ({ request }) => {
    for (const path of ['/backend/upload', '/backend/upload/moulds', '/backend/upload/history']) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
    }
  })
})
