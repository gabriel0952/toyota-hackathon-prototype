import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e', testIgnore: ['api.spec.ts', 'grounded.spec.ts'], timeout: 30_000, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'on' },
  webServer: { command: './node_modules/.bin/vite --config vite.config.ts', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
  projects: [
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
})
