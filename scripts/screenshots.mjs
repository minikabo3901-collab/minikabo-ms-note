/**
 * iPhone 相当のビューポートで主要画面のスクリーンショットを撮る（レイアウト確認用）。
 *   npm run preview   # 別ターミナルで
 *   node scripts/screenshots.mjs
 * 生成先: screenshots/
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const iphone = devices['iPhone 13'];

const today = new Date();
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** 画面遷移後、読み込み表示が消えるまで待つ */
async function go(page, hash) {
  await page.goto(`${BASE}${hash}`);
  await page.locator('main').waitFor();
  await page.getByText('読み込み中…').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(200);
  if (process.env.DEBUG_NAV) console.log('  -> at', page.url());
}

async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
  console.log('captured', name);
}

const browser = await chromium.launch();

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ ...iphone, colorScheme: scheme, locale: 'ja-JP' });
  const page = await context.newPage();

  await page.goto(BASE);
  await page.getByRole('button', { name: '内容を確認しました' }).click();
  await page.getByRole('navigation', { name: 'メインナビゲーション' }).waitFor();

  if (scheme === 'light') await shot(page, '01-home-empty');

  // --- 検証用のダミーデータを画面操作で登録する（本番データの初期投入はしない） ---
  await go(page, '/#/medications/new');
  await page.getByLabel('薬名').fill('検証用の薬A');
  await page.getByLabel('1回量').fill('1');
  await page.getByLabel('単位').fill('mL');
  await page.getByLabel('投与方法').fill('皮下注射');
  await page.getByRole('button', { name: '保存する' }).click();
  await page.getByRole('heading', { name: '投薬予定' }).waitFor();

  // 導入期：個別の日付
  await page.getByRole('button', { name: '予定ルールを追加' }).click();
  await page.getByRole('button', { name: '個別の日付' }).click();
  await page.getByLabel('ルール名（任意）').fill('導入期');
  for (const n of [-21, -19, -14]) {
    await page.getByLabel('追加する日付').fill(iso(addDays(today, n)));
    await page.getByRole('button', { name: '追加', exact: true }).click();
  }
  if (scheme === 'light') await shot(page, '02-schedule-rule-sheet');
  await page.getByRole('dialog').getByRole('button', { name: '保存する' }).click();

  // 維持期：4週間ごと
  await page.getByRole('button', { name: '予定ルールを追加' }).click();
  await page.getByRole('button', { name: 'N週間ごと' }).click();
  await page.getByLabel('ルール名（任意）').fill('維持期');
  await page.getByLabel('何週間ごと').selectOption('4');
  await page.getByRole('dialog').getByLabel('開始日').fill(iso(addDays(today, -7)));
  await page.getByRole('dialog').getByRole('button', { name: '保存する' }).click();
  if (scheme === 'light') await shot(page, '03-medication-edit');

  // 過去の実施記録
  await go(page, `/#/medication-calendar`);
  if (scheme === 'light') await shot(page, '04-medication-calendar');

  // 週次チェック（変化あり）
  await go(page, `/#/record/weekly?mode=change`);
  for (const label of ['疲労: 2 中くらい', '集中・考えやすさ: 1 少しやりにくい', '歩行・バランス: 1 少し不安定']) {
    const b = page.getByRole('button', { name: label });
    if (await b.count()) await b.first().click();
  }
  await page.getByRole('button', { name: '暑さの影響' }).click();
  await shot(page, `05-weekly-check-${scheme}`);
  await page.getByRole('button', { name: '保存する' }).click();
  // 保存後はホームへ自動遷移するので、遷移完了を待ってから次の画面へ進む
  await page.getByText('今週のチェックは記録済みです').waitFor({ timeout: 15_000 });

  // 症状イベント
  await go(page, `/#/record/symptom/new`);
  await page.getByRole('button', { name: 'しびれ・感覚' }).click();
  await page.getByRole('button', { name: '右足・右脚' }).click();
  await page.getByRole('button', { name: '暑さ', exact: true }).click();
  if (scheme === 'light') await shot(page, '06-symptom-new');
  await page.getByRole('button', { name: '保存する' }).click();
  await page.getByRole('button', { name: '今日の状態（かんたん記録）' }).waitFor({ timeout: 15_000 }).catch(() => {});
  await page.getByRole('button', { name: 'ほぼ同じ' }).click();
  await page.getByRole('button', { name: '今日の状態を保存' }).click();
  if (scheme === 'light') await shot(page, '07-symptom-detail');

  // 測定結果
  for (const [name, value] of [
    ['EDSS', '2'],
    ['T25FW', '5.4'],
    ['SDMT', '52'],
  ]) {
    await go(page, `/#/measurements/new`);
    await page.getByLabel('測定名').selectOption(name);
    await page.getByLabel('数値', { exact: true }).fill(value);
    await page.getByRole('button', { name: '保存する' }).click();
    // 保存後は一覧へ自動遷移する。遷移完了を待ってから次へ進む
    await page.getByRole('heading', { name: '測定結果', level: 1, exact: true }).waitFor({ timeout: 15_000 });
  }

  // 医療履歴
  await go(page, `/#/medical/new`);
  await page.getByLabel('タイトル').fill('定期診察');
  await page.getByLabel('医療機関（任意）').fill('検証用クリニック');
  await page.getByLabel('内容').fill('経過確認');
  await page.getByRole('button', { name: '保存する' }).click();
  await page.getByRole('heading', { name: '医療履歴', level: 1, exact: true }).waitFor({ timeout: 15_000 });
  if (scheme === 'light') await shot(page, '08-medical-edit');

  // 次回予定
  await go(page, `/#/appointments/new`);
  await page.getByLabel('日付').fill(iso(addDays(today, 30)));
  await page.getByLabel('医療機関（任意）').fill('検証用クリニック');
  await page.getByRole('button', { name: '保存する' }).click();
  await page.getByRole('heading', { name: '次回診察・検査', level: 1, exact: true }).waitFor({ timeout: 15_000 });

  // 質問メモ
  await go(page, `/#/clinic/questions`);
  await page.getByLabel('質問内容').fill('次回の検査時期について確認したい');
  await page.getByRole('button', { name: '追加する' }).click();
  if (scheme === 'light') await shot(page, '09-questions');

  // ホーム（データあり）
  await go(page, `/#/`);
  await shot(page, `10-home-${scheme}`);

  // 記録ハブ
  await go(page, `/#/record`);
  if (scheme === 'light') await shot(page, '11-record-hub');

  // 経過
  await go(page, `/#/progress`);
  await shot(page, `12-progress-${scheme}`);

  // 診察用レポート
  await go(page, `/#/clinic/report`);
  await page.getByRole('heading', { name: /診察用レポート/ }).first().waitFor();
  await shot(page, `13-report-${scheme}`);

  // 印刷レイアウト（PDF 保存時の見え方）を確認する
  if (scheme === 'light') {
    await page.emulateMedia({ media: 'print' });
    await shot(page, '15-report-print');
    await page.pdf({
      path: join(OUT, 'report-print.pdf'),
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });
    console.log('captured report-print.pdf');
    await page.emulateMedia({ media: 'screen' });
  }

  // 設定
  await go(page, `/#/settings`);
  await shot(page, `14-settings-${scheme}`);

  await context.close();
}

await browser.close();
console.log('done ->', OUT);
