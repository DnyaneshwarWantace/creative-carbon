import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()

type Stage = { id: string; key: string; label: string; kind: string; system: boolean; isActive: boolean; position: number; questions: Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }> }
type Enquiry = { id: string; stage: string; updatedAt: string; lostReason: string | null; stageAnswers?: Record<string, { answers: Record<string, unknown> }> }

async function stages(request: APIRequestContext, all = false): Promise<Stage[]> {
  return ((await (await request.get(`/api/cc_crm/stages${all ? '?all=1' : ''}`)).json()) as { items: Stage[] }).items
}

async function enquiry(request: APIRequestContext, id: string): Promise<Enquiry> {
  return (await request.get(`/api/cc_crm/enquiries?id=${id}`)).json()
}

async function move(request: APIRequestContext, id: string, stage: string, answers?: Record<string, unknown>) {
  return request.post('/api/cc_crm/enquiries/action', { data: { id, action: 'stage', stage, ...(answers ? { answers } : {}) }, headers: { [LOCK]: (await enquiry(request, id)).updatedAt } })
}

test.describe.serial('CRM pipeline: stages you can add, questions asked on entry, the board', () => {
  let stageId: string
  let stageKey: string
  let enquiryId: string

  test('the built-in stages are there in board order, Won and Lost last', async ({ request }) => {
    const list = await stages(request)
    const keys = list.map((stage) => stage.key)
    for (const key of ['new', 'quoted', 'negotiating', 'won', 'lost']) expect(keys).toContain(key)
    expect(keys.slice(-2)).toEqual(['won', 'lost'])
    const lost = list.find((stage) => stage.key === 'lost')!
    expect(lost.questions.find((question) => question.key === 'lost_reason')?.options?.length).toBeGreaterThan(0)
  })

  test('a new stage with its own required question sits before Won', async ({ request }) => {
    const created = await request.post('/api/cc_crm/stages', { data: { label: `Sample sent ${stamp}`, tone: 'info', afterKey: 'quoted', questions: [{ label: 'Sample sent on', type: 'date', required: true }, { label: 'Courier', type: 'select', required: false, options: ['DTDC', 'Blue Dart'] }] } })
    expect(created.status(), await created.text()).toBe(201)
    const stage = (await created.json()) as Stage
    stageId = stage.id
    stageKey = stage.key
    const keys = (await stages(request)).map((entry) => entry.key)
    expect(keys.indexOf(stageKey)).toBe(keys.indexOf('quoted') + 1)
    expect((await request.post('/api/cc_crm/stages', { data: { label: `Sample sent ${stamp}` } })).status()).toBe(409)
  })

  test('moving an enquiry in asks the questions; answers are kept on the enquiry and in its history', async ({ request }) => {
    const created = await request.post('/api/cc_crm/enquiries', { data: { source: 'Phone', receivedAt: new Date().toISOString(), companyName: `E2E20 Pipeline ${stamp}`, contactName: 'Mr Rao', subject: 'G10 sheets' } })
    expect(created.ok(), await created.text()).toBeTruthy()
    enquiryId = ((await created.json()) as { id: string }).id
    const refused = await move(request, enquiryId, stageKey)
    expect(refused.status()).toBe(400)
    expect(((await refused.json()) as { error: string }).error).toMatch(/Sample sent on/)
    const wrongChoice = await move(request, enquiryId, stageKey, { sample_sent_on: '2026-10-10', courier: 'FedEx' })
    expect(wrongChoice.status()).toBe(400)
    const moved = await move(request, enquiryId, stageKey, { sample_sent_on: '2026-10-10', courier: 'DTDC' })
    expect(moved.ok(), await moved.text()).toBeTruthy()
    const row = await enquiry(request, enquiryId)
    expect(row.stage).toBe(stageKey)
    expect(row.stageAnswers?.[stageKey]?.answers).toMatchObject({ sample_sent_on: '2026-10-10', courier: 'DTDC' })
    const activity = ((await (await request.get(`/api/cc_audit/activity?type=enquiry&id=${enquiryId}`)).json()) as { items: Array<{ action: string; changes: Array<{ label: string; to: unknown }> | null }> }).items
    expect(activity.find((item) => item.action === 'stage_moved')?.changes).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Sample sent on', to: '2026-10-10' })]))
    expect((await move(request, enquiryId, stageKey)).status()).toBe(409)
  })

  test('the board lists the card in its column; reordering stages keeps Won and Lost last', async ({ request }) => {
    const board = ((await (await request.get('/api/cc_crm/enquiries?board=1')).json()) as { items: Array<{ id: string; stage: string; partyName: string | null }> }).items
    expect(board.find((card) => card.id === enquiryId)).toMatchObject({ stage: stageKey, partyName: `E2E20 Pipeline ${stamp}` })
    const open = (await stages(request, true)).filter((stage) => stage.kind === 'open')
    const order = [stageId, ...open.filter((stage) => stage.id !== stageId).map((stage) => stage.id)]
    const reordered = await request.put('/api/cc_crm/stages', { data: { order } })
    expect(reordered.ok(), await reordered.text()).toBeTruthy()
    const keys = (await stages(request)).map((stage) => stage.key)
    expect(keys[0]).toBe(stageKey)
    expect(keys.slice(-2)).toEqual(['won', 'lost'])
    const back = await request.put('/api/cc_crm/stages', { data: { order: open.map((stage) => stage.id) } })
    expect(back.ok()).toBeTruthy()
  })

  test('a stage in use cannot be removed or switched off; built-ins cannot be removed', async ({ request }) => {
    expect((await request.delete(`/api/cc_crm/stages?id=${stageId}`)).status()).toBe(409)
    expect((await request.put('/api/cc_crm/stages', { data: { id: stageId, isActive: false } })).status()).toBe(409)
    const builtIn = (await stages(request)).find((stage) => stage.key === 'new')!
    expect((await request.delete(`/api/cc_crm/stages?id=${builtIn.id}`)).status()).toBe(409)
  })

  test('lost through the stage questions needs the reason', async ({ request }) => {
    const lost = (await stages(request)).find((stage) => stage.key === 'lost')!
    expect((await move(request, enquiryId, 'lost')).status()).toBe(400)
    const done = await move(request, enquiryId, 'lost', { lost_reason: lost.questions[0].options![0], lost_to: 'Another maker' })
    expect(done.ok(), await done.text()).toBeTruthy()
    expect((await enquiry(request, enquiryId)).lostReason).toBe(lost.questions[0].options![0])
  })

  test('cleanup: the empty custom stage is removed', async ({ request }) => {
    expect((await request.delete(`/api/cc_crm/stages?id=${stageId}`)).ok()).toBeTruthy()
    expect((await stages(request, true)).some((stage) => stage.id === stageId)).toBeFalsy()
    for (const path of ['/backend/crm/pipeline', '/backend/crm/stages']) expect((await request.get(path)).status(), path).toBe(200)
  })

  test('the CRM menu lists each page once and has the board and stage settings', async ({ request }) => {
    const nav = (await (await request.get('/api/cc_departments/nav?workspace=crm')).json()) as { groups: Array<{ items: Array<{ href: string; children: unknown[] }> }> }
    const hrefs = nav.groups.flatMap((group) => group.items.map((item) => item.href))
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs).toEqual(expect.arrayContaining(['/backend/crm/pipeline', '/backend/crm/stages', '/backend/crm/enquiries']))
    expect(nav.groups.every((group) => group.items.every((item) => item.children.length === 0))).toBeTruthy()
  })
})
