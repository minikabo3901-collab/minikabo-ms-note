import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { UrgentNotice } from '@/components/ui';

const ITEMS = [
  { to: '/record/weekly', title: '週1回のチェック', desc: '先週との変化を短時間で記録します' },
  { to: '/record/symptom/new', title: '症状の変化', desc: '新しい症状・既存症状の悪化を記録します' },
  { to: '/medications', title: '投薬管理', desc: '薬の設定・投薬予定・実施記録' },
  { to: '/medication-calendar', title: '投薬カレンダー', desc: '月表示・今後の予定・過去の履歴' },
  { to: '/observation', title: '観察モード', desc: '期間を決めて毎日かんたんに記録します' },
  { to: '/medical', title: '医療履歴', desc: '診察・MRI・血液検査・治療などの記録' },
  { to: '/measurements', title: '身体機能・認知機能の測定結果', desc: 'EDSS・T25FW・9HPT・SDMT・BICAMS など' },
  { to: '/appointments', title: '次回診察・検査の予定', desc: 'アプリ内だけで管理します' },
];

export function RecordPage(): ReactNode {
  return (
    <AppShell title="記録">
      <UrgentNotice />
      <ul className="list">
        {ITEMS.map((i) => (
          <li key={i.to}>
            <Link className="list__item" to={i.to}>
              <div className="list__item-title">{i.title}</div>
              <div className="list__item-meta">{i.desc}</div>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
