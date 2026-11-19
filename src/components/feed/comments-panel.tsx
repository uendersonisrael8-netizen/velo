"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import type { Comment, Post } from "@/lib/types";
import { SENTENCE_INPUT_PROPS } from "@/lib/input-suggestions";
import { commentSchema } from "@/lib/validation";
import { cn, formatCompact, timeAgo } from "@/lib/utils";

export function CommentsPanel({
  post,
  onClose,
}: {
  post: Post;
  onClose: () => void;
}) {
  const { user, fetchComments, addComment, subscribeToComments } = useApp();
  const { toast } = useToast();
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    void fetchComments(post.id)
      .then((comments) => {
        if (active) setItems(comments);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error ? reason.message : "Não foi possível carregar os comentários.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = subscribeToComments(post.id, (comment) => {
      setItems((current) =>
        current.some((item) => item.id === comment.id) ? current : [...current, comment],
      );
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [fetchComments, post.id, subscribeToComments]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const parsed = commentSchema.safeParse({ body });
    if (!parsed.success) {
      toast(parsed.error.issues[0]?.message ?? "Escreva algo para comentar.", "error");
      return;
    }
    setSending(true);
    try {
      const comment = await addComment(post.id, parsed.data.body);
      setItems((current) =>
        current.some((item) => item.id === comment.id) ? current : [...current, comment],
      );
      setBody("");
    } catch (reason) {
      toast(
        reason instanceof Error ? reason.message : "Não foi possível comentar agora.",
        "error",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabel={`Comentários de ${post.author.displayName}`}
      className="flex h-[min(78svh,640px)] max-w-[440px] flex-col"
    >
      <header className="shrink-0 border-b border-line px-6 pb-4 pr-16 pt-5">
        <p className="eyebrow text-muted">conversa</p>
        <h2 className="mt-1.5 flex items-baseline gap-2 font-editorial text-[27px] leading-none tracking-[-0.02em]">
          Comentários
          <span className="font-sans text-[10px] font-medium tracking-[0.08em] text-muted">
            {formatCompact(post.commentsCount)}
          </span>
        </h2>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        {loading ? (
          <div className="space-y-5">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex gap-3">
                <span className="skeleton size-8 shrink-0 rounded-full" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="skeleton block h-2.5 w-24 rounded-full" />
                  <span className="skeleton block h-2.5 w-full rounded-full" />
                </span>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-[13px] text-muted">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setLoading(true);
                void fetchComments(post.id)
                  .then(setItems)
                  .catch((reason: unknown) =>
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Não foi possível carregar os comentários.",
                    ),
                  )
                  .finally(() => setLoading(false));
              }}
              className="mt-4 rounded-full border border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] transition hover:border-line-strong"
            >
              tentar de novo
            </button>
          </div>
        ) : items.length ? (
          <ul className="space-y-5">
            {items.map((comment) => {
              const mine = user?.id === comment.author.id;
              return (
                <li key={comment.id} className="flex items-start gap-3">
                  <Link
                    href={mine ? "/profile" : `/u/${comment.author.handle}`}
                    className="mt-0.5 shrink-0"
                  >
                    <Avatar
                      name={comment.author.displayName}
                      src={comment.author.avatarUrl}
                      size={32}
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Link
                        href={mine ? "/profile" : `/u/${comment.author.handle}`}
                        className="text-[11.5px] font-semibold leading-none transition hover:text-accent"
                      >
                        {comment.author.displayName}
                      </Link>
                      <span className="text-[9.5px] text-muted">
                        @{comment.author.handle} · {timeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-[1.55] text-ink/88">
                      {comment.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full border border-line text-muted">
              <MessageCircle className="size-4" strokeWidth={1.5} />
            </span>
            <p className="mt-4 font-editorial text-[23px] leading-tight">Ninguém falou ainda.</p>
            <p className="mt-1.5 max-w-[220px] text-[11.5px] leading-relaxed text-muted">
              A conversa começa com uma frase. Pode ser a sua.
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-paper p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {user ? (
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-2 pr-1.5 transition focus-within:border-line-strong"
          >
            <Avatar name={user.displayName} src={user.avatarUrl} size={28} />
            <input
              {...SENTENCE_INPUT_PROPS}
              autoComplete="on"
              value={body}
              onChange={(event) => setBody(event.target.value.slice(0, 500))}
              placeholder="Escreva um comentário…"
              aria-label="Seu comentário"
              maxLength={500}
              data-autofocus
              className="h-9 min-w-0 flex-1 bg-transparent px-1 text-[12.5px] text-ink outline-none"
            />
            <button
              type="submit"
              disabled={!body.trim() || sending}
              aria-label="Enviar comentário"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full transition",
                body.trim()
                  ? "bg-accent text-[#0a0a0a] hover:bg-ink hover:text-paper"
                  : "bg-elevated text-muted",
              )}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-3.5" strokeWidth={1.9} />
              )}
            </button>
          </form>
        ) : (
          <Link
            href="/login"
            className="flex h-11 items-center justify-center rounded-full bg-accent text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
          >
            entrar para comentar
          </Link>
        )}
        <p className="mt-2 text-center text-[8.5px] uppercase tracking-[0.14em] text-muted/70">
          respeite quem está do outro lado da tela
        </p>
      </div>
    </Dialog>
  );
}
