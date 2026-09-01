import { getDb, DATA_TABLES, type DataTableName } from './db';
import {
  appointmentSchema,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  attachmentMetaSchema,
  doseRecordSchema,
  measurementSchema,
  medicalEventSchema,
  medicationSchema,
  META_KEYS,
  observationEntrySchema,
  observationPeriodSchema,
  questionSchema,
  scheduleRuleSchema,
  symptomEventSchema,
  symptomLogSchema,
  weeklyCheckSchema,
  type Appointment,
  type Attachment,
  type DoseRecord,
  type Measurement,
  type MedicalEvent,
  type Medication,
  type ObservationEntry,
  type ObservationPeriod,
  type Question,
  type ScheduleRule,
  type SymptomEvent,
  type SymptomLog,
  type WeeklyCheck,
} from './types';
import { nowISO, todayISO, weekStartOf, type ISODate } from '@/lib/date';

/** 端末内で一意な ID を作る（外部通信なし） */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function stamps(): { id: string; createdAt: string; updatedAt: string } {
  const now = nowISO();
  return { id: newId(), createdAt: now, updatedAt: now };
}

/** Zod でパースしてから保存する共通処理 */
async function put<T extends { id: string; updatedAt: string }>(
  table: DataTableName,
  schema: { parse: (v: unknown) => T },
  value: unknown,
): Promise<T> {
  const parsed = schema.parse(value);
  await getDb().table(table).put(parsed);
  return parsed;
}

type Draft<T extends { id: string; createdAt: string; updatedAt: string }> = Omit<
  T,
  'id' | 'createdAt' | 'updatedAt'
> &
  Partial<Pick<T, 'id' | 'createdAt'>>;

/* ------------------------------------------------------------------ 薬 */

