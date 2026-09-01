import {
  appointments as appointmentRepo,
  doseRecords as doseRepo,
  measurements as measurementRepo,
  medicalEvents as medicalRepo,
  medications as medRepo,
  observationEntries,
  observationPeriods,
  questions as questionRepo,
  scheduleRules as ruleRepo,
  symptomEvents as symptomRepo,
  symptomLogs as symptomLogRepo,
  weeklyChecks as weeklyRepo,
} from '@/db/repo';
import {
  doseStatusLabel,
  medicationStatusLabel,
  trendLabel,
  type Appointment,
  type DoseRecord,
  type Measurement,
  type MedicalEvent,
  type Medication,
  type Question,
  type SymptomEvent,
  type WeeklyCheck,
} from '@/db/types';
import { buildScheduleItems, describeRule, type ScheduleItem } from '@/features/medication/schedule';
import { WEEKLY_SCALES } from '@/features/weekly/labels';
import { symptomTitle } from '@/features/symptom/notices';
import { durationDays, formatDateJa, isoDateOfDateTime, type ISODate } from '@/lib/date';

/**
 * 診察用レポートの組み立て。
 *
 * AI による要約や解釈は一切行わない。
 * 記録済みのデータを、決定的（deterministic）なルールだけで期間で絞り、並べ替えて返す。
 * 同じデータからは必ず同じレポートが得られる。
 */

export interface ReportRow {
  cells: string[];
}

export interface ReportSection {
  id: string;
  heading: string;
  /** 表形式で出す場合のヘッダ */
  columns?: string[];
  rows?: ReportRow[];
  /** 箇条書きで出す場合 */
  bullets?: string[];
  /** 該当データが無いときの文言 */
  emptyText: string;
}

export interface ReportData {
  from: ISODate;
  to: ISODate;
  generatedAt: string;
  sections: ReportSection[];
}

const fmt = (d: ISODate): string => formatDateJa(d, { year: true });

function medName(meds: Medication[], id: string): string {
  return meds.find((m) => m.id === id)?.name ?? '（削除された薬）';
}

function weeklySummaryRow(w: WeeklyCheck): ReportRow {
  if (w.noChange) return { cells: [fmt(w.weekStart), '先週とほぼ変化なし', '', ''] };
  const scores = WEEKLY_SCALES.map((s) =>
    w.scores[s.key] == null ? `${s.label}：—` : `${s.label}：${w.scores[s.key]}`,
  ).join('／');
  const flags = [
    w.flags.newSymptom ? '新しい症状' : '',
    w.flags.worsenedSymptom ? '症状の悪化' : '',
    w.flags.feverOrInfection ? '発熱・感染症' : '',
    w.flags.heat ? '暑さ' : '',
    w.flags.sleepDeprivation ? '睡眠不足' : '',
    w.flags.exertion ? '運動・疲労' : '',
    w.flags.stress ? 'ストレス' : '',
  ]
    .filter(Boolean)
    .join('、');
  return { cells: [fmt(w.weekStart), scores, flags, w.notes] };
}

