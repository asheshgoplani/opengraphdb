import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_PORT
      ? `http://localhost:${process.env.PLAYWRIGHT_PORT}`
      : 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // SwiftShader is required for cosmos.gl / regl WebGL1 extensions
        // (OES_texture_float, ANGLE_instanced_arrays) in headless chromium.
        // Without these flags, regl init fails and the canvas stays black.
        launchOptions: {
          args: [
            '--use-gl=swiftshader',
            '--ignore-gpu-blocklist',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${process.env.PLAYWRIGHT_PORT ?? 5173}`,
    url: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 5173}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
