"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import { CommentsPanel } from "@/components/feed/comments-panel";
import { PostCard } from "@/components/feed/post-card";
import { RightRail } from "@/components/feed/right-rail";
import { StoryBar } from "@/components/feed/story-bar";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useClientMounted } from "@/components/ui/use-client-mounted";
import { useIsMobile } from "@/components/ui/use-is-mobile";
import type { Post } from "@/lib/types";
import { cn, todayLabel } from "@/lib/utils";

export function FeedView() {
  const { posts, ready, refresh } = useApp();
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useClientMounted();
  const isMobile = useIsMobile();
  const feedRef = useRef<HTMLDivElement>(null);
  const previousIsMobile = useRef(isMobile);
  const today = mounted ? todayLabel() : "seu feed";

  // Ao girar o celular ou redimensionar a janela, o contêiner de snap deixa de
  // ser o mesmo. Voltar ao topo evita que o feed abra deslocado no outro modo.
  useEffect(() => {
    if (previousIsMobile.current === isMobile) return;
    previousIsMobile.current = isMobile;
    feedRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [isMobile]);

  useEffect(() => {
    if (!ready) return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const timer = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [ready, posts.length]);

  // Desktop: setas do teclado navegam entre os posts. No celular o gesto é o
  // scroll-snap nativo (deslizar para cima/baixo), então não interceptamos nada.
  useEffect(() => {
    if (isMobile || commentsPost || !posts.length) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      event.preventDefault();
      const ids = posts.map((post) => post.id);
      const currentIndex = activeId ? ids.indexOf(activeId) : 0;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.min(
        ids.length - 1,
        Math.max(0, (currentIndex >= 0 ? currentIndex : 0) + step),
      );
      document
        .getElementById(ids[nextIndex])
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeId, commentsPost, isMobile, posts]);

  const handleActive = useCallback((postId: string) => {
    setActiveId((current) => (current === postId ? current : postId));
  }, []);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
      toast("Feed atualizado.", "success");
    } catch {
      toast("Não foi possível atualizar o feed.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const activeCommentsPost = commentsPost
    ? posts.find((post) => post.id === commentsPost.id) ?? commentsPost
    : null;

  return (
    <div
      ref={feedRef}
      data-device={isMobile ? "mobile" : "desktop"}
      className={cn(
        "w-full",
        "max-md:h-dvh max-md:snap-y max-md:snap-mandatory max-md:overflow-y-auto max-md:overscroll-y-contain max-md:scroll-smooth max-md:touch-pan-y max-md:no-scrollbar",
        "md:mx-auto md:flex md:max-w-[1220px] md:items-start md:justify-center md:gap-12 md:px-10 md:pb-20 md:pt-10",
      )}
    >
      <div className="w-full min-w-0 md:max-w-[560px]">
        <header className="view-enter hidden md:block">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-muted">{today}</p>
              <h1 className="mt-2 font-editorial text-[42px] leading-[0.92] tracking-[-0.035em] sm:text-[46px]">
                Para você
              </h1>
              <p className="mt-2 max-w-[330px] text-[11.5px] leading-relaxed text-muted">
                Vídeos, fotos e o que passou entre um scroll e outro.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              aria-label="Atualizar feed"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink"
            >
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
                strokeWidth={1.7}
              />
            </button>
          </div>
        </header>

        <div className="mt-7 hidden md:block">
          <StoryBar />
        </div>

        <div className="mb-5 mt-9 hidden items-center gap-3 md:flex">
          <span className="eyebrow shrink-0 text-muted">selecionados para você</span>
          <span className="h-px flex-1 bg-line" />
          <span className="shrink-0 text-[9px] tabular-nums text-muted/60">
            {posts.length} {posts.length === 1 ? "momento" : "momentos"}
          </span>
        </div>

        {!ready ? (
          <div className="space-y-0 md:space-y-8">
            {[0, 1].map((index) => (
              <div key={index} className="max-md:h-dvh">
                <div className="post-frame skeleton mx-auto rounded-[26px]" />
              </div>
            ))}
          </div>
        ) : posts.length ? (
          <div className="flex flex-col md:gap-12">
            {posts.map((post, index) => (
              <div
                key={post.id}
                className="relative max-md:h-dvh max-md:snap-start max-md:snap-always"
              >
                <span
                  aria-hidden="true"
                  className="absolute -left-8 top-1 hidden select-none text-[9px] tabular-nums tracking-[0.1em] text-muted/35 2xl:block"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <PostCard
                  post={post}
                  isActive={activeId === post.id}
                  pausedByOverlay={Boolean(commentsPost)}
                  onActive={handleActive}
                  onOpenComments={(selected) => setCommentsPost(selected)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center rounded-[22px] border border-line bg-surface px-8 py-16 text-center max-md:h-dvh max-md:justify-center max-md:rounded-none max-md:border-0">
            <span className="flex size-11 items-center justify-center rounded-full border border-line bg-paper text-muted">
              <ArrowDown className="size-4" strokeWidth={1.6} />
            </span>
            <p className="mt-5 font-editorial text-[28px] leading-tight">O feed está vazio.</p>
            <p className="mt-2 max-w-[260px] text-[11.5px] leading-relaxed text-muted">
              Seja a primeira pessoa a colocar algo aqui.
            </p>
            <Link
              href="/upload"
              className="mt-6 flex h-10 items-center rounded-full bg-accent px-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              publicar um momento
            </Link>
          </div>
        )}

        {ready && posts.length ? (
          <footer className="mt-14 hidden flex-col items-center border-t border-line pt-10 text-center md:flex">
            <p className="eyebrow text-muted">fim do feed</p>
            <p className="mt-3 font-editorial text-[30px] leading-tight tracking-[-0.02em]">
              Você chegou ao fim.
            </p>
            <p className="mt-2 max-w-[280px] text-[11px] leading-relaxed text-muted">
              O resto do mundo continua no explorar. Ou coloque algo novo no ar.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Link
                href="/explore"
                className="flex h-9 items-center rounded-full border border-line-strong px-4 text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-surface"
              >
                explorar
              </Link>
              <Link
                href="/upload"
                className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
              >
                publicar
              </Link>
            </div>
          </footer>
        ) : null}
      </div>

      <RightRail />

      {activeCommentsPost ? (
        <CommentsPanel
          key={activeCommentsPost.id}
          post={activeCommentsPost}
          onClose={() => setCommentsPost(null)}
        />
      ) : null}
    </div>
  );
}
