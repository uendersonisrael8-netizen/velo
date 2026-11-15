"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bookmark, Compass } from "lucide-react";
import { CommentsPanel } from "@/components/feed/comments-panel";
import { PostGrid } from "@/components/feed/post-grid";
import { PostLightbox } from "@/components/feed/post-lightbox";
import { useApp } from "@/components/providers/app-provider";
import { EmptyState } from "@/components/ui/empty-state";
import type { Post } from "@/lib/types";
import { pluralize } from "@/lib/utils";

export function SavedView() {
  const { user, ready, posts, savedIds } = useApp();
  const [lightboxPost, setLightboxPost] = useState<Post | null>(null);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);

  const savedPosts = useMemo(
    () =>
      posts
        .filter((post) => savedIds.includes(post.id))
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [posts, savedIds],
  );

  if (!ready) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 pb-20 pt-10 sm:px-6 lg:px-10">
        <span className="skeleton block h-3 w-20 rounded-full" />
        <span className="skeleton mt-3 block h-12 w-64 rounded-full" />
        <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <span key={index} className="skeleton block aspect-[3/4] rounded-[5px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-7 sm:px-6 lg:px-10 lg:pt-11">
      <header className="view-enter">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow text-muted">sua coleção</p>
            <h1 className="mt-2 font-editorial text-[48px] leading-[0.9] tracking-[-0.04em] sm:text-[56px]">
              Guardados
            </h1>
            <p className="mt-2.5 max-w-[360px] text-[11.5px] leading-relaxed text-muted">
              O que você quis manter por perto. Uma coleção particular, sem ordem certa.
            </p>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <span className="rounded-full border border-line px-3 py-1.5 text-[9px] tabular-nums text-muted">
              {savedPosts.length} {pluralize(savedPosts.length, "momento", "momentos")}
            </span>
            <Link
              href="/explore"
              className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              <Compass className="size-3.5" strokeWidth={1.9} />
              explorar
            </Link>
          </div>
        </div>
      </header>

      {!user ? (
        <EmptyState
          className="mt-10"
          icon={<Bookmark className="size-4" strokeWidth={1.6} />}
          eyebrow="entre para guardar"
          title="Sua coleção começa no login."
          body="Salve fotos e vídeos do feed para rever quando quiser. Só você vê esta lista."
          action={
            <Link
              href="/login"
              className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              entrar
            </Link>
          }
        />
      ) : savedPosts.length ? (
        <>
          <div className="mt-8 flex items-center gap-3">
            <span className="eyebrow text-muted">salvos recentemente</span>
            <span className="h-px flex-1 bg-line" />
            <span className="text-[8.5px] uppercase tracking-[0.12em] text-muted/60">
              clique para abrir
            </span>
          </div>
          <PostGrid className="mt-4" posts={savedPosts} onSelect={setLightboxPost} />
        </>
      ) : (
        <EmptyState
          className="mt-10"
          icon={<Bookmark className="size-4" strokeWidth={1.6} />}
          eyebrow="ainda vazio"
          title="Nada guardado ainda."
          body="Quando uma foto ou um vídeo te parar no feed, toque em salvar. Fica tudo aqui, esperando."
          action={
            <Link
              href="/explore"
              className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              encontrar algo
            </Link>
          }
        />
      )}

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
