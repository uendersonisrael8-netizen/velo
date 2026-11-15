"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUpRight,
  Check,
  Film,
  ImagePlus,
  Loader2,
  MapPin,
  Music2,
  Plus,
  X,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  extractVideoPoster,
  getVideoDuration,
  MAX_VIDEO_SECONDS,
  validateMediaFile,
} from "@/lib/media";
import type { MediaType } from "@/lib/types";
import { uploadSchema } from "@/lib/validation";
import {
  cn,
  formatFileSize,
  normalizeTag,
  pluralize,
} from "@/lib/utils";

const SUGGESTED_TAGS = [
  "rua",
  "analogico",
  "litoral",
  "cafe",
  "moda",
  "danca",
  "musica",
  "arquitetura",
];

const RULES = [
  "vertical 9:16 rende mais no feed",
  "vídeos de até 3 minutos e 50 MB",
  "som original ou uma faixa sua",
];

export function UploadView() {
  const { ready, createPost } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [location, setLocation] = useState("");
  const [audio, setAudio] = useState("");
  const [showAudio, setShowAudio] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = useCallback(async (nextFile: File | undefined) => {
    if (!nextFile) return;
    setProcessing(true);
    setError(null);
    try {
      const kind = validateMediaFile(nextFile);
      let nextDuration = 0;
      let poster: Blob | null = null;

      if (kind === "video") {
        nextDuration = await getVideoDuration(nextFile);
        if (nextDuration > MAX_VIDEO_SECONDS) {
          throw new Error("Vídeos do feed têm até 3 minutos.");
        }
        poster = await extractVideoPoster(nextFile);
      }

      setFile(nextFile);
      setMediaType(kind);
      setDuration(nextDuration);
      setPosterBlob(poster);
      setPreview(URL.createObjectURL(nextFile));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível abrir esse arquivo.");
    } finally {
      setProcessing(false);
    }
  }, []);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const addTags = useCallback(
    (values: string[]) => {
      setTags((current) => {
        const next = [...current];
        for (const value of values) {
          const clean = normalizeTag(value);
          if (clean && !next.includes(clean) && next.length < 8) next.push(clean);
        }
        return next;
      });
      setTagDraft("");
    },
    [],
  );

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === " ") {
      event.preventDefault();
      if (tagDraft.trim()) addTags([tagDraft]);
      return;
    }
    if (event.key === "Backspace" && !tagDraft && tags.length) {
      setTags((current) => current.slice(0, -1));
    }
  };

  const resetFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setMediaType(null);
    setPreview(null);
    setPosterBlob(null);
    setDuration(0);
    setError(null);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!file) {
      setError("Escolha uma foto ou um vídeo antes de publicar.");
      return;
    }

    const pending = tagDraft.trim() ? [...tags, normalizeTag(tagDraft)] : tags;
    const parsed = uploadSchema.safeParse({
      caption,
      tags: pending,
      location: location || undefined,
      audio: showAudio ? audio || undefined : undefined,
    });

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Revise os campos antes de publicar.";
      setError(message);
      toast(message, "error");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const post = await createPost({
        file,
        caption: parsed.data.caption,
        tags: parsed.data.tags,
        location: parsed.data.location,
        audio: parsed.data.audio,
        posterBlob,
      });
      toast("Publicado. Seu momento já está no feed.", "success");
      router.push(`/#${post.id}`);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Não foi possível publicar. Tente de novo.";
      setError(message);
      toast(message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="mx-auto grid w-full max-w-[1080px] gap-8 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:px-10">
        <div className="skeleton aspect-[4/5] rounded-[20px]" />
        <div className="space-y-4">
          <span className="skeleton block h-3 w-24 rounded-full" />
          <span className="skeleton block h-12 w-64 rounded-full" />
          <span className="skeleton block h-28 w-full rounded-[16px]" />
          <span className="skeleton block h-11 w-full rounded-[13px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-20 pt-7 sm:px-6 lg:px-10 lg:pt-11">
      <header className="view-enter mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-muted">publicar</p>
            <h1 className="mt-2 font-editorial text-[46px] leading-[0.9] tracking-[-0.04em] sm:text-[54px]">
              Novo momento
            </h1>
            <p className="mt-2.5 max-w-[400px] text-[11.5px] leading-relaxed text-muted">
              Uma foto, um vídeo, uma frase. O suficiente para alguém parar por alguns segundos.
            </p>
          </div>
          {isSupabaseConfigured ? (
            <div className="hidden items-center gap-2 pb-1 text-[8.5px] uppercase tracking-[0.14em] text-muted/70 sm:flex">
              <span className="size-1 rounded-full bg-accent" />
              conectado ao supabase
            </div>
          ) : null}
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="view-enter grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10"
      >
        <div>
          <input
            ref={inputRef}
            id="upload-media"
            type="file"
            accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              void handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          {preview && mediaType ? (
            <div className="relative overflow-hidden rounded-[20px] border border-line bg-black shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
              <div className="aspect-[4/5]">
                {mediaType === "video" ? (
                  <video
                    src={preview}
                    className="size-full object-cover"
                    controls
                    loop
                    playsInline
                  />
                ) : (
                  <img src={preview} alt="Prévia da publicação" className="size-full object-cover" />
                )}
              </div>
              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent p-3">
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/32 px-2.5 py-1.5 text-[8px] uppercase tracking-[0.12em] text-white/80 backdrop-blur-md">
                  {mediaType === "video" ? (
                    <Film className="size-3" strokeWidth={1.8} />
                  ) : (
                    <ImagePlus className="size-3" strokeWidth={1.8} />
                  )}
                  {mediaType}
                </span>
                <button
                  type="button"
                  onClick={resetFile}
                  className="flex size-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition hover:bg-black/70"
                  aria-label="Remover arquivo"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[10.5px] font-medium text-white/90">{file?.name}</p>
                  <p className="mt-0.5 text-[9px] text-white/60">
                    {file ? formatFileSize(file.size) : ""}
                    {duration
                      ? ` · ${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-white transition hover:bg-white hover:text-black"
                >
                  trocar
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="upload-media"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "relative flex aspect-[4/5] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[20px] border border-dashed px-8 text-center transition",
                dragging
                  ? "border-accent bg-accent-dim"
                  : "border-line-strong/60 bg-surface hover:border-line-strong",
              )}
            >
              <span className="pointer-events-none absolute inset-0 opacity-[0.4] [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:20px_20px]" />
              <span className="relative flex size-14 items-center justify-center rounded-full border border-line bg-paper text-muted">
                {processing ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ImagePlus className="size-5" strokeWidth={1.5} />
                )}
              </span>
              <span className="relative mt-5 text-[13px] font-semibold">
                {processing ? "Preparando seu arquivo…" : "Arraste ou escolha um arquivo"}
              </span>
              <span className="relative mt-1.5 max-w-[220px] text-[10px] leading-relaxed text-muted">
                MP4, WebM, JPG, PNG ou WebP. O vídeo vira capa automaticamente.
              </span>
              <span className="relative mt-5 rounded-full border border-line-strong bg-paper px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em]">
                escolher do dispositivo
              </span>
            </label>
          )}

          <div className="mt-4 flex items-start gap-2.5 rounded-[13px] border border-line bg-surface px-3.5 py-3">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[#0a0a0a]">
              <Check className="size-3" strokeWidth={2.6} />
            </span>
            <p className="text-[9.5px] leading-relaxed text-muted">
              {mediaType === "video"
                ? "A capa é gerada a partir de um frame do vídeo. Você pode trocar o arquivo quando quiser."
                : "Fotos são publicadas na proporção original. O feed recorta para 9:16 quando necessário."}
            </p>
          </div>

          <div className="mt-6">
            <p className="eyebrow text-muted">antes de publicar</p>
            <ul className="mt-3 space-y-2">
              {RULES.map((rule) => (
                <li key={rule} className="flex items-start gap-2 text-[10px] leading-relaxed text-muted">
                  <span className="mt-[5px] size-1 shrink-0 rounded-full bg-accent" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="space-y-7">
            <section>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="caption"
                  className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted"
                >
                  01 · legenda
                </label>
                <span className="text-[9px] tabular-nums text-muted/60">{caption.length}/2200</span>
              </div>
              <textarea
                id="caption"
                value={caption}
                onChange={(event) => setCaption(event.target.value.slice(0, 2200))}
                placeholder="Conte o que aconteceu, o que você viu, o que ficou."
                rows={5}
                maxLength={2200}
                className="w-full resize-none rounded-[15px] border border-line bg-surface px-4 py-3.5 text-[12.5px] leading-relaxed text-ink outline-none transition placeholder:text-muted/65 focus:border-line-strong focus:bg-paper"
              />
            </section>

            <section>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <label
                  htmlFor="tags"
                  className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted"
                >
                  02 · tags
                </label>
                <span className="text-[9px] tabular-nums text-muted/60">{tags.length}/8</span>
              </div>
              <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-[13px] border border-line bg-surface px-3 py-2 transition focus-within:border-line-strong focus-within:bg-paper">
                {tags.map((item) => (
                  <span
                    key={item}
                    className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-[10px] text-ink shadow-sm"
                  >
                    #{item}
                    <button
                      type="button"
                      onClick={() => setTags((current) => current.filter((tag) => tag !== item))}
                      aria-label={`Remover tag ${item}`}
                      className="text-muted transition hover:text-accent"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  id="tags"
                  value={tagDraft}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value.includes(",") || value.includes(" ")) {
                      addTags(value.split(/[,\s]+/));
                    } else {
                      setTagDraft(value.slice(0, 24));
                    }
                  }}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => {
                    if (tagDraft.trim()) addTags([tagDraft]);
                  }}
                  placeholder={tags.length ? "mais uma…" : "rua, analogico, domingo…"}
                  className="h-7 min-w-[120px] flex-1 bg-transparent px-1 text-[11.5px] outline-none"
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {SUGGESTED_TAGS.filter((item) => !tags.includes(item))
                  .slice(0, 6)
                  .map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => addTags([item])}
                      className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[9px] text-muted transition hover:border-line-strong hover:text-ink"
                    >
                      <Plus className="size-2.5" strokeWidth={2} />
                      {item}
                    </button>
                  ))}
              </div>
            </section>

            <section>
              <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
                03 · detalhes
              </p>
              <div className="space-y-2.5">
                <label className="flex h-11 items-center gap-2.5 rounded-[13px] border border-line bg-surface px-3.5 transition focus-within:border-line-strong focus-within:bg-paper">
                  <MapPin className="size-3.5 shrink-0 text-muted" strokeWidth={1.7} />
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value.slice(0, 80))}
                    placeholder="Onde foi? (opcional)"
                    maxLength={80}
                    className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
                  />
                </label>

                {showAudio ? (
                  <label className="flex h-11 items-center gap-2.5 rounded-[13px] border border-line bg-surface px-3.5 transition focus-within:border-line-strong focus-within:bg-paper">
                    <Music2 className="size-3.5 shrink-0 text-muted" strokeWidth={1.7} />
                    <input
                      value={audio}
                      onChange={(event) => setAudio(event.target.value.slice(0, 120))}
                      placeholder="Nome do som ou artista"
                      maxLength={120}
                      autoFocus
                      className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowAudio(false);
                        setAudio("");
                      }}
                      aria-label="Remover som"
                      className="text-muted transition hover:text-ink"
                    >
                      <X className="size-3.5" />
                    </button>
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAudio(true)}
                    className="flex h-11 w-full items-center gap-2.5 rounded-[13px] border border-dashed border-line px-3.5 text-[10.5px] text-muted transition hover:border-line-strong hover:text-ink"
                  >
                    <Music2 className="size-3.5" strokeWidth={1.7} />
                    adicionar um som
                    <Plus className="ml-auto size-3.5" strokeWidth={1.8} />
                  </button>
                )}
              </div>
            </section>

            {error ? (
              <p className="rounded-[12px] border border-red-500/25 bg-red-500/8 px-3.5 py-2.5 text-[11px] leading-relaxed text-red-500 dark:text-red-300">
                {error}
              </p>
            ) : null}
          </div>

          <div className="mt-8 flex items-center gap-3 border-t border-line pt-5">
            <button
              type="submit"
              disabled={busy || processing || !file}
              className="flex h-11 items-center gap-2 rounded-full bg-accent px-6 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper disabled:opacity-35"
            >
              {busy ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  publicando…
                </>
              ) : (
                <>
                  publicar no velo
                  <ArrowUpRight className="size-3.5" strokeWidth={2} />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="h-11 rounded-full px-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted transition hover:text-ink"
            >
              cancelar
            </button>
            <span className="ml-auto hidden text-[8.5px] uppercase tracking-[0.12em] text-muted/60 sm:block">
              {tags.length} {pluralize(tags.length, "tag", "tags")}
            </span>
          </div>
          <p className="mt-3 text-[8.5px] leading-relaxed text-muted/70">
            Ao publicar, você confirma que tem os direitos da mídia e aceita as diretrizes da
            comunidade.
          </p>
        </div>
      </form>
    </div>
  );
}
