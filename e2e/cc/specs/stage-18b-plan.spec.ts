import { expect, test, type APIRequestContext } from '@playwright/test'

const LOCK = 'x-om-ext-optimistic-lock-expected-updated-at'
const stamp = Date.now()
const AHEAD = `${3000 + (Math.floor(stamp / 1000) % 5000)}-${String(1 + (stamp % 12)).padStart(2, '0')}-${String(1 + (Math.floor(stamp / 12) % 28)).padStart(2, '0')}`
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)

type Line = { area: string; resource: string; item?: string | null; plannedQty: number; unit: string }
type PlanView = { id: string | null; updatedAt: string | null; lines: Line[]; notes: string | null }
type PlanDetail = PlanView & { status: string; rows: Array<Line & { actual: number }>; versionList: Array<{ version: number; reason: string | null; lines: Line[] }> }
type Activity = { action: string; reason: string | null; kind: string; changes: Array<{ field: string; label: string; from: unknown; to: unknown }> | null }

async function plan(request: APIRequestContext, date: string): Promise<PlanView> {
  return (await request.get(`/api/cc_production/plan?date=${date}`)).json()
}

async function save(request: APIRequestContext, date: string, lines: Line[], reason?: string) {
  const current = await plan(request, date)
  return request.put('/api/cc_production/plan', { data: { planDate: date, lines, notes: null, ...(reason ? { reason } : {}) }, headers: current.updatedAt ? { [LOCK]: current.updatedAt } : {} })
}

async function activity(request: APIRequestContext, id: string): Promise<Activity[]> {
  return ((await (await request.get(`/api/cc_audit/activity?type=plan&id=${id}`)).json()) as { items: Activity[] }).items
}

test.describe.serial('Phase F · the plan for a day: its own page, old → new changes, earlier versions kept', () => {
  let planId: string

  test('a plan written ahead is changed freely; each change keeps the old version and logs old → new', async ({ request }) => {
    const written = await save(request, AHEAD, [{ area: 'press', resource: '22', plannedQty: 900, unit: 'kg' }])
    expect(written.ok(), await written.text()).toBeTruthy()
    planId = ((await written.json()) as PlanView).id!
    const changed = await save(request, AHEAD, [{ area: 'press', resource: '22', plannedQty: 1100, unit: 'kg' }, { area: 'moulding', resource: '12', item: '177', plannedQty: 30, unit: 'nos' }])
    expect(changed.ok(), await changed.text()).toBeTruthy()
    const log = await activity(request, planId)
    expect(log.find((item) => item.action === 'written')).toBeTruthy()
    const change = log.find((item) => item.action === 'changed')!
    expect(change.changes).toEqual(expect.arrayContaining([{ field: 'lines[0].plannedQty', label: 'Line 1 · Planned qty', from: 900, to: 1100 }, expect.objectContaining({ field: 'lines[1].area', from: null, to: 'moulding' })]))
    const detail = (await (await request.get(`/api/cc_production/plan?key=${AHEAD}`)).json()) as PlanDetail
    expect(detail.status).toBe('ahead')
    expect(detail.versionList).toEqual([expect.objectContaining({ version: 1, lines: [expect.objectContaining({ plannedQty: 900 })] })])
    expect(detail.rows.map((row) => [row.area, row.plannedQty, row.actual])).toEqual([['press', 1100, 0], ['moulding', 30, 0]])
    const byId = (await (await request.get(`/api/cc_production/plan?key=${planId}`)).json()) as PlanDetail
    expect(byId.versionList.length).toBe(1)
  })

  test('a plan changed on its own day needs a reason; a day that is over is closed', async ({ request }) => {
    const original = await plan(request, today)
    if (!original.id) expect((await save(request, today, [{ area: 'resin', resource: '', plannedQty: 500, unit: 'kg' }])).ok()).toBeTruthy()
    const before = await plan(request, today)
    const lines: Line[] = [...before.lines, { area: 'coating', resource: 'Dryer 9', plannedQty: 1, unit: 'kg' }]
    const refused = await save(request, today, lines)
    expect(refused.status()).toBe(400)
    expect(((await refused.json()) as { error: string }).error).toMatch(/Write why/)
    const changed = await save(request, today, lines, 'Die change on press 12 took the morning')
    expect(changed.ok(), await changed.text()).toBeTruthy()
    const id = ((await changed.json()) as PlanView).id!
    const entry = (await activity(request, id)).find((item) => item.action === 'changed' && item.reason === 'Die change on press 12 took the morning')!
    expect(entry.kind).toBe('correction')
    expect(((await (await request.get(`/api/cc_production/plan?key=${today}`)).json()) as PlanDetail).versionList.at(-1)?.reason).toBe('Die change on press 12 took the morning')
    expect((await save(request, today, before.lines, 'e2e: put back the plan as it was')).ok()).toBeTruthy()

    const closed = await request.put('/api/cc_production/plan', { data: { planDate: '2001-01-02', lines: [] } })
    expect(closed.status()).toBe(409)
  })

  test('the plan page opens by date and by id', async ({ request }) => {
    expect((await request.get(`/backend/owner/plan/${AHEAD}`)).status()).toBe(200)
    expect((await request.get(`/backend/owner/plan/${planId}`)).status()).toBe(200)
  })
})
