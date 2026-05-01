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
        // `--use-angle=swiftshader` is the newer (Chromium 115+) flag that
        // actually gets honored in recent headless builds; the old
        // `--use-gl=swiftshader` remains as a fallback for older runners.
        launchOptions: {
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--enable-unsafe-swiftshader',
          ],
        },
      },
    },
    {
      name: 'mobile-chrome',
      testMatch: /eval-cycle1-mobile\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
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
