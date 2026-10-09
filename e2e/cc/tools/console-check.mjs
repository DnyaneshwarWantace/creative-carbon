import { chromium, devices } from '@playwright/test'
const paths = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ ...devices['iPhone 13'], baseURL: 'http://localhost:3010' })
await context.request.post('/api/auth/login', { data: { email: 'admin@creativecarbon.local', password: process.env.CC_ADMIN_PASSWORD } })
const page = await context.newPage()
page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') console.log(`[${message.type()}]`, message.text().slice(0, 400)) })
page.on('pageerror', (error) => console.log('[pageerror]', error.message.slice(0, 400)))
for (const path of paths) {
  console.log('==', path)
  await page.goto(path, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(2000)
}
await browser.close()
