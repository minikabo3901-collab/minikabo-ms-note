import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import { Badge, Card, ConfirmSheet, EmptyState, SelectField, TextAreaField, TextField } from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { appointments } from '@/db/repo';
import { medicalEventTypes } from '@/db/types';
import { formatDateJa, todayISO } from '@/lib/date';

export function AppointmentListPage(): ReactNode {
  const rows = useLiveQuery(() => appointments.all(), []);
  const today = todayISO();

  return (
    <AppShell title="次回診察・検査" back>
      <p className="notice" style={{ marginBottom: 12 }}>
        この予定はアプリ内だけで管理します。スマートフォンの標準カレンダーとは連携せず、
        カレンダーの権限も要求しません。通知も行いません。
      </p>

      {!rows ? (
        <p className="muted" role="status">
          読み込み中…
        </p>
      ) : rows.length === 0 ? (
        <EmptyState>登録された予定はありません。</EmptyState>
      ) : (
        <ul className="list">
          {rows.map((a) => (
            <li key={a.id}>
              <Link className="list__item" to={`/appointments/${a.id}`}>
                <div className="row row--between row--wrap">
                  <span className="list__item-title">{a.type}</span>
                  <Badge tone={a.done ? 'ok' : a.date < today ? 'attention' : 'accent'}>
                    {a.done ? '済' : a.date < today ? '日付超過' : '予定'}
                  </Badge>
                </div>
                <div className="list__item-meta">
                  {formatDateJa(a.date, { weekday: true })}
                  {a.time ? ` ${a.time}` : ''}
                  {a.facility ? `／${a.facility}` : ''}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link className="btn btn--primary btn--block btn--big" to="/appointments/new">
        予定を追加
      </Link>
    </AppShell>
  );
}

export function AppointmentEditPage(): ReactNode {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    type: '診察',
    date: todayISO(),
    time: '',
    facility: '',
    notes: '',
    done: false,
  });
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    void (async () => {
      const a = await appointments.get(id!);
      if (!alive || !a) return;
      setForm({
        type: a.type,
        date: a.date,
        time: a.time ?? '',
        facility: a.facility,
        notes: a.notes,
        done: a.done,
      });
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [id, isNew]);

  const save = async (): Promise<void> => {
    setError('');
    try {
      const payload = { ...form, time: form.time || null };
      if (isNew) await appointments.create(payload);
      else await appointments.update(id!, payload);
      toast.notify('保存しました');
      navigate('/appointments', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    }
  };

  if (!loaded) {
    return (
      <AppShell title="次回診察・検査" back>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={isNew ? '予定を追加' : '予定'} back>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card>
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
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow field">
              <label className="field__label" htmlFor="ap-date">
                日付
              </label>
              <input
                id="ap-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.currentTarget.value })}
              />
            </div>
            <div className="grow field">
              <label className="field__label" htmlFor="ap-time">
                時刻（任意）
              </label>
              <input
                id="ap-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.currentTarget.value })}
              />
            </div>
          </div>
          <TextField
            label="医療機関（任意）"
            value={form.facility}
            onChange={(e) => setForm({ ...form, facility: e.currentTarget.value })}
          />
          <TextAreaField
            label="メモ（任意）"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })}
          />
          <div className="field">
            <button
              type="button"
              className="chip"
              aria-pressed={form.done}
              onClick={() => setForm({ ...form, done: !form.done })}
            >
              この予定は済んだ
            </button>
          </div>
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

      {!isNew ? (
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
            この予定を削除
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <ConfirmSheet
          title="この予定を削除しますか"
          message="この操作は取り消せません。"
          confirmLabel="削除する"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void appointments.remove(id!).then(() => {
              toast.notify('削除しました');
              navigate('/appointments');
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