export async function buildReport(from: ISODate, to: ISODate): Promise<ReportData> {
  const [meds, rules, doses, weekly, symptoms, medical, ms, qs, appts, periods] = await Promise.all([
    medRepo.all(),
    ruleRepo.all(),
    doseRepo.all(),
    weeklyRepo.all(),
    symptomRepo.all(),
    medicalRepo.all(),
    measurementRepo.all(),
    questionRepo.all(),
    appointmentRepo.all(),
    observationPeriods.all(),
  ]);

  const inRange = (d: ISODate): boolean => d >= from && d <= to;

  /* 1. 使用中の薬 */
  const activeMeds: Medication[] = meds.filter((m) => m.status === 'active');
  const medsSection: ReportSection = {
    id: 'medications',
    heading: '使用中の薬',
    columns: ['薬名', '1回量', '投与方法', '開始日', '状態'],
    rows: activeMeds.map((m) => ({
      cells: [m.name, `${m.dose}${m.unit}`.trim() || '—', m.route || '—', fmt(m.startDate), medicationStatusLabel[m.status]],
    })),
    emptyText: '使用中として登録されている薬はありません。',
  };

  /* 2. 投薬予定 */
  const scheduleSection: ReportSection = {
    id: 'schedule',
    heading: '登録されている投薬予定',
    columns: ['薬名', '予定ルール', '状態'],
    rows: rules.map((r) => ({
      cells: [medName(meds, r.medicationId), describeRule(r), r.active ? '有効' : '停止中'],
    })),
    emptyText: '登録されている投薬予定はありません。',
  };

  /* 3. 投薬の実施履歴 */
  const items: ScheduleItem[] = buildScheduleItems(rules, doses, from, to);
  const doneItems = items.filter((i) => i.status === 'done');
  const doseSection: ReportSection = {
    id: 'doses',
    heading: '投薬の実施履歴',
    columns: ['日付', '薬名', '実際の量', '部位', '反応'],
    rows: doneItems.map((i) => {
      const r: DoseRecord | null = i.record;
      const reactions = [
        r?.siteReactions.join('・'),
        r?.siteReactionNote,
        r?.systemicReactions.join('・'),
        r?.systemicReactionNote,
      ]
        .filter(Boolean)
        .join('／');
      return {
        cells: [
          fmt(i.date),
          medName(meds, i.medicationId),
          r?.actualDose ? `${r.actualDose}${r.unit}` : '—',
          r?.site || '—',
          reactions || '—',
        ],
      };
    }),
    emptyText: 'この期間に実施として記録された投薬はありません。',
  };

  /* 4. 延期・見送り */
  const changed = items.filter((i) => i.status === 'postponed' || i.status === 'skipped');
  const changedSection: ReportSection = {
    id: 'dose-changes',
    heading: '延期・見送り',
    columns: ['日付', '薬名', '状態', 'メモ'],
    rows: changed.map((i) => ({
      cells: [fmt(i.date), medName(meds, i.medicationId), doseStatusLabel[i.status], i.record?.notes || '—'],
    })),
    emptyText: 'この期間に延期・見送りとして記録されたものはありません。',
  };

  /* 5. 新しい症状と悪化症状 */
  const symptomsInRange: SymptomEvent[] = symptoms
    .filter((s) => inRange(isoDateOfDateTime(s.onsetAt)))
    .sort((a, b) => a.onsetAt.localeCompare(b.onsetAt));

  const symptomLogsByEvent = new Map<string, Awaited<ReturnType<typeof symptomLogRepo.forEvent>>>();
  for (const s of symptomsInRange) {
    symptomLogsByEvent.set(s.id, await symptomLogRepo.forEvent(s.id));
  }

  const symptomSection: ReportSection = {
    id: 'symptoms',
    heading: '新しい症状・悪化した症状',
    columns: ['開始', '内容', '種類', '強さ', '経過'],
    rows: symptomsInRange.map((s) => ({
      cells: [
        formatDateJa(isoDateOfDateTime(s.onsetAt)),
        [symptomTitle(s), s.bodyParts.join('・'), s.bodyPartsNote].filter(Boolean).join('／'),
        s.kind === 'new' ? '新しい症状' : '既存症状の悪化',
        `${s.severity}/10`,
        s.status === 'ongoing'
          ? `継続中（${durationDays(s.onsetAt)}日目）`
          : `回復（${s.recoveredAt ? formatDateJa(isoDateOfDateTime(s.recoveredAt)) : ''}）`,
      ],
    })),
    emptyText: 'この期間に記録された症状の変化はありません。',
  };

  /* 6. 継続中の症状 */
  const ongoing = symptoms.filter((s) => s.status === 'ongoing');
  const ongoingSection: ReportSection = {
    id: 'ongoing',
    heading: '継続中の症状',
    columns: ['開始', '内容', '継続日数', '直近の経過記録'],
    rows: await Promise.all(
      ongoing.map(async (s) => {
        const logs = symptomLogsByEvent.get(s.id) ?? (await symptomLogRepo.forEvent(s.id));
        const last = logs[logs.length - 1];
        return {
          cells: [
            formatDateJa(isoDateOfDateTime(s.onsetAt)),
            symptomTitle(s),
            `${durationDays(s.onsetAt)}日目`,
            last ? `${fmt(last.date)}：${trendLabel[last.trend]}${last.severity != null ? `／強さ ${last.severity}` : ''}` : '—',
          ],
        };
      }),
    ),
    emptyText: '継続中として記録されている症状はありません。',
  };

  /* 7. 週次チェックの推移 */
  const weeklyInRange = weekly.filter((w) => inRange(w.weekStart)).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const weeklySection: ReportSection = {
    id: 'weekly',
    heading: '週次チェックの推移（0＝良い状態、4＝つらい状態）',
    columns: ['週の開始', '各項目', 'あてはまる状況', 'メモ'],
    rows: weeklyInRange.map(weeklySummaryRow),
    emptyText: 'この期間の週次チェックはありません。',
  };

  /* 8. 診察・検査・治療履歴 */
  const medicalInRange: MedicalEvent[] = medical
    .filter((m) => inRange(m.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const medicalSection: ReportSection = {
    id: 'medical',
    heading: '診察・検査・治療の履歴',
    columns: ['日付', '種類', 'タイトル', '医療機関', '結果'],
    rows: medicalInRange.map((m) => ({
      cells: [fmt(m.date), m.type, m.title || '—', m.facility || '—', m.result || m.content || '—'],
    })),
    emptyText: 'この期間の医療履歴はありません。',
  };

  /* 9. 測定結果 */
  const msInRange: Measurement[] = ms.filter((m) => inRange(m.date)).sort((a, b) => a.date.localeCompare(b.date));
  const measurementSection: ReportSection = {
    id: 'measurements',
    heading: '身体機能・認知機能の測定結果',
    columns: ['測定日', '測定名', '結果', '医療機関', '測定者'],
    rows: msInRange.map((m) => ({
      cells: [
        fmt(m.date),
        m.name,
        `${m.value != null ? m.value : m.valueText || '—'}${m.unit ? ` ${m.unit}` : ''}`,
        m.facility || '—',
        m.examiner || '—',
      ],
    })),
    emptyText: 'この期間の測定結果はありません。',
  };

  /* 10. 観察モードの記録 */
  const periodsInRange = periods.filter((p) => !(p.endDate < from || p.startDate > to));
  const observationRows: ReportRow[] = [];
  for (const p of periodsInRange) {
    const entries = (await observationEntries.forPeriod(p.id)).filter((e) => inRange(e.date));
    if (entries.length === 0) continue;
    const counts = { better: 0, same: 0, worse: 0 };
    for (const e of entries) counts[e.trend]++;
    observationRows.push({
      cells: [
        `${fmt(p.startDate)}〜${fmt(p.endDate)}`,
        p.title || '観察期間',
        `${entries.length}件`,
        `良くなった ${counts.better}／ほぼ同じ ${counts.same}／悪くなった ${counts.worse}`,
      ],
    });
  }
  const observationSection: ReportSection = {
    id: 'observation',
    heading: '観察モードの記録',
    columns: ['期間', 'タイトル', '記録数', '内訳'],
    rows: observationRows,
    emptyText: 'この期間の観察モードの記録はありません。',
  };

  /* 11. 医師への質問 */
  const openQs: Question[] = qs.filter((q) => !q.asked || q.repeat);
  const questionSection: ReportSection = {
    id: 'questions',
    heading: '医師への質問',
    bullets: openQs.map((q) => `${q.text}${q.repeat ? '（次回も確認）' : ''}`),
    emptyText: '未質問の項目はありません。',
  };

  /* 12. 次回の予定 */
  const apptRows: Appointment[] = appts.filter((a) => !a.done).sort((a, b) => a.date.localeCompare(b.date));
  const apptSection: ReportSection = {
    id: 'appointments',
    heading: '次回の診察・検査の予定',
    columns: ['日付', '種類', '医療機関'],
    rows: apptRows.map((a) => ({ cells: [`${fmt(a.date)}${a.time ? ` ${a.time}` : ''}`, a.type, a.facility || '—'] })),
    emptyText: '登録されている予定はありません。',
  };

  return {
    from,
    to,
    generatedAt: new Date().toISOString(),
    sections: [
      medsSection,
      scheduleSection,
      doseSection,
      changedSection,
      symptomSection,
      ongoingSection,
      weeklySection,
      observationSection,
      medicalSection,
      measurementSection,
      questionSection,
      apptSection,
    ],
  };
}
