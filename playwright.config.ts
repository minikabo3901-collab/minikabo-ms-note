import { defineConfig, devices } from '@playwright/test';

/**
 * iPhone 相当のビューポートで主要フローを検証する。
 * ネットワークは localhost の preview サーバーだけを使い、外部通信は行わない。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173/minikabo-ms-note',
    ...devices['iPhone 13'],
    // Playwright の WebKit は環境依存が大きいため、CI では Chromium のモバイルエミュレーションを使う
    defaultBrowserType: 'chromium',
    // 失敗時のみ証拠を残す（CI で再現しない問題を調べるため）。ローカルでは無効。
    trace: process.env.CI ? 'retain-on-failure' : 'off',
    screenshot: process.env.CI ? 'only-on-failure' : 'off',
  },
  projects: [
    {
      name: 'iphone-viewport',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    // base 配下が入口になるため、起動判定もそこを見る
    url: process.env.E2E_BASE_URL ?? 'http://localhost:4173/minikabo-ms-note/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
