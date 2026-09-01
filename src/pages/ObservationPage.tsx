import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import {
  Badge,
  Card,
  ChipSingleSelect,
  ConfirmSheet,
  EmptyState,
  SelectField,
  SeverityInput,
  Sheet,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { observationEntries, observationPeriods, symptomEvents } from '@/db/repo';
import { trendLabel, trendValues, type Trend } from '@/db/types';
import { symptomTitle } from '@/features/symptom/notices';
import { addDays, diffDays, formatDateJa, todayISO } from '@/lib/date';
import { autoSaveLabel, useAutoSave } from '@/lib/useAutoSave';

/**
 * 観察モード。
 * 再発後・治療後・体調変化時などに、期間を決めて毎日かんたんに記録する。
 * 通知は行わず、アプリを開いたときだけ未入力を案内する。
 */
export function ObservationListPage(): ReactNode {
  const today = todayISO();
  const [creating, setCreating] = useState(false);

  const data = useLiveQuery(async () => {
    const periods = await observationPeriods.all();
    const todo: Record<string, boolean> = {};
    for (const p of periods) {
      if (p.status !== 'active' || p.startDate > today || p.endDate < today) continue;
      const entries = await observationEntries.forPeriod(p.id);
      todo[p.id] = !entries.some((e) => e.date === today);
    }
    return { periods, todo };
  }, [today]);

  return (
    <AppShell title="観察モード" back>
      <p className="notice" style={{ marginBottom: 12 }}>
        期間を決めて毎日かんたんに記録します。通知は行いません。アプリを開いたときだけ未入力をお知らせします。
      </p>

      {!data ? (
        <p className="muted" role="status">
          読み込み中…
        </p>
      ) : data.periods.length === 0 ? (
        <EmptyState>観察期間はまだありません。</EmptyState>
      ) : (
        <ul className="list">
          {data.periods.map((p) => (
            <li key={p.id}>
              <Link className="list__item" to={`/observation/${p.id}`}>
                <div className="row row--between row--wrap">
                  <span className="list__item-title">{p.title || '観察期間'}</span>
                  {data.todo[p.id] ? <Badge tone="attention">本日未入力</Badge> : null}
                  <Badge tone={p.status === 'active' ? 'accent' : 'default'}>
                    {p.status === 'active' ? '実施中' : '終了'}
                  </Badge>
                </div>
                <div className="list__item-meta">
                  {formatDateJa(p.startDate, { year: false })} 〜 {formatDateJa(p.endDate, { year: false })}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="btn btn--primary btn--block btn--big" onClick={() => setCreating(true)}>
        観察期間を追加
      </button>

      {creating ? <PeriodSheet onClose={() => setCreating(false)} /> : null}
    </AppShell>
  );
}

function PeriodSheet({ onClose }: { onClose: () => void }): ReactNode {
  const toast = useToast();
  const navigate = useNavigate();
  const today = todayISO();
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 13));
  const [symptomEventId, setSymptomEventId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const events = useLiveQuery(() => symptomEvents.all(), []) ?? [];

  const save = async (): Promise<void> => {
    setError('');
    try {
      const p = await observationPeriods.create({
        title,
        startDate,
        endDate,
        symptomEventId: symptomEventId || null,
        notes,
        status: 'active',
      });
      toast.notify('保存しました');
      onClose();
      navigate(`/observation/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    }
  };

  return (
    <Sheet title="観察期間を追加" onClose={onClose}>
      <TextField
        label="タイトル（任意）"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        placeholder="治療後の経過 など"
      />
      <div className="field">
        <label className="field__label" htmlFor="obs-start">
          開始日
        </label>
        <input id="obs-start" type="date" value={startDate} onChange={(e) => setStartDate(e.currentTarget.value)} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="obs-end">
          終了予定日
        </label>
        <input id="obs-end" type="date" value={endDate} onChange={(e) => setEndDate(e.currentTarget.value)} />
      </div>
      <SelectField
        label="対象の症状イベント（任意）"
        value={symptomEventId}
        onChange={(e) => setSymptomEventId(e.currentTarget.value)}
      >
        <option value="">指定しない</option>
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {symptomTitle(ev)}（{formatDateJa(ev.onsetAt.slice(0, 10))}）
          </option>
        ))}
      </SelectField>
      <TextAreaField label="メモ（任意）" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
      {error ? (
        <p className="notice notice--attention" role="alert">
          {error}
        </p>
      ) : null}
      <div className="btn-row">
        <button type="button" className="btn" onClick={onClose}>
          キャンセル
        </button>
        <button type="button" className="btn btn--primary" onClick={() => void save()}>
          保存する
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ 詳細画面 */

export function ObservationDetailPage(): ReactNode {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayISO();

  const data = useLiveQuery(async () => {
    const period = await observationPeriods.get(id);
    if (!period) return { period: null, entries: [], event: null };
    const entries = await observationEntries.forPeriod(id);
    const event = period.symptomEventId ? ((await symptomEvents.get(period.symptomEventId)) ?? null) : null;
    return { period, entries, event };
  }, [id]);

  const [trend, setTrend] = useState<Trend>('same');
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (prefilled || !data?.period) return;
    const todays = data.entries.find((e) => e.date === today);
    if (todays) {
      setTrend(todays.trend);
      setSeverity(todays.severity);
      setNotes(todays.notes);
    }
    setPrefilled(true);
  }, [data, today, prefilled]);

  const entryDraft = useMemo(() => ({ trend, severity, notes }), [trend, severity, notes]);
  const entrySavedAt = useAutoSave(
    entryDraft,
    async (d) => {
      if (!id) return;
      await observationEntries.saveForDay(id, today, d);
    },
    prefilled &&
      data?.period?.status === 'active' &&
      !!data?.period &&
      data.period.startDate <= today &&
      today <= data.period.endDate,
  );

  if (!data) {
    return (
      <AppShell title="観察モード" back>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }
  const { period, entries, event } = data;
  if (!period) {
    return (
      <AppShell title="観察モード" back>
        <p>観察期間が見つかりませんでした。</p>
      </AppShell>
    );
  }

  const inRange = period.startDate <= today && today <= period.endDate;
  const todayDone = entries.some((e) => e.date === today);

  const save = async (): Promise<void> => {
    await observationEntries.saveForDay(period.id, today, { trend, severity, notes });
    toast.notify('保存しました');
  };

  return (
    <AppShell title={period.title || '観察期間'} back>
      <Card>
        <p className="card__sub mb0">
          {formatDateJa(period.startDate, { weekday: true })} 〜 {formatDateJa(period.endDate, { weekday: true })}
          （{diffDays(period.endDate, period.startDate) + 1}日間）
        </p>
        {event ? (
          <p className="small mb0" style={{ marginTop: 6 }}>
            対象の症状：<Link to={`/symptom/${event.id}`}>{symptomTitle(event)}</Link>
          </p>
        ) : null}
        {period.notes ? <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{period.notes}</p> : null}
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void observationPeriods
                .update(period.id, { status: period.status === 'active' ? 'ended' : 'active' })
                .then(() => toast.notify('保存しました'))
            }
          >
            {period.status === 'active' ? '観察を終了する' : '観察を再開する'}
          </button>
        </div>
      </Card>

      {inRange && period.status === 'active' ? (
        <Card title={`今日の記録（${formatDateJa(today, { year: false, weekday: true })}）`}>
          {todayDone ? <p className="small muted">本日分は記録済みです。内容を更新できます。</p> : null}
          <ChipSingleSelect
            label="前回と比べて"
            options={trendValues.map((v) => ({ value: v, label: trendLabel[v] }))}
            value={trend}
            onChange={setTrend}
          />
          <SeverityInput label="強さ（任意）" value={severity} onChange={setSeverity} allowNull />
          <TextAreaField label="メモ（任意）" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
          <p className="small muted" role="status" aria-live="polite">
            {autoSaveLabel(entrySavedAt)}
          </p>
          <button type="button" className="btn btn--primary btn--block btn--big" onClick={() => void save()}>
            保存する
          </button>
        </Card>
      ) : (
        <p className="notice" style={{ marginBottom: 12 }}>
          {period.status !== 'active' ? 'この観察期間は終了しています。' : '本日は観察期間の範囲外です。'}
        </p>
      )}

      <Card title={`これまでの記録（${entries.length}件）`}>
        {entries.length === 0 ? (
          <EmptyState>まだ記録はありません。</EmptyState>
        ) : (
          <ul className="timeline">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="timeline__item">
                <div className="timeline__date">{formatDateJa(e.date, { weekday: true })}</div>
                <div>
                  {trendLabel[e.trend]}
                  {e.severity != null ? `／強さ ${e.severity}` : ''}
                </div>
                {e.notes ? (
                  <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>
                    {e.notes}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="btn-row">
        <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
          この観察期間を削除
        </button>
      </div>

      {confirmDelete ? (
        <ConfirmSheet
          title="この観察期間を削除しますか"
          message="毎日の記録も一緒に削除されます。この操作は取り消せません。"
          confirmLabel="削除する"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void observationPeriods.remove(period.id).then(() => {
              toast.notify('削除しました');
              navigate('/observation');
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
