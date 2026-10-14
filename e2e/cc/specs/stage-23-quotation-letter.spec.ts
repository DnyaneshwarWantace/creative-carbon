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

test.describe.serial('Phase I · quotation printed like the SAIL quotation 111', () => {
  let quoteId: string

  test('a quotation from a mailed enquiry gets the To block, kind attention, reference line and terms', async ({ request }) => {
    const customer = await request.post('/api/customers/companies', { data: { displayName: `Steel Authority E2E ${stamp}`, organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    const customerId = ((await customer.json()) as { id: string }).id
    const enquiry = await request.post('/api/cc_crm/enquiries', { data: { source: 'Email', receivedAt: '2026-08-29T10:00:00.000Z', customerId, contactName: 'Harish R.', phone: '9480829173', subject: 'Fibre bearings as per drawing' } })
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
          { productId: products[0].id, quantity: 150, rate: 2735, gstPercent: 18 },
          { productId: products[1].id, quantity: 50, rate: 930, gstPercent: 18 },
        ],
      },
    })
    expect(created.status(), await created.text()).toBe(201)
    quoteId = ((await created.json()) as { id: string }).id
    const made = await quote(request, quoteId)
    expect(made.letter.quoteType).toBe('budgetary')
    expect(made.letter.toCompany).toBe(`STEEL AUTHORITY E2E ${stamp}`)
    expect(made.letter.kindAttn).toBe('HARISH R.')
    expect(made.letter.refLine).toBe('With Ref. To your Mail Dated: 29/08/2026 by Harish R.. MO: 9480829173')
    expect(made.letter).toMatchObject({ delivery: 'Within 30 to 40 Days', packing: 'Nill', freight: 'Freight Paid Basis', validity: '30 DAYS' })
    expect(made.letter.taxes).toMatch(/^(I)?GST-18% Extra or as Applicable\.$/)
    expect(made.letter.lines).toEqual([
      { drawing: '', unit: 'NOS', ratePer: 'EACH' },
      { drawing: '', unit: 'NOS', ratePer: 'EACH' },
    ])
  })

  test('the letter is saved, logged, kept when the quotation is edited, and refused when malformed', async ({ request }) => {
    const before = await quote(request, quoteId)
    const letter = { ...before.letter, toDesignation: 'DY. MANAGER, MECHANICAL, SHOPS, D&D', toAddress: 'BHADRAVATHI, KARNATAKA - 577301', taxes: 'IGST-18% Extra or as Applicable.', payment: '100% Against GRN.', lines: [{ drawing: 'AS PER YOUR DRAWING NO: SW 675124/1', unit: 'NOS', ratePer: 'EACH' }, { drawing: 'AS PER YOUR DRAWING NO. SW 674702/3', unit: 'NOS.', ratePer: 'EACH' }] }
    const saved = await request.put('/api/cc_crm/quotations/letter', { data: { id: quoteId, letter }, headers: { [LOCK]: before.updatedAt } })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    let after = await quote(request, quoteId)
    expect(after.letter.toDesignation).toBe('DY. MANAGER, MECHANICAL, SHOPS, D&D')
    expect(after.letter.lines[1].drawing).toBe('AS PER YOUR DRAWING NO. SW 674702/3')
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
    for (const part of ['CREATIVE CARBON', 'COMPOSITES PVT. LTD.', 'QUOTATION', 'REF.NO: CCPL/', 'DATE:-', 'TO,', 'DY. MANAGER, MECHANICAL, SHOPS, D&D', 'BHADRAVATHI, KARNATAKA - 577301', 'Dear Sir,', 'KIND ATTN - MR. HARISH R.', 'With Ref. To your Mail Dated: 29/08/2026', 'We submit our BUDGETARY QUOTATION', 'DESCRIPTION', 'AS PER YOUR DRAWING NO: SW 675124/1', '150 NOS', 'EACH', '2735=00', '930=00', 'GSTIN NO : 24AAICC5600P1ZJ', 'DELIVERY', 'Within 20 to 25 Days', 'IGST-18% Extra or as Applicable.', 'Freight Paid Basis', '30 DAYS', '100% Against GRN.', 'Please find above Quotation', 'AHMEDABAD', 'IFSC', 'Director']) expect(text, part).toContain(part)
    await expect(frame.locator('img.logo')).toBeVisible()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/quotation.png`, fullPage: true })
  })
})
