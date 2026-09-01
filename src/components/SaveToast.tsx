import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastApi {
  /** 保存完了などを静かに知らせる（自動で消える） */
  notify: (message: string) => void;
}

const Ctx = createContext<ToastApi>({ notify: () => {} });

export function useToast(): ToastApi {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const notify = useCallback((m: string) => {
    setMessage(m);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 2200);
  }, []);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      {/* スクリーンリーダーにも保存完了が伝わるよう status ロールで通知 */}
      <div role="status" aria-live="polite" className="visually-hidden">
        {message ?? ''}
      </div>
      {message ? (
        <div className="save-toast no-print" aria-hidden="true">
          {message}
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
