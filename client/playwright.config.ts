import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node ../server/index.js',
      url: 'http://localhost:1234',
      reuseExistingServer: !process.env.CI,
      env: {
        // The Database panel specs point at a Postgres container on
        // localhost, which the SSRF guard blocks by design once the server
        // is exposed. Tests are the case that guard is not meant to catch.
        ALLOW_PRIVATE_DB_HOSTS: '1',
        // Nearly every spec signs up an account, all from one address, so
        // the auth rate limit would reject most of the run.
        RATE_LIMIT_DISABLED: '1',
      },
    },
  ],
})
