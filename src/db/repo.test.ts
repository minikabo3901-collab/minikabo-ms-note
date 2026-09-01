import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MsNoteDb } from './db';
import { closeDb, withFreshDb } from '@/test/dbHelper';
import {
  deleteAllData,
  doseRecords,
  getDataStats,
  measurements,
  medications,
  meta,
  observationEntries,
  observationPeriods,
  scheduleRules,
  symptomEvents,
  symptomLogs,
  weeklyChecks,
} from './repo';
import { weekStartOf } from '@/lib/date';
import { META_KEYS } from './types';

let db: MsNoteDb;

beforeEach(async () => {
  db = await withFreshDb();
});

afterEach(async () => {
  await closeDb(db);
});

describe('週次チェックの保存', () => {
  it('「変化なし」を保存できる', async () => {
    const weekStart = weekStartOf('2025-06-18');
    await weeklyChecks.saveForWeek(weekStart, {
      recordedDate: '2025-06-18',
      noChange: true,
      scores: { fatigue: null, cognition: null, walking: null, hands: null, sleep: null },
      flags: {
        newSymptom: false,
        worsenedSymptom: false,
        feverOrInfection: false,
        heat: false,
        sleepDeprivation: false,
        exertion: false,
        stress: false,
      },
      notes: '',
    });
    const saved = await weeklyChecks.forWeek(weekStart);
    expect(saved?.noChange).toBe(true);
    expect(saved?.weekStart).toBe('2025-06-16'); // 月曜始まり
  });

  it('同じ週に 2 回保存しても 1 件にまとまり、内容が更新される', async () => {
    const weekStart = weekStartOf('2025-06-18');
    const flags = {
      newSymptom: false,
      worsenedSymptom: false,
      feverOrInfection: false,
      heat: false,
      sleepDeprivation: false,
      exertion: false,
      stress: false,
    };
    await weeklyChecks.saveForWeek(weekStart, {
      recordedDate: '2025-06-18',
      noChange: true,
      scores: { fatigue: null, cognition: null, walking: null, hands: null, sleep: null },
      flags,
      notes: '',
    });
    await weeklyChecks.saveForWeek(weekStart, {
      recordedDate: '2025-06-19',
      noChange: false,
      scores: { fatigue: 3, cognition: 1, walking: 2, hands: 0, sleep: 4 },
      flags: { ...flags, heat: true },
      notes: '暑い日が続いた',
    });

    const all = await weeklyChecks.all();
    expect(all).toHaveLength(1);
    expect(all[0].noChange).toBe(false);
    expect(all[0].scores.fatigue).toBe(3);
    expect(all[0].flags.heat).toBe(true);
    expect(all[0].notes).toBe('暑い日が続いた');
  });

  it('範囲外のスコアは Zod で拒否される', async () => {
    await expect(
      weeklyChecks.saveForWeek('2025-06-16', {
        recordedDate: '2025-06-18',
        noChange: false,
        scores: { fatigue: 9, cognition: null, walking: null, hands: null, sleep: null },
        flags: {
          newSymptom: false,
          worsenedSymptom: false,
          feverOrInfection: false,
          heat: false,
          sleepDeprivation: false,
          exertion: false,
          stress: false,
        },
        notes: '',
      }),
    ).rejects.toThrow();
  });
});

