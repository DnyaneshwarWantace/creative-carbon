import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const SHOTS = process.env.CC_SHOTS_DIR
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

type Print = { formNo: string; instructions: string; needsTc: boolean; deliverAt: string; taxes: string; packing: string; delivery: string; through: string; payment: string; warranty: string }
type Po = { id: string; code: string; status: string; updatedAt: string; printDetails: Print; lines: Array<{ id: string }> }

async function po(request: APIRequestContext, id: string): Promise<Po> {
  return (await request.get(`/api/cc_purchase/orders?id=${id}`)).json()
}

test.describe.serial('Phase M · purchase order printed like PO 25 to Ketan Chemical', () => {
  let poId: string

  test('a new PO gets the client print defaults and the CCCPL/A/NNN/2026-27 number', async ({ request }) => {
    const vendor = await request.post('/api/cc_vendors/vendors', { data: { name: `Ketan Chemical E2E ${stamp}`, address: 'Mumbai West', organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(vendor.ok(), await vendor.text()).toBeTruthy()
    const vendorId = ((await vendor.json()) as { id: string }).id
    const items = ((await (await request.get('/api/cc_products/search?kinds=chemical&q=Methanol')).json()) as { items: Array<{ id: string; title: string }> }).items
    const created = await request.post('/api/cc_purchase/orders', { data: { vendorId, poDate: today, submit: true, lines: [{ productId: items.find((item) => item.title === 'Methanol')!.id, quantity: 1000, rate: 147, gstPercent: 18 }] } })
    expect(created.status(), await created.text()).toBe(201)
    poId = ((await created.json()) as { id: string }).id
    const made = await po(request, poId)
    expect(made.code).toMatch(/^CCCPL\/A\/\d{3}\/\d{4}-\d{2}$/)
    expect(made.printDetails).toMatchObject({ formNo: 'CCCPL/F/PUR/03', needsTc: false, deliverAt: 'KANERA PLANT', packing: 'NILL', delivery: 'IMMEDIATE', through: 'LOCAL TRANSPORT' })
    expect(made.printDetails.taxes).toMatch(/GST EXTRA AT APPLICABLE$/)
  })

  test('print details are saved and logged; the supplier test certificate is asked for', async ({ request }) => {
    const current = await po(request, poId)
    const saved = await request.put('/api/cc_purchase/orders/print-details', { data: { id: poId, printDetails: { ...current.printDetails, needsTc: true, instructions: 'Packing 25 kg bags', payment: 'Routine' } }, headers: { [LOCK]: current.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    const after = await po(request, poId)
    expect(after.printDetails).toMatchObject({ needsTc: true, instructions: 'Packing 25 kg bags' })
    const log = ((await (await request.get(`/api/cc_audit/activity?type=po&id=${poId}`)).json()) as { items: Array<{ action: string }> }).items
    expect(log.some((item) => item.action === 'print_details')).toBeTruthy()
  })

  test('goods receiving asks for the test certificate or a reason', async ({ request }) => {
    let current = await po(request, poId)
    const approved = await request.post('/api/cc_purchase/orders/approve', { data: { id: poId }, headers: { [LOCK]: current.updatedAt } })
    expect(approved.ok(), await approved.text()).toBeTruthy()
    current = await po(request, poId)
    const line = { poLineId: current.lines[0].id, quantity: 100, lotNumber: `E2E24-${stamp}` }
    const refused = await request.post('/api/cc_purchase/grns', { data: { poId, grnDate: today, lines: [line] } })
    expect(refused.status()).toBe(400)
    expect(((await refused.json()) as { error: string }).error).toMatch(/test certificate/)
    const ok = await request.post('/api/cc_purchase/grns', { data: { poId, grnDate: today, tcReceived: false, tcMissingReason: 'Supplier will mail it today', lines: [line] } })
    expect(ok.status(), await ok.text()).toBe(201)
  })

  test('the PO page shows the letterhead print', async ({ page }) => {
    await page.goto(`/backend/purchase/orders/${poId}`)
    const frame = page.frameLocator('iframe').first()
    await expect(frame.locator('body')).toContainText('PURCHASE ORDER', { timeout: 30_000 })
    const text = (await frame.locator('body').innerText()).replace(/\s+/g, ' ')
    for (const part of ['CREATIVE CARBON', 'TO-:', 'CCCPL/F/PUR/03', `KETAN CHEMICAL E2E ${stamp}`, 'MUMBAI WEST', 'P.O NO- CCCPL/A/', 'DATE-', 'OUR GST NO: 24AAICC5600P1ZJ', 'SR.N', 'ITEM NAME', 'RATE PER', '147.00', '147000.00', 'BASIC AMT', '# PLEASE PROVIDE TEST CERTIFICATE ALONG WITH DELIVERY', 'PACKING 25 KG BAGS', 'DELIVERY - KANERA PLANT', 'TOTAL .RS :-', 'TERMS & CONDITION-:', 'IMMEDIATE', 'LOCAL TRANSPORT', 'ROUTINE', 'Yours Faithfully', 'GAURANTY/WARRANTY-: 12 MONTHS']) expect(text, part).toContain(part)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/po.png`, fullPage: true })
  })
})
