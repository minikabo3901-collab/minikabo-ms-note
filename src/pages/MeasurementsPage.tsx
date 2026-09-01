import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import { Card, ConfirmSheet, EmptyState, SelectField, TextAreaField, TextField } from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { measurements } from '@/db/repo';
import { measurementNames } from '@/db/types';
import { formatDateJa, todayISO } from '@/lib/date';

const DEFAULT_UNITS: Record<string, string> = {
  EDSS: '',
  T25FW: '秒',
  '9HPT右手': '秒',
  '9HPT左手': '秒',
  SDMT: '点',
  BICAMS: '点',
};

export function MeasurementListPage(): ReactNode {
  const rows = useLiveQuery(() => measurements.all(), []);

  return (
    <AppShell title="測定結果" back>
      <p className="notice" style={{ marginBottom: 12 }}>
        医療機関などで測定された結果を記録します。アプリ内で検査そのものを実施することはありません。
        結果を正常・異常と自動判定することもありません。
      </p>

      {!rows ? (
        <p className="muted" role="status">
          読み込み中…
        </p>
      ) : rows.length === 0 ? (
        <EmptyState>まだ測定結果はありません。</EmptyState>
      ) : (
        <ul className="list">
          {rows.map((m) => (
            <li key={m.id}>
              <Link className="list__item" to={`/measurements/${m.id}`}>
                <div className="row row--between row--wrap">
                  <span className="list__item-title">{m.name}</span>
                  <span style={{ fontWeight: 700 }}>
                    {m.value != null ? m.value : m.valueText || '—'}
                    {m.unit ? ` ${m.unit}` : ''}
                  </span>
                </div>
                <div className="list__item-meta">
                  {formatDateJa(m.date)}
                  {m.facility ? `／${m.facility}` : ''}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link className="btn btn--primary btn--block btn--big" to="/measurements/new">
        測定結果を追加
      </Link>
    </AppShell>
  );
}

export function MeasurementEditPage(): ReactNode {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();

  const [preset, setPreset] = useState<string>('EDSS');
  const [form, setForm] = useState({
    date: todayISO(),
    name: 'EDSS',
    value: '',
    valueText: '',
    unit: '',
    facility: '',
    examiner: '',
    notes: '',
  });
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    void (async () => {
      const m = await measurements.get(id!);
      if (!alive || !m) return;
      setPreset(measurementNames.includes(m.name as (typeof measurementNames)[number]) ? m.name : 'その他');
      setForm({
        date: m.date,
        name: m.name,
        value: m.value != null ? String(m.value) : '',
        valueText: m.valueText,
        unit: m.unit,
        facility: m.facility,
        examiner: m.examiner,
        notes: m.notes,
      });
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [id, isNew]);

  const choosePreset = (v: string): void => {
    setPreset(v);
    if (v !== 'その他') {
      setForm((f) => ({ ...f, name: v, unit: f.unit || DEFAULT_UNITS[v] || '' }));
    } else {
      setForm((f) => ({ ...f, name: '' }));
    }
  };

  const save = async (): Promise<void> => {
    setError('');
    try {
      const numeric = form.value.trim() === '' ? null : Number(form.value);
      if (numeric != null && Number.isNaN(numeric)) {
        setError('数値の欄には数字を入力してください（文字の結果は「結果（文字）」に入力してください）');
        return;
      }
      const payload = { ...form, value: numeric };
      if (isNew) {
        await measurements.create(payload);
        toast.notify('保存しました');
        navigate('/measurements', { replace: true });
      } else {
        await measurements.update(id!, payload);
        toast.notify('保存しました');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    }
  };

  if (!loaded) {
    return (
      <AppShell title="測定結果" back>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={isNew ? '測定結果を追加' : '測定結果'} back>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card title="測定内容">
          <div className="field">
            <label className="field__label" htmlFor="ms-date">
              測定日
            </label>
            <input
              id="ms-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.currentTarget.value })}
            />
          </div>

          <SelectField label="測定名" value={preset} onChange={(e) => choosePreset(e.currentTarget.value)}>
            {measurementNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectField>

          {preset === 'その他' ? (
            <TextField
              label="測定名（自由入力）"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            />
          ) : null}

          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <TextField
                label="数値"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.currentTarget.value })}
                inputMode="decimal"
                placeholder="例：6.5"
              />
            </div>
            <div className="grow">
              <TextField
                label="単位"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.currentTarget.value })}
              />
            </div>
          </div>

          <TextField
            label="結果（文字：数値以外の場合）"
            value={form.valueText}
            onChange={(e) => setForm({ ...form, valueText: e.currentTarget.value })}
          />
        </Card>

        <Card title="実施情報（任意）">
          <TextField
            label="医療機関"
            value={form.facility}
            onChange={(e) => setForm({ ...form, facility: e.currentTarget.value })}
          />
          <TextField
            label="測定者"
            value={form.examiner}
            onChange={(e) => setForm({ ...form, examiner: e.currentTarget.value })}
          />
          <TextAreaField
            label="メモ"
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

      {!isNew ? (
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
            この測定結果を削除
          </button>
        </div>
      ) : null}

      {confirmDelete ? (
        <ConfirmSheet
          title="この測定結果を削除しますか"
          message="この操作は取り消せません。"
          confirmLabel="削除する"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void measurements.remove(id!).then(() => {
              toast.notify('削除しました');
              navigate('/measurements');
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
