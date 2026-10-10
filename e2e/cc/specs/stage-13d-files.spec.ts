import { expect, test, type APIRequestContext } from '@playwright/test'

const stamp = Date.now()
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

type FileItem = { id: string; fileName: string; label: string | null; version: number; by: string | null; older: Array<{ id: string; version: number }> }

async function upload(request: APIRequestContext, entityId: string, recordId: string, name: string, mimeType: string, buffer: Buffer): Promise<string> {
  const sent = await request.post('/api/attachments', { multipart: { entityId, recordId, file: { name, mimeType, buffer } } })
  expect(sent.ok(), await sent.text()).toBeTruthy()
  return ((await sent.json()) as { item: { id: string } }).item.id
}

test.describe.serial('Phase A · photos and PDFs on any record, old versions kept, shown in the timeline', () => {
  let vendorId: string
  let entityId: string
  let recordId: string
  let firstId: string
  let secondId: string

  test('fixture: a vendor', async ({ request }) => {
    const created = await request.post('/api/cc_vendors/vendors', { data: { name: `E2E13 Files ${stamp}`, contactPhone: '9822033333', organizationId: process.env.CC_ORG, tenantId: process.env.CC_TENANT } })
    expect(created.status(), await created.text()).toBe(201)
    vendorId = ((await created.json()) as { id: string }).id
    const empty = (await (await request.get(`/api/cc_audit/files?type=vendor&id=${vendorId}`)).json()) as { entityId: string; recordId: string; items: FileItem[] }
    expect(empty.items).toEqual([])
    entityId = empty.entityId
    recordId = empty.recordId
  })

  test('an upload is recorded with its label and who uploaded it, and lands in the timeline', async ({ request }) => {
    firstId = await upload(request, entityId, recordId, 'gst-certificate.png', 'image/png', PNG)
    const noted = await request.post('/api/cc_audit/files', { data: { type: 'vendor', id: vendorId, attachmentId: firstId, label: 'GST certificate' } })
    expect(noted.ok(), await noted.text()).toBeTruthy()
    const page = (await (await request.get(`/api/cc_audit/files?type=vendor&id=${vendorId}`)).json()) as { items: FileItem[] }
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ id: firstId, label: 'GST certificate', version: 1, by: expect.any(String), older: [] })
    const twice = await request.post('/api/cc_audit/files', { data: { type: 'vendor', id: vendorId, attachmentId: firstId } })
    expect(twice.status()).toBe(409)
  })

  test('replacing keeps the old file as an earlier version', async ({ request }) => {
    secondId = await upload(request, entityId, recordId, 'gst-certificate-2026.pdf', 'application/pdf', PDF)
    const replaced = await request.post('/api/cc_audit/files', { data: { type: 'vendor', id: vendorId, attachmentId: secondId, replaces: firstId } })
    expect(replaced.ok(), await replaced.text()).toBeTruthy()
    const page = (await (await request.get(`/api/cc_audit/files?type=vendor&id=${vendorId}`)).json()) as { items: FileItem[] }
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ id: secondId, label: 'GST certificate', version: 2, older: [{ id: firstId, version: 1 }] })
    expect((await request.get(`/api/attachments/file/${firstId}`)).ok()).toBeTruthy()
    const again = await request.post('/api/cc_audit/files', { data: { type: 'vendor', id: vendorId, attachmentId: await upload(request, entityId, recordId, 'x.png', 'image/png', PNG), replaces: firstId } })
    expect(again.status()).toBe(409)
  })

  test('the timeline shows both as documents with links to the files', async ({ request }) => {
    const timeline = (await (await request.get(`/api/cc_audit/activity?type=vendor&id=${vendorId}&kind=document`)).json()) as { items: Array<{ action: string; summary: string; by: string | null; links: Array<{ type: string; id: string }> }> }
    expect(timeline.items.map((item) => item.action).sort()).toEqual(['file_replaced', 'file_uploaded'])
    const replaced = timeline.items.find((item) => item.action === 'file_replaced')!
    expect(replaced.summary).toMatch(/old one is kept|old file is kept/)
    expect(replaced.links.map((link) => link.id)).toEqual([secondId, firstId])
  })

  test('a file from another record cannot be claimed, and unknown types are refused', async ({ request }) => {
    const elsewhere = await upload(request, entityId, `vendor:00000000-0000-4000-8000-000000000000`, 'other.png', 'image/png', PNG)
    expect((await request.post('/api/cc_audit/files', { data: { type: 'vendor', id: vendorId, attachmentId: elsewhere } })).status()).toBe(404)
    expect((await request.get(`/api/cc_audit/files?type=nothing&id=${vendorId}`)).status()).toBe(400)
    await request.delete(`/api/attachments?id=${elsewhere}`)
  })

  test('cleanup', async ({ request }) => {
    expect((await request.delete(`/api/cc_vendors/vendors?id=${vendorId}`)).ok()).toBeTruthy()
  })
})
