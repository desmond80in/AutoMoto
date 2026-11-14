import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Tone = 'ok' | 'err';
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => undefined);

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; tone: Tone } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((text: string, tone: Tone = 'ok') => {
    setMsg({ text, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className={`toast${msg ? ' show' : ''}${msg?.tone === 'err' ? ' err' : ''}`} role="status" aria-live="polite">
        {msg?.text}
      </div>
    </Ctx.Provider>
  );
}
