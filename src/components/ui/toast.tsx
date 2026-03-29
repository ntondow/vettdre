"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  dismissing?: boolean;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  error: 8000,
};

const MAX_TOASTS = 3;

let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = `toast-${++idCounter}`;
    setToasts((prev) => {
      const next = [...prev, { id, message, type }];
      // Trim to MAX_TOASTS (remove oldest)
      if (next.length > MAX_TOASTS) return next.slice(next.length - MAX_TOASTS);
      return next;
    });
    const timer = setTimeout(() => dismiss(id), DURATIONS[type]);
    timers.current.set(id, timer);
  }, [dismiss]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const colors: Record<ToastType, string> = {
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-slate-800 text-white",
  };

  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "!",
    info: "i",
  };

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container: top-center on mobile, top-right on desktop */}
      <div className="fixed top-3 left-3 right-3 md:left-auto md:right-4 md:top-4 md:w-[360px] z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg transition-all duration-200 ${colors[t.type]} ${
              t.dismissing ? "opacity-0 translate-y-[-8px]" : "opacity-100 translate-y-0"
            }`}
            style={{ animation: t.dismissing ? undefined : "slide-up 200ms ease-out" }}
          >
            <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white/20 text-sm font-bold shrink-0">
              {icons[t.type]}
            </span>
            <span className="flex-1 text-sm font-medium">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors text-lg shrink-0"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
