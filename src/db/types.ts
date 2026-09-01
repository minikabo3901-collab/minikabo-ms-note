import { z } from 'zod';

/**
 * データモデル定義。
 * すべての入力は Zod で検証してから IndexedDB に保存する。
 * バックアップ復元時にも同じスキーマで全件検証する。
 */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で指定してください');

export const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), '日時の形式が正しくありません');

export const hhmm = z.string().regex(/^\d{2}:\d{2}$/, '時刻は HH:MM 形式で指定してください');

const base = {
  id: z.string().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
};

/* ------------------------------------------------------------------ 薬 */

export const medicationStatusValues = ['active', 'paused', 'ended'] as const;
export const medicationStatusLabel: Record<MedicationStatus, string> = {
  active: '使用中',
  paused: '一時停止',
  ended: '終了',
};
export type MedicationStatus = (typeof medicationStatusValues)[number];

export const medicationSchema = z.object({
  ...base,
  name: z.string().trim().min(1, '薬名を入力してください').max(120),
  dose: z.string().trim().max(60).default(''),
  unit: z.string().trim().max(30).default(''),
  route: z.string().trim().max(60).default(''),
  startDate: isoDate,
  endDate: isoDate.nullable().default(null),
  status: z.enum(medicationStatusValues).default('active'),
  notes: z.string().max(4000).default(''),
});
export type Medication = z.infer<typeof medicationSchema>;

/* ------------------------------------------------- 投薬予定ルール */

export const scheduleKindValues = ['dates', 'everyNDays', 'everyNWeeks'] as const;
export type ScheduleKind = (typeof scheduleKindValues)[number];
export const scheduleKindLabel: Record<ScheduleKind, string> = {
  dates: '個別の日付',
  everyNDays: 'N日ごと',
  everyNWeeks: 'N週間ごと',
};

export const scheduleRuleSchema = z
  .object({
    ...base,
    medicationId: z.string().min(1),
    label: z.string().trim().max(80).default(''),
    kind: z.enum(scheduleKindValues),
    /** kind === 'dates' のときに使う個別日付（複数登録可） */
    dates: z.array(isoDate).default([]),
    /** kind === 'everyNDays' / 'everyNWeeks' のときの間隔 */
    interval: z.number().int().min(1).max(365).default(1),
    /** 繰り返しの起点 */
    startDate: isoDate,
    endDate: isoDate.nullable().default(null),
    time: hhmm.nullable().default(null),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'dates' && v.dates.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dates'], message: '日付を1つ以上追加してください' });
    }
    if (v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: '終了日は開始日以降にしてください' });
    }
  });
export type ScheduleRule = z.infer<typeof scheduleRuleSchema>;

/* --------------------------------------------------------- 投薬記録 */

export const doseStatusValues = ['planned', 'done', 'postponed', 'skipped'] as const;
export type DoseStatus = (typeof doseStatusValues)[number];
export const doseStatusLabel: Record<DoseStatus, string> = {
  planned: '予定',
  done: '実施済み',
  postponed: '延期',
  skipped: '見送り',
};
export const doseStatusMark: Record<DoseStatus, string> = {
  planned: '○',
  done: '●',
  postponed: '△',
  skipped: '×',
};

export const doseRecordSchema = z.object({
  ...base,
  medicationId: z.string().min(1),
  /** 予定に紐づく場合のルール ID（任意記録なら null） */
  ruleId: z.string().nullable().default(null),
  /** 予定日（YYYY-MM-DD）。予定外の記録では実施日を入れる */
  scheduledDate: isoDate,
  scheduledTime: hhmm.nullable().default(null),
  status: z.enum(doseStatusValues).default('planned'),
  takenAt: isoDateTime.nullable().default(null),
  actualDose: z.string().trim().max(60).default(''),
  unit: z.string().trim().max(30).default(''),
  site: z.string().trim().max(60).default(''),
  siteReactions: z.array(z.string().max(60)).default([]),
  siteReactionNote: z.string().max(2000).default(''),
  systemicReactions: z.array(z.string().max(60)).default([]),
  systemicReactionNote: z.string().max(2000).default(''),
  notes: z.string().max(4000).default(''),
});
export type DoseRecord = z.infer<typeof doseRecordSchema>;

/* ------------------------------------------------------ 週1回チェック */

export const weeklyScoreKeys = ['fatigue', 'cognition', 'walking', 'hands', 'sleep'] as const;
export type WeeklyScoreKey = (typeof weeklyScoreKeys)[number];

