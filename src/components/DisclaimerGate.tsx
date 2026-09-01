import { useEffect, useState, type ReactNode } from 'react';
import { APP_NAME, DISCLAIMER_TEXT } from '@/config/appConfig';
import { meta } from '@/db/repo';
import { META_KEYS } from '@/db/types';
import { requestPersistentStorage } from '@/lib/storage';

/**
 * 初回起動時に医療上の免責を表示する。
 * ここでユーザー操作を起点に navigator.storage.persist() を要求する
 * （永続化は保証されないため、バックアップの必要性も併せて案内する）。
 */
export function DisclaimerGate({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<'loading' | 'need' | 'ok'>('loading');

  useEffect(() => {
    let alive = true;
    meta
      .get<string>(META_KEYS.disclaimerAcceptedAt)
      .then((v) => {
        if (alive) setState(v ? 'ok' : 'need');
      })
      .catch(() => {
        if (alive) setState('need');
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="app-main" role="status" aria-live="polite">
        <p className="muted">読み込み中…</p>
      </div>
    );
  }

  if (state === 'ok') return <>{children}</>;

  const accept = async (): Promise<void> => {
    // ユーザー操作の中で永続保存を要求する（未対応環境では何もしない）
    await requestPersistentStorage();
    await meta.acceptDisclaimer();
    setState('ok');
  };

  return (
    <div className="app-main" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}>
      <h1>{APP_NAME}</h1>
      <div className="card card--attention">
        <h2 className="card__title">はじめにお読みください</h2>
        <p style={{ marginBottom: 0 }}>{DISCLAIMER_TEXT}</p>
      </div>

      <div className="card">
        <h2 className="card__title">データの保存について</h2>
        <ul style={{ paddingLeft: 20, margin: '0 0 8px' }}>
          <li>記録はこの端末の中（IndexedDB）だけに保存されます。</li>
          <li>サーバー送信・クラウド同期・アカウント登録はありません。</li>
          <li>
            Safari の「Web サイトデータを消去」や、ホーム画面からのアプリ削除で
            データが消える可能性があります。
          </li>
          <li>定期的に、設定画面から暗号化バックアップを作成してください。</li>
        </ul>
      </div>

      <div className="card">
        <h2 className="card__title">ホーム画面への追加</h2>
        <p className="small mb0">
          Safari で開き、画面下の共有ボタン（□に↑）→「ホーム画面に追加」を選ぶと、
          アプリとして全画面で使えます。オフラインでも起動します。
        </p>
      </div>

      <button type="button" className="btn btn--primary btn--block btn--big" onClick={accept}>
        内容を確認しました
      </button>
    </div>
  );
}
