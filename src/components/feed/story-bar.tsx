"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { ImagePlus, Loader2, Plus, Upload, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { StoryViewer } from "@/components/feed/story-viewer";
import { getVideoDuration, validateMediaFile } from "@/lib/media";
import type { MediaType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getErrorMessage as messageOf } from "@/lib/validation";

export function StoryBar() {
  const { user, stories, seenStoryIds, addStory, ensureAuth } = useApp();
  const { toast } = useToast();
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const ownGroup = user ? stories.find((group) => group.author.id === user.id) : undefined;
  const ownIndex = ownGroup ? stories.findIndex((group) => group.id === ownGroup.id) : -1;

  const openGroup = useCallback(
    (groupIndex: number) => {
      setViewerIndex(groupIndex);
    },
    [],
  );

  const openComposer = useCallback(() => {
    if (!ensureAuth()) return;
    setComposerOpen(true);
  }, [ensureAuth]);

  const handleOwnClick = () => {
    if (ownGroup && ownIndex >= 0) {
      openGroup(ownIndex);
    } else {
      openComposer();
    }
  };

  return (
    <>
      <section aria-label="Momentos" className="relative">
        <div className="mb-3.5 flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <span className="eyebrow text-muted">Momentos</span>
            <span className="text-[9px] uppercase tracking-[0.1em] text-muted/60">24 horas</span>
          </div>
          <button
            type="button"
            onClick={openComposer}
            className="flex items-center gap-1 text-[10px] font-medium text-muted transition hover:text-ink"
          >
            <Plus className="size-3" strokeWidth={2} />
            publicar
          </button>
        </div>

        <div className="no-scrollbar -mx-1 flex gap-[15px] overflow-x-auto px-1 pb-1">
          <StoryBubble
            label={user ? "seu momento" : "entrar"}
            name={user?.displayName ?? "velo"}
            src={user?.avatarUrl}
            own
            hasStory={Boolean(ownGroup)}
            unseen={Boolean(
              ownGroup && ownGroup.items.some((item) => !seenStoryIds.includes(item.id)),
            )}
            onClick={() => {
              if (!user) {
                openComposer();
                return;
              }
              handleOwnClick();
            }}
            onAdd={openComposer}
          />

          {stories
            .filter((group) => group.author.id !== user?.id)
            .map((group) => {
              const index = stories.findIndex((item) => item.id === group.id);
              const unseen = group.items.some((item) => !seenStoryIds.includes(item.id));
              return (
                <StoryBubble
                  key={group.id}
                  label={group.author.displayName.split(" ")[0] ?? group.author.handle}
                  name={group.author.displayName}
                  src={group.author.avatarUrl}
                  unseen={unseen}
                  onClick={() => openGroup(index)}
                />
              );
            })}
        </div>
      </section>

      {composerOpen ? (
        <StoryComposer
          onClose={() => setComposerOpen(false)}
          onPublish={addStory}
          onPublished={() => {
            setComposerOpen(false);
            toast("Momento no ar por 24 horas.", "success");
          }}
        />
      ) : null}

      {viewerIndex !== null && stories.length ? (
        <StoryViewer
          key={`${viewerIndex}-${stories.length}`}
          groups={stories}
          initialGroupIndex={Math.min(viewerIndex, stories.length - 1)}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </>
  );
}

function StoryBubble({
  label,
  name,
  src,
  unseen,
  own = false,
  hasStory = false,
  onClick,
  onAdd,
}: {
  label: string;
  name: string;
  src?: string | null;
  unseen: boolean;
  own?: boolean;
  hasStory?: boolean;
  onClick: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="flex w-[64px] shrink-0 flex-col items-center gap-1.5">
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          aria-label={own ? "Seu momento" : `Ver momento de ${name}`}
          className={cn(
            "group relative block rounded-full p-[2.5px] transition-transform duration-200 hover:scale-[1.03] active:scale-95",
            unseen ? "bg-accent" : "bg-line-strong/60",
          )}
        >
          <span className="block rounded-full bg-paper p-[3px]">
            <Avatar
              name={name}
              src={src}
              size={54}
              className="border border-line/60 transition group-hover:border-line-strong"
            />
          </span>
          {!unseen ? (
            <span className="pointer-events-none absolute inset-[2.5px] rounded-full ring-[3px] ring-paper" />
          ) : null}
        </button>
        {own ? (
          <button
            type="button"
            onClick={onAdd}
            aria-label="Adicionar momento"
            className="absolute -bottom-0.5 -right-0.5 flex size-[19px] items-center justify-center rounded-full border-2 border-paper bg-accent text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
          >
            <Plus className="size-3" strokeWidth={2.6} />
          </button>
        ) : null}
        {!own && hasStory ? (
          <span className="pointer-events-none absolute inset-0 rounded-full" />
        ) : null}
      </div>
      <span
        className={cn(
          "max-w-[64px] truncate text-[9.5px] leading-none",
          unseen ? "font-semibold text-ink" : "text-muted",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function StoryComposer({
  onClose,
  onPublish,
  onPublished,
}: {
  onClose: () => void;
  onPublish: (file: File, caption: string) => Promise<void>;
  onPublished: () => void;
}) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const chooseFile = useCallback(async (nextFile: File | undefined) => {
    if (!nextFile) return;
    setError(null);
    try {
      const kind = validateMediaFile(nextFile);
      if (kind === "video") {
        const duration = await getVideoDuration(nextFile);
        if (duration > 60) {
          throw new Error("Momentos em vídeo têm até 60 segundos.");
        }
      }
      setFile(nextFile);
      setMediaType(kind);
      setPreview(URL.createObjectURL(nextFile));
    } catch (reason) {
      setError(messageOf(reason));
    }
  }, []);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void chooseFile(event.dataTransfer.files?.[0]);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onPublish(file, caption);
      onPublished();
    } catch (reason) {
      setError(messageOf(reason));
      toast(messageOf(reason), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabel="Publicar um momento"
      className="max-w-[440px]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <header className="border-b border-line px-6 pb-4 pr-16 pt-5">
          <p className="eyebrow text-muted">momentos</p>
          <h2 className="mt-1.5 font-editorial text-[28px] leading-none tracking-[-0.02em]">
            Um instante, só.
          </h2>
        </header>

        <div className="space-y-5 p-5">
          <input
            ref={inputRef}
            id="story-media"
            type="file"
            accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              void chooseFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          {preview && mediaType ? (
            <div className="relative overflow-hidden rounded-[18px] border border-line bg-black">
              {mediaType === "video" ? (
                <video
                  src={preview}
                  className="max-h-[40svh] w-full object-contain"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  src={preview}
                  alt="Prévia do momento"
                  className="max-h-[40svh] w-full object-cover"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent p-3">
                <span className="text-[9px] uppercase tracking-[0.13em] text-white/75">
                  {mediaType === "video" ? "vídeo · até 60s" : "imagem"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (preview) URL.revokeObjectURL(preview);
                    setFile(null);
                    setMediaType(null);
                    setPreview(null);
                  }}
                  className="flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/70"
                  aria-label="Remover arquivo"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="story-media"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed px-6 py-10 text-center transition",
                dragging
                  ? "border-accent bg-accent-dim"
                  : "border-line-strong/60 bg-surface hover:border-line-strong",
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-full border border-line bg-paper text-muted">
                <ImagePlus className="size-4" strokeWidth={1.6} />
              </span>
              <span className="mt-4 text-[12.5px] font-semibold">Escolha uma foto ou vídeo</span>
              <span className="mt-1 text-[10px] leading-relaxed text-muted">
                JPG, PNG, WebP · MP4 ou WebM de até 60s
              </span>
              <span className="mt-4 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.11em]">
                selecionar arquivo
              </span>
            </label>
          )}

          <div>
            <label
              htmlFor="story-caption"
              className="mb-2 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-muted"
            >
              <span>legenda</span>
              <span className="tabular-nums text-muted/60">{caption.length}/120</span>
            </label>
            <input
              id="story-caption"
              value={caption}
              onChange={(event) => setCaption(event.target.value.slice(0, 120))}
              placeholder="O que está acontecendo?"
              maxLength={120}
              className="h-11 w-full rounded-[13px] border border-line bg-surface px-3.5 text-[12.5px] outline-none transition focus:border-line-strong focus:bg-paper"
            />
          </div>

          {error ? (
            <p className="rounded-[12px] border border-red-500/25 bg-red-500/8 px-3.5 py-2.5 text-[11px] leading-relaxed text-red-500 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="max-w-[180px] text-[9px] leading-relaxed text-muted">
            Momentos desaparecem depois de 24 horas.
          </p>
          <button
            type="submit"
            disabled={!file || busy}
            className="flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper disabled:opacity-35"
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                publicando
              </>
            ) : (
              <>
                <Upload className="size-3.5" strokeWidth={2} />
                publicar
              </>
            )}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
