import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

/**
 * iPhone 相当のビューポートで主要フローを検証する E2E テスト。
 *
 * ここでは以下も併せて確認する:
 *  - 外部ホストへの通信が発生しないこと
 *  - 通知 / カレンダー系の権限を要求しないこと
 *  - コンソールエラーが出ないこと
 *  - オフラインで起動でき、記録が残ること
 */

/**
 * 検証対象の URL。
 * GitHub Pages のサブディレクトリ配信に合わせて Vite の base を設定しているため、
 * preview サーバーでも base 配下が入口になる（末尾のスラッシュは付けない）。
 * base を変えた場合は E2E_BASE_URL で上書きできる。
 */
const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:4173/minikabo-ms-note/').replace(/\/$/, '');
/** トップページ。base 配下は末尾スラッシュが必要（vite preview はスラッシュ無しをリダイレクトしない）。 */
const HOME = `${BASE}/`;

/** 権限 API を監視するためのフック（ページ読み込み前に注入） */
const PERMISSION_SPY = `
  window.__permissionCalls = [];
  if (window.Notification) {
    Notification.requestPermission = function () {
      window.__permissionCalls.push('Notification.requestPermission');
      return Promise.resolve('denied');
    };
  }
  if (navigator.permissions && navigator.permissions.query) {
    const orig = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = function (d) {
      window.__permissionCalls.push('permissions.query:' + (d && d.name));
      return orig(d);
    };
  }
`;

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

function watchRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (req: Request) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith(BASE)) return;
    external.push(url);
  });
  return external;
}

/** 初回起動の免責画面を通過する */
async function acceptDisclaimer(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: '内容を確認しました' });
  try {
    await btn.waitFor({ state: 'visible', timeout: 15_000 });
    await btn.click();
  } catch {
    // 既に同意済みの場合（再読み込み後など）はそのまま進む
  }
  await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible();
}

