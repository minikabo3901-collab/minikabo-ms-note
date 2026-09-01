import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import { Card, EmptyState, Segmented } from '@/components/ui';
import {
  doseRecords,
  measurements as measurementRepo,
  medicalEvents as medicalRepo,
  medications as medRepo,
  symptomEvents as symptomRepo,
  weeklyChecks as weeklyRepo,
} from '@/db/repo';
import { doseStatusLabel } from '@/db/types';
import { LineChart, type Marker, type Series } from '@/features/progress/LineChart';
import { TREND_NOTICE, worseningWeeklyKeys } from '@/features/progress/trend';
import { WEEKLY_SCALES, scaleName } from '@/features/weekly/labels';
import { symptomTitle } from '@/features/symptom/notices';
import { addDays, addMonths, formatDateJa, isoDateOfDateTime, todayISO, type ISODate } from '@/lib/date';

type RangeKey = '1m' | '3m' | '6m' | '1y' | 'all';

const RANGES: { value: RangeKey; label: string }[] = [
  { value: '1m', label: '1か月' },
  { value: '3m', label: '3か月' },
  { value: '6m', label: '6か月' },
  { value: '1y', label: '1年' },
  { value: 'all', label: '全期間' },
];

type LayerKey = 'weekly' | 'symptom' | 'dose' | 'medical' | 'measurement';

const LAYERS: { key: LayerKey; label: string }[] = [
  { key: 'weekly', label: '週次チェック' },
  { key: 'symptom', label: '症状イベント' },
  { key: 'dose', label: '投薬' },
  { key: 'medical', label: '診察・検査・治療' },
  { key: 'measurement', label: '測定結果' },
];

interface TimelineRow {
  date: ISODate;
  kind: LayerKey;
  title: string;
  detail: string;
  to?: string;
}

