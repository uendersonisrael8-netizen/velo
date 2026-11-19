"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Image as ImageIcon, Search, SlidersHorizontal, X } from "lucide-react";
import { CommentsPanel } from "@/components/feed/comments-panel";
import { PostGrid } from "@/components/feed/post-grid";
import { PostLightbox } from "@/components/feed/post-lightbox";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import type { Post, Profile } from "@/lib/types";
import { SEARCH_INPUT_PROPS } from "@/lib/input-suggestions";
import { cn, normalizeTag, pluralize } from "@/lib/utils";

type Filter = "all" | "video" | "image";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "video", label: "Vídeos" },
  { value: "image", label: "Fotos" },
];

function deaccent(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function ExploreView() {
  return (
    <Suspense fallback={<ExploreSkeleton />}>
      <ExploreContent />
    </Suspense>
  );
}

function ExploreContent() {
  const searchParams = useSearchParams();
  const { posts, user, followingIds, toggleFollow } = useApp();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [tag, setTag] = useState(() => normalizeTag(searchParams.get("tag") ?? ""));
  const [filter, setFilter] = useState<Filter>("all");
  const [lightboxPost, setLightboxPost] = useState<Post | null>(null);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (tag) params.set("tag", tag);
    const search = params.toString();
    const next = search ? `/explore?${search}` : "/explore";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) window.history.replaceState(null, "", next);
  }, [query, tag]);

  const tagChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const item of post.tags) counts.set(item, (counts.get(item) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 9)
      .map(([value, count]) => ({ tag: value, count }));
  }, [posts]);

  const creators = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const post of posts) {
      if (post.author.id === user?.id) continue;
      if (!map.has(post.author.id)) map.set(post.author.id, post.author);
    }
    return [...map.values()].slice(0, 6);
  }, [posts, user?.id]);

  const results = useMemo(() => {
    const term = deaccent(query.trim().replace(/^#+/, ""));
    return posts.filter((post) => {
      if (filter !== "all" && post.mediaType !== filter) return false;
      if (tag && !post.tags.includes(tag)) return false;
      if (!term) return true;
      const haystack = deaccent(
        [
          post.caption,
          post.tags.join(" "),
          post.author.displayName,
          post.author.handle,
          post.location ?? "",
          post.audio ?? "",
        ].join(" "),
      );
      return haystack.includes(term);
    });
  }, [filter, posts, query, tag]);

  const hasFilters = Boolean(query.trim() || tag || filter !== "all");

  const clearFilters = () => {
    setQuery("");
    setTag("");
    setFilter("all");
  };

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-10 lg:pt-11">
      <header className="view-enter">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow text-muted">descobrir</p>
            <h1 className="mt-2 font-editorial text-[50px] leading-[0.9] tracking-[-0.04em] sm:text-[58px]">
              Explorar
            </h1>
            <p className="mt-3 max-w-[380px] text-[12px] leading-relaxed text-muted">
              Um lugar para encontrar o que você ainda não sabia que procurava.
            </p>
          </div>

          <div className="w-full lg:w-[360px]">
            <div className="group relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-[17px] -translate-y-1/2 text-muted transition group-focus-within:text-ink"
                strokeWidth={1.6}
              />
              <input
                {...SEARCH_INPUT_PROPS}
                autoComplete="on"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tags, pessoas, lugares…"
                aria-label="Buscar no explorar"
                className="h-[50px] w-full rounded-full border border-line bg-surface pl-11 pr-11 text-[12px] text-ink outline-none transition placeholder:text-muted/75 focus:border-line-strong focus:bg-paper"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpar busca"
                  className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:bg-elevated hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 px-4 text-[9px] text-muted/70">
              <SlidersHorizontal className="size-2.5" strokeWidth={1.8} />
              busque por #tag, @pessoa ou um lugar
            </div>
          </div>
        </div>

        {tagChips.length ? (
          <div className="no-scrollbar mt-7 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="eyebrow shrink-0 pr-1 text-muted">em alta</span>
            {tagChips.map((item) => (
              <button
                key={item.tag}
                type="button"
                onClick={() => setTag((current) => (current === item.tag ? "" : item.tag))}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-2 text-[10px] font-medium transition",
                  tag === item.tag
                    ? "border-accent bg-accent text-[#0a0a0a]"
                    : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                #{item.tag}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {!hasFilters && creators.length ? (
        <section className="mt-12" aria-labelledby="voices-title">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="eyebrow text-muted">para seguir</p>
              <h2
                id="voices-title"
                className="mt-1.5 font-editorial text-[27px] leading-none tracking-[-0.02em]"
              >
                Vozes do velo
              </h2>
            </div>
            <span className="hidden text-[9px] uppercase tracking-[0.12em] text-muted sm:block">
              gente que olha de perto
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {creators.map((creator) => {
              const following = followingIds.includes(creator.id);
              return (
                <div
                  key={creator.id}
                  className="group flex flex-col justify-between rounded-[14px] border border-line bg-surface p-3.5 transition hover:border-line-strong"
                >
                  <Link href={`/u/${creator.handle}`} className="block">
                    <Avatar
                      name={creator.displayName}
                      src={creator.avatarUrl}
                      size={44}
                      className="border border-line/70"
                    />
                    <p className="mt-3 truncate text-[11.5px] font-semibold leading-tight">
                      {creator.displayName}
                    </p>
                    <p className="mt-0.5 truncate text-[9px] text-muted">@{creator.handle}</p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void toggleFollow(creator.id)}
                    className={cn(
                      "mt-3 h-7 w-full rounded-full border text-[8px] font-semibold uppercase tracking-[0.1em] transition",
                      following
                        ? "border-line text-muted hover:border-line-strong hover:text-ink"
                        : "border-line-strong text-ink hover:border-accent hover:bg-accent hover:text-[#0a0a0a]",
                    )}
                  >
                    {following ? "seguindo" : "seguir"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="results-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[10px] font-medium transition",
                  filter === item.value
                    ? "bg-paper text-ink shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {item.value === "video" ? (
                  <span className="size-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current" />
                ) : item.value === "image" ? (
                  <ImageIcon className="size-3" strokeWidth={1.8} />
                ) : null}
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <p id="results-title" className="text-[9.5px] tabular-nums text-muted">
              {results.length} {pluralize(results.length, "resultado", "resultados")}
              {tag ? (
                <>
                  {" "}
                  em <span className="text-ink">#{tag}</span>
                </>
              ) : null}
            </p>
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[9px] font-medium uppercase tracking-[0.08em] text-muted underline-offset-4 transition hover:text-ink hover:underline"
              >
                limpar
              </button>
            ) : null}
          </div>
        </div>

        {results.length ? (
          <PostGrid className="mt-5" posts={results} onSelect={setLightboxPost} />
        ) : (
          <EmptyState
            className="mt-6"
            icon={<Search className="size-4" strokeWidth={1.6} />}
            eyebrow={posts.length ? "nada por aqui" : "o começo"}
            title={posts.length ? "Ainda não achamos." : "O explorar está vazio."}
            body={
              posts.length
                ? "Tente outra tag, o nome de uma pessoa ou um lugar. Às vezes o que você quer está a um acento de distância."
                : "Tudo o que aparece aqui vem de publicações reais. Seja a primeira pessoa a colocar algo no velo."
            }
            action={
              posts.length ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
                >
                  ver tudo
                </button>
              ) : (
                <Link
                  href="/upload"
                  className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
                >
                  publicar um momento
                </Link>
              )
            }
          />
        )}
      </section>

      <footer className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <p className="font-editorial text-[18px] tracking-[-0.02em] text-muted">
          Continue olhando.
        </p>
        <Link
          href="/upload"
          className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink transition hover:text-accent"
        >
          publicar no velo
          <ArrowUpRight className="size-3" strokeWidth={1.8} />
        </Link>
      </footer>

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

function ExploreSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-10 lg:pt-11">
      <span className="skeleton block h-3 w-20 rounded-full" />
      <span className="skeleton mt-4 block h-12 w-56 rounded-full sm:h-14" />
      <span className="skeleton mt-4 block h-3 w-72 max-w-full rounded-full" />
      <div className="mt-8 flex gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <span key={index} className="skeleton h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-10 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className="skeleton aspect-[4/5] rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}
