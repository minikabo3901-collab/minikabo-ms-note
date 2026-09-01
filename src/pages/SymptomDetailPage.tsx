import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import {
  Badge,
  Card,
  ChipSingleSelect,
  ConfirmSheet,
  SeverityInput,
  TextAreaField,
  UrgentNotice,
} from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { symptomEvents, symptomLogs } from '@/db/repo';
import {
  adlImpactLabel,
  trendLabel,
  trendValues,
  type Trend,
} from '@/db/types';
import { isOngoingOver24h, ONGOING_24H_MESSAGE, symptomTitle } from '@/features/symptom/notices';
import {
  durationDays,
  formatDateJa,
  formatDateTimeJa,
  fromDateTimeLocalValue,
  isoDateOfDateTime,
  toDateTimeLocalValue,
  todayISO,
} from '@/lib/date';
import { autoSaveLabel, useAutoSave } from '@/lib/useAutoSave';

export function SymptomDetailPage(): ReactNode {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const today = todayISO();

  const data = useLiveQuery(async () => {
    const event = await symptomEvents.get(id);
    if (!event) return { event: null, logs: [] };
    const logs = await symptomLogs.forEvent(id);
    return { event, logs };
  }, [id]);

  const [trend, setTrend] = useState<Trend>('same');
  const [logSeverity, setLogSeverity] = useState<number | null>(null);
  const [logNotes, setLogNotes] = useState('');
  const [showRecover, setShowRecover] = useState(false);
  const [recoverLocal, setRecoverLocal] = useState(() => toDateTimeLocalValue(null));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // 当日分が既にあれば読み込んで、毎回すべて再入力しなくて済むようにする
  useEffect(() => {
    if (prefilled || !data?.event) return;
    const todays = data.logs.find((l) => l.date === today);
    if (todays) {
      setTrend(todays.trend);
      setLogSeverity(todays.severity);
      setLogNotes(todays.notes);
    } else {
      setLogSeverity(data.event.severity);
    }
    if (params.get('recover') === '1') setShowRecover(true);
    setPrefilled(true);
  }, [data, today, params, prefilled]);

  const logDraft = useMemo(
    () => ({ trend, severity: logSeverity, notes: logNotes }),
    [trend, logSeverity, logNotes],
  );
  const logSavedAt = useAutoSave(
    logDraft,
    async (d) => {
      if (!id) return;
      await symptomLogs.saveForDay(id, today, d);
    },
    prefilled && data?.event?.status === 'ongoing',
  );

  if (!data) {
    return (
      <AppShell title="症状" back>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }
  const { event, logs } = data;
  if (!event) {
    return (
      <AppShell title="症状" back>
        <p>この症状の記録は見つかりませんでした。</p>
      </AppShell>
    );
  }

  const saveLog = async (): Promise<void> => {
    await symptomLogs.saveForDay(event.id, today, {
      trend,
      severity: logSeverity,
      notes: logNotes,
    });
    toast.notify('保存しました');
    if (params.get('log')) {
      const next = new URLSearchParams(params);
      next.delete('log');
      setParams(next, { replace: true });
    }
  };

  const recover = async (): Promise<void> => {
    await symptomEvents.update(event.id, {
      status: 'recovered',
      recoveredAt: fromDateTimeLocalValue(recoverLocal),
    });
    toast.notify('回復として記録しました');
    setShowRecover(false);
  };

  const reopen = async (): Promise<void> => {
    await symptomEvents.update(event.id, { status: 'ongoing', recoveredAt: null });
    toast.notify('継続中に戻しました');
  };

  return (
    <AppShell title={symptomTitle(event)} back>
      {event.status === 'ongoing' ? <UrgentNotice /> : null}

      <Card title="この症状">
        <div className="row row--between row--wrap" style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>{symptomTitle(event)}</span>
          <Badge tone={event.status === 'ongoing' ? 'attention' : 'ok'}>
            {event.status === 'ongoing' ? '継続中' : '回復'}
          </Badge>
        </div>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
          <dt className="small muted">種類</dt>
          <dd style={{ margin: 0 }}>{event.kind === 'new' ? '新しい症状' : '既存症状の悪化'}</dd>
          <dt className="small muted">開始</dt>
          <dd style={{ margin: 0 }}>
            {formatDateTimeJa(event.onsetAt)}（{event.onsetType === 'sudden' ? '突然' : '徐々に'}）
          </dd>
          <dt className="small muted">継続</dt>
          <dd style={{ margin: 0 }}>
            {event.status === 'ongoing'
              ? `${durationDays(event.onsetAt, null, today)}日目`
              : `${durationDays(event.onsetAt, event.recoveredAt)}日間`}
          </dd>
          {event.recoveredAt ? (
            <>
              <dt className="small muted">回復</dt>
              <dd style={{ margin: 0 }}>{formatDateTimeJa(event.recoveredAt)}</dd>
            </>
          ) : null}
          <dt className="small muted">強さ</dt>
          <dd style={{ margin: 0 }}>{event.severity} / 10</dd>
          <dt className="small muted">生活への影響</dt>
          <dd style={{ margin: 0 }}>{adlImpactLabel[event.adlImpact]}</dd>
          {event.bodyParts.length || event.bodyPartsNote ? (
            <>
              <dt className="small muted">部位</dt>
              <dd style={{ margin: 0 }}>
                {[...event.bodyParts, event.bodyPartsNote].filter(Boolean).join('・')}
              </dd>
            </>
          ) : null}
          {event.context.length || event.contextNote ? (
            <>
              <dt className="small muted">状況</dt>
              <dd style={{ margin: 0 }}>{[...event.context, event.contextNote].filter(Boolean).join('・')}</dd>
            </>
          ) : null}
        </dl>
        {event.notes ? <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{event.notes}</p> : null}

        {isOngoingOver24h(event) ? (
          <p className="notice notice--attention" style={{ marginTop: 10 }}>
            {ONGOING_24H_MESSAGE}
          </p>
        ) : null}
      </Card>

      {event.status === 'ongoing' ? (
        <Card title="今日の状態（かんたん記録）">
          <ChipSingleSelect
            label="前回と比べて"
            options={trendValues.map((v) => ({ value: v, label: trendLabel[v] }))}
            value={trend}
            onChange={setTrend}
          />
          <SeverityInput label="強さ（任意）" value={logSeverity} onChange={setLogSeverity} allowNull />
          <TextAreaField
            label="メモ（任意）"
            value={logNotes}
            onChange={(e) => setLogNotes(e.currentTarget.value)}
          />
          <p className="small muted" role="status" aria-live="polite">
            {autoSaveLabel(logSavedAt)}
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--big" onClick={() => void saveLog()}>
              今日の状態を保存
            </button>
            <button type="button" className="btn" onClick={() => setShowRecover(true)}>
              回復として終了
            </button>
          </div>
        </Card>
      ) : (
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button type="button" className="btn" onClick={() => void reopen()}>
            継続中に戻す
          </button>
        </div>
      )}

      <Card title={`経過記録（${logs.length}件）`}>
        {logs.length === 0 ? (
          <p className="empty">まだ経過記録はありません。</p>
        ) : (
          <ul className="timeline">
            {[...logs].reverse().map((l) => (
              <li key={l.id} className="timeline__item">
                <div className="timeline__date">{formatDateJa(l.date, { weekday: true })}</div>
                <div>
                  {trendLabel[l.trend]}
                  {l.severity != null ? `／強さ ${l.severity}` : ''}
                </div>
                {l.notes ? <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{l.notes}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="btn-row">
        <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
          この記録を削除
        </button>
      </div>

      {showRecover ? (
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setShowRecover(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="回復として終了">
            <h2>回復として終了</h2>
            <p className="small muted">
              開始日 {formatDateJa(isoDateOfDateTime(event.onsetAt))} からの記録を「回復」として閉じます。
              あとから継続中に戻すこともできます。
            </p>
            <div className="field">
              <label className="field__label" htmlFor="recovered-at">
                回復日時
              </label>
              <input
                id="recovered-at"
                type="datetime-local"
                value={recoverLocal}
                onChange={(e) => setRecoverLocal(e.currentTarget.value)}
                style={{ width: '100%', minHeight: 44, padding: '10px 12px', fontSize: '1rem' }}
              />
            </div>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => setShowRecover(false)}>
                キャンセル
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void recover()}>
                回復として保存
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <ConfirmSheet
          title="この症状の記録を削除しますか"
          message="経過記録も一緒に削除されます。この操作は取り消せません。"
          confirmLabel="削除する"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void symptomEvents.remove(event.id).then(() => {
              toast.notify('削除しました');
              navigate('/record');
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
