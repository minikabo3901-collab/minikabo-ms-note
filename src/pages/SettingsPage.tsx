import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, ConfirmSheet, Sheet, TextField } from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { APP_NAME, BACKUP_EXTENSION, DISCLAIMER_TEXT } from '@/config/appConfig';
import { deleteAllData, getDataStats, meta, TABLE_LABELS, type DataStats } from '@/db/repo';
import {
  backupFileName,
  createBackupBlob,
  decryptBackup,
  formatBytes,
  parseEnvelope,
  restoreBackup,
  summarizePayload,
  type BackupPayload,
  type BackupSummary,
} from '@/features/backup/backup';
import {
  isStandalone,
  isStoragePersisted,
  requestPersistentStorage,
  saveBlobToDevice,
} from '@/lib/storage';
import { formatDateTimeJa } from '@/lib/date';

export function SettingsPage(): ReactNode {
  const toast = useToast();
  const [stats, setStats] = useState<DataStats | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setStats(await getDataStats());
    setPersisted(await isStoragePersisted());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <AppShell title="設定" back>
      <Card title="このアプリについて" variant="attention">
        <p className="mb0">{DISCLAIMER_TEXT}</p>
      </Card>

      <Card title="データの保存">
        <p className="small">
          記録はこの端末の中（IndexedDB）だけに保存されます。サーバー送信・クラウド同期・アカウント登録・
          アクセス解析はありません。通知やスマートフォンの標準カレンダーとの連携も行いません。
        </p>
        <p className="small notice">
          Safari の「Web サイトデータを消去」や、ホーム画面からのアプリ削除でデータが消える可能性があります。
          永続保存は端末やブラウザの判断に左右され、保証されません。
          <strong> 定期的にバックアップを作成してください。</strong>
        </p>
        <p className="small mb0">
          永続保存の状態：
          {persisted === null ? 'この環境では確認できません' : persisted ? '許可されています' : '未許可'}
        </p>
        {persisted === false ? (
          <button
            type="button"
            className="btn btn--block"
            style={{ marginTop: 8 }}
            onClick={() =>
              void requestPersistentStorage().then((r) => {
                toast.notify(r ? '永続保存が許可されました' : '許可されませんでした');
                void reload();
              })
            }
          >
            永続保存を要求する
          </button>
        ) : null}
      </Card>

      <DataManagementCard stats={stats} onChanged={() => void reload()} />

      <Card title="ホーム画面への追加">
        <p className="small mb0">
          {isStandalone()
            ? 'ホーム画面から起動しています。オフラインでもこのまま使えます。'
            : 'Safari で開き、画面下の共有ボタン（□に↑）→「ホーム画面に追加」を選ぶと、アプリとして全画面で使えます。初回読み込み後はオフラインでも起動します。'}
        </p>
      </Card>

      <Card title="アプリ情報">
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
          <dt className="small muted">アプリ名</dt>
          <dd className="small" style={{ margin: 0 }}>
            {APP_NAME}
          </dd>
          <dt className="small muted">バックアップ形式</dt>
          <dd className="small" style={{ margin: 0 }}>
            {BACKUP_EXTENSION}（AES-GCM 暗号化）
          </dd>
          <dt className="small muted">外部通信</dt>
          <dd className="small" style={{ margin: 0 }}>
            なし（外部 API・外部フォント・解析ツールを使用していません）
          </dd>
        </dl>
      </Card>
    </AppShell>
  );
}

/* ------------------------------------------------------- データ管理 */

