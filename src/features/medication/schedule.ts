import type { DoseRecord, DoseStatus, Medication, ScheduleRule } from '@/db/types';
import { addDays, diffDays, formatDateJa, type ISODate, todayISO } from '@/lib/date';

/**
 * 投薬予定の生成ロジック（純粋関数）。
 *
 * 重要な設計方針:
 *  - 予定は「ルールから毎回計算する」だけで、DB には保存しない。
 *    そのため予定ルールを変更しても、既に保存済みの実施履歴（doseRecords）は一切変化しない。
 *  - 実施・延期・見送りは doseRecords にだけ保存され、ルール変更の影響を受けない。
 *  - このモジュールは薬の量や投与日を医学的に決定しない。ユーザーが登録した設定をそのまま展開する。
 */

export interface Occurrence {
  medicationId: string;
  ruleId: string;
  date: ISODate;
  time: string | null;
}

const MAX_OCCURRENCES_PER_RULE = 2000; // 暴走防止の安全上限

/** 1つのルールから [from, to] 範囲の予定日を生成する */
export function occurrencesForRule(rule: ScheduleRule, from: ISODate, to: ISODate): Occurrence[] {
  if (!rule.active) return [];
  if (to < from) return [];

  const out: Occurrence[] = [];
  const push = (date: ISODate): void => {
    out.push({ medicationId: rule.medicationId, ruleId: rule.id, date, time: rule.time ?? null });
  };

  if (rule.kind === 'dates') {
    // 個別指定の日付はそのまま使う（開始日・終了日でのフィルタはしない）
    const uniq = Array.from(new Set(rule.dates)).sort();
    for (const d of uniq) {
      if (d >= from && d <= to) push(d);
    }
    return out;
  }

  const step = rule.kind === 'everyNWeeks' ? rule.interval * 7 : rule.interval;
  if (!Number.isFinite(step) || step < 1) return [];

  const hardEnd = rule.endDate && rule.endDate < to ? rule.endDate : to;
  if (hardEnd < rule.startDate) return [];

  // from より前の分は等間隔でスキップして開始位置を求める
  const gap = diffDays(from, rule.startDate);
  const skip = gap > 0 ? Math.floor(gap / step) : 0;
  let cursor = addDays(rule.startDate, skip * step);

  let guard = 0;
  while (cursor <= hardEnd && guard < MAX_OCCURRENCES_PER_RULE) {
    if (cursor >= from) push(cursor);
    cursor = addDays(cursor, step);
    guard++;
  }
  return out;
}

/** 複数ルールから予定を生成し、日付順に並べる（同日同薬の重複は1件にまとめる） */
export function generateOccurrences(rules: ScheduleRule[], from: ISODate, to: ISODate): Occurrence[] {
  const all = rules.flatMap((r) => occurrencesForRule(r, from, to));
  const seen = new Map<string, Occurrence>();
  for (const o of all) {
    const key = `${o.medicationId}|${o.date}`;
    const prev = seen.get(key);
    // 同じ日に複数ルールが重なった場合は、時刻が指定されている方を優先
    if (!prev || (!prev.time && o.time)) seen.set(key, o);
  }
  return [...seen.values()].sort((a, b) =>
    a.date === b.date ? a.medicationId.localeCompare(b.medicationId) : a.date.localeCompare(b.date),
  );
}

export interface ScheduleItem {
  medicationId: string;
  date: ISODate;
  time: string | null;
  ruleId: string | null;
  status: DoseStatus;
  record: DoseRecord | null;
  /** 予定に無い日に手動で記録された場合 true */
  unscheduled: boolean;
}

function recordKey(medicationId: string, date: ISODate): string {
  return `${medicationId}|${date}`;
}

/**
 * 予定（計算値）と実施履歴（保存値）を突き合わせて一覧を作る。
 * 履歴は常にそのまま表示され、予定側の変更で書き換えられることはない。
 */