export const weeklyCheckSchema = z.object({
  ...base,
  /** 週の起点（月曜日 YYYY-MM-DD）。1週につき1件 */
  weekStart: isoDate,
  recordedDate: isoDate,
  /** 「先週とほぼ変化なし」を選んだ場合 true（詳細入力なし） */
  noChange: z.boolean().default(false),
  scores: z
    .object({
      fatigue: z.number().int().min(0).max(4).nullable().default(null),
      cognition: z.number().int().min(0).max(4).nullable().default(null),
      walking: z.number().int().min(0).max(4).nullable().default(null),
      hands: z.number().int().min(0).max(4).nullable().default(null),
      sleep: z.number().int().min(0).max(4).nullable().default(null),
    })
    .default({ fatigue: null, cognition: null, walking: null, hands: null, sleep: null }),
  flags: z
    .object({
      newSymptom: z.boolean().default(false),
      worsenedSymptom: z.boolean().default(false),
      feverOrInfection: z.boolean().default(false),
      heat: z.boolean().default(false),
      sleepDeprivation: z.boolean().default(false),
      exertion: z.boolean().default(false),
      stress: z.boolean().default(false),
    })
    .default({
      newSymptom: false,
      worsenedSymptom: false,
      feverOrInfection: false,
      heat: false,
      sleepDeprivation: false,
      exertion: false,
      stress: false,
    }),
  notes: z.string().max(4000).default(''),
});
export type WeeklyCheck = z.infer<typeof weeklyCheckSchema>;

/* --------------------------------------------------------- 症状イベント */

export const symptomKindValues = ['new', 'worsening'] as const;
export type SymptomKind = (typeof symptomKindValues)[number];
export const symptomKindLabel: Record<SymptomKind, string> = {
  new: '新しい症状',
  worsening: '既存症状の悪化',
};

export const onsetTypeValues = ['sudden', 'gradual'] as const;
export type OnsetType = (typeof onsetTypeValues)[number];
export const onsetTypeLabel: Record<OnsetType, string> = { sudden: '突然', gradual: '徐々に' };

export const symptomStatusValues = ['ongoing', 'recovered'] as const;
export type SymptomStatus = (typeof symptomStatusValues)[number];
export const symptomStatusLabel: Record<SymptomStatus, string> = {
  ongoing: '継続中',
  recovered: '回復',
};

export const adlImpactValues = ['none', 'slight', 'moderate', 'large', 'severe'] as const;
export type AdlImpact = (typeof adlImpactValues)[number];
export const adlImpactLabel: Record<AdlImpact, string> = {
  none: '影響なし',
  slight: '少し影響がある',
  moderate: '普段の動作がしにくい',
  large: '一部できないことがある',
  severe: 'ほとんどできない',
};

export const symptomCategories = [
  '視覚',
  '複視',
  'しびれ・感覚',
  '筋力・動かしにくさ',
  '歩行・バランス',
  '手の使いにくさ',
  '痛み',
  '筋肉のこわばり・けいれん',
  '言葉・飲み込み',
  '排尿・排便',
  '疲労',
  '認知・集中',
  '聴覚',
  'その他',
] as const;

export const bodyPartOptions = [
  '右目',
  '左目',
  '両目',
  '顔',
  '口・舌',
  '首',
  '右手・右腕',
  '左手・左腕',
  '右足・右脚',
  '左足・左脚',
  '体幹',
  '背中・腰',
  '全身',
] as const;

export const symptomContextOptions = [
  '発熱',
  '感染症らしい症状',
  '暑さ',
  '入浴',
  '運動',
  '睡眠不足',
  'ストレス',
  'その他',
] as const;

export const symptomEventSchema = z
  .object({
    ...base,
    kind: z.enum(symptomKindValues),
    categories: z.array(z.string().max(60)).default([]),
    bodyParts: z.array(z.string().max(60)).default([]),
    bodyPartsNote: z.string().max(500).default(''),
    onsetAt: isoDateTime,
    onsetType: z.enum(onsetTypeValues).default('gradual'),
    status: z.enum(symptomStatusValues).default('ongoing'),
    recoveredAt: isoDateTime.nullable().default(null),
    severity: z.number().int().min(0).max(10).default(0),
    adlImpact: z.enum(adlImpactValues).default('none'),
    context: z.array(z.string().max(60)).default([]),
    contextNote: z.string().max(2000).default(''),
    notes: z.string().max(4000).default(''),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'recovered' && !v.recoveredAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recoveredAt'], message: '回復日時を入力してください' });
    }
  });
export type SymptomEvent = z.infer<typeof symptomEventSchema>;

export const trendValues = ['better', 'same', 'worse'] as const;
export type Trend = (typeof trendValues)[number];
export const trendLabel: Record<Trend, string> = {
  better: '良くなった',
  same: 'ほぼ同じ',
  worse: '悪くなった',
};

