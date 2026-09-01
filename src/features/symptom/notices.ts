import type { SymptomEvent } from '@/db/types';

/**
 * 症状に関する中立的な表示ルール。
 * ここでは診断（再発 / PIRA など）を一切行わない。
 * 「24時間以上続いているかどうか」という事実だけを判定し、固定文言を返す。
 */

export const ONGOING_24H_MESSAGE =
  '症状の変化が24時間以上続いています。必要に応じて担当医療機関への相談を検討してください。';

export const URGENT_MESSAGE =
  '急激な症状や強い症状があるときは、アプリの記録や表示を待たずに担当医療機関へ相談してください。';

/** 継続中かつ発症から24時間以上経過しているか */
export function isOngoingOver24h(event: SymptomEvent, now: Date = new Date()): boolean {
  if (event.status !== 'ongoing') return false;
  const onset = Date.parse(event.onsetAt);
  if (Number.isNaN(onset)) return false;
  return now.getTime() - onset >= 24 * 60 * 60 * 1000;
}

/** 症状イベントの見出し（分類が未選択でも読める形にする） */
export function symptomTitle(event: SymptomEvent): string {
  if (event.categories.length > 0) return event.categories.join('・');
  return event.kind === 'new' ? '新しい症状' : '既存症状の悪化';
}
