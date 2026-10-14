import { expect, test, type APIRequestContext } from '@playwright/test'
import { newCertificate, type Certificate } from '../../../apps/mercato/src/modules/cc_production/lib/testCertificate'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const SHOTS = process.env.CC_SHOTS_DIR
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

type Lab = { id: string; result: string; reportNo: string | null; updatedAt: string; issuedAt: string | null; certificate: Certificate | null; history: Array<{ action: string; note: string | null }> }

const RCPL: Record<string, string> = {
  Appearance: 'Smooth',
  Finish: 'Moulded',
  Thickness: '9.7 to 10.4',
  Density: '1.40',
  'Water absorption': '130',
  'Oil absorption': '10',
  'Wear Resistance': '500',
  'Cross breaking strength': '150',
  'Tensile strength': '66.0',
  'Compression strength': '251.48',
  'Insulation resistance|In Air': '>2000',
  'Insulation resistance|After 24 hrs. immersion in Water': '1000',
  'Dielectric strength, Edgewise': 'Pass at 25 KV',
  Machinability: 'Complied',
}

async function lab(request: APIRequestContext, id: string): Promise<Lab> {
  return (await request.get(`/api/cc_production/lab?id=${id}`)).json()
}

function filled(base: Certificate, density = '1.40'): Certificate {
  return { ...base, rows: base.rows.map((row) => ({ ...row, observed: row.property === 'Density' ? density : (RCPL[`${row.property}|${row.condition}`] ?? RCPL[row.property] ?? row.observed) })) }
}

test.describe.serial('Phase N · test certificate like the RCPL P2 certificate', () => {
  let labId: string
  let base: Certificate

  test('a certificate made on a lab test takes the next TC number and sets the result', async ({ request }) => {
    const created = await request.post('/api/cc_production/lab', { data: { testDate: today, customerName: `RCPL E2E ${stamp}`, itemTitle: 'Phenolic sheet 10mm', lotRefs: 'F/03/10/2026 10mm P2', testType: 'IS 2036 full test', standard: 'IS 2036', result: 'pending', testPoint: 'outgoing' } })
    expect(created.status(), await created.text()).toBe(201)
    labId = ((await created.json()) as { id: string }).id
    base = newCertificate({ templateKey: 'p2', tcNo: '', lotRefs: 'F/03/10/2026 10mm P2', customer: `RCPL E2E ${stamp}`, itemTitle: 'Phenolic sheet 10mm', thicknessMm: 10, testedBy: 'Vimal', verifiedBy: 'Dhairya Shah, Director' })
    let row = await lab(request, labId)
    const half = { ...base, rows: base.rows.map((item, index) => (index < 4 ? { ...filled(base).rows[index] } : item)) }
    const saved = await request.put('/api/cc_production/lab/certificate', { data: { id: labId, certificate: half }, headers: { [LOCK]: row.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    row = await lab(request, labId)
    expect(row.reportNo).toMatch(/^CCCPL\/\d{4}-\d{2}\/\d{3}$/)
    expect(row.certificate?.tcNo).toBe(row.reportNo)
    expect(row.result).toBe('pending')
    const issueEarly = await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'issue' }, headers: { [LOCK]: row.updatedAt } })
    expect(issueEarly.status()).toBe(400)
    expect(((await issueEarly.json()) as { error: string }).error).toMatch(/observed value/)
    const all = await request.put('/api/cc_production/lab/certificate', { data: { id: labId, certificate: { ...filled(base), tcNo: row.reportNo } }, headers: { [LOCK]: row.updatedAt } })
    expect(all.ok(), await all.text()).toBeTruthy()
    row = await lab(request, labId)
    expect(row.result).toBe('pass')
    expect(row.certificate?.rows.every((item) => item.remark === 'OK')).toBeTruthy()
  })

  test('a Not OK value fails the test; issuing it needs a reason', async ({ request }) => {
    let row = await lab(request, labId)
    const low = await request.put('/api/cc_production/lab/certificate', { data: { id: labId, certificate: { ...filled(base, '1.30'), tcNo: row.reportNo } }, headers: { [LOCK]: row.updatedAt } })
    expect(low.ok(), await low.text()).toBeTruthy()
    row = await lab(request, labId)
    expect(row.result).toBe('fail')
    expect(row.certificate?.rows.find((item) => item.property === 'Density')?.remark).toBe('NOT OK')
    const refused = await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'issue' }, headers: { [LOCK]: row.updatedAt } })
    expect(refused.status()).toBe(409)
    const back = await request.put('/api/cc_production/lab/certificate', { data: { id: labId, certificate: { ...filled(base), tcNo: row.reportNo } }, headers: { [LOCK]: row.updatedAt } })
    expect(back.ok(), await back.text()).toBeTruthy()
    row = await lab(request, labId)
    const issued = await request.post('/api/cc_production/lab/action', { data: { id: labId, action: 'issue' }, headers: { [LOCK]: row.updatedAt } })
    expect(issued.ok(), await issued.text()).toBeTruthy()
    row = await lab(request, labId)
    expect(row.issuedAt).toBeTruthy()
    const locked = await request.put('/api/cc_production/lab/certificate', { data: { id: labId, certificate: { ...filled(base), tcNo: row.reportNo } }, headers: { [LOCK]: row.updatedAt } })
    expect(locked.status()).toBe(409)
  })

  test('the lab page shows the certificate print', async ({ page }) => {
    await page.goto(`/backend/quality/lab/${labId}`)
    const frame = page.frameLocator('iframe').first()
    await expect(frame.locator('body')).toContainText('TEST CERTIFICATE', { timeout: 30_000 })
    const text = (await frame.locator('body').innerText()).replace(/\s+/g, ' ')
    for (const part of ['TC No.', 'CCCPL/', 'Production Traceability', 'F/03/10/2026', `RCPL E2E ${stamp}`, 'PHENOLIC SHEET', 'P2', '10 MM', 'Test Properties', 'Specified value as per', 'IS 2036 : 1995', '10.0 ± 0.60 mm', '9.7 to 10.4', 'Density', '> 1.35', '1.40', 'mg., max.', 'Cycles, min.', 'Pass at 25 KV', 'Complied', 'OK', 'Tested By: Vimal (Laboratory Department)', 'Verified By: Dhairya Shah (Director)']) expect(text, part).toContain(part)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tc.png`, fullPage: true })
  })
})
