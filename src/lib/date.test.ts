import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  diffDays,
  durationDays,
  formatDateJa,
  monthGrid,
  toISODate,
  weekStartOf,
} from './date';
import { isOngoingOver24h } from '@/features/symptom/notices';
import type { SymptomEvent } from '@/db/types';

describe('日付ユーティリティ', () => {
  it('日数の加算で月をまたげる', () => {
    expect(addDays('2025-01-30', 3)).toBe('2025-02-02');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29'); // うるう年
  });

  it('月の加算で末日が丸められる', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2025-05-15', -3)).toBe('2025-02-15');
  });

  it('差分日数を計算できる', () => {
    expect(diffDays('2025-01-10', '2025-01-01')).toBe(9);
    expect(diffDays('2025-01-01', '2025-01-10')).toBe(-9);
  });

  it('週の開始は月曜日', () => {
    expect(weekStartOf('2025-06-18')).toBe('2025-06-16'); // 水曜 → 月曜
    expect(weekStartOf('2025-06-16')).toBe('2025-06-16'); // 月曜
    expect(weekStartOf('2025-06-22')).toBe('2025-06-16'); // 日曜
  });

  it('日本語の日付表記を作れる', () => {
    expect(formatDateJa('2025-06-18')).toBe('2025年6月18日');
    expect(formatDateJa('2025-06-18', { weekday: true })).toBe('2025年6月18日（水）');
    expect(formatDateJa('2025-06-18', { year: false })).toBe('6月18日');
  });

  it('月カレンダーは月曜始まりで 42 日分', () => {
    const grid = monthGrid(2025, 5); // 2025年6月
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2025-05-26'); // 6/1 は日曜なので、その週の月曜から
    expect(grid).toContain('2025-06-30');
  });

  it('継続日数は開始日を1日目として数える', () => {
    expect(durationDays('2025-06-01T00:00:00', null, '2025-06-01')).toBe(1);
    expect(durationDays('2025-06-01T00:00:00', null, '2025-06-05')).toBe(5);
  });

  it('タイムゾーンをまたいでも日付がずれない', () => {
    const d = new Date(2025, 0, 1, 0, 30);
    expect(toISODate(d)).toBe('2025-01-01');
  });
});

describe('24時間継続の判定（診断は行わない）', () => {
  const base: SymptomEvent = {
    id: 'e1',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    kind: 'new',
    categories: [],
    bodyParts: [],
    bodyPartsNote: '',
    onsetAt: '2025-01-01T00:00:00.000Z',
    onsetType: 'sudden',
    status: 'ongoing',
    recoveredAt: null,
    severity: 5,
    adlImpact: 'none',
    context: [],
    contextNote: '',
    notes: '',
  };

  it('24時間未満なら false', () => {
    expect(isOngoingOver24h(base, new Date('2025-01-01T23:59:00.000Z'))).toBe(false);
  });

  it('24時間以上なら true', () => {
    expect(isOngoingOver24h(base, new Date('2025-01-02T00:00:00.000Z'))).toBe(true);
  });

  it('回復済みなら常に false', () => {
    const recovered = { ...base, status: 'recovered' as const, recoveredAt: '2025-01-05T00:00:00.000Z' };
    expect(isOngoingOver24h(recovered, new Date('2025-01-10T00:00:00.000Z'))).toBe(false);
  });
});
