import type { WeeklyCheck, WeeklyScoreKey } from '@/db/types';
import { WEEKLY_SCALES } from '@/features/weekly/labels';

/**
 * 「低下傾向」の有無を判定する事実ベースの補助。
 *
 * ここでは医学的な診断（再発・PIRA など）は一切行わない。
 * 「同じ項目が3回連続で前回より悪い値になったか」という数値上の事実だけを見て、
 * 中立的な案内文を出すかどうかを決める。
 */

export const TREND_NOTICE = '複数回の記録で低下傾向があります。診察時に確認してください。';

/** 3回連続で前回より悪化（値が増加）しているか。判定には4点以上の記録が必要。 */
export function hasConsecutiveWorsening(values: (number | null)[], times = 3): boolean {
  const seq = values.filter((v): v is number => v != null);
  if (seq.length < times + 1) return false;
  let run = 0;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i] > seq[i - 1] ? run + 1 : 0;
    if (run >= times) return true;
  }
  return false;
}

/** 週次チェックのうち、低下傾向が見られる項目名を返す */
export function worseningWeeklyKeys(checks: WeeklyCheck[], times = 3): WeeklyScoreKey[] {
  const ordered = [...checks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const out: WeeklyScoreKey[] = [];
  for (const scale of WEEKLY_SCALES) {
    const values = ordered.map((c) => (c.noChange ? null : c.scores[scale.key]));
    if (hasConsecutiveWorsening(values, times)) out.push(scale.key);
  }
  return out;
}
