import { useEffect, useState, type ReactNode } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Service Worker の更新案内。
 * 更新しても IndexedDB のデータは消えない（キャッシュのみ入れ替わる）。
 * ユーザーが明示的に押したときだけ新しいバージョンを適用する。
 */
export function UpdatePrompt(): ReactNode {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdate(() => async () => {
          await updateSW(true);
        });
        setNeedRefresh(true);
      },
    });
  }, []);

  if (!needRefresh) return null;

  return (
    <div className="save-toast no-print" role="status" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span>新しいバージョンがあります</span>
      <button
        type="button"
        className="btn btn--primary"
        style={{ minHeight: 36, padding: '4px 12px' }}
        onClick={() => {
          setNeedRefresh(false);
          void update?.();
        }}
      >
        更新
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        style={{ minHeight: 36, padding: '4px 8px' }}
        onClick={() => setNeedRefresh(false)}
      >
        後で
      </button>
    </div>
  );
}
