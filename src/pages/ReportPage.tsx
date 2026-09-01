import { useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, Segmented } from '@/components/ui';
import { APP_NAME, DISCLAIMER_TEXT } from '@/config/appConfig';
import { buildReport, type ReportData } from '@/features/report/buildReport';
import { addMonths, formatDateJa, formatDateTimeJa, todayISO } from '@/lib/date';

type RangeKey = '1m' | '3m' | '6m' | '1y' | 'all';

const RANGES: { value: RangeKey; label: string }[] = [
  { value: '1m', label: '1か月' },
  { value: '3m', label: '3か月' },
  { value: '6m', label: '6か月' },
  { value: '1y', label: '1年' },
  { value: 'all', label: '全期間' },
];

/**
 * 診察用レポート。
 * 記録データから決定的なルールでまとめるだけで、AI による医学的要約は行わない。
 *
 * PDF 化は「印刷用レイアウト + ブラウザの PDF 保存」で行う。
 * この方式なら端末の日本語システムフォントがそのまま使われ、文字化けが起きず、
 * PDF 用の日本語フォントを同梱する必要もない（アプリ容量とライセンスの両面で有利）。
 */
export function ReportPage(): ReactNode {
  const today = todayISO();
  const [range, setRange] = useState<RangeKey>('3m');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const from =
    customFrom ||
    (range === 'all' ? '1900-01-01' : addMonths(today, range === '1m' ? -1 : range === '3m' ? -3 : range === '6m' ? -6 : -12));
  const to = customTo || today;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    buildReport(from, to)
      .then((r) => {
        if (alive) {
          setReport(r);
          setLoading(false);
        }
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from, to]);

  return (
    <AppShell title="診察用レポート" back>
      <div className="no-print">
        <Card title="対象期間">
          <Segmented
            label="期間の選択"
            value={range}
            onChange={(v) => {
              setRange(v);
              setCustomFrom('');
              setCustomTo('');
            }}
            options={RANGES}
          />
          <div className="row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
            <div className="grow field">
              <label className="field__label" htmlFor="rep-from">
                開始日（任意）
              </label>
              <input
                id="rep-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.currentTarget.value)}
              />
            </div>
            <div className="grow field">
              <label className="field__label" htmlFor="rep-to">
                終了日（任意）
              </label>
              <input id="rep-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.currentTarget.value)} />
            </div>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--big" onClick={() => window.print()}>
              印刷 / PDFとして保存
            </button>
          </div>
          <p className="field__hint mb0">
            iPhone では「印刷」を選び、プレビュー画面から共有ボタン →「ファイルに保存」で PDF として保存できます。
            端末の日本語フォントがそのまま使われるため、文字化けは起こりません。
            オフラインでも利用できます。
          </p>
        </Card>
      </div>

      {loading || !report ? (
        <p className="muted" role="status">
          レポートを作成しています…
        </p>
      ) : (
        <article className="report">
          <header>
            <h1 style={{ marginBottom: 4 }}>{APP_NAME} 診察用レポート</h1>
            <p className="small muted" style={{ marginBottom: 4 }}>
              対象期間：{report.from === '1900-01-01' ? '全期間' : formatDateJa(report.from)} 〜{' '}
              {formatDateJa(report.to)}
            </p>
            <p className="small muted">作成日時：{formatDateTimeJa(report.generatedAt)}</p>
            <p className="small" style={{ border: '1px solid currentColor', padding: '6px 8px' }}>
              {DISCLAIMER_TEXT}
            </p>
          </header>

          {report.sections.map((s) => (
            <section key={s.id} className="report-section">
              <h2>{s.heading}</h2>
              {s.bullets ? (
                s.bullets.length === 0 ? (
                  <p className="small muted">{s.emptyText}</p>
                ) : (
                  <ul>
                    {s.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )
              ) : (s.rows?.length ?? 0) === 0 ? (
                <p className="small muted">{s.emptyText}</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {s.columns?.map((c) => (
                          <th key={c} scope="col">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows?.map((r, i) => (
                        <tr key={i}>
                          {r.cells.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          <footer className="small muted" style={{ marginTop: 16 }}>
            このレポートは記録データをそのまままとめたものです。医学的な解釈・判定は行っていません。
          </footer>
        </article>
      )}
    </AppShell>
  );
}