test.describe('みにかぼ MSノート', () => {
  test('初回起動から主要画面まで移動でき、外部通信も権限要求も発生しない', async ({ page }) => {
    const errors = watchConsole(page);
    const external = watchRequests(page);
    await page.addInitScript(PERMISSION_SPY);

    await page.goto(HOME);
    await expect(page.getByRole('heading', { name: 'みにかぼ MSノート', level: 1 })).toBeVisible();
    await expect(page.getByText('診断や治療判断を行うものではありません')).toBeVisible();
    await acceptDisclaimer(page);

    // 下部ナビは 4 項目
    const nav = page.getByRole('navigation', { name: 'メインナビゲーション' });
    await expect(nav.getByRole('link')).toHaveCount(4);
    for (const label of ['ホーム', '記録', '経過', '診察']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }

    // ホームの必須要素
    await expect(page.getByText('投薬予定はありません')).toBeVisible();
    await expect(page.getByRole('link', { name: '症状の変化を記録' })).toBeVisible();
    await expect(page.getByRole('link', { name: '先週とほぼ変化なし' })).toBeVisible();

    // 4 タブすべてに移動できる
    await nav.getByRole('link', { name: '記録' }).click();
    await expect(page.getByRole('heading', { name: '記録', level: 1 })).toBeVisible();
    await nav.getByRole('link', { name: '経過' }).click();
    await expect(page.getByRole('heading', { name: '経過', level: 1 })).toBeVisible();
    await nav.getByRole('link', { name: '診察' }).click();
    await expect(page.getByRole('heading', { name: '診察', level: 1 })).toBeVisible();

    // 設定は右上の歯車から
    await page.getByRole('link', { name: '設定を開く' }).click();
    await expect(page.getByRole('heading', { name: '設定', level: 1 })).toBeVisible();
    await expect(page.getByText('診断や治療判断を行うものではありません')).toBeVisible();

    // 権限要求が一切行われていない
    const calls = await page.evaluate(() => (window as unknown as { __permissionCalls: string[] }).__permissionCalls);
    expect(calls).toEqual([]);

    expect(external, `外部通信が発生しました: ${external.join(', ')}`).toEqual([]);
    expect(errors, `コンソールエラー: ${errors.join(' | ')}`).toEqual([]);
  });

  test('週次チェックを「変化なし」で完了できる', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(HOME);
    await acceptDisclaimer(page);

    await page.getByRole('link', { name: '先週とほぼ変化なし' }).click();
    await expect(page.getByRole('heading', { name: '今週のチェック' })).toBeVisible();
    await page.getByRole('button', { name: 'この内容で完了' }).click();

    await expect(page.getByText('今週のチェックは記録済みです')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('薬・投薬予定・投薬記録の一連の流れが動く', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(HOME);
    await acceptDisclaimer(page);

    // 記録 → 投薬管理 → 薬を追加
    await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '記録' }).click();
    await page.getByRole('link', { name: /投薬管理/ }).click();
    await page.getByRole('link', { name: '薬を追加' }).click();

    await page.getByLabel('薬名').fill('テスト用の薬');
    await page.getByLabel('1回量').fill('1');
    await page.getByLabel('単位').fill('mL');
    await page.getByRole('button', { name: '保存する' }).click();

    // 予定ルール（14日ごと）を追加
    await expect(page.getByRole('heading', { name: '投薬予定' })).toBeVisible();
    await page.getByRole('button', { name: '予定ルールを追加' }).click();
    await page.getByRole('button', { name: 'N日ごと' }).click();
    await page.getByLabel('何日ごと').selectOption('14');
    await page.getByRole('dialog').getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText(/14日ごと/)).toBeVisible();

    // ホームに戻ると「本日が投薬予定日です」
    await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'ホーム' }).click();
    await expect(page.getByText('本日が投薬予定日です')).toBeVisible();

    // 投薬を記録
    await page.getByRole('button', { name: '投薬を記録' }).click();
    await expect(page.getByRole('heading', { name: '投薬の記録' })).toBeVisible();
    await page.getByRole('button', { name: '腹部（右）' }).click();
    await page.getByRole('button', { name: '赤み' }).click();
    await page.getByRole('button', { name: '保存する' }).click();

    // 実施済みになり、次回予定が表示される
    await expect(page.getByText(/次回まで\d+日/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('症状の変化を記録すると継続中として表示される', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(HOME);
    await acceptDisclaimer(page);

    await page.getByRole('link', { name: '症状の変化を記録' }).click();
    await expect(page.getByText('急激な症状や強い症状があるとき')).toBeVisible();

    await page.getByRole('button', { name: 'しびれ・感覚' }).click();
    await page.getByRole('button', { name: '右手・右腕' }).click();
    await page.getByRole('button', { name: '保存する' }).click();

    // 詳細画面
    await expect(page.getByRole('heading', { name: 'しびれ・感覚', level: 1 })).toBeVisible();
    await expect(page.getByText('継続中').first()).toBeVisible();

    // 今日の状態を記録
    await page.getByRole('button', { name: 'ほぼ同じ' }).click();
    await page.getByRole('button', { name: '今日の状態を保存' }).click();
    await expect(page.getByText('経過記録（1件）')).toBeVisible();

    // ホームの「継続中の症状」に出る
    await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'ホーム' }).click();
    await expect(page.getByText('継続中の症状')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('オフラインでも起動でき、記録の追加・保持ができる', async ({ page, context }) => {
    await page.goto(HOME);
    await acceptDisclaimer(page);

    // Service Worker の登録完了を待つ
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || true);
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state;
    });

    // ネットワークを切断
    await context.setOffline(true);
    await page.reload();

    // オフライン専用画面ではなく、通常のアプリがそのまま起動する
    await expect(page.getByRole('navigation', { name: 'メインナビゲーション' })).toBeVisible();
    await expect(page.getByRole('link', { name: '症状の変化を記録' })).toBeVisible();

    // オフラインで記録を追加
    await page.getByRole('link', { name: '症状の変化を記録' }).click();
    await page.getByRole('button', { name: '疲労', exact: true }).click();
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByRole('heading', { name: '疲労', level: 1 })).toBeVisible();

    // オフラインのまま画面遷移できる
    await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '経過' }).click();
    await expect(page.getByRole('heading', { name: '経過', level: 1 })).toBeVisible();
    await expect(page.getByText(/タイムライン（\d+件）/)).toBeVisible();

    // オフラインで再読み込みしてもデータが残っている
    await page.reload();
    await page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'ホーム' }).click();
    await expect(page.getByText('継続中の症状')).toBeVisible();

    // オンラインに戻してもデータは維持される
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByText('継続中の症状')).toBeVisible();
  });

  test('診察用レポートが期間指定で生成される', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto(HOME);
    await acceptDisclaimer(page);

    // 測定結果を1件入れておく
    await page.goto(`${BASE}/#/measurements/new`);
    await page.getByLabel('数値', { exact: true }).fill('4.5');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('EDSS')).toBeVisible();

    await page.goto(`${BASE}/#/clinic/report`);
    await expect(page.getByRole('heading', { name: /診察用レポート/ }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: '身体機能・認知機能の測定結果' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'EDSS' })).toBeVisible();
    await expect(page.getByText('医学的な解釈・判定は行っていません')).toBeVisible();

    // 全期間に切り替えても壊れない
    await page.getByRole('button', { name: '全期間' }).click();
    await expect(page.getByText('対象期間：全期間')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('主要な操作要素が 44px 以上で、横スクロールが発生しない', async ({ page }) => {
    await page.goto(HOME);
    await acceptDisclaimer(page);

    // 横スクロールなし
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);

    // ナビゲーションとホームの主要ボタンのタップ領域
    const targets = [
      page.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: '記録' }),
      page.getByRole('link', { name: '症状の変化を記録' }),
      page.getByRole('link', { name: '先週とほぼ変化なし' }),
      page.getByRole('link', { name: '設定を開く' }),
    ];
    for (const t of targets) {
      const box = await t.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('キーボード操作でナビゲーションを辿れる', async ({ page }) => {
    await page.goto(HOME);
    await acceptDisclaimer(page);

    // Tab で辿り、ナビゲーションのリンクに到達できる
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await page.keyboard.press('Tab');
      found = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.tagName === 'A' && el.textContent?.includes('記録') === true;
      });
    }
    expect(found).toBe(true);

    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: '記録', level: 1 })).toBeVisible();
  });

  test('PWA の manifest と Service Worker が有効', async ({ page, request }) => {
    await page.goto(HOME);
    await acceptDisclaimer(page);

    const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(manifestHref).toBeTruthy();

    // href は base 付きの絶対パスにも相対パスにもなり得るため、ページ URL を基準に解決する
    const manifestUrl = new URL(manifestHref!, page.url()).toString();
    const res = await request.get(manifestUrl);
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.name).toBe('みにかぼ MSノート');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('ja');
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

    // 有効化されるまで待ってから状態を確認する
    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.ready;
        return reg.active?.state === 'activated';
      },
      undefined,
      { timeout: 15_000 },
    );
    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.state ?? null;
    });
    expect(swState).toBe('activated');
    // プリキャッシュにアプリ本体とアイコンが含まれている
    const cachedUrls = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls: string[] = [];
      for (const n of names) {
        const c = await caches.open(n);
        for (const req of await c.keys()) urls.push(req.url);
      }
      return urls;
    });
    expect(cachedUrls.some((u) => u.includes('index.html') || u.endsWith('/'))).toBe(true);
    expect(cachedUrls.some((u) => u.includes('icon-512.png'))).toBe(true);
    expect(cachedUrls.some((u) => u.endsWith('.css'))).toBe(true);
  });
});
