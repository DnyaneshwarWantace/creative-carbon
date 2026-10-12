import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { AUTH_FILE } from './playwright.config'

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  outputDir: path.join(__dirname, '.results-demo'),
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.CC_BASE_URL ?? 'http://localhost:3010',
    extraHTTPHeaders: { accept: 'application/json, text/html' },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'demo', testMatch: /demo-.*\.spec\.ts/, dependencies: ['setup'], use: { storageState: AUTH_FILE } },
  ],
})
