import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import { Badge, Card, EmptyState } from '@/components/ui';
import {
  appointments as appointmentsRepo,
  doseRecords as doseRepo,
  medications as medRepo,
  observationEntries,
  observationPeriods,
  scheduleRules as ruleRepo,
  symptomEvents as symptomRepo,
  weeklyChecks as weeklyRepo,
} from '@/db/repo';
import { nextDoseHeadline, nextDoseInfo } from '@/features/medication/schedule';
import { isOngoingOver24h, ONGOING_24H_MESSAGE, symptomTitle } from '@/features/symptom/notices';
import {
  durationDays,
  formatDateJa,
  isoDateOfDateTime,
  todayISO,
  weekStartOf,
  diffDays,
} from '@/lib/date';

export function HomePage(): ReactNode {
  const navigate = useNavigate();
  const today = todayISO();

  const data = useLiveQuery(async () => {
    const [meds, rules, records, week, ongoing, appts, periods] = await Promise.all([
      medRepo.all(),
      ruleRepo.all(),
      doseRepo.all(),
      weeklyRepo.forWeek(weekStartOf(today)),
      symptomRepo.ongoing(),
      appointmentsRepo.upcoming(today),
      observationPeriods.active(),
    ]);
    // 観察モードの本日未入力を数える（通知は行わず、開いたときだけ案内する）
    let observationTodo = 0;
    for (const p of periods) {
      if (p.startDate > today || p.endDate < today) continue;
      const entries = await observationEntries.forPeriod(p.id);
      if (!entries.some((e) => e.date === today)) observationTodo++;
    }
    return { meds, rules, records, week, ongoing, appts, observationTodo };
  }, [today]);

  if (!data) {
    return (
      <AppShell>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }

  const info = nextDoseInfo(data.meds, data.rules, data.records, today);
  const medName = info.medication?.name ?? '';

  return (
    <AppShell>
      {/* 7.1 次の投薬 */}
      <Card title="次の投薬" variant={info.kind === 'overdue' ? 'attention' : undefined}>
        <p className="card__lead">{nextDoseHeadline(info)}</p>
        {info.item ? (
          <p className="card__sub">
            {medName}／予定日 {formatDateJa(info.item.date, { weekday: true })}
            {info.item.time ? ` ${info.item.time}` : ''}
            {info.kind === 'overdue' ? `（${info.daysOverdue}日経過）` : ''}
          </p>
        ) : (
          <p className="card__sub">
            薬と投薬予定は設定画面ではなく「投薬管理」から、みにかぼ本人が登録します。
          </p>
        )}

        {info.kind === 'overdue' ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate(`/dose/${info.item!.medicationId}/${info.item!.date}`)}
            >
              実施を記録
            </button>
            <Link className="btn" to={`/medications/${info.item!.medicationId}`}>
              予定を変更
            </Link>
            <Link className="btn" to="/clinic/questions">
              病院に確認
            </Link>
          </div>
        ) : (
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() =>
                navigate(
                  info.item
                    ? `/dose/${info.item.medicationId}/${info.item.date}`
                    : '/medications',
                )
              }
            >
              投薬を記録
            </button>
            <Link className="btn" to="/medication-calendar">
              予定を確認
            </Link>
            <Link className="btn" to="/medications">
              予定を変更
            </Link>
          </div>
        )}
      </Card>

      {/* 7.2 今週のチェック（未記録のときだけ目立たせる） */}
      {!data.week ? (
        <section className="card card--accent">
          <h2 className="card__title">今週のチェック</h2>
          <p className="card__sub">先週と比べて、体調に変化はありますか。</p>
          <div className="btn-row">
            <Link className="btn btn--primary btn--big" to="/record/weekly?mode=nochange">
              先週とほぼ変化なし
            </Link>
            <Link className="btn btn--big" to="/record/weekly?mode=change">
              変化がある
            </Link>
          </div>
        </section>
      ) : (
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          今週のチェックは記録済みです（{formatDateJa(data.week.recordedDate, { year: false })}）。
          <Link to="/record/weekly"> 内容を見直す</Link>
        </p>
      )}

      {/* 7.3 症状変化 */}
      <Link className="btn btn--primary btn--block btn--big" to="/record/symptom/new" style={{ marginBottom: 12 }}>
        症状の変化を記録
      </Link>

      {/* 7.4 継続中の症状 */}
      {data.ongoing.length > 0 ? (
        <Card title="継続中の症状">
          <ul className="list">
            {data.ongoing.map((e) => (
              <li key={e.id}>
                <div className="list__item">
                  <div className="row row--between row--wrap">
                    <span className="list__item-title">{symptomTitle(e)}</span>
                    <Badge tone="accent">{e.kind === 'new' ? '新しい症状' : '悪化'}</Badge>
                  </div>
                  <div className="list__item-meta">
                    開始 {formatDateJa(isoDateOfDateTime(e.onsetAt))} ／ 継続{' '}
                    {durationDays(e.onsetAt, null, today)}日目
                  </div>
                  {isOngoingOver24h(e) ? (
                    <p className="notice notice--attention small" style={{ margin: '8px 0 0' }}>
                      {ONGOING_24H_MESSAGE}
                    </p>
                  ) : null}
                  <div className="btn-row" style={{ marginTop: 10 }}>
                    <Link className="btn" to={`/symptom/${e.id}?log=1`}>
                      今日の状態を記録
                    </Link>
                    <Link className="btn" to={`/symptom/${e.id}?recover=1`}>
                      回復として終了
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* 観察モードの未入力案内（通知は行わない） */}
      {data.observationTodo > 0 ? (
        <Card title="観察モード">
          <p className="mb0">
            本日分が未入力の観察期間が {data.observationTodo} 件あります。
            <br />
            <Link to="/observation">観察モードを開く</Link>
          </p>
        </Card>
      ) : null}

      {/* 7.5 次回診察・検査 */}
      <Card title="次回診察・検査">
        {data.appts.length === 0 ? (
          <EmptyState>
            登録された予定はありません。
            <br />
            <Link to="/appointments/new">予定を追加</Link>
          </EmptyState>
        ) : (
          <ul className="list">
            {data.appts.slice(0, 3).map((a) => {
              const d = diffDays(a.date, today);
              return (
                <li key={a.id}>
                  <Link className="list__item" to={`/appointments/${a.id}`}>
                    <div className="row row--between row--wrap">
                      <span className="list__item-title">
                        {a.type}
                        {a.facility ? `／${a.facility}` : ''}
                      </span>
                      <Badge>{d === 0 ? '本日' : `あと${d}日`}</Badge>
                    </div>
                    <div className="list__item-meta">
                      {formatDateJa(a.date, { weekday: true })}
                      {a.time ? ` ${a.time}` : ''}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="field__hint mb0">
          この予定はアプリ内だけで管理します。スマートフォンの標準カレンダーとは連携しません。
        </p>
      </Card>
    </AppShell>
  );
}
