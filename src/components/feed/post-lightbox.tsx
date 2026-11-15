"use client";

import Link from "next/link";
import { Bookmark, Heart, MapPin, MessageCircle, Music2, Share2 } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import type { Post } from "@/lib/types";
import { cn, formatCompact, timeAgo } from "@/lib/utils";

export function PostLightbox({
  post,
  onClose,
  onOpenComments,
}: {
  post: Post | null;
  onClose: () => void;
  onOpenComments: (post: Post) => void;
}) {
  const {
    user,
    likedIds,
    savedIds,
    followingIds,
    toggleLike,
    toggleSave,
    toggleFollow,
  } = useApp();
  const { toast } = useToast();

  const open = Boolean(post);
  const liked = post ? likedIds.includes(post.id) : false;
  const saved = post ? savedIds.includes(post.id) : false;
  const following = post ? followingIds.includes(post.author.id) : false;
  const isMine = Boolean(post && user?.id === post.author.id);

  const handleShare = async () => {
    if (!post) return;
    const url = `${window.location.origin}/#${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `@${post.author.handle} no velo.`,
          text: post.caption,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast("Link copiado.", "success");
      }
    } catch {
      // dismissed share sheet
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel={post ? `Publicação de ${post.author.displayName}` : "Publicação"}
      className="max-w-[980px]"
    >
      {post ? (
        <div className="grid md:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
          <div className="relative flex h-[44svh] items-center justify-center overflow-hidden bg-[#060606] md:h-[min(80svh,700px)] md:rounded-l-[24px]">
            {post.mediaType === "video" ? (
              <video
                key={post.id}
                src={post.mediaUrl}
                poster={post.posterUrl ?? undefined}
                className="max-h-full w-full object-contain"
                controls
                autoPlay
                loop
                playsInline
              />
            ) : (
              <img
                src={post.mediaUrl}
                alt={post.caption || `Foto de ${post.author.displayName}`}
                className="max-h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            <span className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[8px] uppercase tracking-[0.14em] text-white/70 backdrop-blur-md">
              {post.mediaType === "video" ? "vídeo" : "foto"}
            </span>
          </div>

          <div className="flex h-[43svh] flex-col md:h-[min(80svh,700px)]">
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pr-12 pt-5 md:px-6 md:pr-14">
              <div className="flex items-center gap-3">
                <Link
                  href={isMine ? "/profile" : `/u/${post.author.handle}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <Avatar
                    name={post.author.displayName}
                    src={post.author.avatarUrl}
                    size={38}
                    className="border border-line"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold leading-tight">
                      {post.author.displayName}
                    </span>
                    <span className="mt-0.5 block truncate text-[9.5px] text-muted">
                      @{post.author.handle} · {timeAgo(post.createdAt)}
                    </span>
                  </span>
                </Link>
                {!isMine ? (
                  <button
                    type="button"
                    onClick={() => void toggleFollow(post.author.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-[8.5px] font-semibold uppercase tracking-[0.08em] transition",
                      following
                        ? "border-line text-muted hover:border-line-strong hover:text-ink"
                        : "border-accent bg-accent text-[#0a0a0a] hover:bg-ink hover:text-paper",
                    )}
                  >
                    {following ? "seguindo" : "seguir"}
                  </button>
                ) : (
                  <span className="rounded-full border border-line px-2.5 py-1.5 text-[8px] uppercase tracking-[0.12em] text-muted">
                    seu post
                  </span>
                )}
              </div>

              {post.caption ? (
                <p className="mt-5 text-[13px] leading-[1.65] text-ink/90">{post.caption}</p>
              ) : null}

              {post.tags.length ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/explore?tag=${encodeURIComponent(tag)}`}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-[9.5px] text-muted transition hover:border-line-strong hover:text-ink"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 space-y-1.5 text-[9.5px] text-muted">
                {post.location ? (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-3" strokeWidth={1.7} />
                    {post.location}
                  </p>
                ) : null}
                <p className="flex items-center gap-1.5">
                  <Music2 className="size-3" strokeWidth={1.7} />
                  {post.audio || "som original"}
                </p>
              </div>

              <div className="my-5 h-px bg-line" />

              <div className="grid grid-cols-3 gap-2">
                <Stat label="curtidas" value={post.likesCount} />
                <Stat label="comentários" value={post.commentsCount} />
                <Stat label="guardados" value={post.savesCount} />
              </div>

              <button
                type="button"
                onClick={() => onOpenComments(post)}
                className="mt-5 flex w-full items-center justify-between gap-3 rounded-[13px] border border-line bg-surface px-3.5 py-3 text-left transition hover:border-line-strong"
              >
                <span className="flex items-center gap-2">
                  <MessageCircle className="size-4 text-muted" strokeWidth={1.7} />
                  <span className="text-[11.5px] font-medium">
                    Ver os comentários
                  </span>
                </span>
                <span className="text-[9px] tabular-nums text-muted">
                  {formatCompact(post.commentsCount)}
                </span>
              </button>
            </div>

            <div className="border-t border-line px-4 py-3.5">
              <div className="flex items-center justify-between gap-1">
                <LightboxAction
                  label={liked ? "Descurtir" : "Curtir"}
                  active={liked}
                  onClick={() => void toggleLike(post.id)}
                  icon={
                    <Heart
                      className="size-[18px]"
                      strokeWidth={liked ? 0 : 1.7}
                      fill={liked ? "currentColor" : "none"}
                    />
                  }
                  count={formatCompact(post.likesCount)}
                />
                <LightboxAction
                  label="Comentar"
                  onClick={() => onOpenComments(post)}
                  icon={<MessageCircle className="size-[18px]" strokeWidth={1.7} />}
                  count={formatCompact(post.commentsCount)}
                />
                <LightboxAction
                  label="Compartilhar"
                  onClick={() => void handleShare()}
                  icon={<Share2 className="size-[17px]" strokeWidth={1.7} />}
                />
                <LightboxAction
                  label={saved ? "Remover dos guardados" : "Salvar"}
                  active={saved}
                  onClick={() => {
                    void toggleSave(post.id).then((savedNow) => {
                      if (savedNow) {
                        toast(
                          saved ? "Removido dos guardados." : "Salvo nos seus guardados.",
                          "success",
                        );
                      }
                    });
                  }}
                  icon={
                    <Bookmark
                      className="size-[17px]"
                      strokeWidth={1.7}
                      fill={saved ? "currentColor" : "none"}
                    />
                  }
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[11px] border border-line bg-paper px-3 py-2.5">
      <p className="text-[15px] font-semibold leading-none tabular-nums">{formatCompact(value)}</p>
      <p className="mt-1.5 text-[8px] uppercase tracking-[0.1em] text-muted">{label}</p>
    </div>
  );
}

function LightboxAction({
  label,
  icon,
  onClick,
  active = false,
  count,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  count?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-muted transition hover:bg-surface hover:text-ink",
        active && "text-accent hover:text-accent",
      )}
    >
      {icon}
      {count ? <span className="text-[9.5px] font-medium tabular-nums">{count}</span> : null}
    </button>
  );
}
