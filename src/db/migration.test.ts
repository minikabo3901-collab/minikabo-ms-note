import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { MsNoteDb, __setDbForTests } from './db';

/**
 * データベースのマイグレーション検証。
 * v1 のスキーマで作られた既存データが、v2 を開いたときに壊れず、
 * 新テーブルが追加され、欠けているフィールドが補完されることを確認する。
 */

let opened: Dexie[] = [];

afterEach(() => {
  for (const d of opened) d.close();
  opened = [];
  __setDbForTests(null);
});

function openV1(name: string): Dexie {
  const db = new Dexie(name);
  db.version(1).stores({
    medications: 'id, name, status, startDate',
    scheduleRules: 'id, medicationId, kind, startDate, active',
    doseRecords: 'id, medicationId, scheduledDate, status, [medicationId+scheduledDate]',
    weeklyChecks: 'id, weekStart, recordedDate',
    symptomEvents: 'id, status, onsetAt, kind',
    symptomLogs: 'id, eventId, date, [eventId+date]',
    medicalEvents: 'id, date, type',
    attachments: 'id, createdAt',
    measurements: 'id, date, name',
    questions: 'id, asked, createdAt',
    meta: 'key',
  });
  opened.push(db);
  return db;
}

describe('IndexedDB のマイグレーション', () => {
  it('v1 のデータを保ったまま v2 へ移行できる', async () => {
    const name = `ms-note-migration-${Math.floor(Math.random() * 1e9)}`;

    // --- v1 相当のデータベースを作ってデータを入れる ---
    const v1 = openV1(name);
    await v1.open();
    expect(v1.verno).toBe(1);
    await v1.table('medications').put({
      id: 'm1',
      name: '旧データの薬',
      dose: '1',
      unit: 'mL',
      route: '',
      startDate: '2024-05-01',
      // status と endDate は v1 時代には存在しなかったものとする
      notes: '',
      createdAt: '2024-05-01T00:00:00.000Z',
      updatedAt: '2024-05-01T00:00:00.000Z',
    });
    await v1.table('weeklyChecks').put({
      id: 'w1',
      weekStart: '2024-05-06',
      recordedDate: '2024-05-06',
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
      createdAt: '2024-05-06T00:00:00.000Z',
      updatedAt: '2024-05-06T00:00:00.000Z',
    });
    v1.close();

    // --- 現行スキーマ（v2）で開き直す ---
    const v2 = new MsNoteDb(name);
    opened.push(v2);
    await v2.open();
    expect(v2.verno).toBe(2);

    // 既存データが残っている
    const weekly = await v2.weeklyChecks.toArray();
    expect(weekly).toHaveLength(1);
    expect(weekly[0].id).toBe('w1');

    // upgrade で status が補完されている
    const med = await v2.medications.get('m1');
    expect(med?.name).toBe('旧データの薬');
    expect(med?.status).toBe('active');
    expect(med?.endDate).toBeNull();

    // v2 で追加されたテーブルが使える
    await v2.observationPeriods.put({
      id: 'p1',
      title: '',
      startDate: '2025-01-01',
      endDate: '2025-01-10',
      symptomEventId: null,
      notes: '',
      status: 'active',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(await v2.observationPeriods.count()).toBe(1);
    expect(await v2.appointments.count()).toBe(0);
    expect(await v2.observationEntries.count()).toBe(0);
  });

  it('新規作成時は最初から v2 のテーブルがそろっている', async () => {
    const db = new MsNoteDb(`ms-note-fresh-${Math.floor(Math.random() * 1e9)}`);
    opened.push(db);
    await db.open();
    expect(db.verno).toBe(2);
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toContain('observationPeriods');
    expect(names).toContain('observationEntries');
    expect(names).toContain('appointments');
    expect(names).toContain('attachments');
  });
});
