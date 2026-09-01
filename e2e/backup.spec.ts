import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * バックアップ作成 → 全データ削除 → 復元 の往復を、
 * ネットワークを切断した状態（オフライン）で検証する。
 */

/** Vite の base（GitHub Pages のサブディレクトリ）に合わせる。末尾のスラッシュは付けない。 */
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:4173/minikabo-ms-note/').replace(/\/$/, '');
/** トップページ。base 配下は末尾スラッシュが必要（vite preview はスラッシュ無しをリダイレクトしない）。 */
const HOME = `${BASE}/`;
const PASSWORD = 'minikabo-test-pass';

async function acceptDisclaimer(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: '内容を確認しました' });
  try {
    await btn.waitFor({ state: 'visible', timeout: 15_000 });
    await btn.click();
  } catch {
    /* 同意済みならそのまま */
  }
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible();
}

test('オフラインでバックアップを作成し、全データ削除後に復元できる', async ({ page, context }) => {
  await page.goto(HOME);
  await acceptDisclaimer(page);

  // Service Worker が有効になるまで待つ
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state === 'activated';
  });

  // --- 記録を1件作る ---
  await page.goto(`${BASE}/#/measurements/new`);
  await page.getByLabel('数値', { exact: true }).fill('3.5');
  await page.getByLabel('医療機関').fill('バックアップ検証');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByRole('heading', { name: '測定結果', level: 1, exact: true })).toBeVisible();

  // --- ここからオフライン ---
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible();

  await page.goto(`${BASE}/#/settings`);
  await expect(page.getByRole('heading', { name: 'データ管理' })).toBeVisible();
  await expect(page.getByText('最終バックアップ')).toBeVisible();

  // --- バックアップ作成 ---
  await page.getByRole('button', { name: 'バックアップ作成' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('パスワード（8文字以上）').fill(PASSWORD);
  await dialog.getByLabel('パスワード（確認）').fill(PASSWORD);

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'ファイルを書き出す' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.msbackup$/);

  const dir = mkdtempSync(join(tmpdir(), 'msnote-'));
  const backupPath = join(dir, download.suggestedFilename());
  await download.saveAs(backupPath);

  // 最終バックアップ日時が更新される
  await expect(page.getByText('未作成')).toHaveCount(0);

  // --- 全データ削除（二段階確認） ---
  await page.getByRole('button', { name: '全データを削除' }).click();
  await page.getByRole('button', { name: '次へ進む' }).click();
  await page.getByLabel('確認のため「削除」と入力').fill('削除');
  await page.getByRole('button', { name: '完全に削除する' }).click();

  await page.goto(`${BASE}/#/measurements`);
  await expect(page.getByText('まだ測定結果はありません。')).toBeVisible();

  // --- 間違ったパスワードでは復元できない ---
  await page.goto(`${BASE}/#/settings`);
  await page.getByLabel(/バックアップファイル/).setInputFiles(backupPath);
  await page.getByLabel('バックアップのパスワード').fill('wrong-password-123');
  await page.getByRole('button', { name: '内容を確認する' }).click();
  await expect(page.getByRole('alert')).toContainText('パスワードが違うか、ファイルが壊れています');

  // --- 正しいパスワードで復元 ---
  await page.getByLabel('バックアップのパスワード').fill(PASSWORD);
  await page.getByRole('button', { name: '内容を確認する' }).click();

  const preview = page.getByRole('dialog');
  await expect(preview.getByText('作成日時：')).toBeVisible();
  await expect(preview.getByRole('row', { name: /測定結果/ })).toContainText('1 件');
  await preview.getByRole('button', { name: '復元する' }).click();

  await page.goto(`${BASE}/#/measurements`);
  await expect(page.getByText('バックアップ検証')).toBeVisible();
  await expect(page.getByText('3.5')).toBeVisible();

  // オフラインのまま再読み込みしても残っている
  await page.reload();
  await expect(page.getByText('バックアップ検証')).toBeVisible();

  await context.setOffline(false);
});
