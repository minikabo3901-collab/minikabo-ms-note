import { z } from 'zod';
import { getDb, DATA_TABLES } from '@/db/db';
import { meta, TABLE_LABELS } from '@/db/repo';
import {
  appointmentSchema,
  attachmentMetaSchema,
  doseRecordSchema,
  measurementSchema,
  medicalEventSchema,
  medicationSchema,
  observationEntrySchema,
  observationPeriodSchema,
  questionSchema,
  scheduleRuleSchema,
  symptomEventSchema,
  symptomLogSchema,
  weeklyCheckSchema,
} from '@/db/types';
import { APP_ID, APP_NAME, BACKUP_EXTENSION } from '@/config/appConfig';
import { nowISO } from '@/lib/date';

/**
 * 暗号化バックアップ。
 *
 * - 暗号化は Web Crypto API のみを使用（外部ライブラリ・外部通信なし）
 * - 鍵導出: PBKDF2-SHA-256（ランダム salt）
 * - 暗号化: AES-GCM 256bit（ランダム IV）
 * - 健康データは必ず暗号化された状態でのみファイルに書き出す（平文は残さない）
 * - パスワードはどこにも保存しない。紛失した場合、復元は不可能。
 */

export const BACKUP_FORMAT = `${APP_ID}-backup`;
export const BACKUP_FORMAT_VERSION = 1;
export const PBKDF2_ITERATIONS = 310_000;

/* ------------------------------------------------------------ base64 */

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------ ファイル形式 */

const base64String = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'ファイルの形式が正しくありません');

export const envelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().min(1),
  app: z.string(),
  createdAt: z.string(),
  kdf: z.object({
    name: z.literal('PBKDF2'),
    hash: z.literal('SHA-256'),
    iterations: z.number().int().min(10_000).max(2_000_000),
    salt: base64String,
  }),
  cipher: z.object({
    name: z.literal('AES-GCM'),
    iv: base64String,
  }),
  payload: base64String,
});
export type BackupEnvelope = z.infer<typeof envelopeSchema>;

const attachmentBackupSchema = attachmentMetaSchema.extend({
  /** Blob は base64 にして保存する */
  data: base64String,
});

export const payloadSchema = z.object({
  createdAt: z.string(),
  appName: z.string().optional(),
  dbVersion: z.number().int().optional(),
  data: z.object({
    medications: z.array(medicationSchema),
    scheduleRules: z.array(scheduleRuleSchema),
    doseRecords: z.array(doseRecordSchema),
    weeklyChecks: z.array(weeklyCheckSchema),
    symptomEvents: z.array(symptomEventSchema),
    symptomLogs: z.array(symptomLogSchema),
    medicalEvents: z.array(medicalEventSchema),
    measurements: z.array(measurementSchema),
    questions: z.array(questionSchema),
    observationPeriods: z.array(observationPeriodSchema),
    observationEntries: z.array(observationEntrySchema),
    appointments: z.array(appointmentSchema),
  }),
  attachments: z.array(attachmentBackupSchema),
});
export type BackupPayload = z.infer<typeof payloadSchema>;

/* ---------------------------------------------------------- 鍵の導出 */

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/* ---------------------------------------------------------- 書き出し */

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export async function collectBackupPayload(): Promise<BackupPayload> {
  const db = getDb();
  const data = {} as BackupPayload['data'];
  for (const t of DATA_TABLES) {
    (data as Record<string, unknown[]>)[t] = await db.table(t).toArray();
  }
  const attachmentRows = await db.attachments.toArray();
  const attachments = await Promise.all(
    attachmentRows.map(async (a) => ({
      id: a.id,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      name: a.name,
      mime: a.mime,
      size: a.size,
      data: await blobToBase64(a.blob),
    })),
  );
  return { createdAt: nowISO(), appName: APP_NAME, dbVersion: db.verno, data, attachments };
}

