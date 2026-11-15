"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, Check, X } from "lucide-react";
import { cn, createId } from "@/lib/utils";
import type { ToastKind } from "@/lib/types";

type Toast = {
  id: string;
  message: string;
  kind: ToastKind;
};

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "default") => {
      if (!message) return;
      const id = createId("toast");
      setItems((current) => [...current.slice(-2), { id, message, kind }]);
      const timer = window.setTimeout(() => dismiss(id), 3800);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-8"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "toast-enter pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-full border px-4 py-3 text-[13px] shadow-2xl backdrop-blur-xl",
              item.kind === "error"
                ? "border-red-500/25 bg-red-500/12 text-red-100"
                : "border-white/10 bg-[#111]/90 text-white",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full",
                item.kind === "error"
                  ? "bg-red-500/15 text-red-300"
                  : "bg-accent text-[#0a0a0a]",
              )}
            >
              {item.kind === "error" ? (
                <AlertCircle className="size-3.5" strokeWidth={1.8} />
              ) : (
                <Check className="size-3.5" strokeWidth={2} />
              )}
            </span>
            <span className="flex-1 leading-snug">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded-full p-1 text-white/45 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar aviso"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast precisa estar dentro de ToastProvider.");
  return context;
}