function DataManagementCard({
  stats,
  onChanged,
}: {
  stats: DataStats | null;
  onChanged: () => void;
}): ReactNode {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [backupOpen, setBackupOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [preview, setPreview] = useState<{ payload: BackupPayload; summary: BackupSummary } | null>(null);

  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const doBackup = async (): Promise<void> => {
    setError('');
    if (password.length < 8) {
      setError('パスワードは8文字以上にしてください');
      return;
    }
    if (password !== password2) {
      setError('確認用のパスワードが一致しません');
      return;
    }
    setBusy(true);
    try {
      const blob = await createBackupBlob(password);
      saveBlobToDevice(blob, backupFileName());
      await meta.markBackup();
      toast.notify('バックアップを作成しました');
      setBackupOpen(false);
      setPassword('');
      setPassword2('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'バックアップを作成できませんでした');
    } finally {
      setBusy(false);
    }
  };

  const doDecrypt = async (): Promise<void> => {
    setError('');
    if (!restoreFile) return;
    setBusy(true);
    try {
      const text = await restoreFile.text();
      const envelope = parseEnvelope(text);
      const payload = await decryptBackup(envelope, restorePassword);
      setPreview({ payload, summary: summarizePayload(payload) });
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込めませんでした');
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (): Promise<void> => {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await restoreBackup(preview.payload);
      toast.notify('復元しました');
      setPreview(null);
      setRestoreFile(null);
      setRestorePassword('');
      if (fileRef.current) fileRef.current.value = '';
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '復元できませんでした（元のデータは保持されています）');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="データ管理">
      {!stats ? (
        <p className="muted" role="status">
          集計中…
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <tbody>
                {Object.entries(stats.counts).map(([k, v]) => (
                  <tr key={k}>
                    <th
                      scope="row"
                      style={{ textAlign: 'left', fontWeight: 600, padding: '3px 0', color: 'var(--text-muted)' }}
                    >
                      {TABLE_LABELS[k] ?? k}
                    </th>
                    <td style={{ textAlign: 'right', padding: '3px 0' }}>{v} 件</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" style={{ textAlign: 'left', padding: '3px 0', borderTop: '1px solid var(--border)' }}>
                    記録件数（合計）
                  </th>
                  <td style={{ textAlign: 'right', padding: '3px 0', borderTop: '1px solid var(--border)' }}>
                    {stats.totalRecords} 件
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={{ textAlign: 'left', padding: '3px 0' }}>
                    添付ファイル
                  </th>
                  <td style={{ textAlign: 'right', padding: '3px 0' }}>
                    {stats.attachmentCount} 件（{formatBytes(stats.attachmentBytes)}）
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={{ textAlign: 'left', padding: '3px 0' }}>
                    推定使用容量
                  </th>
                  <td style={{ textAlign: 'right', padding: '3px 0' }}>
                    {formatBytes(stats.estimatedUsageBytes)}
                    {stats.estimatedQuotaBytes ? ` / ${formatBytes(stats.estimatedQuotaBytes)}` : ''}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={{ textAlign: 'left', padding: '3px 0' }}>
                    最終バックアップ
                  </th>
                  <td style={{ textAlign: 'right', padding: '3px 0' }}>
                    {stats.lastBackupAt ? formatDateTimeJa(stats.lastBackupAt) : '未作成'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--primary" onClick={() => setBackupOpen(true)}>
              バックアップ作成
            </button>
          </div>

          <div className="hr" />

          <h3>バックアップから復元</h3>
          <p className="small muted">
            現在のデータはすべて置き換えられます。念のため、先に新しいバックアップを作成してください。
          </p>
          <div className="field">
            <label className="field__label" htmlFor="restore-file">
              バックアップファイル（{BACKUP_EXTENSION}）
            </label>
            <input
              id="restore-file"
              ref={fileRef}
              type="file"
              accept={`${BACKUP_EXTENSION},application/octet-stream,application/json`}
              onChange={(e) => {
                setRestoreFile(e.currentTarget.files?.[0] ?? null);
                setPreview(null);
                setError('');
              }}
              style={{ fontSize: '1rem', minHeight: 44 }}
            />
          </div>
          {restoreFile ? (
            <>
              <TextField
                label="バックアップのパスワード"
                type="password"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.currentTarget.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn--block"
                disabled={busy || !restorePassword}
                onClick={() => void doDecrypt()}
              >
                {busy ? '確認中…' : '内容を確認する'}
              </button>
            </>
          ) : null}

          {error ? (
            <p className="notice notice--attention" role="alert" style={{ marginTop: 10 }}>
              {error}
            </p>
          ) : null}

          <div className="hr" />

          <h3>全データ削除</h3>
          <p className="small muted">
            この端末に保存されているすべての記録と添付ファイルを削除します。取り消しはできません。
          </p>
          <button type="button" className="btn btn--danger btn--block" onClick={() => setDeleteStep(1)}>
            全データを削除
          </button>
        </>
      )}

      {/* --- バックアップ作成 --- */}
      {backupOpen ? (
        <Sheet title="バックアップを作成" onClose={() => setBackupOpen(false)}>
          <p className="small">
            バックアップは AES-GCM で暗号化されます（鍵は PBKDF2-SHA-256 でパスワードから導出）。
          </p>
          <p className="notice notice--attention small">
            パスワードはアプリに保存されません。忘れた場合、このバックアップを復元する方法はありません。
          </p>
          <TextField
            label="パスワード（8文字以上）"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="new-password"
          />
          <TextField
            label="パスワード（確認）"
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.currentTarget.value)}
            autoComplete="new-password"
          />
          {error ? (
            <p className="notice notice--attention" role="alert">
              {error}
            </p>
          ) : null}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setBackupOpen(false)}>
              キャンセル
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void doBackup()}>
              {busy ? '作成中…' : 'ファイルを書き出す'}
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* --- 復元プレビュー --- */}
      {preview ? (
        <Sheet title="この内容で復元しますか" onClose={() => setPreview(null)}>
          <p className="small">
            作成日時：<strong>{formatDateTimeJa(preview.summary.createdAt)}</strong>
          </p>
          <div className="table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <tbody>
                {preview.summary.counts.map((c) => (
                  <tr key={c.label}>
                    <th scope="row" style={{ textAlign: 'left', fontWeight: 600, padding: '3px 0' }}>
                      {c.label}
                    </th>
                    <td style={{ textAlign: 'right', padding: '3px 0' }}>{c.count} 件</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" style={{ textAlign: 'left', padding: '3px 0' }}>
                    添付ファイル
                  </th>
                  <td style={{ textAlign: 'right', padding: '3px 0' }}>
                    {preview.summary.attachmentCount} 件（{formatBytes(preview.summary.attachmentBytes)}）
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="notice notice--attention small" style={{ marginTop: 10 }}>
            現在のデータはすべて置き換えられます。復元は 1 つのトランザクションで実行され、
            途中で失敗した場合は元のデータが維持されます。
          </p>
          {error ? (
            <p className="notice notice--attention" role="alert">
              {error}
            </p>
          ) : null}
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setPreview(null)}>
              キャンセル
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void doRestore()}>
              {busy ? '復元中…' : '復元する'}
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* --- 全データ削除（二段階確認） --- */}
      {deleteStep === 1 ? (
        <ConfirmSheet
          title="全データを削除しますか（1/2）"
          message="すべての記録・添付ファイルが削除されます。復元にはバックアップファイルが必要です。"
          confirmLabel="次へ進む"
          danger
          onCancel={() => setDeleteStep(0)}
          onConfirm={() => {
            setDeleteConfirmText('');
            setDeleteStep(2);
          }}
        />
      ) : null}

      {deleteStep === 2 ? (
        <Sheet title="全データを削除しますか（2/2）" onClose={() => setDeleteStep(0)}>
          <p className="notice notice--attention">
            この操作は取り消せません。実行するには、下の欄に「削除」と入力してください。
          </p>
          <TextField
            label="確認のため「削除」と入力"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.currentTarget.value)}
            autoComplete="off"
          />
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setDeleteStep(0)}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={deleteConfirmText.trim() !== '削除'}
              onClick={() => {
                void deleteAllData().then(() => {
                  setDeleteStep(0);
                  toast.notify('すべてのデータを削除しました');
                  onChanged();
                });
              }}
            >
              完全に削除する
            </button>
          </div>
        </Sheet>
      ) : null}
    </Card>
  );
}