export async function createBackupBlob(password: string): Promise<Blob> {
  if (password.length < 8) throw new Error('パスワードは8文字以上にしてください');

  const payload = await collectBackupPayload();
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    plaintext as unknown as BufferSource,
  );

  const envelope: BackupEnvelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    app: APP_NAME,
    createdAt: payload.createdAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    payload: bytesToBase64(new Uint8Array(cipherBuf)),
  };

  // 平文の健康データはファイルに含めない（ヘッダは形式情報と作成日時のみ）
  return new Blob([JSON.stringify(envelope)], { type: 'application/octet-stream' });
}

export function backupFileName(date: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${APP_ID}-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(
    date.getHours(),
  )}${p(date.getMinutes())}${BACKUP_EXTENSION}`;
}

/* ------------------------------------------------------------ 読み込み */

export function parseEnvelope(text: string): BackupEnvelope {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('バックアップファイルとして読み取れません');
  }
  const result = envelopeSchema.safeParse(json);
  if (!result.success) {
    throw new Error('このファイルは対応していない形式です');
  }
  if (result.data.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error('新しいバージョンで作られたバックアップです。アプリを更新してください');
  }
  return result.data;
}

export async function decryptBackup(envelope: BackupEnvelope, password: string): Promise<BackupPayload> {
  const salt = base64ToBytes(envelope.kdf.salt);
  const iv = base64ToBytes(envelope.cipher.iv);
  const key = await deriveKey(password, salt, envelope.kdf.iterations);

  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      base64ToBytes(envelope.payload) as unknown as BufferSource,
    );
  } catch {
    throw new Error('パスワードが違うか、ファイルが壊れています');
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(plainBuf));
  } catch {
    throw new Error('バックアップの内容が壊れています');
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('バックアップの内容が検証できませんでした（形式が不正です）');
  }
  return parsed.data;
}

export interface BackupSummary {
  createdAt: string;
  counts: { label: string; count: number }[];
  totalRecords: number;
  attachmentCount: number;
  attachmentBytes: number;
}

/** 復元前に表示する内容サマリ */
export function summarizePayload(payload: BackupPayload): BackupSummary {
  const counts = DATA_TABLES.map((t) => ({
    label: TABLE_LABELS[t] ?? t,
    count: (payload.data as Record<string, unknown[]>)[t]?.length ?? 0,
  }));
  return {
    createdAt: payload.createdAt,
    counts,
    totalRecords: counts.reduce((s, c) => s + c.count, 0),
    attachmentCount: payload.attachments.length,
    attachmentBytes: payload.attachments.reduce((s, a) => s + a.size, 0),
  };
}

/* -------------------------------------------------------------- 復元 */

/**
 * 現在のデータを置き換える形で復元する（MVP は置換のみ）。
 * すべて 1 つのトランザクションで実行するため、途中で失敗した場合は
 * Dexie がロールバックし、元のデータが維持される。
 */
export async function restoreBackup(payload: BackupPayload): Promise<void> {
  // 事前検証（DB に触れる前に落とす）
  payloadSchema.parse(payload);

  const db = getDb();
  const tables = [...DATA_TABLES.map((t) => db.table(t)), db.attachments];

  const attachmentRows = payload.attachments.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    name: a.name,
    mime: a.mime,
    size: a.size,
    blob: new Blob([base64ToBytes(a.data) as unknown as BlobPart], { type: a.mime }),
  }));

  await db.transaction('rw', tables, async () => {
    for (const t of DATA_TABLES) {
      await db.table(t).clear();
      const rows = (payload.data as Record<string, unknown[]>)[t] ?? [];
      if (rows.length) await db.table(t).bulkPut(rows);
    }
    await db.attachments.clear();
    if (attachmentRows.length) await db.attachments.bulkPut(attachmentRows);
  });

  await meta.set('lastRestoreAt', nowISO());
}

/** バイト数を読みやすく整形 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '不明';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
