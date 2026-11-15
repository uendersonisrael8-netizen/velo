"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Bookmark,
  Heart,
  MapPin,
  MessageCircle,
  Music2,
  Share2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { useIsMobile } from "@/components/ui/use-is-mobile";
import type { Post } from "@/lib/types";
import { cn, formatCompact, timeAgo } from "@/lib/utils";

type PostCardProps = {
  post: Post;
  isActive: boolean;
  pausedByOverlay?: boolean;
  onActive: (postId: string) => void;
  onOpenComments: (post: Post) => void;
};

export function PostCard({
  post,
  isActive,
  pausedByOverlay = false,
  onActive,
  onOpenComments,
}: PostCardProps) {
  const {
    user,
    likedIds,
    savedIds,
    followingIds,
    muted,
    volume,
    setVolume,
    toggleMute,
    toggleLike,
    likePost,
    toggleSave,
    toggleFollow,
  } = useApp();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const wrapperRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clickTimer = useRef<number | null>(null);
  const burstTimer = useRef<number | null>(null);

  const [playing, setPlaying] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [burstKey, setBurstKey] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const liked = likedIds.includes(post.id);
  const saved = savedIds.includes(post.id);
  const following = followingIds.includes(post.author.id);
  const isMine = user?.id === post.author.id;
  const isVideo = post.mediaType === "video";
  const soundEnabled = !muted && volume > 0;
  const soundAudible = soundEnabled && !audioBlocked;

  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.62) {
            onActive(post.id);
          } else if (entry.intersectionRatio < 0.2) {
            setManualPaused(false);
          }
        }
      },
      { threshold: [0.62, 0.85] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onActive, post.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const shouldPlay = isActive && !pausedByOverlay && !manualPaused;
    if (!shouldPlay || document.hidden) {
      video.pause();
      return;
    }

    let cancelled = false;

    const startPlayback = async () => {
      video.volume = Math.min(1, Math.max(0, volume));
      if (soundEnabled) video.muted = false;

      try {
        await video.play();
        if (!cancelled) setAudioBlocked(false);
      } catch {
        if (cancelled) return;
        if (soundEnabled) {
          // O navegador bloqueou o autoplay com som. O vídeo segue em
          // silêncio e o botão "ativar som" fica visível até o próximo toque.
          video.muted = true;
          if (!cancelled) setAudioBlocked(true);
          try {
            await video.play();
          } catch {
            if (!cancelled) setPlaying(false);
          }
        } else {
          setPlaying(false);
        }
      }
    };

    void startPlayback();

    return () => {
      cancelled = true;
    };
  }, [isActive, manualPaused, pausedByOverlay, soundEnabled, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onVisibility = () => {
      if (document.hidden) {
        video.pause();
      } else if (isActive && !pausedByOverlay && !manualPaused) {
        video.muted = !soundAudible;
        void video.play().catch(() => {
          if (!soundAudible) return;
          video.muted = true;
          setAudioBlocked(true);
          void video.play().catch(() => undefined);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isActive, manualPaused, pausedByOverlay, soundAudible]);

  useEffect(() => {
    return () => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
      if (burstTimer.current) window.clearTimeout(burstTimer.current);
    };
  }, []);

  const triggerHeart = useCallback(() => {
    setShowBurst(false);
    setBurstKey((value) => value + 1);
    window.requestAnimationFrame(() => setShowBurst(true));
    if (burstTimer.current) window.clearTimeout(burstTimer.current);
    burstTimer.current = window.setTimeout(() => setShowBurst(false), 850);
  }, []);

  const enableSound = useCallback(() => {
    const video = videoRef.current;
    const nextVolume = volume > 0 ? volume : 0.8;

    setAudioBlocked(false);
    if (video) {
      video.muted = false;
      video.volume = nextVolume;
      if (video.paused && !pausedByOverlay) {
        setManualPaused(false);
        void video.play().catch(() => {
          video.muted = true;
          setAudioBlocked(true);
          void video.play().catch(() => undefined);
        });
      }
    }

    if (volume === 0) setVolume(nextVolume);
    else if (muted) toggleMute();
  }, [muted, pausedByOverlay, setVolume, toggleMute, volume]);

  const disableSound = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = true;
    setAudioBlocked(false);
    if (!muted) toggleMute();
  }, [muted, toggleMute]);

  const handleSoundToggle = useCallback(() => {
    if (soundAudible) disableSound();
    else enableSound();
  }, [disableSound, enableSound, soundAudible]);

  const handleSurfaceClick = useCallback(() => {
    if (!isVideo || pausedByOverlay) return;

    // Primeiro toque com o som desligado liga o áudio dentro do gesto do
    // usuário, que é o que os navegadores mobile exigem para liberar o som.
    if (!soundAudible) {
      enableSound();
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      setManualPaused(false);
      void video.play().catch(() => undefined);
      return;
    }

    if (clickTimer.current) return;
    clickTimer.current = window.setTimeout(() => {
      setManualPaused(true);
      video.pause();
      clickTimer.current = null;
    }, 210);
  }, [enableSound, isVideo, pausedByOverlay, soundAudible]);

  const handleDoubleClick = useCallback(() => {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (!user) {
      void likePost(post.id);
      return;
    }
    triggerHeart();
    void likePost(post.id);
  }, [likePost, post.id, triggerHeart, user]);

  const handleLike = useCallback(() => {
    if (!user) {
      void toggleLike(post.id);
      return;
    }
    void toggleLike(post.id);
    if (!liked) triggerHeart();
  }, [liked, post.id, toggleLike, triggerHeart, user]);

  const handleSave = useCallback(async () => {
    const savedNow = await toggleSave(post.id);
    if (savedNow) {
      toast(saved ? "Removido dos guardados." : "Salvo nos seus guardados.", "success");
    }
  }, [post.id, saved, toast, toggleSave]);

  const handleShare = useCallback(async () => {
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
        toast("Link copiado. Manda pra alguém.", "success");
      }
    } catch {
      // The native share sheet can be dismissed. No need to alarm the user.
    }
  }, [post.author.handle, post.caption, post.id, toast]);

  const handleFollow = useCallback(() => {
    void toggleFollow(post.author.id);
  }, [post.author.id, toggleFollow]);

  return (
    <div className="post-cluster relative mx-auto flex h-full w-full items-stretch justify-center gap-3 md:gap-4">
      <div className="flex h-full min-w-0 flex-1 justify-center">
        <article
          ref={wrapperRef}
          id={post.id}
          className="post-frame mx-auto scroll-mt-24 overflow-hidden rounded-[22px] border border-line bg-[#0b0b0a] text-white shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:rounded-[26px]"
        >
          {isVideo ? (
            <video
              ref={videoRef}
              src={post.mediaUrl}
              poster={post.posterUrl ?? undefined}
              className="absolute inset-0 size-full object-cover"
              loop
              muted={!soundAudible}
              playsInline
              preload={isActive ? "auto" : isMobile ? "none" : "metadata"}
              onLoadedData={() => setLoaded(true)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(event) => {
                const element = event.currentTarget;
                if (element.duration > 0) setProgress(element.currentTime / element.duration);
              }}
              aria-hidden="true"
            />
          ) : (
            <img
              src={post.mediaUrl}
              alt={post.caption || `Foto de @${post.author.handle}`}
              className={cn(
                "absolute inset-0 size-full object-cover",
                isActive ? "media-zoom" : "",
              )}
              loading={isActive ? "eager" : "lazy"}
              decoding="async"
              referrerPolicy="no-referrer"
            />
          )}

          <button
            type="button"
            onClick={handleSurfaceClick}
            onDoubleClick={handleDoubleClick}
            className="absolute inset-0 z-[2] cursor-default focus-visible:outline-offset-[-5px]"
            aria-label={
              isVideo
                ? `Vídeo de ${post.author.displayName}. ${
                    soundAudible ? "Toque para pausar." : "Toque para ativar o som."
                  } Duplo toque para curtir.`
                : `Foto de ${post.author.displayName}. Duplo clique para curtir.`
            }
          />

          <div className="grain pointer-events-none absolute inset-0 z-[3]" />
          <div className="media-scrim-top pointer-events-none absolute inset-x-0 top-0 z-[4] h-36" />
          <div className="media-scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 z-[4] h-[62%]" />

          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
            <div className="pointer-events-auto flex items-start justify-between gap-3 p-4 max-md:pt-[max(1rem,env(safe-area-inset-top))]">
              <Link
                href={isMine ? "/profile" : `/u/${post.author.handle}`}
                className="flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-2 text-white"
              >
                <Avatar
                  name={post.author.displayName}
                  src={post.author.avatarUrl}
                  size={31}
                  className="border border-white/25"
                />
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[12px] font-semibold leading-none">
                    @{post.author.handle}
                  </span>
                  <span className="shrink-0 text-[10px] text-white/55">
                    {timeAgo(post.createdAt)}
                  </span>
                </span>
              </Link>

              <div className="flex shrink-0 items-start gap-2">
                {post.location ? (
                  <span className="hidden items-center gap-1 text-[9px] text-white/55 sm:flex">
                    <MapPin className="size-2.5" strokeWidth={1.8} />
                    {post.location}
                  </span>
                ) : null}
                <div className="flex flex-col items-end gap-2">
                  {!isMine ? (
                    <button
                      type="button"
                      onClick={handleFollow}
                      className={cn(
                        "flex h-7 items-center rounded-full border px-3 text-[9px] font-semibold uppercase tracking-[0.08em] backdrop-blur-md transition",
                        following
                          ? "border-white/15 bg-black/20 text-white/65 hover:border-white/30 hover:text-white"
                          : "border-white/25 bg-white/10 text-white hover:bg-accent hover:border-accent hover:text-[#0a0a0a]",
                      )}
                    >
                      {following ? "seguindo" : "seguir"}
                    </button>
                  ) : (
                    <span className="rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[8px] uppercase tracking-[0.14em] text-white/65 backdrop-blur-md">
                      seu post
                    </span>
                  )}

                  {isVideo && isActive ? (
                    <button
                      type="button"
                      onClick={handleSoundToggle}
                      aria-label={soundAudible ? "Desativar som do vídeo" : "Ativar som do vídeo"}
                      aria-pressed={soundAudible}
                      className="flex h-8 items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-3 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition active:scale-95 md:hidden"
                    >
                      {soundAudible ? (
                        <Volume2 className="size-3.5" strokeWidth={1.9} />
                      ) : (
                        <VolumeX className="size-3.5" strokeWidth={1.9} />
                      )}
                      {soundAudible ? "som ligado" : "ativar som"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-auto flex items-end p-4 pb-[18px] max-md:pb-[calc(78px+env(safe-area-inset-bottom))]">
              <div className="pointer-events-auto min-w-0 flex-1 pr-16 md:pr-0">
                <button
                  type="button"
                  onClick={() => setExpanded((value) => !value)}
                  className="block max-w-full text-left"
                >
                  <span
                    className={cn(
                      "block text-[12.5px] leading-[1.5] text-white/92 sm:text-[13px]",
                      expanded ? "" : "line-clamp-3",
                    )}
                    style={{ textShadow: "0 1px 12px rgba(0,0,0,.3)" }}
                  >
                    {post.caption}
                  </span>
                </button>

                {post.tags.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {post.tags.slice(0, 4).map((tag) => (
                      <Link
                        key={tag}
                        href={`/explore?tag=${encodeURIComponent(tag)}`}
                        className="text-[10.5px] font-medium text-white/72 transition hover:text-accent"
                      >
                        #{tag}
                      </Link>
                    ))}
                  </div>
                ) : null}

                <div className="mt-2.5 flex min-w-0 items-center gap-3 text-[9.5px] text-white/62">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Music2 className="size-3 shrink-0" strokeWidth={1.7} />
                    <span className="truncate">{post.audio || "som original"}</span>
                  </span>
                  <span className="hidden h-0.5 w-0.5 shrink-0 rounded-full bg-white/40 sm:block" />
                  <span className="hidden uppercase tracking-[0.12em] sm:block">
                    {isVideo ? "vídeo" : "foto"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {isVideo ? (
            <div className="pointer-events-none absolute inset-x-0 z-20 h-[2px] bg-white/20 max-md:bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0">
              <div
                className="h-full origin-left bg-accent transition-transform duration-150 ease-linear"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>
          ) : null}

          {isVideo && isActive && !playing && !pausedByOverlay ? (
            <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full border border-white/20 bg-black/30 backdrop-blur-md">
                <span className="ml-0.5 block size-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-white" />
              </span>
            </div>
          ) : null}

          {isVideo && !loaded && isActive ? (
            <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center bg-black/15">
              <span className="size-7 animate-spin rounded-full border border-white/25 border-t-accent" />
            </div>
          ) : null}

          {showBurst ? (
            <div className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center">
              <Heart
                key={burstKey}
                className="heart-burst size-24 text-accent drop-shadow-[0_8px_40px_rgba(0,0,0,0.35)]"
                fill="currentColor"
                strokeWidth={0}
              />
            </div>
          ) : null}
        </article>
      </div>

      <div className="pointer-events-none absolute bottom-[calc(88px+env(safe-area-inset-bottom))] right-3 z-20 flex flex-col items-center gap-3.5 md:static md:z-auto md:w-[54px] md:shrink-0 md:justify-end md:pb-3">
        <ActionButton
          label={liked ? "Descurtir" : "Curtir"}
          onClick={handleLike}
          icon={
            <Heart
              className={cn("size-[19px] transition", liked && "text-accent")}
              strokeWidth={liked ? 0 : 1.8}
              fill={liked ? "currentColor" : "none"}
            />
          }
          count={formatCompact(post.likesCount)}
          active={liked}
        />
        <ActionButton
          label="Comentar"
          onClick={() => onOpenComments(post)}
          icon={<MessageCircle className="size-[19px]" strokeWidth={1.8} />}
          count={formatCompact(post.commentsCount)}
        />
        <ActionButton
          label={saved ? "Remover dos guardados" : "Salvar"}
          onClick={handleSave}
          icon={
            <Bookmark
              className={cn("size-[18px]", saved && "text-accent")}
              strokeWidth={1.8}
              fill={saved ? "currentColor" : "none"}
            />
          }
        />
        <ActionButton
          label="Compartilhar"
          onClick={handleShare}
          icon={<Share2 className="size-[18px]" strokeWidth={1.8} />}
        />

        <div className="relative hidden pointer-events-auto md:block">
          <ActionButton
            label={soundAudible ? "Ajustar volume" : "Ativar som"}
            onClick={() => setVolumeOpen((value) => !value)}
            icon={
              soundAudible ? (
                <Volume2 className="size-[18px]" strokeWidth={1.8} />
              ) : (
                <VolumeX className="size-[18px]" strokeWidth={1.8} />
              )
            }
          />
          {volumeOpen ? (
            <div className="absolute bottom-full right-0 z-20 mb-2 w-[156px] rounded-full border border-line bg-surface px-3 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.18)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={soundAudible ? disableSound : enableSound}
                  aria-label={soundAudible ? "Silenciar" : "Ativar som"}
                  className="text-muted transition hover:text-ink"
                >
                  {soundAudible ? (
                    <Volume2 className="size-3.5" />
                  ) : (
                    <VolumeX className="size-3.5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={soundAudible ? Math.round(volume * 100) : 0}
                  onChange={(event) => {
                    const next = Number(event.target.value) / 100;
                    if (next === 0) disableSound();
                    else enableSound();
                    setVolume(next);
                  }}
                  aria-label="Volume do vídeo"
                  className="volume-range h-3 w-full"
                  style={
                    {
                      "--volume": `${soundAudible ? Math.round(volume * 100) : 0}%`,
                    } as CSSProperties
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  count,
  onClick,
  active = false,
}: {
  label: string;
  icon: React.ReactNode;
  count?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="pointer-events-auto group/action flex flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "flex size-11 items-center justify-center rounded-full border border-white/14 bg-black/26 text-white backdrop-blur-md transition duration-200 group-hover/action:scale-105 group-hover/action:border-white/25 group-hover/action:bg-black/45",
          "md:size-[41px] md:border-line md:bg-surface md:text-ink md:backdrop-blur-none md:group-hover/action:border-line-strong md:group-hover/action:bg-elevated",
          active && "border-accent/55 bg-accent/12 md:bg-accent/10",
        )}
      >
        {icon}
      </span>
      {count ? (
        <span className="text-[9px] font-medium leading-none tabular-nums text-white/78 md:text-muted">
          {count}
        </span>
      ) : null}
    </button>
  );
}
