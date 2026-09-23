import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = path.dirname(fileURLToPath(import.meta.url))
const backend = path.resolve(frontend, '../backend')
const python = path.resolve(frontend, process.platform === 'win32' ? '../.venv/Scripts/python.exe' : '../.venv/bin/python')
// Each run gets a separate SQLite file; the user's demonstration DB is never reset.
const database = path.join(backend, `data/e2e-${Date.now()}.db`).replaceAll('\\', '/')
export default defineConfig({
  testDir: './tests', timeout: 90000, workers: 1, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5174', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: `"${python}" -m app.seed && "${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8011`, cwd: backend,
      url: 'http://127.0.0.1:8011/api/health', reuseExistingServer: false, timeout: 40000,
      env: { DATABASE_URL: `sqlite:///${database}`, DEMO_MODE: 'true', LLM_PROVIDER: 'rule_based', CORS_ORIGINS: 'http://127.0.0.1:5174' } },
    { command: 'npm run dev -- --port 5174', cwd: frontend, url: 'http://127.0.0.1:5174', reuseExistingServer: false,
      env: { VITE_API_URL: 'http://127.0.0.1:8011' }, timeout: 40000 },
  ],
})
