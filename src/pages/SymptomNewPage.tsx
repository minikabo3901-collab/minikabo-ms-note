import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import {
  Card,
  ChipMultiSelect,
  ChipSingleSelect,
  SeverityInput,
  TextAreaField,
  TextField,
  UrgentNotice,
} from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { symptomEvents } from '@/db/repo';
import {
  adlImpactLabel,
  adlImpactValues,
  bodyPartOptions,
  onsetTypeLabel,
  onsetTypeValues,
  symptomCategories,
  symptomContextOptions,
  symptomKindLabel,
  symptomKindValues,
  type AdlImpact,
  type OnsetType,
  type SymptomKind,
} from '@/db/types';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/date';

export function SymptomNewPage(): ReactNode {
  const navigate = useNavigate();
  const toast = useToast();

  const [kind, setKind] = useState<SymptomKind>('new');
  const [categories, setCategories] = useState<string[]>([]);
  const [bodyParts, setBodyParts] = useState<string[]>([]);
  const [bodyPartsNote, setBodyPartsNote] = useState('');
  const [onsetLocal, setOnsetLocal] = useState(() => toDateTimeLocalValue(null));
  const [onsetType, setOnsetType] = useState<OnsetType>('gradual');
  const [severity, setSeverity] = useState<number | null>(3);
  const [adlImpact, setAdlImpact] = useState<AdlImpact>('none');
  const [context, setContext] = useState<string[]>([]);
  const [contextNote, setContextNote] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const toggle = (list: string[], set: (v: string[]) => void, v: string): void => {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  const submit = async (): Promise<void> => {
    setError('');
    try {
      const ev = await symptomEvents.create({
        kind,
        categories,
        bodyParts,
        bodyPartsNote,
        onsetAt: fromDateTimeLocalValue(onsetLocal),
        onsetType,
        status: 'ongoing',
        recoveredAt: null,
        severity: severity ?? 0,
        adlImpact,
        context,
        contextNote,
        notes,
      });
      toast.notify('保存しました');
      navigate(`/symptom/${ev.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした');
    }
  };

  return (
    <AppShell title="症状の変化を記録" back>
      <UrgentNotice />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Card title="基本情報">
          <ChipSingleSelect
            label="種類"
            options={symptomKindValues.map((v) => ({ value: v, label: symptomKindLabel[v] }))}
            value={kind}
            onChange={setKind}
          />
          <div className="field">
            <label className="field__label" htmlFor="onset">
              開始日時
            </label>
            <input
              id="onset"
              type="datetime-local"
              value={onsetLocal}
              onChange={(e) => setOnsetLocal(e.currentTarget.value)}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '10px 12px',
                fontSize: '1rem',
              }}
            />
          </div>
          <ChipSingleSelect
            label="始まり方"
            options={onsetTypeValues.map((v) => ({ value: v, label: onsetTypeLabel[v] }))}
            value={onsetType}
            onChange={setOnsetType}
          />
        </Card>

        <Card title="症状の分類（複数選択できます）">
          <ChipMultiSelect
            label="分類"
            options={symptomCategories}
            selected={categories}
            onToggle={(v) => toggle(categories, setCategories, v)}
          />
          <ChipMultiSelect
            label="部位"
            options={bodyPartOptions}
            selected={bodyParts}
            onToggle={(v) => toggle(bodyParts, setBodyParts, v)}
          />
          <TextField
            label="部位の補足（任意）"
            value={bodyPartsNote}
            onChange={(e) => setBodyPartsNote(e.currentTarget.value)}
            placeholder="自由に記入できます"
          />
        </Card>

        <Card title="強さと生活への影響">
          <SeverityInput value={severity} onChange={setSeverity} />
          <ChipSingleSelect
            label="普段の生活への影響"
            options={adlImpactValues.map((v) => ({ value: v, label: adlImpactLabel[v] }))}
            value={adlImpact}
            onChange={setAdlImpact}
          />
        </Card>

        <Card title="状況・背景（複数選択できます）">
          <ChipMultiSelect
            label="あてはまるもの"
            options={symptomContextOptions}
            selected={context}
            onToggle={(v) => toggle(context, setContext, v)}
          />
          <TextField
            label="状況の補足（任意）"
            value={contextNote}
            onChange={(e) => setContextNote(e.currentTarget.value)}
          />
        </Card>

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
    </AppShell>
  );
}
