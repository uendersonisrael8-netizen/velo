"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  MessageCircle,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { ChatThread } from "@/components/direct/chat-thread";
import { NewChatDialog } from "@/components/direct/new-chat-dialog";
import { CommentsPanel } from "@/components/feed/comments-panel";
import { PostLightbox } from "@/components/feed/post-lightbox";
import { useApp } from "@/components/providers/app-provider";
import { useDirectUnread } from "@/components/providers/direct-provider";
import { SEARCH_INPUT_PROPS } from "@/lib/input-suggestions";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchDirectConversations } from "@/lib/supabase/direct";
import type { DirectConversation, Post, Profile } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const PAGE_HEIGHT =
  "h-[calc(100dvh-62px-80px-env(safe-area-inset-bottom))] md:h-dvh";

function previewOf(conversation: DirectConversation, userId: string) {
  const last = conversation.lastMessage;
  if (!last) return "Diga oi 👋";
  const prefix = last.senderId === userId ? "Você: " : "";
  if (last.postId) return `${prefix}compartilhou um post`;
  return `${prefix}${last.body}`;
}

export function DirectView() {
  return (
    <Suspense fallback={<DirectSkeleton />}>
      <DirectContent />
    </Suspense>
  );
}

function DirectContent() {
  const searchParams = useSearchParams();
  const { user, ready } = useApp();
  const { unreadCount, refreshUnread } = useDirectUnread();
  const userId = user?.id ?? null;

  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [pendingConversation, setPendingConversation] =
    useState<DirectConversation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    searchParams.get("c"),
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [lightboxPost, setLightboxPost] = useState<Post | null>(null);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const load = useCallback(async (silent = false) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      const rows = await fetchDirectConversations(supabase);
      setConversations(rows);
      setPendingConversation((current) =>
        current && rows.some((row) => row.id === current.id) ? null : current,
      );
      setError(null);
    } catch {
      if (!silent) {
        setError(
          "Não consegui carregar suas conversas. Verifique a conexão e tente de novo.",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      void load(true);
      void refreshUnread();
    }, 500);
  }, [load, refreshUnread]);

  const selectConversation = useCallback((conversationId: string | null) => {
    setSelectedId(conversationId);
    if (conversationId) {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, unreadCount: 0 }
            : conversation,
        ),
      );
    }

    const next = conversationId
      ? `/direct?c=${encodeURIComponent(conversationId)}`
      : "/direct";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) window.history.replaceState(null, "", next);
  }, []);

  const handleStarted = useCallback(
    (conversationId: string, profile: Profile) => {
      setPendingConversation({
        id: conversationId,
        participant: profile,
        lastMessage: null,
        unreadCount: 0,
        updatedAt: new Date().toISOString(),
      });
      selectConversation(conversationId);
      void load(true);
    },
    [load, selectConversation],
  );

  useEffect(() => {
    if (!ready || !userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    void fetchDirectConversations(supabase)
      .then((rows) => {
        if (!active) return;
        setConversations(rows);
        setPendingConversation((current) =>
          current && rows.some((row) => row.id === current.id) ? null : current,
        );
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError(
          "Não consegui carregar suas conversas. Verifique a conexão e tente de novo.",
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ready, userId]);

  useEffect(() => {
    if (!ready || !userId) return;
    void refreshUnread();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`direct-conversations:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => scheduleRefresh(),
      )
      .subscribe();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 15000);

    return () => {
      window.clearInterval(interval);
      if (refreshTimer.current) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [load, ready, refreshUnread, scheduleRefresh, userId]);

  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(window.location.search).get("c");
      setSelectedId(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const last = conversation.lastMessage;
      return (
        conversation.participant.displayName.toLowerCase().includes(term) ||
        conversation.participant.handle.toLowerCase().includes(term) ||
        (last?.body ?? "").toLowerCase().includes(term)
      );
    });
  }, [conversations, query]);

  const selectedConversation = useMemo(() => {
    if (!selectedId) return null;
    return (
      conversations.find((conversation) => conversation.id === selectedId) ??
      (pendingConversation?.id === selectedId ? pendingConversation : null)
    );
  }, [conversations, pendingConversation, selectedId]);

  if (!ready) return <DirectSkeleton />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-62px-80px-env(safe-area-inset-bottom))] w-full max-w-lg items-center justify-center px-4 py-10 md:min-h-dvh">
        <EmptyState
          icon={<MessageCircle className="size-4" strokeWidth={1.6} />}
          eyebrow="mensagens privadas"
          title="Entre para conversar."
          body="O Direct guarda suas conversas, os vídeos compartilhados e o que ainda você não leu. Só você e a outra pessoa veem."
          action={
            <Link
              href="/login"
              className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              entrar
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1280px] overflow-hidden bg-paper md:border-x md:border-line",
        PAGE_HEIGHT,
      )}
    >
      <section
        aria-label="Conversas"
        className={cn(
          "h-full w-full shrink-0 flex-col border-line md:flex md:w-[336px] md:border-r",
          selectedId ? "hidden" : "flex",
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-6">
          <div>
            <p className="eyebrow text-muted">mensagens</p>
            <h1 className="mt-1.5 font-editorial text-[34px] leading-none tracking-[-0.035em]">
              Direct
            </h1>
            {unreadCount > 0 ? (
              <p className="mt-1.5 text-[9.5px] font-medium text-accent">
                {unreadCount === 1
                  ? "1 mensagem não lida"
                  : `${unreadCount} mensagens não lidas`}
              </p>
            ) : (
              <p className="mt-1.5 text-[9.5px] text-muted">
                conversas só suas
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            aria-label="Nova conversa"
            title="Nova conversa"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:border-line-strong hover:bg-elevated active:scale-95"
          >
            <Pencil className="size-4" strokeWidth={1.7} />
          </button>
        </header>

        <div className="shrink-0 px-4 pb-3">
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 transition focus-within:border-accent/60">
            <Search className="size-4 shrink-0 text-muted" strokeWidth={1.7} />
            <input
              {...SEARCH_INPUT_PROPS}
              autoComplete="on"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar conversa"
              aria-label="Buscar conversa"
              className="h-10 min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="flex size-6 items-center justify-center rounded-full text-muted transition hover:bg-paper hover:text-ink"
              >
                <X className="size-3.5" strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
          {loading ? (
            <div className="space-y-4 px-4 pt-2">
              {[0, 1, 2, 3, 4].map((index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="skeleton size-11 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="skeleton block h-2.5 w-28 rounded-full" />
                    <span className="skeleton block h-2 w-40 max-w-full rounded-full" />
                  </span>
                </div>
              ))}
            </div>
          ) : error && conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full border border-line bg-surface text-muted">
                <MessageCircle className="size-5" strokeWidth={1.6} />
              </span>
              <p className="font-editorial text-[27px] leading-none tracking-[-0.02em]">
                O Direct não abriu.
              </p>
              <p className="max-w-[250px] text-[11px] leading-relaxed text-muted">
                {error}
              </p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
                className="mt-1 rounded-full border border-line px-4 py-2 text-[10px] font-semibold transition hover:border-line-strong"
              >
                Tentar de novo
              </button>
            </div>
          ) : filtered.length ? (
            filtered.map((conversation) => {
              const active = selectedId === conversation.id;
              const unread = conversation.unreadCount > 0;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => selectConversation(conversation.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                    active ? "bg-surface" : "hover:bg-surface/60",
                  )}
                >
                  <Avatar
                    name={conversation.participant.displayName}
                    src={conversation.participant.avatarUrl}
                    size={46}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px] font-semibold leading-tight">
                        {conversation.participant.displayName}
                      </span>
                      <span className="shrink-0 text-[8.5px] text-muted">
                        {conversation.lastMessage
                          ? timeAgo(conversation.lastMessage.createdAt)
                          : ""}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-[10.5px] leading-relaxed",
                          unread ? "font-medium text-ink" : "text-muted",
                        )}
                      >
                        {previewOf(conversation, user.id)}
                      </span>
                      {unread ? (
                        <span className="flex h-[17px] min-w-[17px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[8px] font-bold tabular-nums text-[#0a0a0a]">
                          {conversation.unreadCount > 99
                            ? "99+"
                            : conversation.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })
          ) : query.trim() ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Search className="size-5 text-muted" strokeWidth={1.6} />
              <p className="text-[11.5px] text-muted">
                Nenhuma conversa com “{query.trim()}”.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-[10px] font-semibold text-accent"
              >
                limpar busca
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full border border-line bg-surface text-muted">
                <MessageCircle className="size-5" strokeWidth={1.6} />
              </span>
              <p className="font-editorial text-[27px] leading-none tracking-[-0.02em]">
                Nada por aqui ainda.
              </p>
              <p className="max-w-[240px] text-[11px] leading-relaxed text-muted">
                Comece uma conversa com alguém do velo ou envie um vídeo direto
                do feed.
              </p>
              <button
                type="button"
                onClick={() => setNewChatOpen(true)}
                className="mt-1 flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
              >
                nova conversa
              </button>
            </div>
          )}
        </div>

        {error && conversations.length > 0 ? (
          <div className="shrink-0 border-t border-line px-4 py-2.5">
            <p className="text-[9px] leading-relaxed text-red-400">{error}</p>
          </div>
        ) : null}
      </section>

      <section
        aria-label="Conversa"
        className={cn(
          "h-full min-w-0 flex-1",
          selectedId ? "block" : "hidden md:block",
        )}
      >
        {selectedConversation ? (
          <ChatThread
            key={selectedConversation.id}
            conversation={selectedConversation}
            onBack={() => selectConversation(null)}
            onActivity={scheduleRefresh}
            onOpenPost={setLightboxPost}
          />
        ) : selectedId ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            {loading ? (
              <Loader2 className="size-5 animate-spin text-muted" />
            ) : (
              <>
                <span className="flex size-12 items-center justify-center rounded-full border border-line bg-surface text-muted">
                  <MessageCircle className="size-5" strokeWidth={1.6} />
                </span>
                <p className="font-editorial text-[28px] leading-none tracking-[-0.02em]">
                  Conversa não encontrada.
                </p>
                <p className="max-w-[250px] text-[11px] leading-relaxed text-muted">
                  Ela pode ter sido removida ou ainda está carregando. Volte
                  para a lista e tente de novo.
                </p>
                <button
                  type="button"
                  onClick={() => selectConversation(null)}
                  className="mt-1 rounded-full border border-line px-4 py-2 text-[10px] font-semibold transition hover:border-line-strong"
                >
                  Voltar para o Direct
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-full border border-line bg-surface text-muted">
              <MessageCircle className="size-6" strokeWidth={1.5} />
            </span>
            <p className="mt-1 font-editorial text-[34px] leading-none tracking-[-0.03em]">
              Suas mensagens.
            </p>
            <p className="max-w-[300px] text-[11.5px] leading-relaxed text-muted">
              Escolha uma conversa ao lado ou comece uma nova com alguém do
              velo. Os posts compartilhados aparecem aqui com a miniatura.
            </p>
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="mt-2 flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              <Pencil className="size-3.5" strokeWidth={1.9} />
              nova conversa
            </button>
          </div>
        )}
      </section>

      <NewChatDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onStarted={handleStarted}
      />

      <PostLightbox
        post={lightboxPost}
        onClose={() => setLightboxPost(null)}
        onOpenComments={(post) => {
          setLightboxPost(null);
          setCommentsPost(post);
        }}
      />
      {commentsPost ? (
        <CommentsPanel
          key={commentsPost.id}
          post={commentsPost}
          onClose={() => setCommentsPost(null)}
        />
      ) : null}
    </div>
  );
}

function DirectSkeleton() {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1280px] overflow-hidden md:border-x md:border-line",
        PAGE_HEIGHT,
      )}
    >
      <div className="w-full shrink-0 border-line px-5 py-6 md:w-[336px] md:border-r">
        <span className="skeleton block h-3 w-16 rounded-full" />
        <span className="skeleton mt-3 block h-9 w-32 rounded-full" />
        <span className="skeleton mt-6 block h-10 w-full rounded-full" />
        <div className="mt-5 space-y-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="skeleton size-11 shrink-0 rounded-full" />
              <span className="min-w-0 flex-1 space-y-2">
                <span className="skeleton block h-2.5 w-28 rounded-full" />
                <span className="skeleton block h-2 w-40 max-w-full rounded-full" />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden flex-1 items-center justify-center md:flex">
        <span className="skeleton size-16 rounded-full" />
      </div>
    </div>
  );
}
