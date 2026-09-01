import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Card, ScaleInput, TextAreaField } from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { weeklyChecks } from '@/db/repo';
import { WEEKLY_FLAGS, WEEKLY_SCALES, type WeeklyFlagKey } from '@/features/weekly/labels';
import type { WeeklyCheck, WeeklyScoreKey } from '@/db/types';
import { formatDateJa, todayISO, weekStartOf } from '@/lib/date';
import { autoSaveLabel, useAutoSave } from '@/lib/useAutoSave';

type Scores = WeeklyCheck['scores'];
type Flags = WeeklyCheck['flags'];

const EMPTY_SCORES: Scores = { fatigue: null, cognition: null, walking: null, hands: null, sleep: null };
const EMPTY_FLAGS: Flags = {
  newSymptom: false,
  worsenedSymptom: false,
  feverOrInfection: false,
  heat: false,
  sleepDeprivation: false,
  exertion: false,
  stress: false,
};

/**
 * 週1回のチェック。
 * 「先週とほぼ変化なし」を選んだ場合は確認後すぐ完了できる。
 * 「変化がある」を選んだ場合だけ詳細項目を開く（目標入力時間 30 秒程度）。
 */
export function WeeklyCheckPage(): ReactNode {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const today = todayISO();
  const weekStart = weekStartOf(today);

  const [mode, setMode] = useState<'select' | 'nochange' | 'change'>(() => {
    const m = params.get('mode');
    return m === 'nochange' ? 'nochange' : m === 'change' ? 'change' : 'select';
  });
  const [scores, setScores] = useState<Scores>(EMPTY_SCORES);
  const [flags, setFlags] = useState<Flags>(EMPTY_FLAGS);
  const [notes, setNotes] = useState('');
  const [existing, setExisting] = useState<WeeklyCheck | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    weeklyChecks.forWeek(weekStart).then((w) => {
      if (!alive) return;
      if (w) {
        setExisting(w);
        setScores(w.scores);
        setFlags(w.flags);
        setNotes(w.notes);
        if (params.get('mode') === null) setMode(w.noChange ? 'nochange' : 'change');
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [weekStart, params]);

  // 「変化がある」の詳細入力は、すべて任意項目なので自動保存する
  const draft = useMemo(() => ({ scores, flags, notes }), [scores, flags, notes]);
  const savedAt = useAutoSave(
    draft,
    async (d) => {
      await weeklyChecks.saveForWeek(weekStart, {
        recordedDate: today,
        noChange: false,
        scores: d.scores,
        flags: d.flags,
        notes: d.notes,
      });
    },
    loaded && mode === 'change',
  );

  const save = async (noChange: boolean): Promise<void> => {
    await weeklyChecks.saveForWeek(weekStart, {
      recordedDate: today,
      noChange,
      scores: noChange ? EMPTY_SCORES : scores,
      flags: noChange ? EMPTY_FLAGS : flags,
      notes: noChange ? '' : notes,
    });
    toast.notify('保存しました');
    navigate('/');
  };

  if (!loaded) {
    return (
      <AppShell title="今週のチェック" back>
        <p className="muted" role="status">
          読み込み中…
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="今週のチェック" back>
      <p className="small muted">
        対象の週：{formatDateJa(weekStart, { weekday: true })} から
        {existing ? '（記録済みの内容を編集しています）' : ''}
      </p>

      {mode === 'select' ? (
        <Card>
          <p className="card__lead">先週と比べていかがですか</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--big" onClick={() => setMode('nochange')}>
              先週とほぼ変化なし
            </button>
            <button type="button" className="btn btn--big" onClick={() => setMode('change')}>
              変化がある
            </button>
          </div>
        </Card>
      ) : null}

      {mode === 'nochange' ? (
        <Card>
          <p className="card__lead">先週とほぼ変化なし</p>
          <p className="card__sub">この内容で今週のチェックを完了します。</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary btn--big" onClick={() => void save(true)}>
              この内容で完了
            </button>
            <button type="button" className="btn" onClick={() => setMode('change')}>
              やっぱり変化がある
            </button>
          </div>
        </Card>
      ) : null}

      {mode === 'change' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          <Card title="この1週間の状態">
            {WEEKLY_SCALES.map((s) => (
              <ScaleInput
                key={s.key}
                label={s.label}
                levels={s.levels}
                value={scores[s.key as WeeklyScoreKey]}
                onChange={(v) => setScores((prev) => ({ ...prev, [s.key]: v }))}
              />
            ))}
          </Card>

          <Card title="この1週間にあてはまるもの">
            <div className="chips">
              {WEEKLY_FLAGS.map((f) => {
                const on = flags[f.key as WeeklyFlagKey];
                return (
                  <button
                    key={f.key}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    onClick={() => setFlags((prev) => ({ ...prev, [f.key]: !prev[f.key as WeeklyFlagKey] }))}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <p className="small muted" role="status" aria-live="polite">
            {autoSaveLabel(savedAt)}
          </p>

          <Card title="メモ（任意）">
            <TextAreaField
              label="気づいたこと"
              value={notes}
              onChange={(e) => setNotes(e.currentTarget.value)}
              placeholder="任意です。空欄のままでも保存できます。"
            />
          </Card>

          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setMode('select')}>
              最初に戻る
            </button>
            <button type="submit" className="btn btn--primary btn--big">
              保存する
            </button>
          </div>
        </form>
      ) : null}
    </AppShell>
  );
}
