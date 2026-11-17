"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useApp } from "@/components/providers/app-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchDirectUnreadCount } from "@/lib/supabase/direct";

type DirectContextValue = {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
};

const DirectContext = createContext<DirectContextValue | null>(null);

const EMPTY_DIRECT: DirectContextValue = {
  unreadCount: 0,
  refreshUnread: async () => undefined,
};

/**
 * Mantém o badge de não lidas do Direct no menu. Escuta INSERTs em
 * `direct_messages` (o Realtime respeita a RLS) e usa polling lento como
 * fallback quando o Realtime não está habilitado no projeto.
 */
export function DirectProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useApp();
  const userId = user?.id ?? null;
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef<number | null>(null);

  const refreshUnread = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;

    try {
      setUnreadCount(await fetchDirectUnreadCount(supabase));
    } catch {
      // Se a migração ainda não foi aplicada, o app continua funcionando.
    }
  }, [userId]);

  useEffect(() => {
    if (!ready || !userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    void fetchDirectUnreadCount(supabase)
      .then((count) => {
        if (active) setUnreadCount(count);
      })
      .catch(() => {
        // Se a migração ainda não foi aplicada, o app continua funcionando.
      });

    const schedule = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void refreshUnread();
      }, 600);
    };

    const channel = supabase
      .channel(`direct-unread:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        schedule,
      )
      .subscribe();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshUnread();
    }, 30000);

    return () => {
      active = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [ready, refreshUnread, userId]);

  return (
    <DirectContext.Provider
      value={{ unreadCount: userId ? unreadCount : 0, refreshUnread }}
    >
      {children}
    </DirectContext.Provider>
  );
}

export function useDirectUnread() {
  return useContext(DirectContext) ?? EMPTY_DIRECT;
}
