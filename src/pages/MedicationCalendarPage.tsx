import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import { Badge, Card, EmptyState, Segmented } from '@/components/ui';
import { doseRecords, medications, scheduleRules } from '@/db/repo';
import { doseStatusLabel, doseStatusMark } from '@/db/types';
import { buildScheduleItems, type ScheduleItem } from '@/features/medication/schedule';
import {
  addDays,
  addMonths,
  formatDateJa,
  monthGrid,
  monthLabel,
  todayISO,
  WEEKDAY_HEADERS_MON,
} from '@/lib/date';

type Tab = 'calendar' | 'upcoming' | 'history';

/**
 * アプリ内の投薬カレンダー。
 * スマートフォンの標準カレンダーへの追加・.ics 出力・カレンダー API は実装しない。
 */
export function MedicationCalendarPage(): ReactNode {
  const today = todayISO();
  const [tab, setTab] = useState<Tab>('calendar');
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y, month0: m - 1 };
  });
  const [selected, setSelected] = useState<string>(today);

  const data = useLiveQuery(async () => {
    const [meds, rules, records] = await Promise.all([
      medications.all(),
      scheduleRules.all(),
      doseRecords.all(),
    ]);
    return { meds, rules, records };
  }, []);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month0), [cursor]);

  const items = useMemo(() => {
    if (!data) return [];
    const from = addDays(grid[0], -400);
    const to = addDays(grid[grid.length - 1], 400);
    return buildScheduleItems(data.rules, data.records, from, to);
  }, [data, grid]);

  const medName = (id: string): string => data?.meds.find((m) => m.id === id)?.name ?? '（削除された薬）';

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const i of items) {
      const arr = map.get(i.date) ?? [];
      arr.push(i);
      map.set(i.date, arr);
    }
    return map;
  }, [items]);

  const upcoming = items.filter((i) => i.date >= today).slice(0, 40);
  const history = items.filter((i) => i.date < today).reverse().slice(0, 60);

  return (
    <AppShell title="投薬カレンダー" back>
      <p className="notice" style={{ marginBottom: 12 }}>
        この予定はアプリ内だけで管理します。スマートフォンの標準カレンダーとは連携しません。
      </p>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          label="表示切り替え"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'calendar', label: '月表示' },
            { value: 'upcoming', label: '今後の予定' },
            { value: 'history', label: '実施履歴' },
          ]}
        />
      </div>

      {!data ? (
        <p className="muted" role="status">
          読み込み中…
        </p>
      ) : tab === 'calendar' ? (
        <>
          <Card>
            <div className="row row--between" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className="icon-btn"
                aria-label="前の月"
                onClick={() => {
                  const d = addMonths(`${cursor.year}-${String(cursor.month0 + 1).padStart(2, '0')}-01`, -1);
                  const [y, m] = d.split('-').map(Number);
                  setCursor({ year: y, month0: m - 1 });
                }}
              >
                ‹
              </button>
              <strong aria-live="polite">{monthLabel(cursor.year, cursor.month0)}</strong>
              <button
                type="button"
                className="icon-btn"
                aria-label="次の月"
                onClick={() => {
                  const d = addMonths(`${cursor.year}-${String(cursor.month0 + 1).padStart(2, '0')}-01`, 1);
                  const [y, m] = d.split('-').map(Number);
                  setCursor({ year: y, month0: m - 1 });
                }}
              >
                ›
              </button>
            </div>

            <table className="cal">
              <caption className="visually-hidden">
                {monthLabel(cursor.year, cursor.month0)}の投薬予定。●実施済み、△延期、×見送り、○予定。
              </caption>
              <thead>
                <tr>
                  {WEEKDAY_HEADERS_MON.map((w) => (
                    <th key={w} scope="col">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }, (_, row) => (
                  <tr key={row}>
                    {grid.slice(row * 7, row * 7 + 7).map((d) => {
                      const inMonth = Number(d.split('-')[1]) === cursor.month0 + 1;
                      const dayItems = byDate.get(d) ?? [];
                      const cls = [
                        'cal__day',
                        inMonth ? '' : 'cal__day--other',
                        d === today ? 'cal__day--today' : '',
                        d === selected ? 'cal__day--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <td key={d}>
                          <button
                            type="button"
                            className={cls}
                            onClick={() => setSelected(d)}
                            aria-label={`${formatDateJa(d, { weekday: true })}${
                              dayItems.length
                                ? ` 投薬${dayItems.length}件：${dayItems
                                    .map((i) => `${medName(i.medicationId)} ${doseStatusLabel[i.status]}`)
                                    .join('、')}`
                                : ' 予定なし'
                            }`}
                            aria-pressed={d === selected}
                          >
                            <span aria-hidden="true">{Number(d.split('-')[2])}</span>
                            <span className="cal__marks" aria-hidden="true">
                              {dayItems.slice(0, 3).map((i, idx) => (
                                <span key={idx} className="cal__mark">
                                  {doseStatusMark[i.status]}
                                </span>
                              ))}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="field__hint mb0">印：○予定／●実施済み／△延期／×見送り</p>
          </Card>

          <Card title={formatDateJa(selected, { weekday: true })}>
            {(byDate.get(selected) ?? []).length === 0 ? (
              <EmptyState>この日の投薬予定はありません。</EmptyState>
            ) : (
              <ul className="list">
                {(byDate.get(selected) ?? []).map((i) => (
                  <li key={`${i.medicationId}-${i.date}`}>
                    <Link className="list__item" to={`/dose/${i.medicationId}/${i.date}`}>
                      <div className="row row--between row--wrap">
                        <span className="list__item-title">{medName(i.medicationId)}</span>
                        <Badge tone={i.status === 'done' ? 'ok' : i.status === 'planned' ? 'default' : 'attention'}>
                          {doseStatusLabel[i.status]}
                        </Badge>
                      </div>
                      <div className="list__item-meta">
                        {i.time ? `予定時刻 ${i.time}` : '時刻の指定なし'}
                        {i.unscheduled ? '／予定外の記録' : ''}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <Card title={tab === 'upcoming' ? '今後の予定' : '過去の実施履歴'}>
          {(tab === 'upcoming' ? upcoming : history).length === 0 ? (
            <EmptyState>表示できる記録はありません。</EmptyState>
          ) : (
            <ul className="list">
              {(tab === 'upcoming' ? upcoming : history).map((i) => (
                <li key={`${i.medicationId}-${i.date}`}>
                  <Link className="list__item" to={`/dose/${i.medicationId}/${i.date}`}>
                    <div className="row row--between row--wrap">
                      <span className="list__item-title">{formatDateJa(i.date, { weekday: true })}</span>
                      <Badge tone={i.status === 'done' ? 'ok' : i.status === 'planned' ? 'default' : 'attention'}>
                        {doseStatusLabel[i.status]}
                      </Badge>
                    </div>
                    <div className="list__item-meta">
                      {medName(i.medicationId)}
                      {i.record?.actualDose ? `／${i.record.actualDose}${i.record.unit}` : ''}
                      {i.record?.site ? `／${i.record.site}` : ''}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </AppShell>
  );
}