export const symptomLogSchema = z.object({
  ...base,
  eventId: z.string().min(1),
  date: isoDate,
  trend: z.enum(trendValues),
  severity: z.number().int().min(0).max(10).nullable().default(null),
  notes: z.string().max(2000).default(''),
});
export type SymptomLog = z.infer<typeof symptomLogSchema>;

/* ------------------------------------------------------------ 観察モード */

export const observationPeriodSchema = z
  .object({
    ...base,
    title: z.string().trim().max(120).default(''),
    startDate: isoDate,
    endDate: isoDate,
    symptomEventId: z.string().nullable().default(null),
    notes: z.string().max(2000).default(''),
    status: z.enum(['active', 'ended']).default('active'),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: '終了予定日は開始日以降にしてください' });
    }
  });
export type ObservationPeriod = z.infer<typeof observationPeriodSchema>;

export const observationEntrySchema = z.object({
  ...base,
  periodId: z.string().min(1),
  date: isoDate,
  trend: z.enum(trendValues),
  severity: z.number().int().min(0).max(10).nullable().default(null),
  notes: z.string().max(2000).default(''),
});
export type ObservationEntry = z.infer<typeof observationEntrySchema>;

/* ------------------------------------------------------------ 医療履歴 */

export const medicalEventTypes = [
  '診察',
  '入院',
  'MRI',
  '血液検査',
  '髄液検査',
  'ステロイドパルス',
  'その他の治療',
  '予防接種',
  '感染症',
  'その他',
] as const;
export type MedicalEventType = (typeof medicalEventTypes)[number];

export const medicalEventSchema = z.object({
  ...base,
  type: z.string().max(40),
  date: isoDate,
  title: z.string().trim().max(160).default(''),
  facility: z.string().trim().max(120).default(''),
  doctor: z.string().trim().max(120).default(''),
  content: z.string().max(8000).default(''),
  result: z.string().max(8000).default(''),
  notes: z.string().max(4000).default(''),
  attachmentIds: z.array(z.string().min(1)).default([]),
});
export type MedicalEvent = z.infer<typeof medicalEventSchema>;

/** 添付ファイル（Blob は IndexedDB に保存。Cache Storage には置かない） */
export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024; // 1件あたり 8MB
export const ATTACHMENT_TOTAL_WARN_BYTES = 150 * 1024 * 1024; // 合計 150MB で注意表示

export const attachmentMetaSchema = z.object({
  ...base,
  name: z.string().max(255),
  mime: z.enum(ATTACHMENT_MIME_TYPES),
  size: z.number().int().min(0).max(ATTACHMENT_MAX_BYTES),
});
export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;
export type Attachment = AttachmentMeta & { blob: Blob };

/* --------------------------------------------- 身体機能・認知機能の測定 */

export const measurementNames = [
  'EDSS',
  'T25FW',
  '9HPT右手',
  '9HPT左手',
  'SDMT',
  'BICAMS',
  'その他',
] as const;

export const measurementSchema = z.object({
  ...base,
  date: isoDate,
  /** 測定名（既定候補または自由入力） */
  name: z.string().trim().min(1, '測定名を入力してください').max(80),
  /** 数値として扱える場合のみ。文字列の結果は valueText に入れる */
  value: z.number().nullable().default(null),
  valueText: z.string().trim().max(200).default(''),
  unit: z.string().trim().max(30).default(''),
  facility: z.string().trim().max(120).default(''),
  examiner: z.string().trim().max(120).default(''),
  notes: z.string().max(2000).default(''),
});
export type Measurement = z.infer<typeof measurementSchema>;

/* ------------------------------------------------------------ 質問メモ */

export const questionSchema = z.object({
  ...base,
  text: z.string().trim().min(1, '質問内容を入力してください').max(2000),
  asked: z.boolean().default(false),
  askedAt: isoDateTime.nullable().default(null),
  answer: z.string().max(4000).default(''),
  repeat: z.boolean().default(false),
});
export type Question = z.infer<typeof questionSchema>;

/* ------------------------------------------- 次回診察・検査（アプリ内のみ） */

export const appointmentSchema = z.object({
  ...base,
  type: z.string().max(40).default('診察'),
  date: isoDate,
  time: hhmm.nullable().default(null),
  facility: z.string().trim().max(120).default(''),
  notes: z.string().max(2000).default(''),
  done: z.boolean().default(false),
});
export type Appointment = z.infer<typeof appointmentSchema>;

/* ------------------------------------------------------------ 設定 / meta */

export const metaSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});
export type MetaEntry = z.infer<typeof metaSchema>;

export const META_KEYS = {
  disclaimerAcceptedAt: 'disclaimerAcceptedAt',
  lastBackupAt: 'lastBackupAt',
  persistRequestedAt: 'persistRequestedAt',
  schemaNote: 'schemaNote',
} as const;
