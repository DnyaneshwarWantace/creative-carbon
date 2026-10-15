import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const SHOTS = process.env.CC_SHOTS_DIR
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

type Letter = { quoteType: string; toDesignation: string; toCompany: string; toAddress: string; kindAttn: string; refLine: string; delivery: string; taxes: string; packing: string; freight: string; validity: string; payment: string; showTotal: boolean; lines: Array<{ drawing: string; unit: string; ratePer: string }> }
type Quote = { id: string; quoteNo: string; updatedAt: string; letter: Letter; customerPoRef?: string | null }

async function quote(request: APIRequestContext, id: string): Promise<Quote> {
  return (await request.get(`/api/cc_crm/quotations?id=${id}`)).json()
}

test.describe.serial('Phase I · quotation printed like the client quotation', () => {
  let quoteId: string

  test('a quotation from a mailed enquiry gets the To block, kind attention, reference line and terms', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `Sample Steel E2E ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const enquiry = await request.post('/api/cc_crm/enquiries', { data: { source: 'Email', receivedAt: '2026-08-21T10:00:00.000Z', customerId, contactName: 'Ravi K.', phone: '9000000002', subject: 'Fibre bearings as per drawing' } })
    expect(enquiry.ok(), await enquiry.text()).toBeTruthy()
    const enquiryId = ((await enquiry.json()) as { id: string }).id
    const products = ((await (await request.get('/api/cc_products/search?kinds=moulded&q=Moulded')).json()) as { items: Array<{ id: string; title: string }> }).items
    expect(products.length).toBeGreaterThan(1)
    const created = await request.post('/api/cc_crm/quotations', {
      data: {
        orderDate: today,
        validUntil: new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        enquiryId,
        customerId,
        lines: [
          { productId: products[0].id, quantity: 120, rate: 2450, gstPercent: 18 },
          { productId: products[1].id, quantity: 40, rate: 875, gstPercent: 18 },
        ],
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    quoteId = ((await created.json()) as { id: string }).id
    const made = await quote(request, quoteId)
    expect(made.letter.quoteType).toBe('budgetary')
    expect(made.letter.toCompany).toBe(`SAMPLE STEEL E2E ${stamp}`)
    expect(made.letter.kindAttn).toBe('RAVI K.')
    expect(made.letter.refLine).toBe('With Ref. To your Mail Dated: 21/08/2026 by Ravi K.. MO: 9000000002')
    expect(made.letter).toMatchObject({ delivery: 'Within 30 to 40 Days', packing: 'Nill', freight: 'Freight Paid Basis', validity: '30 DAYS' })
    expect(made.letter.taxes).toMatch(/^(I)?GST-18% Extra or as Applicable\.$/)
    expect(made.letter.lines).toEqual([
      { drawing: '', unit: 'NOS', ratePer: 'EACH' },
      { drawing: '', unit: 'NOS', ratePer: 'EACH' },
    ])
  })

  test('the letter is saved, logged, kept when the quotation is edited, and refused when malformed', async ({ request }) => {
    const before = await quote(request, quoteId)
    const letter = { ...before.letter, toDesignation: 'MANAGER, MAINTENANCE', toAddress: 'SAMPLE TOWN - 000001', taxes: 'IGST-18% Extra or as Applicable.', payment: '100% Against GRN.', lines: [{ drawing: 'AS PER YOUR DRAWING NO: DRG-E2E-001/1', unit: 'NOS', ratePer: 'EACH' }, { drawing: 'AS PER YOUR DRAWING NO. DRG-E2E-002/3', unit: 'NOS.', ratePer: 'EACH' }] }
    const saved = await request.put('/api/cc_crm/quotations/letter', { data: { id: quoteId, letter }, headers: { [LOCK]: before.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    let after = await quote(request, quoteId)
    expect(after.letter.toDesignation).toBe('MANAGER, MAINTENANCE')
    expect(after.letter.lines[1].drawing).toBe('AS PER YOUR DRAWING NO. DRG-E2E-002/3')
    const bad = await request.put('/api/cc_crm/quotations/letter', { data: { id: quoteId, letter: { ...letter, quoteType: 'maybe' } }, headers: { [LOCK]: after.updatedAt } })
    expect(bad.status()).toBe(400)
    const changes = await request.put('/api/cc_crm/quotations/letter', { data: { id: quoteId, letter: { ...letter, delivery: 'Within 20 to 25 Days' } }, headers: { [LOCK]: after.updatedAt } })
    expect(changes.ok(), await changes.text()).toBeTruthy()
    const log = ((await (await request.get(`/api/cc_audit/activity?type=quotation&id=${quoteId}`)).json()) as { items: Array<{ action: string; changes: Array<{ field: string; to: unknown }> | null }> }).items
    expect(log.find((item) => item.action === 'letter_edited' && item.changes?.some((change) => change.field === 'letter.delivery'))).toBeTruthy()
    after = await quote(request, quoteId)
    const full = (await (await request.get(`/api/cc_crm/quotations?id=${quoteId}`)).json()) as Record<string, unknown> & { lines: Array<{ productId: string; quantity: number; rate: number; gstPercent: number }> }
    const edited = await request.put('/api/cc_crm/quotations', { data: { id: quoteId, orderDate: today, customerId: full.customerId, enquiryId: full.enquiryId, validUntil: full.validUntil, customerPoRef: 'Mail 29/08', lines: full.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, rate: line.rate, gstPercent: line.gstPercent })) }, headers: { [LOCK]: after.updatedAt } })
    expect(edited.ok(), await edited.text()).toBeTruthy()
    expect((await quote(request, quoteId)).letter.delivery).toBe('Within 20 to 25 Days')
  })

  test('the quotation page shows the letterhead print', async ({ page }) => {
    await page.goto(`/backend/crm/quotations/${quoteId}`)
    const frame = page.frameLocator('iframe').first()
    await expect(frame.locator('body')).toContainText('TERMS & CONDITIONS', { timeout: 30_000 })
    const text = (await frame.locator('body').innerText()).replace(/\s+/g, ' ')
    for (const part of ['CREATIVE CARBON', 'COMPOSITES PVT. LTD.', 'QUOTATION', 'REF.NO: CCPL/', 'DATE:-', 'TO,', 'MANAGER, MAINTENANCE', 'SAMPLE TOWN - 000001', 'Dear Sir,', 'KIND ATTN - MR. RAVI K.', 'With Ref. To your Mail Dated: 21/08/2026', 'We submit our BUDGETARY QUOTATION', 'DESCRIPTION', 'AS PER YOUR DRAWING NO: DRG-E2E-001/1', '120 NOS', 'EACH', '2450=00', '875=00', 'GSTIN NO :', 'DELIVERY', 'Within 20 to 25 Days', 'IGST-18% Extra or as Applicable.', 'Freight Paid Basis', '30 DAYS', '100% Against GRN.', 'Please find above Quotation', 'Jurisdiction', 'IFSC', 'Director']) expect(text, part).toContain(part)
    await expect(frame.locator('img.logo')).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/quotation.png`, fullPage: true })
  })
})