export function ProgressPage(): ReactNode {
  const today = todayISO();
  const [range, setRange] = useState<RangeKey>('3m');
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    weekly: true,
    symptom: true,
    dose: true,
    medical: true,
    measurement: true,
  });
  const [measureName, setMeasureName] = useState<string>('');

  const data = useLiveQuery(async () => {
    const [weekly, symptoms, doses, medical, ms, meds] = await Promise.all([
      weeklyRepo.all(),
      symptomRepo.all(),
      doseRecords.all(),
      medicalRepo.all(),
      measurementRepo.all(),
      medRepo.all(),
    ]);
    return { weekly, symptoms, doses, medical, ms, meds };
  }, []);

  const from = useMemo<ISODate>(() => {
    if (range === 'all') {
      if (!data) return addMonths(today, -3);
      const dates = [
        ...data.weekly.map((w) => w.weekStart),
        ...data.symptoms.map((s) => isoDateOfDateTime(s.onsetAt)),
        ...data.doses.map((d) => d.scheduledDate),
        ...data.medical.map((m) => m.date),
        ...data.ms.map((m) => m.date),
      ].filter(Boolean);
      return dates.length ? dates.sort()[0] : addMonths(today, -3);
    }
    const months = range === '1m' ? 1 : range === '3m' ? 3 : range === '6m' ? 6 : 12;
    return addMonths(today, -months);
  }, [range, data, today]);

  const to = addDays(today, 0);

  const filtered = useMemo(() => {
    if (!data) return null;
    const inRange = (d: ISODate): boolean => d >= from && d <= to;
    return {
      weekly: data.weekly.filter((w) => inRange(w.weekStart)),
      symptoms: data.symptoms.filter((s) => inRange(isoDateOfDateTime(s.onsetAt))),
      doses: data.doses.filter((d) => inRange(d.scheduledDate)),
      medical: data.medical.filter((m) => inRange(m.date)),
      ms: data.ms.filter((m) => inRange(m.date)),
      meds: data.meds,
    };
  }, [data, from, to]);

  const weeklySeries: Series[] = useMemo(() => {
    if (!filtered) return [];
    return WEEKLY_SCALES.map((s) => ({
      name: s.label,
      points: filtered.weekly
        .filter((w) => !w.noChange && w.scores[s.key] != null)
        .map((w) => ({ date: w.weekStart, value: w.scores[s.key] as number })),
    }));
  }, [filtered]);

  const markers: Marker[] = useMemo(() => {
    if (!filtered) return [];
    const out: Marker[] = [];
    if (layers.dose) {
      for (const d of filtered.doses) {
        if (d.status === 'done') out.push({ date: d.scheduledDate, symbol: '▲', label: '投薬（実施）' });
      }
    }
    if (layers.symptom) {
      for (const s of filtered.symptoms) {
        out.push({ date: isoDateOfDateTime(s.onsetAt), symbol: '◆', label: '症状イベント' });
      }
    }
    if (layers.medical) {
      for (const m of filtered.medical) {
        out.push({ date: m.date, symbol: '■', label: '診察・検査・治療' });
      }
    }
    return out;
  }, [filtered, layers]);

  const measurementNamesInRange = useMemo(
    () => Array.from(new Set((filtered?.ms ?? []).map((m) => m.name))).sort(),
    [filtered],
  );

  const activeMeasureName = measureName || measurementNamesInRange[0] || '';

  const measurementSeries: Series[] = useMemo(() => {
    if (!filtered || !activeMeasureName) return [];
    const pts = filtered.ms
      .filter((m) => m.name === activeMeasureName && m.value != null)
      .map((m) => ({ date: m.date, value: m.value as number }));
    return pts.length ? [{ name: activeMeasureName, points: pts }] : [];
  }, [filtered, activeMeasureName]);

  const worsening = useMemo(() => (filtered ? worseningWeeklyKeys(filtered.weekly) : []), [filtered]);

  const timeline: TimelineRow[] = useMemo(() => {
    if (!filtered) return [];
    const rows: TimelineRow[] = [];
    const medName = (id: string): string => filtered.meds.find((m) => m.id === id)?.name ?? '（削除された薬）';

    if (layers.weekly) {
      for (const w of filtered.weekly) {
        rows.push({
          date: w.weekStart,
          kind: 'weekly',
          title: '週次チェック',
          detail: w.noChange
            ? '先週とほぼ変化なし'
            : WEEKLY_SCALES.filter((s) => w.scores[s.key] != null)
                .map((s) => `${s.label} ${w.scores[s.key]}`)
                .join('／') || '記録あり',
        });
      }
    }
    if (layers.symptom) {
      for (const s of filtered.symptoms) {
        rows.push({
          date: isoDateOfDateTime(s.onsetAt),
          kind: 'symptom',
          title: `症状：${symptomTitle(s)}`,
          detail: `${s.kind === 'new' ? '新しい症状' : '悪化'}／強さ ${s.severity}／${
            s.status === 'ongoing' ? '継続中' : '回復'
          }`,
          to: `/symptom/${s.id}`,
        });
      }
    }
    if (layers.dose) {
      for (const d of filtered.doses) {
        rows.push({
          date: d.scheduledDate,
          kind: 'dose',
          title: `投薬：${medName(d.medicationId)}`,
          detail: `${doseStatusLabel[d.status]}${d.actualDose ? `／${d.actualDose}${d.unit}` : ''}${
            d.site ? `／${d.site}` : ''
          }`,
          to: `/dose/${d.medicationId}/${d.scheduledDate}`,
        });
      }
    }
    if (layers.medical) {
      for (const m of filtered.medical) {
        rows.push({
          date: m.date,
          kind: 'medical',
          title: `${m.type}：${m.title || '記録'}`,
          detail: [m.facility, m.result].filter(Boolean).join('／'),
          to: `/medical/${m.id}`,
        });
      }
    }
    if (layers.measurement) {
      for (const m of filtered.ms) {
        rows.push({
          date: m.date,
          kind: 'measurement',
          title: `測定：${m.name}`,
          detail: `${m.value != null ? m.value : m.valueText}${m.unit ? ` ${m.unit}` : ''}`,
          to: `/measurements/${m.id}`,
        });
      }
    }
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [filtered, layers]);

  return (
    <AppShell title="経過">
      <div style={{ marginBottom: 12 }}>
        <Segmented label="期間の選択" value={range} onChange={setRange} options={RANGES} />
      </div>

      <div className="chips" style={{ marginBottom: 12 }}>
        {LAYERS.map((l) => (
          <button
            key={l.key}
            type="button"
            className="chip"
            aria-pressed={layers[l.key]}
            onClick={() => setLayers((p) => ({ ...p, [l.key]: !p[l.key] }))}
          >
            {l.label}
          </button>
        ))}
      </div>

      {!filtered ? (
        <p className="muted" role="status">
          読み込み中…
        </p>
      ) : (
        <>
          {layers.weekly ? (
            <Card title="週次チェックの推移（0＝良い状態、4＝つらい状態）">
              <LineChart
                series={weeklySeries}
                markers={markers}
                from={from}
                to={to}
                yMin={0}
                yMax={4}
                yLabel="0〜4"
                caption={`${formatDateJa(from)}から${formatDateJa(to)}までの週次チェックの推移。`}
              />
              {worsening.length > 0 ? (
                <p className="notice notice--attention" style={{ marginTop: 10 }}>
                  {TREND_NOTICE}
                  <br />
                  <span className="small">対象：{worsening.map((k) => scaleName(k)).join('、')}</span>
                </p>
              ) : null}
            </Card>
          ) : null}

          {layers.measurement ? (
            <Card title="測定結果の推移">
              {measurementNamesInRange.length === 0 ? (
                <EmptyState>この期間の測定結果はありません。</EmptyState>
              ) : (
                <>
                  <div className="chips" style={{ marginBottom: 10 }}>
                    {measurementNamesInRange.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="chip"
                        aria-pressed={n === activeMeasureName}
                        onClick={() => setMeasureName(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <LineChart
                    series={measurementSeries}
                    markers={markers}
                    from={from}
                    to={to}
                    caption={`${activeMeasureName}の推移。`}
                  />
                  <p className="field__hint mb0">
                    数値の意味づけや正常・異常の判定は行いません。記録した値をそのまま表示しています。
                  </p>
                </>
              )}
            </Card>
          ) : null}

          <Card title={`タイムライン（${timeline.length}件）`}>
            {timeline.length === 0 ? (
              <EmptyState>この期間の記録はありません。</EmptyState>
            ) : (
              <ul className="timeline">
                {timeline.slice(0, 200).map((r, i) => (
                  <li key={i} className="timeline__item">
                    <div className="timeline__date">{formatDateJa(r.date, { weekday: true })}</div>
                    <div className="list__item-title" style={{ fontSize: '0.9375rem' }}>
                      {r.to ? <Link to={r.to}>{r.title}</Link> : r.title}
                    </div>
                    {r.detail ? <div className="small muted">{r.detail}</div> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
