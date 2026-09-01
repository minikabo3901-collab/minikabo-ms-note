import { describe, expect, it } from 'vitest';
import { hasConsecutiveWorsening, worseningWeeklyKeys } from './trend';
import type { WeeklyCheck } from '@/db/types';

const emptyFlags = {
  newSymptom: false,
  worsenedSymptom: false,
  feverOrInfection: false,
  heat: false,
  sleepDeprivation: false,
  exertion: false,
  stress: false,
};

function check(weekStart: string, fatigue: number | null, walking: number | null = null): WeeklyCheck {
  return {
    id: weekStart,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    weekStart,
    recordedDate: weekStart,
    noChange: false,
    scores: { fatigue, cognition: null, walking, hands: null, sleep: null },
    flags: emptyFlags,
    notes: '',
  };
}

describe('低下傾向の判定（診断は行わない）', () => {
  it('3回連続で値が悪化していれば true', () => {
    expect(hasConsecutiveWorsening([0, 1, 2, 3])).toBe(true);
  });

  it('途中で改善していれば false', () => {
    expect(hasConsecutiveWorsening([0, 1, 2, 1, 2])).toBe(false);
  });

  it('同じ値が続く場合は悪化とみなさない', () => {
    expect(hasConsecutiveWorsening([2, 2, 2, 2])).toBe(false);
  });

  it('記録が足りない場合は false', () => {
    expect(hasConsecutiveWorsening([0, 1, 2])).toBe(false);
    expect(hasConsecutiveWorsening([])).toBe(false);
  });

  it('null は詰めて比較する', () => {
    expect(hasConsecutiveWorsening([0, null, 1, null, 2, 3])).toBe(true);
  });

  it('週次チェックから該当項目だけを返す', () => {
    const checks = [
      check('2025-01-06', 0, 2),
      check('2025-01-13', 1, 2),
      check('2025-01-20', 2, 1),
      check('2025-01-27', 3, 1),
    ];
    expect(worseningWeeklyKeys(checks)).toEqual(['fatigue']);
  });

  it('該当が無ければ空配列', () => {
    const checks = [check('2025-01-06', 2), check('2025-01-13', 2), check('2025-01-20', 1), check('2025-01-27', 1)];
    expect(worseningWeeklyKeys(checks)).toEqual([]);
  });
});
