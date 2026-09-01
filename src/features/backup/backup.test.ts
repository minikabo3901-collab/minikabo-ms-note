import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MsNoteDb } from '@/db/db';
import { closeDb, withFreshDb } from '@/test/dbHelper';
import {
  BACKUP_FORMAT,
  createBackupBlob,
  decryptBackup,
  parseEnvelope,
  restoreBackup,
  summarizePayload,
} from './backup';
import { measurements, medications, questions, symptomEvents } from '@/db/repo';

let db: MsNoteDb;

const PASSWORD = 'correct-horse-battery';

async function seed(): Promise<void> {
  await medications.create({
    name: 'バックアップ検証用の薬',
    dose: '1',
    unit: 'mL',
    route: '皮下注射',
    startDate: '2025-01-01',
    endDate: null,
    status: 'active',
    notes: '',
  });
  await measurements.create({
    date: '2025-02-01',
    name: 'T25FW',
    value: 5.5,
    valueText: '',
    unit: '秒',
    facility: '',
    examiner: '',
    notes: '',
  });
  await questions.create({ text: '次回の検査について', asked: false, askedAt: null, answer: '', repeat: false });
  await symptomEvents.create({
    kind: 'new',
    categories: ['疲労'],
    bodyParts: [],
    bodyPartsNote: '',
    onsetAt: '2025-02-03T00:00:00.000Z',
    onsetType: 'gradual',
    status: 'ongoing',
    recoveredAt: null,
    severity: 3,
    adlImpact: 'slight',
    context: [],
    contextNote: '',
    notes: '',
  });
}

beforeEach(async () => {
  db = await withFreshDb();
});

afterEach(async () => {
  await closeDb(db);
});

describe('暗号化バックアップ', () => {
  it('作成したバックアップを同じパスワードで復号できる', async () => {
    await seed();
    const blob = await createBackupBlob(PASSWORD);
    const envelope = parseEnvelope(await blob.text());

    expect(envelope.format).toBe(BACKUP_FORMAT);
    expect(envelope.cipher.name).toBe('AES-GCM');
    expect(envelope.kdf.name).toBe('PBKDF2');
    expect(envelope.kdf.hash).toBe('SHA-256');

    const payload = await decryptBackup(envelope, PASSWORD);
    expect(payload.data.medications).toHaveLength(1);
    expect(payload.data.medications[0].name).toBe('バックアップ検証用の薬');
    expect(payload.data.measurements[0].value).toBe(5.5);

    const summary = summarizePayload(payload);
    expect(summary.totalRecords).toBe(4);
    expect(summary.createdAt).toBe(payload.createdAt);
  });

  it('ファイルに平文の健康データが残らない', async () => {
    await seed();
    const text = await (await createBackupBlob(PASSWORD)).text();
    expect(text).not.toContain('バックアップ検証用の薬');
    expect(text).not.toContain('次回の検査について');
    expect(text).not.toContain('T25FW');
    expect(text).not.toContain('5.5');
    // パスワードそのものも含まれない
    expect(text).not.toContain(PASSWORD);
  });

  it('毎回異なる salt と IV が使われる', async () => {
    await seed();
    const a = parseEnvelope(await (await createBackupBlob(PASSWORD)).text());
    const b = parseEnvelope(await (await createBackupBlob(PASSWORD)).text());
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.payload).not.toBe(b.payload);
  });

  it('短すぎるパスワードでは作成できない', async () => {
    await expect(createBackupBlob('short')).rejects.toThrow();
  });

  it('間違ったパスワードでは復号できない', async () => {
    await seed();
    const envelope = parseEnvelope(await (await createBackupBlob(PASSWORD)).text());
    await expect(decryptBackup(envelope, 'wrong-password')).rejects.toThrow(
      'パスワードが違うか、ファイルが壊れています',
    );
  });

  it('暗号文が改ざんされていれば復号に失敗する', async () => {
    await seed();
    const envelope = parseEnvelope(await (await createBackupBlob(PASSWORD)).text());
    const bytes = envelope.payload.split('');
    bytes[10] = bytes[10] === 'A' ? 'B' : 'A';
    const tampered = { ...envelope, payload: bytes.join('') };
    await expect(decryptBackup(tampered, PASSWORD)).rejects.toThrow();
  });
});

describe('復元と壊れたファイルの扱い', () => {
  it('復元すると既存データが置き換わる', async () => {
    await seed();
    const envelope = parseEnvelope(await (await createBackupBlob(PASSWORD)).text());
    const payload = await decryptBackup(envelope, PASSWORD);

    // 別の内容に変えてから復元する
    await medications.create({
      name: '復元で消える薬',
      dose: '',
      unit: '',
      route: '',
      startDate: '2025-03-01',
      endDate: null,
      status: 'active',
      notes: '',
    });
    expect(await medications.all()).toHaveLength(2);

    await restoreBackup(payload);
    const after = await medications.all();
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe('バックアップ検証用の薬');
  });

  it('JSON でないファイルは読み込み時に拒否される', async () => {
    expect(() => parseEnvelope('これはバックアップではありません')).toThrow(
      'バックアップファイルとして読み取れません',
    );
  });

  it('形式が違う JSON は拒否される', () => {
    expect(() => parseEnvelope(JSON.stringify({ hello: 'world' }))).toThrow('このファイルは対応していない形式です');
    expect(() =>
      parseEnvelope(JSON.stringify({ format: 'other-app-backup', formatVersion: 1, payload: 'AAAA' })),
    ).toThrow('このファイルは対応していない形式です');
  });

  it('新しい形式バージョンのファイルは拒否される', async () => {
    await seed();
    const envelope = parseEnvelope(await (await createBackupBlob(PASSWORD)).text());
    const future = JSON.stringify({ ...envelope, formatVersion: 99 });
    expect(() => parseEnvelope(future)).toThrow('新しいバージョンで作られたバックアップです。アプリを更新してください');
  });

  it('壊れたバックアップを復元しようとしても既存データは壊れない', async () => {
    await seed();
    const before = await medications.all();

    // 中身の検証に失敗するペイロード（必須フィールドが欠けている）
    const brokenPayload = {
      createdAt: new Date().toISOString(),
      data: {
        medications: [{ id: 'x' }],
        scheduleRules: [],
        doseRecords: [],
        weeklyChecks: [],
        symptomEvents: [],
        symptomLogs: [],
        medicalEvents: [],
        measurements: [],
        questions: [],
        observationPeriods: [],
        observationEntries: [],
        appointments: [],
      },
      attachments: [],
    };

    await expect(restoreBackup(brokenPayload as never)).rejects.toThrow();

    const after = await medications.all();
    expect(after).toHaveLength(before.length);
    expect(after[0].name).toBe('バックアップ検証用の薬');
    expect(await measurements.all()).toHaveLength(1);
    expect(await questions.all()).toHaveLength(1);
  });

  it('間違ったパスワードで復元手順に入っても既存データは変化しない', async () => {
    await seed();
    const envelope = parseEnvelope(await (await createBackupBlob(PASSWORD)).text());
    await medications.create({
      name: '残るはずの薬',
      dose: '',
      unit: '',
      route: '',
      startDate: '2025-03-01',
      endDate: null,
      status: 'active',
      notes: '',
    });

    await expect(decryptBackup(envelope, 'not-the-password')).rejects.toThrow();

    // 復号に失敗した時点で DB には触れていない
    expect(await medications.all()).toHaveLength(2);
  });
});
