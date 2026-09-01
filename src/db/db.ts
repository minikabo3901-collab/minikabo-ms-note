import Dexie, { type Table } from 'dexie';
import { APP_ID } from '@/config/appConfig';
import type {
  Appointment,
  Attachment,
  DoseRecord,
  Medication,
  Measurement,
  MedicalEvent,
  MetaEntry,
  ObservationEntry,
  ObservationPeriod,
  Question,
  ScheduleRule,
  SymptomEvent,
  SymptomLog,
  WeeklyCheck,
} from './types';

/**
 * IndexedDB（Dexie）定義。
 *
 * スキーマ変更手順（README にも記載）:
 *  1. 既存の `this.version(n)` ブロックは絶対に書き換えない
 *  2. 新しく `this.version(n + 1).stores({...}).upgrade(async (tx) => {...})` を追加する
 *  3. 追加した version で必要なら既存レコードを補完（backfill）する
 *  4. src/db/db.migration.test.ts にマイグレーションのテストを追加する
 *
 * 健康データはすべてこの IndexedDB にのみ保存し、サーバーへは送信しない。
 */
export class MsNoteDb extends Dexie {
  medications!: Table<Medication, string>;
  scheduleRules!: Table<ScheduleRule, string>;
  doseRecords!: Table<DoseRecord, string>;
  weeklyChecks!: Table<WeeklyCheck, string>;
  symptomEvents!: Table<SymptomEvent, string>;
  symptomLogs!: Table<SymptomLog, string>;
  medicalEvents!: Table<MedicalEvent, string>;
  attachments!: Table<Attachment, string>;
  measurements!: Table<Measurement, string>;
  questions!: Table<Question, string>;
  meta!: Table<MetaEntry, string>;
  observationPeriods!: Table<ObservationPeriod, string>;
  observationEntries!: Table<ObservationEntry, string>;
  appointments!: Table<Appointment, string>;

  constructor(name: string = APP_ID) {
    super(name);

    // ---- v1: 初期スキーマ（変更禁止） ----
    this.version(1).stores({
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

    // ---- v2: 観察モードと次回予定を追加。medications.status を補完 ----
    this.version(2)
      .stores({
        observationPeriods: 'id, status, startDate, endDate, symptomEventId',
        observationEntries: 'id, periodId, date, [periodId+date]',
        appointments: 'id, date, done',
      })
      .upgrade(async (tx) => {
        // v1 時代に status を持たないレコードがあれば「使用中」として扱う
        await tx
          .table('medications')
          .toCollection()
          .modify((m: Partial<Medication>) => {
            if (!m.status) m.status = 'active';
            if (m.endDate === undefined) m.endDate = null;
          });
      });
  }
}

let instance: MsNoteDb | null = null;

export function getDb(): MsNoteDb {
  if (!instance) instance = new MsNoteDb();
  return instance;
}

/** テスト専用: 独立した DB インスタンスを差し替える */
export function __setDbForTests(db: MsNoteDb | null): void {
  instance = db;
}

export const db = new Proxy({} as MsNoteDb, {
  get(_t, prop: string | symbol) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

/** 全テーブル（バックアップ・件数集計で使用。attachments は別扱い） */
export const DATA_TABLES = [
  'medications',
  'scheduleRules',
  'doseRecords',
  'weeklyChecks',
  'symptomEvents',
  'symptomLogs',
  'medicalEvents',
  'measurements',
  'questions',
  'observationPeriods',
  'observationEntries',
  'appointments',
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];
