"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Grid3X3,
  LogOut,
  MapPin,
  Pencil,
  Share2,
  UserRound,
} from "lucide-react";
import { CommentsPanel } from "@/components/feed/comments-panel";
import { PostGrid } from "@/components/feed/post-grid";
import { PostLightbox } from "@/components/feed/post-lightbox";
import { EditProfileDialog } from "@/components/profile/edit-profile-dialog";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeExternalUrl } from "@/lib/sanitize";
import type { Post } from "@/lib/types";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("pt-BR");

export function ProfileView() {
  const { user, ready, posts, savedIds, followingIds, signOut } = useApp();
  const { toast } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<"posts" | "saved">("posts");
  const [editing, setEditing] = useState(false);
  const [lightboxPost, setLightboxPost] = useState<Post | null>(null);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);
  const [counts, setCounts] = useState<{
    userId: string;
    followers: number;
    following: number;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", user.id),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", user.id),
    ])
      .then(([followers, following]) => {
        if (!active) return;
        setCounts({
          userId: user.id,
          followers: followers.count ?? 0,
          following: following.count ?? 0,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.id]);

  const myPosts = useMemo(
    () =>
      posts
        .filter((post) => post.author.id === user?.id)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [posts, user?.id],
  );

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
        <div className="flex items-center gap-5">
          <span className="skeleton size-24 rounded-full" />
          <div className="space-y-3">
            <span className="skeleton block h-9 w-52 rounded-full" />
            <span className="skeleton block h-3 w-32 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-[700px] px-4 pb-20 pt-12 sm:px-6 lg:px-10">
        <p className="eyebrow text-muted">sua conta</p>
        <h1 className="mt-2 font-editorial text-[48px] leading-[0.92] tracking-[-0.035em]">
          Seu perfil
        </h1>
        <EmptyState
          className="mt-8"
          icon={<UserRound className="size-4" strokeWidth={1.6} />}
          eyebrow="do seu jeito"
          title="Entre para ter um perfil."
          body="Seu nome, sua bio e tudo o que você publicou ou guardou em um só lugar."
          action={
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
              >
                entrar
              </Link>
              <Link
                href="/signup"
                className="flex h-9 items-center rounded-full border border-line-strong px-4 text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-surface"
              >
                criar conta
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const liveCounts = counts?.userId === user.id ? counts : null;
  const followers = liveCounts?.followers ?? user.followersCount ?? 0;
  const following = liveCounts?.following ?? user.followingCount ?? followingIds.length;

  const linkHref = safeExternalUrl(user.link);

  const handleShare = async () => {
    const url = `${window.location.origin}/u/${user.handle}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link do seu perfil copiado.", "success");
    } catch {
      toast("Não foi possível copiar o link.", "error");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  const visiblePosts = tab === "posts" ? myPosts : savedPosts;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-7 sm:px-6 lg:px-10 lg:pt-11">
      <header className="view-enter">
        <p className="eyebrow text-muted">seu perfil</p>
        <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <div className="relative shrink-0">
              <Avatar
                name={user.displayName}
                src={user.avatarUrl}
                size={94}
                className="border border-line"
              />
              <span className="absolute bottom-1.5 right-1.5 size-3 rounded-full border-2 border-paper bg-accent" />
            </div>

            <div className="min-w-0">
              <h1 className="font-editorial text-[40px] leading-[0.94] tracking-[-0.035em] sm:text-[48px]">
                {user.displayName}
              </h1>
              <p className="mt-1.5 text-[11px] font-medium tracking-[0.02em] text-muted">
                @{user.handle}
              </p>
              {user.bio ? (
                <p className="mt-3.5 max-w-[440px] text-[12.5px] leading-[1.65] text-ink/85">
                  {user.bio}
                </p>
              ) : null}

              <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-muted">
                {linkHref ? (
                  <a
                    href={linkHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.5 transition hover:text-accent"
                  >
                    <ArrowUpRight className="size-3" strokeWidth={1.8} />
                    {user.link}
                  </a>
                ) : null}
                {user.location ? (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3" strokeWidth={1.8} />
                    {user.location}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-surface"
            >
              <Pencil className="size-3.5" strokeWidth={1.8} />
              editar perfil
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              aria-label="Compartilhar perfil"
              className="flex size-10 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink"
            >
              <Share2 className="size-3.5" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              aria-label="Sair da conta"
              title="Sair"
              className="flex size-10 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink"
            >
              <LogOut className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-line pt-5">
          <Stat
            value={myPosts.length}
            label={myPosts.length === 1 ? "publicação" : "publicações"}
          />
          <Stat value={followers} label="seguidores" />
          <Stat value={following} label="seguindo" />
          <Link
            href="/upload"
            className="ml-auto flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
          >
            publicar
            <ArrowUpRight className="size-3" strokeWidth={2} />
          </Link>
        </div>
      </header>

      <div className="mt-9 flex items-center justify-between border-b border-line">
        <div className="flex gap-6">
          <TabButton
            active={tab === "posts"}
            onClick={() => setTab("posts")}
            icon={<Grid3X3 className="size-3.5" strokeWidth={1.7} />}
            label="Publicações"
            count={myPosts.length}
          />
          <TabButton
            active={tab === "saved"}
            onClick={() => setTab("saved")}
            icon={<Bookmark className="size-3.5" strokeWidth={1.7} />}
            label="Guardados"
            count={savedPosts.length}
          />
        </div>
        <span className="hidden text-[8.5px] uppercase tracking-[0.12em] text-muted/60 sm:block">
          {tab === "posts" ? "o que você colocou no mundo" : "o que você quis guardar"}
        </span>
      </div>

      {visiblePosts.length ? (
        <PostGrid
          key={tab}
          className="mt-5"
          posts={visiblePosts}
          onSelect={setLightboxPost}
        />
      ) : (
        <EmptyState
          className="mt-6"
          icon={
            tab === "posts" ? (
              <Grid3X3 className="size-4" strokeWidth={1.6} />
            ) : (
              <Bookmark className="size-4" strokeWidth={1.6} />
            )
          }
          eyebrow={tab === "posts" ? "seu espaço" : "ainda vazio"}
          title={tab === "posts" ? "Nada publicado ainda." : "Nada guardado ainda."}
          body={
            tab === "posts"
              ? "Sua primeira foto ou vídeo pode começar agora. O feed espera por você."
              : "Quando algo te parar no feed, toque em salvar. Fica tudo aqui."
          }
          action={
            <Link
              href={tab === "posts" ? "/upload" : "/explore"}
              className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              {tab === "posts" ? "publicar um momento" : "explorar o velo"}
            </Link>
          }
        />
      )}

      {editing ? <EditProfileDialog onClose={() => setEditing(false)} /> : null}
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className="text-[13px] font-semibold tabular-nums">{number.format(value)}</span>
      <span className="text-[9.5px] uppercase tracking-[0.1em] text-muted">{label}</span>
    </p>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-1.5 pb-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.1em] transition",
        active ? "text-ink" : "text-muted hover:text-ink",
      )}
    >
      {icon}
      {label}
      <span className="text-[8px] tabular-nums text-muted">{count}</span>
      <span
        className={cn(
          "absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-accent transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}
