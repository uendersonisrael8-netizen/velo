"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowLeft, Loader2, MessageCircle, Send } from "lucide-react";
import { SharedPostCard } from "@/components/direct/shared-post-card";
import { useApp } from "@/components/providers/app-provider";
import { useDirectUnread } from "@/components/providers/direct-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchDirectMessages,
  markDirectRead,
  sendDirectMessage,
} from "@/lib/supabase/direct";
import type { DirectConversation, DirectMessage, Post } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "hoje";
  if (sameDay(date, yesterday)) return "ontem";
  return dayFormatter.format(date);
}

export function ChatThread({
  conversation,
  onBack,
  onActivity,
  onOpenPost,
}: {
  conversation: DirectConversation;
  onBack: () => void;
  onActivity: () => void;
  onOpenPost: (post: Post) => void;
}) {
  const { user } = useApp();
  const { refreshUnread } = useDirectUnread();
  const { toast } = useToast();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const load = useCallback(
    async (silent = false) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return [] as DirectMessage[];
      try {
        const items = await fetchDirectMessages(supabase, conversation.id);
        setMessages(items);
        setError(null);
        return items;
      } catch {
        if (!silent) setError("Não consegui carregar esta conversa.");
        return [] as DirectMessage[];
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [conversation.id],
  );

  const markRead = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    try {
      await markDirectRead(supabase, conversation.id);
      await refreshUnread();
    } catch {
      // A conversa continua utilizável mesmo se a RPC de leitura falhar.
    }
  }, [conversation.id, refreshUnread]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let active = true;
    void fetchDirectMessages(supabase, conversation.id)
      .then((items) => {
        if (!active) return;
        setMessages(items);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Não consegui carregar esta conversa.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [conversation.id]);

  useEffect(() => {
    void markRead();
  }, [markRead]);

  useEffect(() => {
    if (!loading) scrollToBottom("auto");
  }, [conversation.id, loading, scrollToBottom]);

  useEffect(() => {
    if (!loading) scrollToBottom("smooth");
  }, [loading, messages.length, scrollToBottom]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`direct-thread:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => {
          void load(true).then(() => {
            void markRead();
          });
        },
      )
      .subscribe();

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load(true).then((items) => {
        const last = items[items.length - 1];
        if (last && last.sender.id !== user?.id) void markRead();
      });
    }, 6000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, load, markRead, user?.id]);

  const send = useCallback(async () => {
    const text = body.trim();
    if (!text || sending) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;

    setSending(true);
    try {
      const message = await sendDirectMessage(supabase, {
        conversationId: conversation.id,
        senderId: user.id,
        body: text,
      });
      setMessages((previous) => [...previous, message]);
      setBody("");
      onActivity();
      void refreshUnread();
    } catch {
      toast("Não consegui enviar agora. Tente de novo.", "error");
    } finally {
      setSending(false);
    }
  }, [
    body,
    conversation.id,
    onActivity,
    refreshUnread,
    sending,
    toast,
    user,
  ]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-paper">
      <header className="flex h-[64px] shrink-0 items-center gap-2 border-b border-line px-3 md:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar para as conversas"
          className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-ink md:hidden"
        >
          <ArrowLeft className="size-[18px]" strokeWidth={1.8} />
        </button>
        <Link
          href={`/u/${conversation.participant.handle}`}
          className="flex min-w-0 items-center gap-3 rounded-[14px] px-1 py-1 transition hover:bg-surface"
        >
          <Avatar
            name={conversation.participant.displayName}
            src={conversation.participant.avatarUrl}
            size={38}
          />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight">
              {conversation.participant.displayName}
            </span>
            <span className="block truncate text-[10.5px] text-muted">
              @{conversation.participant.handle}
            </span>
          </span>
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-6">
        {loading ? (
          <div className="space-y-3">
            <span className="skeleton block h-10 w-2/3 rounded-[18px]" />
            <span className="skeleton ml-auto block h-10 w-1/2 rounded-[18px]" />
            <span className="skeleton block h-10 w-3/5 rounded-[18px]" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-[12px] text-muted">{error}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              className="rounded-full border border-line px-4 py-2 text-[11px] font-semibold transition hover:border-line-strong"
            >
              Tentar de novo
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-full border border-line bg-surface text-muted">
              <MessageCircle className="size-5" strokeWidth={1.6} />
            </span>
            <p className="mt-2 font-editorial text-[26px] leading-none tracking-[-0.02em]">
              Diga oi. 👋
            </p>
            <p className="max-w-[260px] text-[11.5px] leading-relaxed text-muted">
              Essa conversa ainda está em branco. Mande a primeira mensagem ou
              compartilhe um vídeo do feed.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const showDay =
                !previous ||
                new Date(previous.createdAt).toDateString() !==
                  new Date(message.createdAt).toDateString();
              const own = message.sender.id === user?.id;
              return (
                <div key={message.id}>
                  {showDay ? (
                    <div className="my-4 flex items-center gap-3">
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-[8px] uppercase tracking-[0.14em] text-muted">
                        {dayLabel(message.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "flex items-end gap-2",
                      own ? "justify-end" : "justify-start",
                    )}
                  >
                    {!own ? (
                      <Avatar
                        name={message.sender.displayName}
                        src={message.sender.avatarUrl}
                        size={26}
                      />
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-[18px] px-3.5 py-2.5 text-[12.5px] leading-relaxed md:max-w-[70%]",
                        own
                          ? "rounded-br-[6px] bg-accent text-[#0a0a0a]"
                          : "rounded-bl-[6px] bg-surface text-ink",
                      )}
                    >
                      {message.body ? (
                        <p className="whitespace-pre-wrap break-words">
                          {message.body}
                        </p>
                      ) : null}
                      {message.post ? (
                        <SharedPostCard
                          post={message.post}
                          own={own}
                          onOpen={() => onOpenPost(message.post as Post)}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "mt-1 block text-right text-[8.5px]",
                          own ? "text-black/45" : "text-muted",
                        )}
                      >
                        {timeAgo(message.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-line bg-paper px-3 py-3 md:px-5"
      >
        <div className="flex items-end gap-2 rounded-[22px] border border-line bg-surface px-3 py-1.5 transition focus-within:border-accent/60">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={`Mensagem para @${conversation.participant.handle}`}
            aria-label="Mensagem"
            className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent py-2 text-[12.5px] leading-relaxed outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={!body.trim() || sending}
            aria-label="Enviar mensagem"
            className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-[#0a0a0a] transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" strokeWidth={1.9} />
            )}
          </button>
        </div>
        <p className="mt-1.5 px-2 text-[8.5px] text-muted">
          Enter envia · Shift + Enter quebra a linha
        </p>
      </form>
    </div>
  );
}