export const medications = {
  all: () => getDb().medications.orderBy('name').toArray(),
  active: () => getDb().medications.where('status').equals('active').toArray(),
  get: (id: string) => getDb().medications.get(id),
  create: (d: Draft<Medication>) => put('medications', medicationSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<Medication>) => {
    const cur = await getDb().medications.get(id);
    if (!cur) throw new Error('薬が見つかりません');
    return put('medications', medicationSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  /** 薬を消すと予定ルールと実施履歴も消えるため、明示的な操作からのみ呼ぶ */
  remove: async (id: string) => {
    const db = getDb();
    await db.transaction('rw', db.medications, db.scheduleRules, db.doseRecords, async () => {
      await db.scheduleRules.where('medicationId').equals(id).delete();
      await db.doseRecords.where('medicationId').equals(id).delete();
      await db.medications.delete(id);
    });
  },
};

/* ------------------------------------------------------- 投薬予定ルール */

export const scheduleRules = {
  all: () => getDb().scheduleRules.toArray(),
  forMedication: (medicationId: string) =>
    getDb().scheduleRules.where('medicationId').equals(medicationId).toArray(),
  get: (id: string) => getDb().scheduleRules.get(id),
  create: (d: Draft<ScheduleRule>) => put('scheduleRules', scheduleRuleSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<ScheduleRule>) => {
    const cur = await getDb().scheduleRules.get(id);
    if (!cur) throw new Error('予定ルールが見つかりません');
    // 予定ルールの変更は未来の予定にだけ影響する。doseRecords には一切触れない。
    return put('scheduleRules', scheduleRuleSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  remove: (id: string) => getDb().scheduleRules.delete(id),
};

/* ------------------------------------------------------------ 投薬記録 */

export const doseRecords = {
  all: () => getDb().doseRecords.toArray(),
  inRange: (from: ISODate, to: ISODate) =>
    getDb().doseRecords.where('scheduledDate').between(from, to, true, true).toArray(),
  forMedication: (medicationId: string) =>
    getDb().doseRecords.where('medicationId').equals(medicationId).toArray(),
  find: async (medicationId: string, scheduledDate: ISODate) =>
    getDb().doseRecords.where('[medicationId+scheduledDate]').equals([medicationId, scheduledDate]).first(),
  create: (d: Draft<DoseRecord>) => put('doseRecords', doseRecordSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<DoseRecord>) => {
    const cur = await getDb().doseRecords.get(id);
    if (!cur) throw new Error('投薬記録が見つかりません');
    return put('doseRecords', doseRecordSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  /** 同一（薬・予定日）の記録があれば更新、無ければ作成 */
  upsertForDate: async (medicationId: string, scheduledDate: ISODate, patch: Partial<DoseRecord>) => {
    const existing = await doseRecords.find(medicationId, scheduledDate);
    if (existing) return doseRecords.update(existing.id, patch);
    return doseRecords.create({
      medicationId,
      ruleId: null,
      scheduledDate,
      scheduledTime: null,
      status: 'planned',
      takenAt: null,
      actualDose: '',
      unit: '',
      site: '',
      siteReactions: [],
      siteReactionNote: '',
      systemicReactions: [],
      systemicReactionNote: '',
      notes: '',
      ...patch,
    } as Draft<DoseRecord>);
  },
  remove: (id: string) => getDb().doseRecords.delete(id),
};

/* --------------------------------------------------------- 週次チェック */

export const weeklyChecks = {
  all: () => getDb().weeklyChecks.orderBy('weekStart').toArray(),
  forWeek: (weekStart: ISODate) => getDb().weeklyChecks.where('weekStart').equals(weekStart).first(),
  currentWeek: (today: ISODate = todayISO()) => weeklyChecks.forWeek(weekStartOf(today)),
  create: (d: Draft<WeeklyCheck>) => put('weeklyChecks', weeklyCheckSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<WeeklyCheck>) => {
    const cur = await getDb().weeklyChecks.get(id);
    if (!cur) throw new Error('週次チェックが見つかりません');
    return put('weeklyChecks', weeklyCheckSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  /** 同じ週の記録は1件にまとめる */
  saveForWeek: async (weekStart: ISODate, data: Omit<Draft<WeeklyCheck>, 'weekStart'>) => {
    const existing = await weeklyChecks.forWeek(weekStart);
    if (existing) return weeklyChecks.update(existing.id, { ...data, weekStart });
    return weeklyChecks.create({ ...data, weekStart } as Draft<WeeklyCheck>);
  },
  remove: (id: string) => getDb().weeklyChecks.delete(id),
};

/* --------------------------------------------------------- 症状イベント */

export const symptomEvents = {
  all: () => getDb().symptomEvents.orderBy('onsetAt').reverse().toArray(),
  ongoing: () => getDb().symptomEvents.where('status').equals('ongoing').toArray(),
  get: (id: string) => getDb().symptomEvents.get(id),
  create: (d: Draft<SymptomEvent>) => put('symptomEvents', symptomEventSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<SymptomEvent>) => {
    const cur = await getDb().symptomEvents.get(id);
    if (!cur) throw new Error('症状イベントが見つかりません');
    return put('symptomEvents', symptomEventSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  remove: async (id: string) => {
    const db = getDb();
    await db.transaction('rw', db.symptomEvents, db.symptomLogs, async () => {
      await db.symptomLogs.where('eventId').equals(id).delete();
      await db.symptomEvents.delete(id);
    });
  },
};

export const symptomLogs = {
  forEvent: (eventId: string) => getDb().symptomLogs.where('eventId').equals(eventId).sortBy('date'),
  all: () => getDb().symptomLogs.toArray(),
  create: (d: Draft<SymptomLog>) => put('symptomLogs', symptomLogSchema, { ...stamps(), ...d }),
  /** 同じ日の経過記録は上書きする（毎回すべて再入力させないため） */
  saveForDay: async (eventId: string, date: ISODate, data: Omit<Draft<SymptomLog>, 'eventId' | 'date'>) => {
    const existing = await getDb()
      .symptomLogs.where('[eventId+date]')
      .equals([eventId, date])
      .first();
    if (existing) {
      return put('symptomLogs', symptomLogSchema, { ...existing, ...data, updatedAt: nowISO() });
    }
    return symptomLogs.create({ ...data, eventId, date } as Draft<SymptomLog>);
  },
  remove: (id: string) => getDb().symptomLogs.delete(id),
};

/* ------------------------------------------------------------ 観察モード */

export const observationPeriods = {
  all: () => getDb().observationPeriods.orderBy('startDate').reverse().toArray(),
  active: () => getDb().observationPeriods.where('status').equals('active').toArray(),
  get: (id: string) => getDb().observationPeriods.get(id),
  create: (d: Draft<ObservationPeriod>) =>
    put('observationPeriods', observationPeriodSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<ObservationPeriod>) => {
    const cur = await getDb().observationPeriods.get(id);
    if (!cur) throw new Error('観察期間が見つかりません');
    return put('observationPeriods', observationPeriodSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  remove: async (id: string) => {
    const db = getDb();
    await db.transaction('rw', db.observationPeriods, db.observationEntries, async () => {
      await db.observationEntries.where('periodId').equals(id).delete();
      await db.observationPeriods.delete(id);
    });
  },
};

export const observationEntries = {
  forPeriod: (periodId: string) => getDb().observationEntries.where('periodId').equals(periodId).sortBy('date'),
  all: () => getDb().observationEntries.toArray(),
  saveForDay: async (periodId: string, date: ISODate, data: Omit<Draft<ObservationEntry>, 'periodId' | 'date'>) => {
    const existing = await getDb()
      .observationEntries.where('[periodId+date]')
      .equals([periodId, date])
      .first();
    if (existing) {
      return put('observationEntries', observationEntrySchema, { ...existing, ...data, updatedAt: nowISO() });
    }
    return put('observationEntries', observationEntrySchema, {
      ...stamps(),
      ...data,
      periodId,
      date,
    });
  },
  remove: (id: string) => getDb().observationEntries.delete(id),
};

/* ------------------------------------------------------------ 医療履歴 */

export const medicalEvents = {
  all: () => getDb().medicalEvents.orderBy('date').reverse().toArray(),
  get: (id: string) => getDb().medicalEvents.get(id),
  create: (d: Draft<MedicalEvent>) => put('medicalEvents', medicalEventSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<MedicalEvent>) => {
    const cur = await getDb().medicalEvents.get(id);
    if (!cur) throw new Error('医療履歴が見つかりません');
    return put('medicalEvents', medicalEventSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  remove: async (id: string) => {
    const db = getDb();
    const ev = await db.medicalEvents.get(id);
    await db.transaction('rw', db.medicalEvents, db.attachments, async () => {
      if (ev) await db.attachments.bulkDelete(ev.attachmentIds);
      await db.medicalEvents.delete(id);
    });
  },
};

export const attachments = {
  get: (id: string) => getDb().attachments.get(id),
  getMany: (ids: string[]) => getDb().attachments.bulkGet(ids),
  count: () => getDb().attachments.count(),
  all: () => getDb().attachments.toArray(),
  totalBytes: async () => {
    let total = 0;
    await getDb().attachments.each((a) => {
      total += a.size ?? 0;
    });
    return total;
  },
  /** ファイルを検証して IndexedDB に保存する（外部送信は一切しない） */
  add: async (file: File): Promise<Attachment> => {
    const mime = file.type as (typeof ATTACHMENT_MIME_TYPES)[number];
    if (!ATTACHMENT_MIME_TYPES.includes(mime)) {
      throw new Error('JPEG / PNG / PDF のみ添付できます');
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      throw new Error(`1ファイルの上限は ${Math.floor(ATTACHMENT_MAX_BYTES / 1024 / 1024)}MB です`);
    }
    const meta = attachmentMetaSchema.parse({ ...stamps(), name: file.name, mime, size: file.size });
    const blob = new Blob([await file.arrayBuffer()], { type: mime });
    const rec: Attachment = { ...meta, blob };
    await getDb().attachments.put(rec);
    return rec;
  },
  remove: (id: string) => getDb().attachments.delete(id),
};

/* --------------------------------------------------------------- 測定 */

export const measurements = {
  all: () => getDb().measurements.orderBy('date').reverse().toArray(),
  get: (id: string) => getDb().measurements.get(id),
  create: (d: Draft<Measurement>) => put('measurements', measurementSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<Measurement>) => {
    const cur = await getDb().measurements.get(id);
    if (!cur) throw new Error('測定結果が見つかりません');
    return put('measurements', measurementSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  remove: (id: string) => getDb().measurements.delete(id),
};

/* ------------------------------------------------------------- 質問メモ */

export const questions = {
  all: () => getDb().questions.orderBy('createdAt').reverse().toArray(),
  get: (id: string) => getDb().questions.get(id),
  create: (d: Draft<Question>) => put('questions', questionSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<Question>) => {
    const cur = await getDb().questions.get(id);
    if (!cur) throw new Error('質問が見つかりません');
    return put('questions', questionSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  remove: (id: string) => getDb().questions.delete(id),
};

/* ----------------------------------------------------- 次回診察・検査 */

export const appointments = {
  all: () => getDb().appointments.orderBy('date').toArray(),
  upcoming: async (today: ISODate = todayISO()) => {
    const rows = await getDb().appointments.where('date').aboveOrEqual(today).sortBy('date');
    return rows.filter((a) => !a.done);
  },
  get: (id: string) => getDb().appointments.get(id),
  create: (d: Draft<Appointment>) => put('appointments', appointmentSchema, { ...stamps(), ...d }),
  update: async (id: string, patch: Partial<Appointment>) => {
    const cur = await getDb().appointments.get(id);
    if (!cur) throw new Error('予定が見つかりません');
    return put('appointments', appointmentSchema, { ...cur, ...patch, id, updatedAt: nowISO() });
  },
  remove: (id: string) => getDb().appointments.delete(id),
};

/* ------------------------------------------------------------- meta */

export const meta = {
  get: async <T = unknown>(key: string): Promise<T | undefined> => {
    const row = await getDb().meta.get(key);
    return row?.value as T | undefined;
  },
  set: async (key: string, value: unknown): Promise<void> => {
    await getDb().meta.put({ key, value });
  },
  markBackup: () => meta.set(META_KEYS.lastBackupAt, nowISO()),
  acceptDisclaimer: () => meta.set(META_KEYS.disclaimerAcceptedAt, nowISO()),
};

/* ------------------------------------------------------- 集計・全削除 */

export interface DataStats {
  counts: Record<string, number>;
  totalRecords: number;
  attachmentCount: number;
  attachmentBytes: number;
  lastBackupAt: string | null;
  estimatedUsageBytes: number | null;
  estimatedQuotaBytes: number | null;
}

export async function getDataStats(): Promise<DataStats> {
  const db = getDb();
  const counts: Record<string, number> = {};
  let totalRecords = 0;
  for (const t of DATA_TABLES) {
    const n = await db.table(t).count();
    counts[t] = n;
    totalRecords += n;
  }
  const attachmentCount = await db.attachments.count();
  const attachmentBytes = await attachments.totalBytes();
  const lastBackupAt = (await meta.get<string>(META_KEYS.lastBackupAt)) ?? null;

  let estimatedUsageBytes: number | null = null;
  let estimatedQuotaBytes: number | null = null;
  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      estimatedUsageBytes = est.usage ?? null;
      estimatedQuotaBytes = est.quota ?? null;
    } catch {
      /* 取得できない環境ではそのまま null */
    }
  }

  return {
    counts,
    totalRecords,
    attachmentCount,
    attachmentBytes,
    lastBackupAt,
    estimatedUsageBytes,
    estimatedQuotaBytes,
  };
}

/**
 * 全データ削除（設定画面の二段階確認を経てから呼ぶ）。
 * 記録・添付ファイルをすべて削除する。
 * 医療上の免責に同意した記録だけは、再度の同意を求めないために残す。
 */
export async function deleteAllData(): Promise<void> {
  const db = getDb();
  const tables = [...DATA_TABLES.map((t) => db.table(t)), db.attachments, db.meta];
  const accepted = await meta.get<string>(META_KEYS.disclaimerAcceptedAt);
  await db.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear();
    if (accepted) await db.meta.put({ key: META_KEYS.disclaimerAcceptedAt, value: accepted });
  });
}

export const TABLE_LABELS: Record<string, string> = {
  medications: '薬',
  scheduleRules: '投薬予定ルール',
  doseRecords: '投薬記録',
  weeklyChecks: '週次チェック',
  symptomEvents: '症状イベント',
  symptomLogs: '症状の経過記録',
  medicalEvents: '医療履歴',
  measurements: '測定結果',
  questions: '質問メモ',
  observationPeriods: '観察期間',
  observationEntries: '観察の記録',
  appointments: '次回診察・検査',
};
