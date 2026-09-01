import { useEffect, useRef, useState } from 'react';

/**
 * 入力内容の自動保存。
 *
 * - 変更が止まってから delay ミリ秒後に保存する
 * - 画面遷移（アンマウント）時に、未保存分があれば書き出す
 * - 保存完了は「静かに」表示するため、時刻だけを返す（アラートは出さない）
 *
 * 必須項目のあるフォーム（薬・症状イベントの新規作成など）では使わない。
 * すべての項目が任意で、部分的に保存されても内容が壊れない画面だけで使用する。
 */
export function useAutoSave<T>(
  value: T,
  save: (v: T) => Promise<unknown>,
  enabled: boolean,
  delay = 900,
): Date | null {
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const saveRef = useRef(save);
  saveRef.current = save;
  const valueRef = useRef(value);
  valueRef.current = value;

  const pending = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    // 初期値では保存しない（画面を開いただけで記録を作らないため）
    if (!started.current) {
      started.current = true;
      return;
    }
    pending.current = true;
    const timer = window.setTimeout(() => {
      pending.current = false;
      void saveRef
        .current(valueRef.current)
        .then(() => setSavedAt(new Date()))
        .catch(() => {
          /* 保存できなかった場合は次の変更で再試行する */
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [value, enabled, delay]);

  useEffect(
    () => () => {
      if (pending.current) void saveRef.current(valueRef.current);
    },
    [],
  );

  return savedAt;
}

/** 自動保存の状態を静かに知らせる文言 */
export function autoSaveLabel(savedAt: Date | null): string {
  if (!savedAt) return '入力すると自動的に保存されます';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `自動保存しました（${p(savedAt.getHours())}:${p(savedAt.getMinutes())}）`;
}
