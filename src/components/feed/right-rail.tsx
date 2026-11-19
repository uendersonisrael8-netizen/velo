"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import type { Profile } from "@/lib/types";
import { SEARCH_INPUT_PROPS } from "@/lib/input-suggestions";
import { cn, pluralize } from "@/lib/utils";

export function RightRail() {
  const { posts, user, followingIds, toggleFollow } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const creators = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const post of posts) {
      if (post.author.id === user?.id) continue;
      if (!map.has(post.author.id)) map.set(post.author.id, post.author);
    }
    return [...map.values()];
  }, [posts, user?.id]);

  const trending = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const tag of post.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({
        tag,
        label: tag.replace(/_/g, " "),
        count: `${count} ${pluralize(count, "post", "posts")}`,
      }));
  }, [posts]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    router.push(term ? `/explore?q=${encodeURIComponent(term)}` : "/explore");
  };

  return (
    <aside className="sticky top-9 hidden w-[292px] shrink-0 self-start xl:block">
      <form onSubmit={handleSearch} className="group relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted transition group-focus-within:text-ink"
          strokeWidth={1.6}
        />
        <input
          {...SEARCH_INPUT_PROPS}
          autoComplete="on"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar pessoas, tags, lugares"
          aria-label="Buscar no velo"
          className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-4 text-[11.5px] text-ink outline-none transition placeholder:text-muted/75 focus:border-line-strong focus:bg-paper"
        />
      </form>

      <section className="mt-9" aria-labelledby="trending-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="trending-title" className="eyebrow text-muted">
            Em alta agora
          </h2>
          <Link
            href="/explore"
            className="text-[9px] uppercase tracking-[0.1em] text-muted transition hover:text-accent"
          >
            ver tudo
          </Link>
        </div>
        {trending.length ? (
          <ol className="space-y-0.5">
            {trending.map((item, index) => (
              <li key={item.tag}>
                <Link
                  href={`/explore?tag=${encodeURIComponent(item.tag)}`}
                  className="group flex items-center gap-3 rounded-[11px] px-2 py-2.5 transition hover:bg-surface"
                >
                  <span className="w-5 shrink-0 font-editorial text-[17px] leading-none text-muted/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold leading-tight transition group-hover:text-accent">
                      #{item.tag}
                    </span>
                    <span className="mt-0.5 block truncate text-[9.5px] text-muted">
                      {item.label} · {item.count}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="size-3 shrink-0 text-muted/40 transition group-hover:text-accent"
                    strokeWidth={1.6}
                  />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-2 text-[10px] leading-relaxed text-muted/70">
            As tags em alta aparecem quando as primeiras publicações chegarem.
          </p>
        )}
      </section>

      <section className="mt-9" aria-labelledby="creators-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="creators-title" className="eyebrow text-muted">
            Quem seguir
          </h2>
          <Link
            href="/explore"
            className="text-[9px] uppercase tracking-[0.1em] text-muted transition hover:text-accent"
          >
            explorar
          </Link>
        </div>
        {creators.length ? (
          <ul className="space-y-1">
            {creators.slice(0, 4).map((profile) => {
              const following = followingIds.includes(profile.id);
              return (
                <li key={profile.id} className="flex items-center gap-2.5 rounded-[11px] py-1.5">
                  <Link
                    href={`/u/${profile.handle}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    <Avatar
                      name={profile.displayName}
                      src={profile.avatarUrl}
                      size={36}
                      className="border border-line"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[11.5px] font-semibold leading-tight">
                        {profile.displayName}
                      </span>
                      <span className="mt-0.5 block truncate text-[9.5px] text-muted">
                        @{profile.handle}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void toggleFollow(profile.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[8.5px] font-semibold uppercase tracking-[0.08em] transition",
                      following
                        ? "border-line text-muted hover:border-line-strong hover:text-ink"
                        : "border-line-strong text-ink hover:border-accent hover:bg-accent hover:text-[#0a0a0a]",
                    )}
                  >
                    {following ? "seguindo" : "seguir"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 text-[10px] leading-relaxed text-muted/70">
            Quando alguém publicar, as pessoas para seguir aparecem aqui.
          </p>
        )}
      </section>

      <section className="relative mt-10 overflow-hidden rounded-[16px] border border-line bg-surface p-5">
        <span className="absolute right-4 top-3 font-editorial text-[52px] leading-none text-accent/20">
          ”
        </span>
        <p className="eyebrow text-[8px] text-muted">nota da casa</p>
        <p className="mt-3 font-editorial text-[21px] leading-[1.18] tracking-[-0.02em]">
          Nem tudo precisa de pressa.
        </p>
        <p className="mt-2 max-w-[210px] text-[10px] leading-relaxed text-muted">
          O velo é feito para olhar devagar. Fique o quanto quiser.
        </p>
        <Link
          href="/upload"
          className="mt-4 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink transition hover:text-accent"
        >
          publicar algo
          <ArrowUpRight className="size-3" strokeWidth={1.8} />
        </Link>
      </section>

      <footer className="mt-8 flex flex-wrap gap-x-3 gap-y-1.5 px-1 text-[8.5px] leading-relaxed text-muted/60">
        <span>© {new Date().getFullYear()} velo.</span>
        <span aria-hidden="true">·</span>
        <span>supabase</span>
        <span aria-hidden="true">·</span>
        <Link href="/explore" className="transition hover:text-ink">
          explorar
        </Link>
        <span aria-hidden="true">·</span>
        <span>feito com calma</span>
      </footer>
    </aside>
  );
}
