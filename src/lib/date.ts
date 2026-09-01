/**
 * 日付ユーティリティ。
 * すべてローカルタイムで扱い、日付は 'YYYY-MM-DD' 文字列で保持する
 * （タイムゾーンによる日付ずれを避けるため Date の UTC 変換は使わない）。
 */

export type ISODate = string; // YYYY-MM-DD

const pad = (n: number): string => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function nowISO(now: Date = new Date()): string {
  return now.toISOString();
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(s: ISODate, months: number): ISODate {
  const d = parseISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** a - b を日数で返す（a が未来なら正） */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseISODate(a).getTime() - parseISODate(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** 月曜始まりの週の開始日 */
export function weekStartOf(s: ISODate): ISODate {
  const d = parseISODate(s);
  const dow = (d.getDay() + 6) % 7; // 月=0 ... 日=6
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function isoDateOfDateTime(iso: string): ISODate {
  const d = new Date(iso);
  return toISODate(d);
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateJa(s: ISODate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = parseISODate(s);
  const { weekday = false, year = true } = opts;
  const base = year
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getMonth() + 1}月${d.getDate()}日`;
  return weekday ? `${base}（${WEEKDAYS_JA[d.getDay()]}）` : base;
}

export function formatDateTimeJa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDateJa(toISODate(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTimeJa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> 用の値 */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocalValue(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** 継続日数（開始日を1日目として数える） */
export function durationDays(startISO: string, endISO?: string | null, today: ISODate = todayISO()): number {
  const start = isoDateOfDateTime(startISO);
  const end = endISO ? isoDateOfDateTime(endISO) : today;
  return diffDays(end, start) + 1;
}

/** 月カレンダー用: 指定月を含む「月曜始まり」6週間分の日付配列 */
export function monthGrid(year: number, month0: number): ISODate[] {
  const first = new Date(year, month0, 1);
  const start = parseISODate(weekStartOf(toISODate(first)));
  const out: ISODate[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(toISODate(d));
  }
  return out;
}

export function monthLabel(year: number, month0: number): string {
  return `${year}年${month0 + 1}月`;
}

export const WEEKDAY_HEADERS_MON = ['月', '火', '水', '木', '金', '土', '日'];
