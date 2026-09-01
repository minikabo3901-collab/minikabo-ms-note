import { useId, type ReactNode } from 'react';
import { diffDays, formatDateJa, type ISODate } from '@/lib/date';

/**
 * 依存ライブラリを使わない、シンプルな折れ線グラフ（SVG）。
 * 色だけに頼らないよう、系列ごとに線種と点の形も変える。
 */

export interface Series {
  name: string;
  /** 値は日付順である必要はない（内部でソートする） */
  points: { date: ISODate; value: number }[];
}

export interface Marker {
  date: ISODate;
  /** 1文字程度の記号（凡例で意味を説明する） */
  symbol: string;
  label: string;
}

const DASHES = ['', '5 3', '2 3', '8 3 2 3', '1 3'];
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross'] as const;

const W = 340;
const H = 190;
const PAD = { top: 12, right: 10, bottom: 30, left: 30 };

function shapePath(shape: (typeof SHAPES)[number], x: number, y: number, r: number): string {
  switch (shape) {
    case 'square':
      return `M${x - r} ${y - r}h${r * 2}v${r * 2}h${-r * 2}Z`;
    case 'triangle':
      return `M${x} ${y - r}L${x + r} ${y + r}L${x - r} ${y + r}Z`;
    case 'diamond':
      return `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;
    case 'cross':
      return `M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`;
    default:
      return `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
  }
}

export function LineChart({
  series,
  markers = [],
  from,
  to,
  yMin,
  yMax,
  yLabel,
  caption,
}: {
  series: Series[];
  markers?: Marker[];
  from: ISODate;
  to: ISODate;
  yMin?: number;
  yMax?: number;
  yLabel?: string;
  caption: string;
}): ReactNode {
  const titleId = useId();
  const span = Math.max(1, diffDays(to, from));

  const all = series.flatMap((s) => s.points.map((p) => p.value));
  const lo = yMin ?? (all.length ? Math.min(...all) : 0);
  const hi = yMax ?? (all.length ? Math.max(...all) : 1);
  const range = hi - lo || 1;

  const x = (d: ISODate): number => PAD.left + (diffDays(d, from) / span) * (W - PAD.left - PAD.right);
  const y = (v: number): number => H - PAD.bottom - ((v - lo) / range) * (H - PAD.top - PAD.bottom);

  const ticks = 4;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => lo + (range * i) / ticks);

  const hasData = series.some((s) => s.points.length > 0);

  return (
    <figure style={{ margin: 0 }}>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{caption}</title>

        {/* 目盛り */}
        {gridY.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text x={PAD.left - 4} y={y(v) + 3} fontSize={8} textAnchor="end" fill="var(--axis)">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* 軸 */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke="var(--axis)"
          strokeWidth={1}
        />
        <text x={PAD.left} y={H - PAD.bottom + 14} fontSize={8} fill="var(--axis)">
          {formatDateJa(from, { year: false })}
        </text>
        <text x={W - PAD.right} y={H - PAD.bottom + 14} fontSize={8} textAnchor="end" fill="var(--axis)">
          {formatDateJa(to, { year: false })}
        </text>
        {yLabel ? (
          <text x={2} y={10} fontSize={8} fill="var(--axis)">
            {yLabel}
          </text>
        ) : null}

        {/* マーカー（投薬日・症状・治療日など） */}
        {markers.map((m, i) => (
          <g key={`${m.date}-${i}`}>
            <line
              x1={x(m.date)}
              x2={x(m.date)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--axis)"
              strokeWidth={0.8}
              strokeDasharray="2 3"
              opacity={0.7}
            />
            <text x={x(m.date)} y={H - PAD.bottom + 22} fontSize={8} textAnchor="middle" fill="var(--axis)">
              {m.symbol}
            </text>
          </g>
        ))}

        {/* 系列 */}
        {series.map((s, si) => {
          const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
          if (pts.length === 0) return null;
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date)} ${y(p.value)}`).join(' ');
          const color = `var(--s${(si % 5) + 1})`;
          const shape = SHAPES[si % SHAPES.length];
          return (
            <g key={s.name}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray={DASHES[si % DASHES.length]}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {pts.map((p, i) => (
                <path
                  key={i}
                  d={shapePath(shape, x(p.date), y(p.value), 2.6)}
                  fill={shape === 'cross' ? 'none' : color}
                  stroke={color}
                  strokeWidth={shape === 'cross' ? 1.6 : 0}
                />
              ))}
            </g>
          );
        })}

        {!hasData ? (
          <text x={W / 2} y={H / 2} fontSize={11} textAnchor="middle" fill="var(--axis)">
            この期間の記録はありません
          </text>
        ) : null}
      </svg>

      <figcaption className="chart-legend" style={{ marginTop: 6 }}>
        {series.map((s, si) => (
          <span className="chart-legend__item" key={s.name}>
            <span
              className="chart-legend__swatch"
              style={{ background: `var(--s${(si % 5) + 1})` }}
              aria-hidden="true"
            />
            {s.name}
          </span>
        ))}
        {markers.length > 0
          ? Array.from(new Map(markers.map((m) => [m.symbol, m.label])).entries()).map(([sym, label]) => (
              <span className="chart-legend__item" key={sym}>
                <span aria-hidden="true">{sym}</span>
                {label}
              </span>
            ))
          : null}
      </figcaption>
    </figure>
  );
}
