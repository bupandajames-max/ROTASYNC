import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail-safe: never crash if a toast is fired outside the provider.
    return {
      success: (m: string) => console.log('[toast.success]', m),
      error: (m: string) => console.warn('[toast.error]', m),
      info: (m: string) => console.log('[toast.info]', m),
    };
  }
  return ctx;
}

const KIND_STYLES: Record<ToastKind, { ring: string; iconBg: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  success: { ring: 'border-emerald-500/30', iconBg: 'bg-emerald-600', Icon: Check },
  error: { ring: 'border-rose-500/30', iconBg: 'bg-rose-600', Icon: AlertTriangle },
  info: { ring: 'border-indigo-500/30', iconBg: 'bg-indigo-600', Icon: Info },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, kind, message }]);
    window.setTimeout(() => remove(id), 4500);
  }, [remove]);

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-20 right-4 left-4 sm:left-auto sm:right-6 sm:max-w-sm z-[100] flex flex-col gap-2.5 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => {
            const style = KIND_STYLES[t.kind];
            const Icon = style.Icon;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                className={`pointer-events-auto bg-slate-950 border ${style.ring} text-white py-3 px-4 rounded-2xl shadow-2xl text-xs font-semibold leading-relaxed flex items-start gap-3`}
              >
                <div className={`p-1.5 ${style.iconBg} rounded-full text-white shrink-0 mt-0.5`}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={3} />
                </div>
                <span className="flex-1">{t.message}</span>
                <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-white transition-colors shrink-0 mt-0.5" aria-label="Dismiss">
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
