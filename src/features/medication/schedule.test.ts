import { describe, expect, it } from 'vitest';
import {
  buildScheduleItems,
  generateOccurrences,
  nextDoseHeadline,
  nextDoseInfo,
  occurrencesForRule,
} from './schedule';
import type { DoseRecord, Medication, ScheduleRule } from '@/db/types';

const baseStamps = { createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' };

function rule(over: Partial<ScheduleRule> & Pick<ScheduleRule, 'id' | 'kind' | 'startDate'>): ScheduleRule {
  return {
    ...baseStamps,
    medicationId: 'med-1',
    label: '',
    dates: [],
    interval: 1,
    endDate: null,
    time: null,
    active: true,
    ...over,
  } as ScheduleRule;
}

function med(over: Partial<Medication> = {}): Medication {
  return {
    ...baseStamps,
    id: 'med-1',
    name: 'テスト薬',
    dose: '',
    unit: '',
    route: '',
    startDate: '2025-01-01',
    endDate: null,
    status: 'active',
    notes: '',
    ...over,
  };
}

function record(over: Partial<DoseRecord> & Pick<DoseRecord, 'id' | 'scheduledDate'>): DoseRecord {
  return {
    ...baseStamps,
    medicationId: 'med-1',
    ruleId: null,
    scheduledTime: null,
    status: 'done',
    takenAt: null,
    actualDose: '',
    unit: '',
    site: '',
    siteReactions: [],
    siteReactionNote: '',
    systemicReactions: [],
    systemicReactionNote: '',
    notes: '',
    ...over,
  } as DoseRecord;
}

describe('投薬予定の生成', () => {
  it('N日ごとのルールから等間隔の予定日を生成する', () => {
    const r = rule({ id: 'r1', kind: 'everyNDays', interval: 14, startDate: '2025-03-01' });
    const occ = occurrencesForRule(r, '2025-03-01', '2025-04-15');
    expect(occ.map((o) => o.date)).toEqual(['2025-03-01', '2025-03-15', '2025-03-29', '2025-04-12']);
  });

  it('N週間ごとのルールを 7 日単位で展開する', () => {
    const r = rule({ id: 'r1', kind: 'everyNWeeks', interval: 4, startDate: '2025-01-06' });
    const occ = occurrencesForRule(r, '2025-01-01', '2025-04-01');
    expect(occ.map((o) => o.date)).toEqual(['2025-01-06', '2025-02-03', '2025-03-03', '2025-03-31']);
  });

  it('範囲の途中から取得しても等間隔の位置がずれない', () => {
    const r = rule({ id: 'r1', kind: 'everyNDays', interval: 10, startDate: '2025-01-01' });
    const occ = occurrencesForRule(r, '2025-02-05', '2025-03-01');
    expect(occ.map((o) => o.date)).toEqual(['2025-02-10', '2025-02-20']);
  });

  it('終了日を過ぎた予定は生成しない', () => {
    const r = rule({ id: 'r1', kind: 'everyNDays', interval: 7, startDate: '2025-01-01', endDate: '2025-01-20' });
    const occ = occurrencesForRule(r, '2025-01-01', '2025-03-01');
    expect(occ.map((o) => o.date)).toEqual(['2025-01-01', '2025-01-08', '2025-01-15']);
  });

  it('無効化されたルールからは予定を生成しない', () => {
    const r = rule({ id: 'r1', kind: 'everyNDays', interval: 7, startDate: '2025-01-01', active: false });
    expect(occurrencesForRule(r, '2025-01-01', '2025-03-01')).toEqual([]);
  });

  it('個別の日付と繰り返し予定を併用できる（導入期＋維持期）', () => {
    // 導入期：不規則な個別日付
    const induction = rule({
      id: 'r-induction',
      kind: 'dates',
      startDate: '2025-01-06',
      dates: ['2025-01-06', '2025-01-08', '2025-01-13', '2025-01-20'],
    });
    // 維持期：4週間ごと
    const maintenance = rule({
      id: 'r-maintenance',
      kind: 'everyNWeeks',
      interval: 4,
      startDate: '2025-02-17',
    });

    const occ = generateOccurrences([induction, maintenance], '2025-01-01', '2025-04-30');
    expect(occ.map((o) => o.date)).toEqual([
      '2025-01-06',
      '2025-01-08',
      '2025-01-13',
      '2025-01-20',
      '2025-02-17',
      '2025-03-17',
      '2025-04-14',
    ]);
  });

  it('同じ日に複数ルールが重なっても 1 件にまとめる', () => {
    const a = rule({ id: 'a', kind: 'dates', startDate: '2025-05-01', dates: ['2025-05-01'] });
    const b = rule({ id: 'b', kind: 'dates', startDate: '2025-05-01', dates: ['2025-05-01'], time: '09:00' });
    const occ = generateOccurrences([a, b], '2025-05-01', '2025-05-01');
    expect(occ).toHaveLength(1);
    expect(occ[0].time).toBe('09:00');
  });
});

describe('予定ルールの変更と過去の履歴', () => {
  it('未来の予定ルールを変更しても、過去の実施履歴は変わらない', () => {
    const oldRule = rule({ id: 'r1', kind: 'everyNDays', interval: 14, startDate: '2025-01-01' });
    const past = [
      record({ id: 'd1', scheduledDate: '2025-01-01', status: 'done', actualDose: '1' }),
      record({ id: 'd2', scheduledDate: '2025-01-15', status: 'skipped' }),
    ];

    const before = buildScheduleItems([oldRule], past, '2025-01-01', '2025-03-01');
    const beforeDone = before.filter((i) => i.record).map((i) => [i.date, i.status]);

    // 間隔を 14 日 → 28 日に変更（ルールを差し替えるだけで、履歴には触れない）
    const newRule = { ...oldRule, interval: 28, updatedAt: '2025-02-01T00:00:00.000Z' };
    const after = buildScheduleItems([newRule], past, '2025-01-01', '2025-03-01');
    const afterDone = after.filter((i) => i.record).map((i) => [i.date, i.status]);

    expect(afterDone).toEqual(beforeDone);
    expect(afterDone).toEqual([
      ['2025-01-01', 'done'],
      ['2025-01-15', 'skipped'],
    ]);

    // 予定側（記録の無い日）は新しい間隔で計算される
    expect(after.filter((i) => !i.record).map((i) => i.date)).toEqual(['2025-01-29', '2025-02-26']);
  });

  it('ルールから外れた日の記録も履歴として残り続ける', () => {
    const r = rule({ id: 'r1', kind: 'dates', startDate: '2025-06-10', dates: ['2025-06-10'] });
    const rec = [record({ id: 'd1', scheduledDate: '2025-06-03', status: 'done' })];
    const items = buildScheduleItems([r], rec, '2025-06-01', '2025-06-30');
    const orphan = items.find((i) => i.date === '2025-06-03');
    expect(orphan).toBeDefined();
    expect(orphan?.unscheduled).toBe(true);
    expect(orphan?.status).toBe('done');
  });
});

describe('投薬予定日の超過判定', () => {
  const r = rule({ id: 'r1', kind: 'everyNDays', interval: 14, startDate: '2025-04-01' });

  it('予定日を過ぎて未処理なら overdue になる', () => {
    const info = nextDoseInfo([med()], [r], [], '2025-04-05');
    expect(info.kind).toBe('overdue');
    expect(info.daysOverdue).toBe(4);
    expect(nextDoseHeadline(info)).toBe('投薬予定日を過ぎています');
  });

  it('実施済みなら overdue にならない', () => {
    const rec = [record({ id: 'd1', scheduledDate: '2025-04-01', status: 'done' })];
    const info = nextDoseInfo([med()], [r], rec, '2025-04-05');
    expect(info.kind).toBe('upcoming');
    expect(info.daysUntil).toBe(10);
    expect(nextDoseHeadline(info)).toBe('次回まで10日');
  });

  it('見送り・延期として記録済みでも overdue にはしない', () => {
    for (const status of ['skipped', 'postponed'] as const) {
      const rec = [record({ id: 'd1', scheduledDate: '2025-04-01', status })];
      expect(nextDoseInfo([med()], [r], rec, '2025-04-05').kind).toBe('upcoming');
    }
  });

  it('本日が予定日なら today になる', () => {
    const info = nextDoseInfo([med()], [r], [], '2025-04-01');
    expect(info.kind).toBe('today');
    expect(nextDoseHeadline(info)).toBe('本日が投薬予定日です');
  });

  it('予定が無ければ none になる', () => {
    const info = nextDoseInfo([med()], [], [], '2025-04-01');
    expect(info.kind).toBe('none');
    expect(nextDoseHeadline(info)).toBe('投薬予定はありません');
  });

  it('使用中でない薬の予定は対象にしない', () => {
    const info = nextDoseInfo([med({ status: 'paused' })], [r], [], '2025-04-05');
    expect(info.kind).toBe('none');
  });

  it('最も古い未処理の予定を overdue として返す', () => {
    const info = nextDoseInfo([med()], [r], [], '2025-05-10');
    expect(info.kind).toBe('overdue');
    expect(info.item?.date).toBe('2025-04-01');
  });
});
