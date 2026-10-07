import { expect, test as setup } from '@playwright/test'
import { AUTH_FILE } from '../playwright.config'

setup('log in as the Creative Carbon admin', async ({ request }) => {
  const email = process.env.CC_ADMIN_EMAIL ?? 'admin@creativecarbon.local'
  const password = process.env.CC_ADMIN_PASSWORD
  if (!password) throw new Error('[internal] set CC_ADMIN_PASSWORD to run the Creative Carbon e2e suite')
  const response = await request.post('/api/auth/login', { data: { email, password } })
  expect(response.status(), await response.text()).toBeLessThan(400)
  await request.storageState({ path: AUTH_FILE })
})
