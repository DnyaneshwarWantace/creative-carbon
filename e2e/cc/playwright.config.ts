import { defineConfig } from '@playwright/test'
import path from 'node:path'

export const AUTH_FILE = path.join(__dirname, '.auth', 'admin.json')

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  outputDir: path.join(__dirname, '.results'),
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { outputFolder: path.join(__dirname, '.report'), open: 'never' }]],
  use: {
    baseURL: process.env.CC_BASE_URL ?? 'http://localhost:3010',
    extraHTTPHeaders: { accept: 'application/json, text/html' },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'stages', testMatch: /stage-\d+.*\.spec\.ts/, dependencies: ['setup'], use: { storageState: AUTH_FILE } },
  ],
})
