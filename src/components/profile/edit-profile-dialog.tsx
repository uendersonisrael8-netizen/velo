"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { validateImageFile } from "@/lib/media";
import {
  SENTENCE_INPUT_PROPS,
  TECHNICAL_INPUT_PROPS,
  WORDS_INPUT_PROPS,
} from "@/lib/input-suggestions";
import { flattenZodErrors, profileSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";

export function EditProfileDialog({ onClose }: { onClose: () => void }) {
  const { user, updateProfile } = useApp();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [handle, setHandle] = useState(user?.handle ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [link, setLink] = useState(user?.link ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  if (!user) return null;

  const currentAvatar = avatarPreview ?? (removeAvatar ? null : user.avatarUrl);

  const pickAvatar = (file: File | undefined) => {
    if (!file) return;
    try {
      validateImageFile(file, 4 * 1024 * 1024);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setRemoveAvatar(false);
      setFormError(null);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Escolha outra imagem.");
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = profileSchema.safeParse({
      displayName,
      handle,
      bio,
      link: link || undefined,
      location: location || undefined,
    });
    if (!result.success) {
      setErrors(flattenZodErrors(result.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await updateProfile({
        displayName: result.data.displayName,
        handle: result.data.handle,
        bio: result.data.bio,
        link: result.data.link,
        location: result.data.location,
        avatarFile,
        removeAvatar,
      });
      toast("Perfil atualizado.", "success");
      onClose();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Não foi possível salvar o perfil.";
      setFormError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} ariaLabel="Editar perfil" className="max-w-[520px]">
      <form onSubmit={handleSubmit}>
        <header className="border-b border-line px-6 pb-4 pr-16 pt-5">
          <p className="eyebrow text-muted">sua conta</p>
          <h2 className="mt-1.5 font-editorial text-[28px] leading-none tracking-[-0.02em]">
            Editar perfil
          </h2>
        </header>

        <div className="max-h-[64svh] space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-4">
            <Avatar
              name={displayName || user.displayName}
              src={currentAvatar}
              size={72}
              className="border border-line"
            />
            <div>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  pickAvatar(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[9px] font-semibold uppercase tracking-[0.1em] transition hover:border-line-strong"
                >
                  <Camera className="size-3" strokeWidth={1.8} />
                  trocar foto
                </button>
                {currentAvatar ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarFile(null);
                      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                      setAvatarPreview(null);
                      setRemoveAvatar(true);
                    }}
                    className="flex size-8 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink"
                    aria-label="Remover foto"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-[9px] text-muted">JPG, PNG ou WebP até 4 MB.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="profile-name"
              label="nome"
              error={errors.displayName}
              counter={`${displayName.length}/60`}
            >
              <input
                {...WORDS_INPUT_PROPS}
                autoComplete="name"
                id="profile-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value.slice(0, 60))}
                maxLength={60}
                className="h-11 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[12px] outline-none transition focus:border-line-strong focus:bg-paper"
              />
            </Field>
            <Field id="profile-handle" label="handle" error={errors.handle}>
              <div className="flex h-11 items-center rounded-[12px] border border-line bg-surface pl-3.5 pr-3 transition focus-within:border-line-strong focus-within:bg-paper">
                <span className="text-[12px] text-muted">@</span>
                <input
                  {...TECHNICAL_INPUT_PROPS}
                  autoComplete="username"
                  id="profile-handle"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value.toLowerCase())}
                  maxLength={24}
                  className="min-w-0 flex-1 bg-transparent px-1 text-[12px] outline-none"
                />
              </div>
            </Field>
          </div>

          <Field
            id="profile-bio"
            label="bio"
            error={errors.bio}
            counter={`${bio.length}/160`}
          >
            <textarea
              {...SENTENCE_INPUT_PROPS}
              autoComplete="on"
              id="profile-bio"
              value={bio}
              onChange={(event) => setBio(event.target.value.slice(0, 160))}
              rows={3}
              maxLength={160}
              className="w-full resize-none rounded-[12px] border border-line bg-surface px-3.5 py-3 text-[12px] leading-relaxed outline-none transition focus:border-line-strong focus:bg-paper"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="profile-link" label="link" error={errors.link}>
              <input
                {...TECHNICAL_INPUT_PROPS}
                autoComplete="url"
                inputMode="url"
                id="profile-link"
                value={link}
                onChange={(event) => setLink(event.target.value.slice(0, 120))}
                placeholder="seu-site.com"
                maxLength={120}
                className="h-11 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[12px] outline-none transition placeholder:text-muted/60 focus:border-line-strong focus:bg-paper"
              />
            </Field>
            <Field id="profile-location" label="lugar" error={errors.location}>
              <input
                {...WORDS_INPUT_PROPS}
                autoComplete="on"
                id="profile-location"
                value={location}
                onChange={(event) => setLocation(event.target.value.slice(0, 60))}
                placeholder="São Paulo, BR"
                maxLength={60}
                className="h-11 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[12px] outline-none transition placeholder:text-muted/60 focus:border-line-strong focus:bg-paper"
              />
            </Field>
          </div>

          {formError ? (
            <p className="rounded-[10px] border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-red-500 dark:text-red-300">
              {formError}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted transition hover:text-ink"
          >
            cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            salvar
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  counter,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  counter?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted"
        >
          {label}
        </label>
        {counter ? <span className="text-[8.5px] text-muted/60">{counter}</span> : null}
      </div>
      {children}
      {error ? (
        <p className={cn("mt-1 text-[9.5px] text-red-500 dark:text-red-300")}>{error}</p>
      ) : null}
    </div>
  );
}
