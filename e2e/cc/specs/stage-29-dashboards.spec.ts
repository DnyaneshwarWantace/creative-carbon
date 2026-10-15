import { expect, test } from '@playwright/test'

test.describe('Dashboards · Order tracker and Plant today as masonry boards', () => {
  test('the order tracker API gives 14 days of deliveries and the 30-day order mix', async ({ request }) => {
    const response = await request.get('/api/cc_dashboard/overview')
    expect(response.ok(), await response.text()).toBeTruthy()
    const body = (await response.json()) as { today: string; dueByDay: Array<{ date: string; count: number }>; statusMix: Array<{ status: string; count: number }> }
    expect(body.dueByDay).toHaveLength(14)
    expect(body.dueByDay[0].date).toBe(body.today)
    expect(Array.isArray(body.statusMix)).toBeTruthy()
  })

  test('the plant today API gives the press floor and a 7-day trend', async ({ request }) => {
    const response = await request.get('/api/cc_production/owner?date=2026-10-02')
    expect(response.ok(), await response.text()).toBeTruthy()
    const body = (await response.json()) as { pressFloor: unknown[]; trend: unknown[] }
    expect(Array.isArray(body.pressFloor)).toBeTruthy()
    expect(body.trend).toHaveLength(7)
  })

  test('both boards render their cards', async ({ page }) => {
    await page.goto('/backend/overview')
    for (const heading of ['Where orders are right now', 'Delivery promise', 'Deliveries in the next 14 days', 'Stuck the longest', 'Orders in the last 30 days', 'Latest orders']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 60_000 })
    }
    await page.goto('/backend/owner')
    for (const heading of ['Plan vs made', 'Press floor', 'Last 7 days']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 60_000 })
    }
  })

  test('home opens Plant today for the owner', async ({ page }) => {
    await page.goto('/backend')
    await expect(page).toHaveURL(/\/backend\/owner/)
  })
})
