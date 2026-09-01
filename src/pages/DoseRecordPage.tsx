import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import {
  Card,
  ChipMultiSelect,
  ChipSingleSelect,
  ConfirmSheet,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { doseRecords, medications } from '@/db/repo';
import { doseStatusLabel, doseStatusValues, type DoseRecord, type DoseStatus, type Medication } from '@/db/types';
import {
  formatDateJa,
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
  todayISO,
} from '@/lib/date';

const SITE_OPTIONS = [
  '腹部（右）',
  '腹部（左）',
  '太もも（右）',
  '太もも（左）',
  '上腕（右）',
  '上腕（左）',
  '臀部（右）',
  '臀部（左）',
  '点滴（静脈）',
  'その他',
] as const;

const SITE_REACTIONS = ['変化なし', '赤み', '腫れ', '痛み', 'かゆみ', '熱感', 'しこり', 'あざ'] as const;
const SYSTEMIC_REACTIONS = [
  '変化なし',
  '発熱',
  '悪寒',
  '頭痛',
  '倦怠感',
  '筋肉痛',
  '関節痛',
  '吐き気',
  'その他',
] as const;

/**
 * 投薬の実施記録。
 * 予定日ごとに 1 件の記録を持つ。過去の記録の修正はこの画面での明示的な保存操作でのみ行われる。
 */
export function DoseRecordPage(): ReactNode {
  const { medId = '', date = todayISO() } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [med, setMed] = useState<Medication | null>(null);
  const [existing, setExisting] = useState<DoseRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [status, setStatus] = useState<DoseStatus>('done');
  const [takenLocal, setTakenLocal] = useState('');
  const [actualDose, setActualDose] = useState('');
  const [unit, setUnit] = useState('');
  const [site, setSite] = useState('');
  const [siteFree, setSiteFree] = useState('');
  const [siteReactions, setSiteReactions] = useState<string[]>([]);
  const [siteReactionNote, setSiteReactionNote] = useState('');
  const [systemicReactions, setSystemicReactions] = useState<string[]>([]);
  const [systemicReactionNote, setSystemicReactionNote] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      const m = await medications.get(medId);
      const rec = await doseRecords.find(medId, date);
      if (!alive) return;
      setMed(m ?? null);
      if (rec) {
        setExisting(rec);
        setStatus(rec.status === 'planned' ? 'done' : rec.status);
        setTakenLocal(toDateTimeLocalValue(rec.takenAt ?? `${date}T09:00`));
        setActualDose(rec.actualDose);
        setUnit(rec.unit || m?.unit || '');
        setSite(SITE_OPTIONS.includes(rec.site as (typeof SITE_OPTIONS)[number]) ? rec.site : '');
        setSiteFree(SITE_OPTIONS.includes(rec.site as (typeof SITE_OPTIONS)[number]) ? '' : rec.site);
        setSiteReactions(rec.siteReactions);
        setSiteReactionNote(rec.siteReactionNote);
        setSystemicReactions(rec.systemicReactions);
        setSystemicReactionNote(rec.systemicReactionNote);
        setNotes(rec.notes);
      } else {
        setTakenLocal(toDateTimeLocalValue(new Date(`${date}T09:00`).toISOString()));
        setActualDose(m?.dose ?? '');
        setUnit(m?.unit ?? '');
      }
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [medId, date]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string): void => {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  const save = async (): Promise<void> => {
    setError('');
    try {
      await doseRecords.upsertForDate(medId, date, {
        status,
        takenAt: status === 'done' ? fromDateTimeLocalValue(takenLocal) : null,
        actualDose: status === 'done' ? actualDose : '',
        unit: status === 'done' ? unit : '',
        site: status === 'done' ? siteFree || site : '',
        siteReactions: status === 'done' ? siteReactions : [],
        siteReactionNote: status === 'done' ? siteReactionNote : '',
        systemicReactions: status === 'done' ? systemicReactions : [],
        systemicReactionNote: status === 'done' ? systemicReactionNote : '',
        notes,
      });
      toast.notify('保存しました');
      navigate(-1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    }
  };

  if (!loaded) {
    return (
      <AppShell title="投薬の記録" back>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }

  if (!med) {
    return (
      <AppShell title="投薬の記録" back>
        <p>薬が見つかりませんでした。</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="投薬の記録" back>
      <Card>
        <p className="card__lead mb0">{med.name}</p>
        <p className="card__sub mb0">予定日：{formatDateJa(date, { weekday: true })}</p>
        {existing ? (
          <p className="small muted mb0" style={{ marginTop: 6 }}>
            すでに保存されている記録を編集しています。
          </p>
        ) : null}
      </Card>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Card title="状態">
          <ChipSingleSelect
            label="この日の状態"
            options={doseStatusValues.map((v) => ({ value: v, label: doseStatusLabel[v] }))}
            value={status}
            onChange={setStatus}
          />
        </Card>

        {status === 'done' ? (
          <>
            <Card title="実施内容">
              <div className="field">
                <label className="field__label" htmlFor="taken-at">
                  実施日時
                </label>
                <input
                  id="taken-at"
                  type="datetime-local"
                  value={takenLocal}
                  onChange={(e) => setTakenLocal(e.currentTarget.value)}
                />
              </div>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <TextField
                    label="実際の量"
                    value={actualDose}
                    onChange={(e) => setActualDose(e.currentTarget.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="grow">
                  <TextField label="単位" value={unit} onChange={(e) => setUnit(e.currentTarget.value)} />
                </div>
              </div>
              <ChipSingleSelect
                label="注射部位・投与部位"
                options={SITE_OPTIONS.map((v) => ({ value: v, label: v }))}
                value={site || null}
                onChange={(v) => {
                  setSite(v);
                  setSiteFree('');
                }}
              />
              <TextField
                label="部位の自由記入（任意）"
                value={siteFree}
                onChange={(e) => setSiteFree(e.currentTarget.value)}
                placeholder="選択肢に無い場合はこちら"
              />
            </Card>

            <Card title="反応">
              <ChipMultiSelect
                label="注射部位の反応"
                options={SITE_REACTIONS}
                selected={siteReactions}
                onToggle={(v) => toggle(siteReactions, setSiteReactions, v)}
              />
              <TextField
                label="部位の反応の補足（任意）"
                value={siteReactionNote}
                onChange={(e) => setSiteReactionNote(e.currentTarget.value)}
              />
              <ChipMultiSelect
                label="全身の反応"
                options={SYSTEMIC_REACTIONS}
                selected={systemicReactions}
                onToggle={(v) => toggle(systemicReactions, setSystemicReactions, v)}
              />
              <TextField
                label="全身の反応の補足（任意）"
                value={systemicReactionNote}
                onChange={(e) => setSystemicReactionNote(e.currentTarget.value)}
              />
            </Card>
          </>
        ) : null}

        <Card title="メモ（任意）">
          <TextAreaField label="自由記入" value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        </Card>

        {error ? (
          <p className="notice notice--attention" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn btn--primary btn--block btn--big">
          保存する
        </button>
      </form>

      {existing ? (
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
            この記録を削除
          </button>
        </div>
      ) : null}

      {confirmDelete && existing ? (
        <ConfirmSheet
          title="この投薬記録を削除しますか"
          message="削除すると、この日の記録は予定のみの状態に戻ります。"
          confirmLabel="削除する"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void doseRecords.remove(existing.id).then(() => {
              toast.notify('削除しました');
              navigate(-1);
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