describe('症状イベントと経過記録', () => {
  const draft = {
    kind: 'new' as const,
    categories: ['しびれ・感覚'],
    bodyParts: ['右手・右腕'],
    bodyPartsNote: '',
    onsetAt: '2025-07-01T08:00:00.000Z',
    onsetType: 'gradual' as const,
    status: 'ongoing' as const,
    recoveredAt: null,
    severity: 4,
    adlImpact: 'slight' as const,
    context: ['暑さ'],
    contextNote: '',
    notes: '',
  };

  it('症状イベントを作成し、継続中として取得できる', async () => {
    const ev = await symptomEvents.create(draft);
    const ongoing = await symptomEvents.ongoing();
    expect(ongoing.map((e) => e.id)).toEqual([ev.id]);
  });

  it('同じ日の経過記録は上書きされ、日ごとに 1 件になる', async () => {
    const ev = await symptomEvents.create(draft);
    await symptomLogs.saveForDay(ev.id, '2025-07-02', { trend: 'same', severity: 4, notes: '' });
    await symptomLogs.saveForDay(ev.id, '2025-07-02', { trend: 'worse', severity: 6, notes: '夕方から強い' });
    await symptomLogs.saveForDay(ev.id, '2025-07-03', { trend: 'better', severity: 3, notes: '' });

    const logs = await symptomLogs.forEvent(ev.id);
    expect(logs).toHaveLength(2);
    expect(logs[0].date).toBe('2025-07-02');
    expect(logs[0].trend).toBe('worse');
    expect(logs[0].severity).toBe(6);
    expect(logs[1].trend).toBe('better');
  });

  it('回復として終了すると継続中から外れる', async () => {
    const ev = await symptomEvents.create(draft);
    await symptomEvents.update(ev.id, { status: 'recovered', recoveredAt: '2025-07-10T00:00:00.000Z' });
    expect(await symptomEvents.ongoing()).toHaveLength(0);
  });

  it('回復日時なしで回復にすることはできない', async () => {
    const ev = await symptomEvents.create(draft);
    await expect(symptomEvents.update(ev.id, { status: 'recovered' })).rejects.toThrow();
  });

  it('症状イベントを削除すると経過記録も消える', async () => {
    const ev = await symptomEvents.create(draft);
    await symptomLogs.saveForDay(ev.id, '2025-07-02', { trend: 'same', severity: null, notes: '' });
    await symptomEvents.remove(ev.id);
    expect(await symptomLogs.all()).toHaveLength(0);
  });
});

describe('薬と投薬記録', () => {
  it('薬を削除すると予定ルールと投薬記録も消える', async () => {
    const m = await medications.create({
      name: 'テスト薬',
      dose: '1',
      unit: 'mL',
      route: '皮下注射',
      startDate: '2025-01-01',
      endDate: null,
      status: 'active',
      notes: '',
    });
    await scheduleRules.create({
      medicationId: m.id,
      label: '',
      kind: 'everyNWeeks',
      dates: [],
      interval: 4,
      startDate: '2025-01-01',
      endDate: null,
      time: null,
      active: true,
    });
    await doseRecords.upsertForDate(m.id, '2025-01-01', { status: 'done' });

    await medications.remove(m.id);
    expect(await scheduleRules.all()).toHaveLength(0);
    expect(await doseRecords.all()).toHaveLength(0);
  });

  it('同じ予定日への保存は 1 件にまとまる', async () => {
    await doseRecords.upsertForDate('med-x', '2025-02-01', { status: 'planned' });
    await doseRecords.upsertForDate('med-x', '2025-02-01', { status: 'done', actualDose: '2' });
    const all = await doseRecords.all();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('done');
    expect(all[0].actualDose).toBe('2');
  });
});

describe('集計と全削除', () => {
  it('件数を集計し、全削除で 0 件になる', async () => {
    await medications.create({
      name: 'A',
      dose: '',
      unit: '',
      route: '',
      startDate: '2025-01-01',
      endDate: null,
      status: 'active',
      notes: '',
    });
    await measurements.create({
      date: '2025-01-05',
      name: 'EDSS',
      value: 2,
      valueText: '',
      unit: '',
      facility: '',
      examiner: '',
      notes: '',
    });
    const p = await observationPeriods.create({
      title: '',
      startDate: '2025-01-01',
      endDate: '2025-01-14',
      symptomEventId: null,
      notes: '',
      status: 'active',
    });
    await observationEntries.saveForDay(p.id, '2025-01-02', { trend: 'same', severity: null, notes: '' });

    const stats = await getDataStats();
    expect(stats.counts.medications).toBe(1);
    expect(stats.counts.measurements).toBe(1);
    expect(stats.counts.observationEntries).toBe(1);
    expect(stats.totalRecords).toBe(4);

    await deleteAllData();
    const after = await getDataStats();
    expect(after.totalRecords).toBe(0);
  });

  it('全データ削除後も、医療上の免責への同意記録だけは残る', async () => {
    await meta.acceptDisclaimer();
    await medications.create({
      name: 'A',
      dose: '',
      unit: '',
      route: '',
      startDate: '2025-01-01',
      endDate: null,
      status: 'active',
      notes: '',
    });
    await meta.markBackup();

    await deleteAllData();

    expect(await medications.all()).toHaveLength(0);
    expect(await meta.get(META_KEYS.disclaimerAcceptedAt)).toBeTruthy();
    // バックアップ日時などその他の状態は消える
    expect(await meta.get(META_KEYS.lastBackupAt)).toBeUndefined();
  });
});
