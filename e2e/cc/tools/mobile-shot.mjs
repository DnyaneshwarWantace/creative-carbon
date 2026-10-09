import { chromium, devices } from '@playwright/test'
const [,, out, ...paths] = process.argv
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext(process.env.DESKTOP ? { viewport: { width: 1440, height: 1000 }, baseURL: 'http://localhost:3010' } : { ...devices['iPhone 13'], baseURL: 'http://localhost:3010' })
const login = await context.request.post('/api/auth/login', { data: { email: 'admin@creativecarbon.local', password: process.env.CC_ADMIN_PASSWORD } })
if (!login.ok()) throw new Error('login ' + login.status())
const page = await context.newPage()
for (const [index, path] of paths.entries()) {
  await page.goto(path, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(1200)
  const dismiss = page.getByRole('button', { name: 'Dismiss' })
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click()
  const scroll = Number(process.env.SCROLL ?? 0)
  if (scroll) await page.mouse.wheel(0, scroll)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}-${index}.png`, fullPage: Boolean(process.env.FULL) })
  console.log('shot', path)
}
await browser.close()