export function buildScheduleItems(
  rules: ScheduleRule[],
  records: DoseRecord[],
  from: ISODate,
  to: ISODate,
): ScheduleItem[] {
  const occ = generateOccurrences(rules, from, to);
  const byKey = new Map<string, DoseRecord>();
  for (const r of records) byKey.set(recordKey(r.medicationId, r.scheduledDate), r);

  const items: ScheduleItem[] = occ.map((o) => {
    const rec = byKey.get(recordKey(o.medicationId, o.date)) ?? null;
    return {
      medicationId: o.medicationId,
      date: o.date,
      time: rec?.scheduledTime ?? o.time,
      ruleId: o.ruleId,
      status: rec?.status ?? 'planned',
      record: rec,
      unscheduled: false,
    };
  });

  const covered = new Set(items.map((i) => recordKey(i.medicationId, i.date)));
  for (const r of records) {
    if (r.scheduledDate < from || r.scheduledDate > to) continue;
    const key = recordKey(r.medicationId, r.scheduledDate);
    if (covered.has(key)) continue;
    items.push({
      medicationId: r.medicationId,
      date: r.scheduledDate,
      time: r.scheduledTime,
      ruleId: r.ruleId,
      status: r.status,
      record: r,
      unscheduled: true,
    });
  }

  return items.sort((a, b) =>
    a.date === b.date ? a.medicationId.localeCompare(b.medicationId) : a.date.localeCompare(b.date),
  );
}

/** 予定が「まだ処理されていない」状態か（記録が無い or 予定のまま） */
export function isUnresolved(item: ScheduleItem): boolean {
  return item.status === 'planned';
}

export type NextDoseKind = 'none' | 'upcoming' | 'today' | 'overdue';

export interface NextDoseInfo {
  kind: NextDoseKind;
  /** upcoming のとき、今日から予定日までの日数 */
  daysUntil: number | null;
  /** overdue のとき、予定日から経過した日数 */
  daysOverdue: number | null;
  item: ScheduleItem | null;
  medication: Medication | null;
}

/**
 * 次の投薬状態を判定する。
 * 「投与してください」といった医療上の指示は行わず、状態の提示のみを行う。
 */
export function nextDoseInfo(
  medications: Medication[],
  rules: ScheduleRule[],
  records: DoseRecord[],
  today: ISODate = todayISO(),
  lookBackDays = 120,
  lookAheadDays = 400,
): NextDoseInfo {
  const activeMeds = medications.filter((m) => m.status === 'active');
  const activeIds = new Set(activeMeds.map((m) => m.id));
  const activeRules = rules.filter((r) => activeIds.has(r.medicationId));

  const from = addDays(today, -lookBackDays);
  const to = addDays(today, lookAheadDays);
  const items = buildScheduleItems(activeRules, records, from, to).filter(
    (i) => activeIds.has(i.medicationId) && !i.unscheduled,
  );

  const medOf = (id: string): Medication | null => activeMeds.find((m) => m.id === id) ?? null;

  // 1) 予定日を過ぎていて未処理のもの（最も古いもの）
  const overdue = items.filter((i) => i.date < today && isUnresolved(i));
  if (overdue.length > 0) {
    const item = overdue[0];
    return {
      kind: 'overdue',
      daysUntil: null,
      daysOverdue: diffDays(today, item.date),
      item,
      medication: medOf(item.medicationId),
    };
  }

  // 2) 本日が予定日
  const todayItems = items.filter((i) => i.date === today && isUnresolved(i));
  if (todayItems.length > 0) {
    const item = todayItems[0];
    return { kind: 'today', daysUntil: 0, daysOverdue: null, item, medication: medOf(item.medicationId) };
  }

  // 3) これからの予定
  const future = items.filter((i) => i.date > today && isUnresolved(i));
  if (future.length > 0) {
    const item = future[0];
    return {
      kind: 'upcoming',
      daysUntil: diffDays(item.date, today),
      daysOverdue: null,
      item,
      medication: medOf(item.medicationId),
    };
  }

  return { kind: 'none', daysUntil: null, daysOverdue: null, item: null, medication: null };
}

/** ホーム画面に出す中立的な文言（医療指示を含まない） */
export function nextDoseHeadline(info: NextDoseInfo): string {
  switch (info.kind) {
    case 'overdue':
      return '投薬予定日を過ぎています';
    case 'today':
      return '本日が投薬予定日です';
    case 'upcoming':
      return `次回まで${info.daysUntil}日`;
    default:
      return '投薬予定はありません';
  }
}

/** ルールの内容を日本語で要約する */
export function describeRule(rule: ScheduleRule): string {
  const time = rule.time ? ` ${rule.time}` : '';
  if (rule.kind === 'dates') {
    const n = new Set(rule.dates).size;
    return `個別の日付 ${n}件${time}`;
  }
  const unit = rule.kind === 'everyNWeeks' ? '週間' : '日';
  const end = rule.endDate ? `〜${formatDateJa(rule.endDate)}` : '（終了日なし）';
  return `${rule.interval}${unit}ごと ${formatDateJa(rule.startDate)}から${end}${time}`;
}
