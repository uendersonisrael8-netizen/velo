"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { useBodyLock } from "@/components/ui/use-body-lock";
import { useClientMounted } from "@/components/ui/use-client-mounted";
import type { StoryGroup } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const IMAGE_DURATION = 5000;

export function StoryViewer({
  groups,
  initialGroupIndex,
  onClose,
}: {
  groups: StoryGroup[];
  initialGroupIndex: number;
  onClose: () => void;
}) {
  const { markStorySeen, muted, volume, setVolume, toggleMute } = useApp();
  const mounted = useClientMounted();
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const elapsedRef = useRef(0);
  const holdStartedRef = useRef(0);
  const didHoldRef = useRef(false);

  useBodyLock(true);

  const group = groups[Math.min(groupIndex, Math.max(groups.length - 1, 0))];
  const item = group?.items[Math.min(itemIndex, Math.max(group.items.length - 1, 0))];

  const goNext = useCallback(() => {
    if (!groups.length) {
      onClose();
      return;
    }
    const currentGroup = groups[groupIndex];
    if (currentGroup && itemIndex + 1 < currentGroup.items.length) {
      elapsedRef.current = 0;
      setProgress(0);
      setLoaded(false);
      setItemIndex(itemIndex + 1);
      return;
    }
    if (groupIndex + 1 < groups.length) {
      elapsedRef.current = 0;
      setProgress(0);
      setLoaded(false);
      setGroupIndex(groupIndex + 1);
      setItemIndex(0);
      return;
    }
    onClose();
  }, [groupIndex, groups, itemIndex, onClose]);

  const goPrev = useCallback(() => {
    const currentGroup = groups[groupIndex];
    if (itemIndex > 0) {
      elapsedRef.current = 0;
      setProgress(0);
      setLoaded(false);
      setItemIndex(itemIndex - 1);
      return;
    }
    if (currentGroup && groupIndex > 0) {
      elapsedRef.current = 0;
      setProgress(0);
      setLoaded(false);
      setGroupIndex(groupIndex - 1);
      setItemIndex(Math.max((groups[groupIndex - 1]?.items.length ?? 1) - 1, 0));
      return;
    }
    elapsedRef.current = 0;
    setProgress(0);
  }, [groupIndex, groups, itemIndex]);

  useEffect(() => {
    if (!item || item.mediaType !== "image" || paused || !loaded) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsedRef.current += now - last;
      last = now;
      const next = Math.min(1, elapsedRef.current / IMAGE_DURATION);
      setProgress(next);
      if (next >= 1) {
        window.clearInterval(timer);
        goNext();
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, [goNext, item, loaded, paused]);

  useEffect(() => {
    if (!item || item.mediaType !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted || volume === 0;
    video.volume = Math.min(1, Math.max(0, volume));
    if (paused) {
      video.pause();
    } else {
      void video.play().catch(() => setPaused(true));
    }
  }, [item, muted, paused, volume]);

  useEffect(() => {
    if (!group) return;
    markStorySeen(group.id);
  }, [group, markStorySeen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === " ") {
        event.preventDefault();
        setPaused((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, onClose]);

  const handleHoldStart = useCallback(() => {
    holdStartedRef.current = performance.now();
    didHoldRef.current = false;
    setPaused(true);
  }, []);

  const handleHoldEnd = useCallback(() => {
    if (performance.now() - holdStartedRef.current > 220) didHoldRef.current = true;
    setPaused(false);
  }, []);

  const handleStep = useCallback(
    (direction: "next" | "prev") => {
      if (didHoldRef.current) {
        didHoldRef.current = false;
        return;
      }
      if (direction === "next") goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  if (!mounted || !group || !item) return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[95] bg-black/94 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`Momento de ${group.author.displayName}`}
    >
      <div className="flex h-full items-center justify-center sm:p-6">
        <div className="relative h-full w-full max-w-[430px] overflow-hidden bg-[#050505] sm:h-[min(92svh,880px)] sm:rounded-[26px] sm:border sm:border-white/12 sm:shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
          {item.mediaType === "video" ? (
            <video
              key={item.id}
              ref={videoRef}
              src={item.mediaUrl}
              poster={item.posterUrl ?? undefined}
              className="absolute inset-0 size-full object-cover"
              playsInline
              loop={false}
              preload="auto"
              onLoadedData={() => setLoaded(true)}
              onTimeUpdate={(event) => {
                const element = event.currentTarget;
                if (element.duration > 0) {
                  setProgress(element.currentTime / element.duration);
                }
              }}
              onEnded={goNext}
            />
          ) : (
            <img
              key={item.id}
              src={item.mediaUrl}
              alt={item.caption || `Momento de ${group.author.displayName}`}
              className={cn(
                "absolute inset-0 size-full object-cover",
                loaded ? "poster-enter" : "opacity-0",
              )}
              onLoad={() => setLoaded(true)}
              draggable={false}
              referrerPolicy="no-referrer"
            />
          )}

          <div className="grain pointer-events-none absolute inset-0 z-[2]" />
          <div className="media-scrim-top pointer-events-none absolute inset-x-0 top-0 z-[3] h-40" />
          <div className="media-scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-60" />

          {!loaded ? (
            <div className="absolute inset-0 z-[4] flex items-center justify-center">
              <span className="size-8 animate-spin rounded-full border border-white/25 border-t-accent" />
            </div>
          ) : null}

          <div className="absolute inset-x-0 top-0 z-20 px-3 pt-3">
            <div className="flex gap-1">
              {group.items.map((storyItem, index) => (
                <div
                  key={storyItem.id}
                  className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/25"
                >
                  <div
                    className={cn(
                      "h-full origin-left rounded-full",
                      index === itemIndex ? "bg-accent" : "bg-white",
                    )}
                    style={{
                      transform: `scaleX(${
                        index < itemIndex ? 1 : index === itemIndex ? progress : 0
                      })`,
                      transition: index === itemIndex ? "transform 60ms linear" : undefined,
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  name={group.author.displayName}
                  src={group.author.avatarUrl}
                  size={31}
                  className="border border-white/25"
                />
                <div className="min-w-0 leading-tight text-white">
                  <p className="truncate text-[11.5px] font-semibold">
                    {group.author.displayName}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] text-white/60">
                    @{group.author.handle} · {timeAgo(item.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMuteOpen((value) => !value)}
                    aria-label={muted ? "Ativar som do momento" : "Ajustar som do momento"}
                    className="flex size-8 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white"
                  >
                    {muted || volume === 0 ? (
                      <VolumeX className="size-[17px]" strokeWidth={1.7} />
                    ) : (
                      <Volume2 className="size-[17px]" strokeWidth={1.7} />
                    )}
                  </button>
                  {muteOpen ? (
                    <div className="animate-fade-in absolute right-0 top-10 w-[150px] rounded-full border border-white/15 bg-black/80 px-3 py-2.5 backdrop-blur-xl">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={toggleMute}
                          aria-label={muted ? "Ativar som" : "Silenciar"}
                          className="text-white/70 transition hover:text-white"
                        >
                          {muted ? (
                            <VolumeX className="size-3.5" />
                          ) : (
                            <Volume2 className="size-3.5" />
                          )}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={muted ? 0 : Math.round(volume * 100)}
                          onChange={(event) => setVolume(Number(event.target.value) / 100)}
                          aria-label="Volume do momento"
                          className="volume-range h-3 w-full"
                          style={{ "--volume": `${muted ? 0 : Math.round(volume * 100)}%` } as CSSProperties}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar momento"
                  className="flex size-8 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="size-[19px]" strokeWidth={1.7} />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label="Momento anterior"
            onClick={() => handleStep("prev")}
            onPointerDown={handleHoldStart}
            onPointerUp={handleHoldEnd}
            onPointerCancel={handleHoldEnd}
            onPointerLeave={handleHoldEnd}
            className="absolute inset-y-0 left-0 z-10 w-[28%] cursor-default focus-visible:outline-offset-[-4px]"
          />
          <button
            type="button"
            aria-label="Próximo momento"
            onClick={() => handleStep("next")}
            onPointerDown={handleHoldStart}
            onPointerUp={handleHoldEnd}
            onPointerCancel={handleHoldEnd}
            onPointerLeave={handleHoldEnd}
            className="absolute inset-y-0 right-0 z-10 w-[28%] cursor-default focus-visible:outline-offset-[-4px]"
          />

          {paused && loaded ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md">
                <Play className="ml-0.5 size-5" fill="currentColor" strokeWidth={0} />
              </span>
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-5 pb-7 text-white">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[8px] uppercase tracking-[0.14em] text-white/75 backdrop-blur-md">
                <Pause className="size-2.5" strokeWidth={2} />
                segure para pausar
              </span>
              <span className="hidden items-center gap-1 text-[8px] uppercase tracking-[0.14em] text-white/45 sm:flex">
                <ChevronLeft className="size-3" />
                <ChevronRight className="size-3" />
                navegue
              </span>
            </div>
            {item.caption ? (
              <p
                className="mt-3 max-w-[92%] text-[13px] leading-[1.55] text-white/92"
                style={{ textShadow: "0 1px 18px rgba(0,0,0,.4)" }}
              >
                {item.caption}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[calc(100%-500px)] -translate-x-1/2 items-center justify-between px-6 xl:flex">
        <button
          type="button"
          onClick={goPrev}
          aria-label="Momento anterior"
          className="pointer-events-auto flex size-11 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <ChevronLeft className="size-5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label="Próximo momento"
          className="pointer-events-auto flex size-11 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-white/30 hover:text-white"
        >
          <ChevronRight className="size-5" strokeWidth={1.5} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
