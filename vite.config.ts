import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// アプリ名は src/config/appConfig.ts と同期させる（ビルド時に読み込む）
import { APP_NAME, APP_SHORT_NAME, APP_DESCRIPTION, THEME_COLOR, BACKGROUND_COLOR } from './src/config/appConfig';

/**
 * 配信先のベースパス。
 * GitHub Pages はリポジトリ名のサブディレクトリで配信されるため、それに合わせる。
 *   https://<ユーザー名>.github.io/minikabo-ms-note/
 * CI からはリポジトリ名を BASE_PATH 環境変数で渡す（.github/workflows/deploy.yml）。
 * ユーザーサイト（<ユーザー名>.github.io リポジトリ）へ移す場合は BASE_PATH=/ を指定する。
 *
 * この base に合わせて、Vite が出力する JS/CSS/画像のパス、manifest の start_url と scope、
 * Service Worker の登録パスと scope、プリキャッシュ対象のパスがすべて自動的に揃う。
 */
const BASE_PATH = process.env.BASE_PATH ?? '/minikabo-ms-note/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      // 外部通信を一切行わないため runtimeCaching は使わない（すべてプリキャッシュ）
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        // start_url / scope / icons と同じく manifest からの相対指定にする。
        // サブディレクトリ配信でも「/」を指してしまわないようにするため。
        id: './',
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: APP_DESCRIPTION,
        lang: 'ja',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        categories: ['health', 'medical', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // 依存ライブラリを分けておくと、アプリ更新時に差し替わるファイルが小さくなる
        manualChunks: (id: string) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
