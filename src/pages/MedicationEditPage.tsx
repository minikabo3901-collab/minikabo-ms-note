import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import {
  Card,
  ChipSingleSelect,
  ConfirmSheet,
  SelectField,
  Sheet,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { medications, scheduleRules } from '@/db/repo';
import {
  medicationStatusLabel,
  medicationStatusValues,
  scheduleKindLabel,
  scheduleKindValues,
  type MedicationStatus,
  type ScheduleKind,
  type ScheduleRule,
} from '@/db/types';
import { describeRule } from '@/features/medication/schedule';
import { formatDateJa, todayISO } from '@/lib/date';

const emptyForm = {
  name: '',
  dose: '',
  unit: '',
  route: '',
  startDate: todayISO(),
  endDate: '',
  status: 'active' as MedicationStatus,
  notes: '',
};

export function MedicationEditPage(): ReactNode {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(emptyForm);
  const [loaded, setLoaded] = useState(isNew);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ruleEditing, setRuleEditing] = useState<ScheduleRule | 'new' | null>(null);

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    medications.get(id!).then((m) => {
      if (!alive || !m) return;
      setForm({
        name: m.name,
        dose: m.dose,
        unit: m.unit,
        route: m.route,
        startDate: m.startDate,
        endDate: m.endDate ?? '',
        status: m.status,
        notes: m.notes,
      });
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [id, isNew]);

  const rules = useLiveQuery(
    async () => (isNew ? [] : scheduleRules.forMedication(id!)),
    [id, isNew],
  );

  const save = async (): Promise<void> => {
    setError('');
    try {
      const payload = {
        name: form.name,
        dose: form.dose,
        unit: form.unit,
        route: form.route,
        startDate: form.startDate,
        endDate: form.endDate || null,
        status: form.status,
        notes: form.notes,
      };
      if (isNew) {
        const m = await medications.create(payload);
        toast.notify('保存しました');
        navigate(`/medications/${m.id}`, { replace: true });
      } else {
        await medications.update(id!, payload);
        toast.notify('保存しました');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    }
  };

  if (!loaded) {
    return (
      <AppShell title="薬の設定" back>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title={isNew ? '薬を追加' : '薬の設定'} back>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card title="薬の情報">
          <TextField
            label="薬名"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
            placeholder="処方されている薬の名前を入力"
            autoComplete="off"
          />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <TextField
                label="1回量"
                value={form.dose}
                onChange={(e) => setForm({ ...form, dose: e.currentTarget.value })}
                inputMode="decimal"
                placeholder="例：数値を入力"
              />
            </div>
            <div className="grow">
              <TextField
                label="単位"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.currentTarget.value })}
                placeholder="mg / mL / 錠 など"
              />
            </div>
          </div>
          <TextField
            label="投与方法"
            value={form.route}
            onChange={(e) => setForm({ ...form, route: e.currentTarget.value })}
            placeholder="皮下注射 / 点滴 / 内服 など"
          />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow field">
              <label className="field__label" htmlFor="med-start">
                開始日
              </label>
              <input
                id="med-start"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })}
              />
            </div>
            <div className="grow field">
              <label className="field__label" htmlFor="med-end">
                終了日（任意）
              </label>
              <input
                id="med-end"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.currentTarget.value })}
              />
            </div>
          </div>
          <ChipSingleSelect
            label="状態"
            options={medicationStatusValues.map((v) => ({ value: v, label: medicationStatusLabel[v] }))}
            value={form.status}
            onChange={(v) => setForm({ ...form, status: v })}
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

      {!isNew ? (
        <>
          <Card title="投薬予定">
            <p className="small muted">
              複数のルールを組み合わせられます。導入期の不規則な日程を「個別の日付」で、
              その後の定期投与を「N日ごと／N週間ごと」で登録できます。
            </p>
            {(rules ?? []).length === 0 ? (
              <p className="empty">投薬予定はまだ登録されていません。</p>
            ) : (
              <ul className="list">
                {(rules ?? []).map((r) => (
                  <li key={r.id}>
                    <button type="button" className="list__item" onClick={() => setRuleEditing(r)}>
                      <div className="row row--between row--wrap">
                        <span className="list__item-title">
                          {r.label || scheduleKindLabel[r.kind]}
                        </span>
                        <span className="badge">{r.active ? '有効' : '停止中'}</span>
                      </div>
                      <div className="list__item-meta">{describeRule(r)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn--block" onClick={() => setRuleEditing('new')}>
              予定ルールを追加
            </button>
            <p className="field__hint">
              予定ルールを変更しても、過去の実施履歴は変更されません。変更は未来の予定にだけ反映されます。
            </p>
          </Card>

          <div className="btn-row">
            <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
              この薬を削除
            </button>
          </div>
        </>
      ) : null}

      {ruleEditing ? (
        <RuleSheet
          medicationId={id!}
          rule={ruleEditing === 'new' ? null : ruleEditing}
          onClose={() => setRuleEditing(null)}
          onSaved={() => {
            setRuleEditing(null);
            toast.notify('保存しました');
          }}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmSheet
          title="この薬を削除しますか"
          message="投薬予定ルールと投薬記録も一緒に削除されます。この操作は取り消せません。"
          confirmLabel="削除する"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void medications.remove(id!).then(() => {
              toast.notify('削除しました');
              navigate('/medications');
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}

/* --------------------------------------------------- 予定ルール編集シート */

function RuleSheet({
  medicationId,
  rule,
  onClose,
  onSaved,
}: {
  medicationId: string;
  rule: ScheduleRule | null;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const [kind, setKind] = useState<ScheduleKind>(rule?.kind ?? 'everyNWeeks');
  const [label, setLabel] = useState(rule?.label ?? '');
  const [interval, setInterval] = useState(String(rule?.interval ?? 4));
  const [startDate, setStartDate] = useState(rule?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [time, setTime] = useState(rule?.time ?? '');
  const [active, setActive] = useState(rule?.active ?? true);
  const [dates, setDates] = useState<string[]>(rule?.dates ?? []);
  const [dateInput, setDateInput] = useState(todayISO());
  const [error, setError] = useState('');

  const addDate = (): void => {
    if (!dateInput) return;
    setDates((prev) => (prev.includes(dateInput) ? prev : [...prev, dateInput].sort()));
  };

  const save = async (): Promise<void> => {
    setError('');
    try {
      const payload = {
        medicationId,
        label,
        kind,
        dates: kind === 'dates' ? dates : [],
        interval: kind === 'dates' ? 1 : Math.max(1, Number(interval) || 1),
        startDate: kind === 'dates' ? (dates[0] ?? startDate) : startDate,
        endDate: endDate || null,
        time: time || null,
        active,
      };
      if (rule) await scheduleRules.update(rule.id, payload);
      else await scheduleRules.create(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    }
  };

  return (
    <Sheet title={rule ? '予定ルールを編集' : '予定ルールを追加'} onClose={onClose}>
      <ChipSingleSelect
        label="繰り返し方"
        options={scheduleKindValues.map((v) => ({ value: v, label: scheduleKindLabel[v] }))}
        value={kind}
        onChange={setKind}
      />
      <TextField
        label="ルール名（任意）"
        value={label}
        onChange={(e) => setLabel(e.currentTarget.value)}
        placeholder="導入期・維持期 など"
      />

      {kind === 'dates' ? (
        <div className="field">
          <span className="field__label">個別の日付</span>
          <div className="row" style={{ marginBottom: 8 }}>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.currentTarget.value)}
              aria-label="追加する日付"
            />
            <button type="button" className="btn" onClick={addDate}>
              追加
            </button>
          </div>
          {dates.length === 0 ? (
            <p className="field__hint">日付を1つ以上追加してください。</p>
          ) : (
            <div className="chips">
              {dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="chip"
                  aria-pressed
                  onClick={() => setDates((prev) => prev.filter((x) => x !== d))}
                  aria-label={`${formatDateJa(d)} を削除`}
                >
                  {formatDateJa(d, { year: false })}
                </button>
              ))}
            </div>
          )}
          <p className="field__hint">チップを押すと削除できます。</p>
        </div>
      ) : (
        <>
          <SelectField
            label={kind === 'everyNWeeks' ? '何週間ごと' : '何日ごと'}
            value={interval}
            onChange={(e) => setInterval(e.currentTarget.value)}
          >
            {Array.from({ length: kind === 'everyNWeeks' ? 12 : 60 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
                {kind === 'everyNWeeks' ? '週間ごと' : '日ごと'}
              </option>
            ))}
          </SelectField>
          <div className="field">
            <label className="field__label" htmlFor="rule-start">
              開始日
            </label>
            <input
              id="rule-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.currentTarget.value)}
            />
          </div>
        </>
      )}

      <div className="field">
        <label className="field__label" htmlFor="rule-end">
          終了日（任意）
        </label>
        <input id="rule-end" type="date" value={endDate} onChange={(e) => setEndDate(e.currentTarget.value)} />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="rule-time">
          予定時刻（任意）
        </label>
        <input id="rule-time" type="time" value={time} onChange={(e) => setTime(e.currentTarget.value)} />
        <p className="field__hint">通知は行いません。表示上の目安として使います。</p>
      </div>

      <div className="field">
        <button type="button" className="chip" aria-pressed={active} onClick={() => setActive((v) => !v)}>
          このルールを有効にする
        </button>
      </div>

      {error ? (
        <p className="notice notice--attention" role="alert">
          {error}
        </p>
      ) : null}

      <div className="btn-row">
        {rule ? (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void scheduleRules.remove(rule.id).then(onSaved)}
          >
            削除
          </button>
        ) : null}
        <button type="button" className="btn btn--primary" onClick={() => void save()}>
          保存する
        </button>
      </div>
    </Sheet>
  );
}
