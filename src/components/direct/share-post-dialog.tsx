"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, Search, Send, UserRound } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useDirectUnread } from "@/components/providers/direct-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SEARCH_INPUT_PROPS } from "@/lib/input-suggestions";
import {
  fetchDirectConversations,
  searchDirectProfiles,
  sendDirectMessage,
  startDirectConversation,
} from "@/lib/supabase/direct";
import type { DirectConversation, Post, Profile } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

export function SharePostDialog({
  post,
  open,
  onClose,
  onSent,
}: {
  post: Post;
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const { user } = useApp();
  const userId = user?.id ?? null;
  const { refreshUnread } = useDirectUnread();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const poster =
    post.posterUrl || (post.mediaType === "image" ? post.mediaUrl : null);

  useEffect(() => {
    if (!open) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;

    let active = true;
    void fetchDirectConversations(supabase)
      .then((rows) => {
        if (!active) return;
        setConversations(rows);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Não consegui carregar suas conversas.");
      })
      .finally(() => {
        if (!active) return;
        setLoadingConversations(false);
      });

    return () => {
      active = false;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;

    const current = ++requestId.current;
    const timer = window.setTimeout(() => {
      void searchDirectProfiles(supabase, term, userId)
        .then((rows) => {
          if (requestId.current !== current) return;
          setPeople(rows);
          setError(null);
        })
        .catch(() => {
          if (requestId.current !== current) return;
          setError("Não consegui buscar pessoas agora.");
        })
        .finally(() => {
          if (requestId.current !== current) return;
          setLoadingPeople(false);
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, query, userId]);

  const handleClose = () => {
    setQuery("");
    setConversations([]);
    setPeople([]);
    setError(null);
    setSendingKey(null);
    setLoadingConversations(true);
    setLoadingPeople(false);
    onClose();
  };

  const sendToConversation = async (conversation: DirectConversation) => {
    if (sendingKey) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;

    setSendingKey(conversation.id);
    try {
      await sendDirectMessage(supabase, {
        conversationId: conversation.id,
        senderId: userId,
        postId: post.id,
      });
      toast(`Enviado para @${conversation.participant.handle}.`, "success");
      void refreshUnread();
      onSent?.();
      handleClose();
    } catch {
      toast("Não consegui enviar o post.", "error");
    } finally {
      setSendingKey(null);
    }
  };

  const sendToProfile = async (profile: Profile) => {
    if (sendingKey) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;

    setSendingKey(profile.id);
    try {
      const conversationId = await startDirectConversation(
        supabase,
        profile.id,
      );
      await sendDirectMessage(supabase, {
        conversationId,
        senderId: userId,
        postId: post.id,
      });
      toast(`Enviado para @${profile.handle}.`, "success");
      void refreshUnread();
      onSent?.();
      handleClose();
    } catch {
      toast("Não consegui enviar o post.", "error");
    } finally {
      setSendingKey(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/#${post.id}`,
      );
      toast("Link copiado.", "success");
    } catch {
      toast("Não consegui copiar o link.", "error");
    }
  };

  const searching = Boolean(query.trim());
  const busy = loadingConversations || loadingPeople;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      ariaLabel="Enviar post no Direct"
      className="max-w-md"
    >
      <div className="px-5 pb-5 pt-6">
        <p className="eyebrow text-muted">Direct</p>
        <h2 className="mt-1 font-editorial text-[30px] leading-none tracking-[-0.03em]">
          Enviar para...
        </h2>

        <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-line bg-surface p-2.5">
          <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-[8px] bg-black/10">
            {poster ? (
              <img
                src={poster}
                alt=""
                className="size-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : (
              <video
                src={post.mediaUrl}
                className="size-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            )}
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 block text-[11.5px] font-medium leading-snug">
              {post.caption || "Post do velo"}
            </span>
            <span className="mt-1 block text-[9.5px] text-muted">
              @{post.author.handle} ·{" "}
              {post.mediaType === "video" ? "vídeo" : "foto"}
            </span>
          </span>
        </div>

        {userId ? (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-line bg-surface px-3">
              <Search className="size-4 text-muted" strokeWidth={1.7} />
              <input
                {...SEARCH_INPUT_PROPS}
                autoComplete="on"
                value={query}
                onChange={(event) => {
                  const value = event.target.value;
                  setQuery(value);
                  setLoadingPeople(Boolean(value.trim()));
                }}
                placeholder="Buscar pessoa ou conversa"
                aria-label="Buscar pessoa para enviar"
                className="h-11 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted"
              />
              {busy ? (
                <Loader2 className="size-4 animate-spin text-muted" />
              ) : null}
            </div>

        {error ? (
          <p className="mt-3 text-[11px] text-red-400">{error}</p>
        ) : null}

        <p className="mt-4 text-[8px] uppercase tracking-[0.14em] text-muted">
          {searching ? "pessoas" : "conversas recentes"}
        </p>

        <div className="mt-2 max-h-[38vh] space-y-1 overflow-y-auto">
          {searching
            ? people.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => void sendToProfile(profile)}
                  disabled={Boolean(sendingKey)}
                  className="flex w-full items-center gap-3 rounded-[13px] px-2 py-2 text-left transition hover:bg-surface disabled:opacity-60"
                >
                  <Avatar
                    name={profile.displayName}
                    src={profile.avatarUrl}
                    size={38}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold">
                      {profile.displayName}
                    </span>
                    <span className="block truncate text-[10px] text-muted">
                      @{profile.handle}
                    </span>
                  </span>
                  {sendingKey === profile.id ? (
                    <Loader2 className="size-4 animate-spin text-muted" />
                  ) : (
                    <Send className="size-4 text-muted" strokeWidth={1.7} />
                  )}
                </button>
              ))
            : conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void sendToConversation(conversation)}
                  disabled={Boolean(sendingKey)}
                  className="flex w-full items-center gap-3 rounded-[13px] px-2 py-2 text-left transition hover:bg-surface disabled:opacity-60"
                >
                  <Avatar
                    name={conversation.participant.displayName}
                    src={conversation.participant.avatarUrl}
                    size={38}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold">
                      {conversation.participant.displayName}
                    </span>
                    <span className="block truncate text-[10px] text-muted">
                      {conversation.lastMessage
                        ? `${conversation.lastMessage.senderId === userId ? "Você: " : ""}${conversation.lastMessage.postId ? "compartilhou um post" : conversation.lastMessage.body}`
                        : `@${conversation.participant.handle}`}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-[8.5px] text-muted">
                      {conversation.lastMessage
                        ? timeAgo(conversation.lastMessage.createdAt)
                        : ""}
                    </span>
                    {sendingKey === conversation.id ? (
                      <Loader2 className="size-4 animate-spin text-muted" />
                    ) : (
                      <Send className="size-4 text-muted" strokeWidth={1.7} />
                    )}
                  </span>
                </button>
              ))}

          {!busy && !error && searching && people.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <UserRound className="size-5 text-muted" strokeWidth={1.6} />
              <p className="text-[11.5px] text-muted">
                Nenhuma pessoa encontrada.
              </p>
            </div>
          ) : null}

          {!busy && !error && !searching && conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <UserRound className="size-5 text-muted" strokeWidth={1.6} />
              <p className="max-w-[240px] text-[11.5px] leading-relaxed text-muted">
                Nenhuma conversa ainda. Busque uma pessoa acima para começar.
              </p>
            </div>
          ) : null}
        </div>

            <p className={cn("mt-4 text-[9px] leading-relaxed text-muted")}>
              O post aparece na conversa com a miniatura, a legenda e o link
              para abrir no velo.
            </p>
          </>
        ) : (
          <div className="mt-5 rounded-[14px] border border-line bg-surface px-4 py-6 text-center">
            <p className="text-[12.5px] font-semibold">
              Entre para enviar no Direct.
            </p>
            <p className="mx-auto mt-1.5 max-w-[260px] text-[10.5px] leading-relaxed text-muted">
              As conversas ficam privadas na sua conta e o post chega com a
              miniatura.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              entrar
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={() => void copyLink()}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-[9.5px] font-semibold text-muted transition hover:border-line-strong hover:text-ink"
        >
          <Copy className="size-3.5" strokeWidth={1.7} />
          copiar link do post
        </button>
      </div>
    </Dialog>
  );
}
