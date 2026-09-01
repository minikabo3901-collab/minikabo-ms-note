import type { WeeklyScoreKey } from '@/db/types';

/**
 * 週次チェックの 0〜4 段階には、必ず意味の分かる日本語ラベルを付ける。
 * 数値が大きいほど「つらい / やりにくい」方向で統一する。
 */
export interface ScaleDef {
  key: WeeklyScoreKey;
  label: string;
  levels: readonly string[];
}

export const WEEKLY_SCALES: readonly ScaleDef[] = [
  {
    key: 'fatigue',
    label: '疲労',
    levels: ['ほとんどない', '少しある', '中くらい', '強い', 'とても強い'],
  },
  {
    key: 'cognition',
    label: '集中・考えやすさ',
    levels: ['いつも通り', '少しやりにくい', '中くらい', 'かなりやりにくい', 'とてもやりにくい'],
  },
  {
    key: 'walking',
    label: '歩行・バランス',
    levels: ['いつも通り', '少し不安定', '中くらい', 'かなり不安定', 'とても不安定'],
  },
  {
    key: 'hands',
    label: '手の使いやすさ',
    levels: ['いつも通り', '少しやりにくい', '中くらい', 'かなりやりにくい', 'とてもやりにくい'],
  },
  {
    key: 'sleep',
    label: '睡眠',
    levels: ['よく眠れた', '少し眠りにくい', '中くらい', 'かなり眠りにくい', 'ほとんど眠れない'],
  },
] as const;

export const WEEKLY_FLAGS = [
  { key: 'newSymptom', label: '新しい症状がある' },
  { key: 'worsenedSymptom', label: '以前の症状が悪化した' },
  { key: 'feverOrInfection', label: '発熱または感染症らしい症状' },
  { key: 'heat', label: '暑さの影響' },
  { key: 'sleepDeprivation', label: '睡眠不足' },
  { key: 'exertion', label: '強い運動や疲労' },
  { key: 'stress', label: '強いストレス' },
] as const;

export type WeeklyFlagKey = (typeof WEEKLY_FLAGS)[number]['key'];

export function scaleLabelFor(key: WeeklyScoreKey, value: number | null): string {
  const def = WEEKLY_SCALES.find((s) => s.key === key);
  if (!def || value == null) return '未入力';
  return `${value}（${def.levels[value] ?? ''}）`;
}

export function scaleName(key: WeeklyScoreKey): string {
  return WEEKLY_SCALES.find((s) => s.key === key)?.label ?? key;
}
