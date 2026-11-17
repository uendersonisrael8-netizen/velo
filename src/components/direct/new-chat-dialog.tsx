"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserRound } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  searchDirectProfiles,
  startDirectConversation,
} from "@/lib/supabase/direct";
import type { Profile } from "@/lib/types";

export function NewChatDialog({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (conversationId: string, profile: Profile) => void;
}) {
  const { user } = useApp();
  const userId = user?.id ?? null;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;

    const current = ++requestId.current;
    const timer = window.setTimeout(
      () => {
        void searchDirectProfiles(supabase, query, userId)
          .then((rows) => {
            if (requestId.current !== current) return;
            setResults(rows);
            setError(null);
          })
          .catch(() => {
            if (requestId.current !== current) return;
            setError("Não consegui buscar pessoas agora.");
          })
          .finally(() => {
            if (requestId.current !== current) return;
            setLoading(false);
          });
      },
      query.trim() ? 300 : 0,
    );

    return () => window.clearTimeout(timer);
  }, [open, query, userId]);

  const handleClose = () => {
    setQuery("");
    setResults([]);
    setError(null);
    setStartingId(null);
    setLoading(true);
    onClose();
  };

  const start = async (profile: Profile) => {
    if (startingId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setStartingId(profile.id);
    try {
      const conversationId = await startDirectConversation(
        supabase,
        profile.id,
      );
      onStarted(conversationId, profile);
      handleClose();
    } catch {
      setError("Não consegui iniciar a conversa. Tente de novo.");
    } finally {
      setStartingId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      ariaLabel="Nova conversa"
      className="max-w-md"
    >
      <div className="px-5 pb-5 pt-6">
        <p className="eyebrow text-muted">mensagens</p>
        <h2 className="mt-1 font-editorial text-[30px] leading-none tracking-[-0.03em]">
          Nova conversa
        </h2>

        <div className="mt-5 flex items-center gap-2 rounded-[14px] border border-line bg-surface px-3">
          <Search className="size-4 text-muted" strokeWidth={1.7} />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLoading(true);
            }}
            placeholder="Buscar por nome ou @handle"
            aria-label="Buscar pessoas"
            className="h-11 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted"
          />
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted" />
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-[11px] text-red-400">{error}</p>
        ) : null}

        <div className="mt-4 max-h-[46vh] space-y-1 overflow-y-auto">
          {results.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => void start(profile)}
              disabled={Boolean(startingId)}
              className="flex w-full items-center gap-3 rounded-[13px] px-2 py-2 text-left transition hover:bg-surface disabled:opacity-60"
            >
              <Avatar
                name={profile.displayName}
                src={profile.avatarUrl}
                size={40}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">
                  {profile.displayName}
                </span>
                <span className="block truncate text-[10.5px] text-muted">
                  @{profile.handle}
                </span>
              </span>
              {startingId === profile.id ? (
                <Loader2 className="size-4 animate-spin text-muted" />
              ) : null}
            </button>
          ))}

          {!loading && !error && results.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <UserRound className="size-5 text-muted" strokeWidth={1.6} />
              <p className="text-[11.5px] text-muted">
                {query.trim()
                  ? "Nenhuma pessoa encontrada."
                  : "Ninguém por aqui ainda."}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
