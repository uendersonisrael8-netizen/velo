"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  MapPin,
  Pencil,
  Share2,
  UserRound,
} from "lucide-react";
import { CommentsPanel } from "@/components/feed/comments-panel";
import { PostGrid } from "@/components/feed/post-grid";
import { PostLightbox } from "@/components/feed/post-lightbox";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchPublicProfile, type PublicProfileBundle } from "@/lib/supabase/data";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeExternalUrl } from "@/lib/sanitize";
import type { Post } from "@/lib/types";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("pt-BR");

export function PublicProfileView({ handle }: { handle: string }) {
  const { ready, user, followingIds, toggleFollow } = useApp();
  const { toast } = useToast();
  const [result, setResult] = useState<{
    handle: string;
    bundle: PublicProfileBundle | null;
  } | null>(null);
  const [lightboxPost, setLightboxPost] = useState<Post | null>(null);
  const [commentsPost, setCommentsPost] = useState<Post | null>(null);

  const cleanHandle = handle.replace(/^@/, "").toLowerCase();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void fetchPublicProfile(supabase, cleanHandle, user?.id)
      .then((bundle) => {
        if (active) setResult({ handle: cleanHandle, bundle });
      })
      .catch(() => {
        if (active) setResult({ handle: cleanHandle, bundle: null });
      });
    return () => {
      active = false;
    };
  }, [cleanHandle, user?.id]);

  const resultForHandle = result?.handle === cleanHandle ? result : null;
  const loading = !resultForHandle;
  const bundle = resultForHandle?.bundle ?? null;
  const profile = bundle?.profile ?? null;
  const profilePosts = bundle?.posts ?? [];

  if (!ready || loading) {
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

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[700px] px-4 pb-20 pt-12 sm:px-6 lg:px-10">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-ink"
        >
          <ArrowLeft className="size-3" strokeWidth={1.8} />
          explorar
        </Link>
        <EmptyState
          className="mt-6"
          icon={<UserRound className="size-4" strokeWidth={1.6} />}
          eyebrow="404"
          title="Esse perfil não existe."
          body={`Não encontramos ninguém com @${cleanHandle}. Pode ser um link antigo ou um handle novo.`}
          action={
            <Link
              href="/explore"
              className="flex h-9 items-center rounded-full bg-accent px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              descobrir pessoas
            </Link>
          }
        />
      </div>
    );
  }

  const isMine = user?.id === profile.id;
  const following = followingIds.includes(profile.id) || Boolean(bundle?.isFollowing);
  const followersCount = bundle?.followersCount ?? 0;
  const followingCount = bundle?.followingCount ?? 0;

  const linkHref = safeExternalUrl(profile.link);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${profile.handle}`);
      toast("Link do perfil copiado.", "success");
    } catch {
      toast("Não foi possível copiar o link.", "error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-7 sm:px-6 lg:px-10 lg:pt-11">
      <Link
        href="/explore"
        className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-3" strokeWidth={1.8} />
        explorar
      </Link>

      <header className="view-enter mt-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            <Avatar
              name={profile.displayName}
              src={profile.avatarUrl}
              size={94}
              className="border border-line"
            />
            <div className="min-w-0">
              <p className="eyebrow text-muted">perfil</p>
              <h1 className="mt-1.5 font-editorial text-[40px] leading-[0.94] tracking-[-0.035em] sm:text-[48px]">
                {profile.displayName}
              </h1>
              <p className="mt-1.5 text-[11px] font-medium text-muted">@{profile.handle}</p>
              {profile.bio ? (
                <p className="mt-3.5 max-w-[440px] text-[12.5px] leading-[1.65] text-ink/85">
                  {profile.bio}
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
                    {profile.link}
                  </a>
                ) : null}
                {profile.location ? (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3" strokeWidth={1.8} />
                    {profile.location}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isMine ? (
              <Link
                href="/profile"
                className="flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-surface"
              >
                <Pencil className="size-3.5" strokeWidth={1.8} />
                editar perfil
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void toggleFollow(profile.id)}
                className={cn(
                  "flex h-10 items-center rounded-full px-5 text-[9px] font-semibold uppercase tracking-[0.12em] transition",
                  following
                    ? "border border-line-strong text-ink hover:bg-surface"
                    : "bg-accent text-[#0a0a0a] hover:bg-ink hover:text-paper",
                )}
              >
                {following ? "seguindo" : "seguir"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleShare()}
              aria-label="Compartilhar perfil"
              className="flex size-10 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink"
            >
              <Share2 className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-line pt-5">
          <p className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-semibold tabular-nums">
              {number.format(profilePosts.length)}
            </span>
            <span className="text-[9.5px] uppercase tracking-[0.1em] text-muted">
              {profilePosts.length === 1 ? "publicação" : "publicações"}
            </span>
          </p>
          <p className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-semibold tabular-nums">
              {number.format(followersCount)}
            </span>
            <span className="text-[9.5px] uppercase tracking-[0.1em] text-muted">seguidores</span>
          </p>
          <p className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-semibold tabular-nums">
              {number.format(followingCount)}
            </span>
            <span className="text-[9.5px] uppercase tracking-[0.1em] text-muted">seguindo</span>
          </p>
        </div>
      </header>

      <div className="mt-9 flex items-center justify-between border-b border-line pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em]">Publicações</p>
        <span className="text-[8.5px] uppercase tracking-[0.12em] text-muted/60">
          {profilePosts.length}
        </span>
      </div>

      {profilePosts.length ? (
        <PostGrid className="mt-5" posts={profilePosts} onSelect={setLightboxPost} />
      ) : (
        <EmptyState
          className="mt-6"
          icon={<UserRound className="size-4" strokeWidth={1.6} />}
          eyebrow="silêncio"
          title="Nada por aqui ainda."
          body={`@${profile.handle} ainda não publicou nada. Talvez esteja só olhando.`}
          action={
            <Link
              href="/explore"
              className="flex h-9 items-center rounded-full border border-line-strong px-4 text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-surface"
            >
              voltar a explorar
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
