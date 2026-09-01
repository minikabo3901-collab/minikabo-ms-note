import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import {
  Badge,
  Card,
  ConfirmSheet,
  EmptyState,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { attachments as attachRepo, medicalEvents } from '@/db/repo';
import {
  ATTACHMENT_MAX_BYTES,
  medicalEventTypes,
  type Attachment,
} from '@/db/types';
import { formatBytes } from '@/features/backup/backup';
import { formatDateJa, todayISO } from '@/lib/date';

export function MedicalListPage(): ReactNode {
  const events = useLiveQuery(() => medicalEvents.all(), []);

  return (
    <AppShell title="医療履歴" back>
      {!events ? (
        <p className="muted" role="status">
          読み込み中…
        </p>
      ) : events.length === 0 ? (
        <EmptyState>まだ医療履歴はありません。</EmptyState>
      ) : (
        <ul className="list">
          {events.map((e) => (
            <li key={e.id}>
              <Link className="list__item" to={`/medical/${e.id}`}>
                <div className="row row--between row--wrap">
                  <span className="list__item-title">{e.title || e.type}</span>
                  <Badge tone="accent">{e.type}</Badge>
                </div>
                <div className="list__item-meta">
                  {formatDateJa(e.date, { weekday: true })}
                  {e.facility ? `／${e.facility}` : ''}
                  {e.attachmentIds.length ? `／添付${e.attachmentIds.length}件` : ''}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className="btn btn--primary btn--block btn--big" to="/medical/new">
        医療履歴を追加
      </Link>
    </AppShell>
  );
}

/* ------------------------------------------------------------ 編集画面 */

export function MedicalEditPage(): ReactNode {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    type: '診察' as string,
    date: todayISO(),
    title: '',
    facility: '',
    doctor: '',
    content: '',
    result: '',
    notes: '',
  });
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attached, setAttached] = useState<Attachment[]>([]);
  const [staged, setStaged] = useState<File[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    void (async () => {
      const ev = await medicalEvents.get(id!);
      if (!alive || !ev) return;
      setForm({
        type: ev.type,
        date: ev.date,
        title: ev.title,
        facility: ev.facility,
        doctor: ev.doctor,
        content: ev.content,
        result: ev.result,
        notes: ev.notes,
      });
      setAttachmentIds(ev.attachmentIds);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [id, isNew]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const rows = await attachRepo.getMany(attachmentIds);
      if (alive) setAttached(rows.filter(Boolean) as Attachment[]);
    })();
    return () => {
      alive = false;
    };
  }, [attachmentIds]);

  const stageFiles = (files: FileList | null): void => {
    setError('');
    if (!files) return;
    const list = Array.from(files);
    const bad = list.find((f) => f.size > ATTACHMENT_MAX_BYTES);
    if (bad) {
      setError(
        `「${bad.name}」は ${formatBytes(bad.size)} で、上限の ${formatBytes(ATTACHMENT_MAX_BYTES)} を超えています。`,
      );
      return;
    }
    setStaged((prev) => [...prev, ...list]);
  };

  const commitStaged = async (): Promise<void> => {
    setError('');
    try {
      const ids: string[] = [];
      for (const f of staged) {
        const a = await attachRepo.add(f);
        ids.push(a.id);
      }
      setAttachmentIds((prev) => [...prev, ...ids]);
      setStaged([]);
      if (fileRef.current) fileRef.current.value = '';
      toast.notify('添付しました');
    } catch (e) {
      setError(e instanceof Error ? e.message : '添付できませんでした');
    }
  };

  const removeAttachment = async (attId: string): Promise<void> => {
    await attachRepo.remove(attId);
    setAttachmentIds((prev) => prev.filter((x) => x !== attId));
  };

  const openAttachment = (a: Attachment): void => {
    // 端末内の Blob をそのまま開く（外部への送信は行わない）
    const url = URL.createObjectURL(a.blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const save = async (): Promise<void> => {
    setError('');
    try {
      const payload = { ...form, attachmentIds };
      if (isNew) {
        const ev = await medicalEvents.create(payload);
        toast.notify('保存しました');
        navigate(`/medical/${ev.id}`, { replace: true });
      } else {
        await medicalEvents.update(id!, payload);
        toast.notify('保存しました');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    }
  };

  if (!loaded) {
    return (
      <AppShell title="医療履歴" back>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }

  const stagedBytes = staged.reduce((s, f) => s + f.size, 0);

  return (
    <AppShell title={isNew ? '医療履歴を追加' : '医療履歴'} back>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card title="基本情報">
          <SelectField
            label="種類"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.currentTarget.value })}
          >
            {medicalEventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectField>
          <div className="field">
            <label className="field__label" htmlFor="me-date">
              日付
            </label>
            <input
              id="me-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.currentTarget.value })}
            />
          </div>
          <TextField
            label="タイトル"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.currentTarget.value })}
            placeholder="例：定期診察"
          />
          <TextField
            label="医療機関（任意）"
            value={form.facility}
            onChange={(e) => setForm({ ...form, facility: e.currentTarget.value })}
          />
          <TextField
            label="医師名（任意）"
            value={form.doctor}
            onChange={(e) => setForm({ ...form, doctor: e.currentTarget.value })}
          />
        </Card>

        <Card title="内容・結果">
          <TextAreaField
            label="内容"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.currentTarget.value })}
          />
          <TextAreaField
            label="結果"
            value={form.result}
            onChange={(e) => setForm({ ...form, result: e.currentTarget.value })}
            hint="検査結果は入力した内容がそのまま保存されます。アプリが正常・異常を判定することはありません。"
          />
          <TextAreaField
            label="メモ（任意）"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
          />
        </Card>

        {error ? (
          <p className="notice notice--attention" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary btn--block btn--big">
          保存する
        </button>
      </form>

      <Card title="添付ファイル">
        <p className="small muted">
          JPEG・PNG・PDF に対応します（1ファイル {formatBytes(ATTACHMENT_MAX_BYTES)} まで）。
          端末内のデータベースに保存され、外部へ送信されることはありません。
        </p>

        {attached.length > 0 ? (
          <ul className="list">
            {attached.map((a) => (
              <li key={a.id}>
                <div className="list__item">
                  <div className="list__item-title">{a.name}</div>
                  <div className="list__item-meta">
                    {a.mime}／{formatBytes(a.size)}
                  </div>
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn" onClick={() => openAttachment(a)}>
                      開く
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => void removeAttachment(a.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="field">
          <label className="field__label" htmlFor="attach-input">
            ファイルを選ぶ
          </label>
          <input
            id="attach-input"
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            onChange={(e) => stageFiles(e.currentTarget.files)}
            style={{ fontSize: '1rem', minHeight: 44 }}
          />
        </div>

        {staged.length > 0 ? (
          <div className="notice" style={{ marginBottom: 10 }}>
            <strong>追加予定のファイル（合計 {formatBytes(stagedBytes)}）</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {staged.map((f, i) => (
                <li key={i}>
                  {f.name}（{formatBytes(f.size)}）
                </li>
              ))}
            </ul>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => setStaged([])}>
                取り消す
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void commitStaged()}>
                この内容で添付する
              </button>
            </div>
          </div>
        ) : null}

        <p className="field__hint mb0">
          添付が増えると端末の保存容量を圧迫します。設定画面から使用状況を確認できます。
        </p>
      </Card>

      {!isNew ? (
        <div className="btn-row">
          <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
            この医療履歴を削除
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <ConfirmSheet
          title="この医療履歴を削除しますか"
          message="添付ファイルも一緒に削除されます。この操作は取り消せません。"
          confirmLabel="削除する"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void medicalEvents.remove(id!).then(() => {
              toast.notify('削除しました');
              navigate('/medical');
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
