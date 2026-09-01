import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import { Badge, EmptyState } from '@/components/ui';
import { medications, scheduleRules } from '@/db/repo';
import { medicationStatusLabel } from '@/db/types';
import { describeRule } from '@/features/medication/schedule';

export function MedicationsPage(): ReactNode {
  const data = useLiveQuery(async () => {
    const meds = await medications.all();
    const rules = await scheduleRules.all();
    return { meds, rules };
  }, []);

  return (
    <AppShell title="投薬管理" back>
      <p className="notice" style={{ marginBottom: 12 }}>
        薬・量・投与間隔は、みにかぼ本人が入力します。アプリが医学的に決めることはありません。
      </p>

      {!data ? (
        <p className="muted" role="status">
          読み込み中…
        </p>
      ) : data.meds.length === 0 ? (
        <EmptyState>まだ薬が登録されていません。</EmptyState>
      ) : (
        <ul className="list">
          {data.meds.map((m) => {
            const rules = data.rules.filter((r) => r.medicationId === m.id);
            return (
              <li key={m.id}>
                <Link className="list__item" to={`/medications/${m.id}`}>
                  <div className="row row--between row--wrap">
                    <span className="list__item-title">{m.name}</span>
                    <Badge tone={m.status === 'active' ? 'accent' : 'default'}>
                      {medicationStatusLabel[m.status]}
                    </Badge>
                  </div>
                  <div className="list__item-meta">
                    {[m.dose && `${m.dose}${m.unit}`, m.route].filter(Boolean).join('／') || '詳細未設定'}
                  </div>
                  <div className="list__item-meta">
                    {rules.length === 0
                      ? '投薬予定は未設定'
                      : rules.map((r) => describeRule(r)).join(' ／ ')}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link className="btn btn--primary btn--block btn--big" to="/medications/new">
        薬を追加
      </Link>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <Link className="btn" to="/medication-calendar">
          投薬カレンダーを見る
        </Link>
      </div>
    </AppShell>
  );
}
