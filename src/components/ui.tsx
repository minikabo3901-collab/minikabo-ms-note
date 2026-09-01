import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';

/* --------------------------------------------------------------- Field */

interface FieldProps {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  required?: boolean;
}

export function Field({ label, hint, children, required }: FieldProps): ReactNode {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="visually-hidden">（必須）</span> : null}
      </label>
      {children(id)}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField(
  props: { label: string; hint?: string; required?: boolean } & InputHTMLAttributes<HTMLInputElement>,
): ReactNode {
  const { label, hint, required, ...rest } = props;
  return (
    <Field label={label} hint={hint} required={required}>
      {(id) => <input id={id} type="text" {...rest} />}
    </Field>
  );
}

export function TextAreaField(
  props: { label: string; hint?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>,
): ReactNode {
  const { label, hint, ...rest } = props;
  return (
    <Field label={label} hint={hint}>
      {(id) => <textarea id={id} {...rest} />}
    </Field>
  );
}

export function SelectField(
  props: { label: string; hint?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>,
): ReactNode {
  const { label, hint, children, ...rest } = props;
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

/* ---------------------------------------------------------------- Chips */

interface ChipsProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: readonly string[];
  onToggle: (value: T) => void;
  hint?: string;
}

/** 複数選択チップ。色だけでなくチェック記号と aria-pressed で状態を伝える */
export function ChipMultiSelect<T extends string>({
  label,
  options,
  selected,
  onToggle,
  hint,
}: ChipsProps<T>): ReactNode {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
      <legend className="field__label" style={{ padding: 0 }}>
        {label}
      </legend>
      <div className="chips">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              className="chip"
              aria-pressed={on}
              onClick={() => onToggle(o)}
            >
              {o}
            </button>
          );
        })}
      </div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </fieldset>
  );
}

interface ChipSingleProps<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  hint?: string;
}

export function ChipSingleSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
}: ChipSingleProps<T>): ReactNode {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
      <legend className="field__label" style={{ padding: 0 }}>
        {label}
      </legend>
      <div className="chips">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </fieldset>
  );
}

/* ----------------------------------------------------------- ScaleInput */

interface ScaleInputProps {
  label: string;
  /** 各段階の日本語ラベル（数字だけにしない） */
  levels: readonly string[];
  value: number | null;
  onChange: (v: number) => void;
  hint?: string;
}

export function ScaleInput({ label, levels, value, onChange, hint }: ScaleInputProps): ReactNode {
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 18px' }}>
      <legend className="field__label" style={{ padding: 0 }}>
        {label}
      </legend>
      <div className="scale">
        <div className="scale__options" role="group" aria-label={label}>
          {levels.map((lv, i) => (
            <button
              key={i}
              type="button"
              className="scale__opt"
              aria-pressed={value === i}
              aria-label={`${label}: ${i} ${lv}`}
              onClick={() => onChange(i)}
            >
              <span aria-hidden="true">{i}</span>
              <span className="scale__opt-label" aria-hidden="true">
                {lv}
              </span>
            </button>
          ))}
        </div>
      </div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </fieldset>
  );
}

/** 0〜10 の強さ（数値と言葉の両方を出す） */
export function SeverityInput({
  label = '強さ',
  value,
  onChange,
  allowNull = false,
}: {
  label?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  allowNull?: boolean;
}): ReactNode {
  const id = useId();
  const word =
    value == null
      ? '未入力'
      : value === 0
        ? '症状なし'
        : value <= 3
          ? '軽い'
          : value <= 6
            ? '中くらい'
            : value <= 8
              ? '強い'
              : 'とても強い';
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}（0〜10）
      </label>
      <div className="row">
        <input
          id={id}
          type="range"
          min={0}
          max={10}
          step={1}
          value={value ?? 0}
          style={{ flex: 1, minHeight: 44 }}
          aria-valuetext={`${value ?? 0}：${word}`}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
        <output htmlFor={id} style={{ minWidth: 96, fontWeight: 700, textAlign: 'right' }}>
          {value == null ? '—' : value} / 10
        </output>
      </div>
      <p className="field__hint">
        現在の選択：{value == null ? '未入力' : `${value}（${word}）`}
        {allowNull && value != null ? (
          <>
            {' '}
            <button type="button" className="btn btn--ghost" onClick={() => onChange(null)}>
              未入力に戻す
            </button>
          </>
        ) : null}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ Segmented */

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}): ReactNode {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="segmented__btn"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Sheet */

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea, a[href]')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="row row--between" style={{ marginBottom: 8 }}>
          <h2 id={titleId} style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- ConfirmSheet */

export function ConfirmSheet({
  title,
  message,
  confirmLabel = '実行する',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode {
  return (
    <Sheet title={title} onClose={onCancel}>
      <div className="stack">
        <div>{message}</div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className={danger ? 'btn btn--danger' : 'btn btn--primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------- 汎用表示 */

export function EmptyState({ children }: { children: ReactNode }): ReactNode {
  return <p className="empty">{children}</p>;
}

export function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'ok' | 'attention' | 'accent';
}): ReactNode {
  const cls = tone === 'default' ? 'badge' : `badge badge--${tone}`;
  return <span className={cls}>{children}</span>;
}

export function Card({
  title,
  children,
  variant,
}: {
  title?: string;
  children: ReactNode;
  variant?: 'accent' | 'attention' | 'flat';
}): ReactNode {
  const cls = ['card', variant ? `card--${variant}` : ''].filter(Boolean).join(' ');
  return (
    <section className={cls}>
      {title ? <h2 className="card__title">{title}</h2> : null}
      {children}
    </section>
  );
}

/** 「急激または強い症状」向けの固定メッセージ（判断はアプリで行わない） */
export function UrgentNotice(): ReactNode {
  return (
    <p className="notice notice--attention" style={{ margin: '0 0 12px' }}>
      急激な症状や強い症状があるときは、アプリの記録や表示を待たずに担当医療機関へ相談してください。
    </p>
  );
}
