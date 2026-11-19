"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { AuthField, authInputClass } from "@/components/auth/auth-field";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { flattenZodErrors, signUpSchema } from "@/lib/validation";
import {
  TECHNICAL_INPUT_PROPS,
  WORDS_INPUT_PROPS,
} from "@/lib/input-suggestions";
import { normalizeHandle } from "@/lib/utils";

export function SignupForm() {
  const { ready, user, signUp } = useApp();
  const { toast } = useToast();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const parsed = signUpSchema.safeParse({
      displayName,
      handle,
      email,
      password,
      confirmPassword,
      terms,
    });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }

    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      const result = await signUp({
        displayName: parsed.data.displayName,
        handle: parsed.data.handle,
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (result.needsConfirmation) {
        setSentTo(parsed.data.email);
      } else {
        toast("Conta criada. Bem-vindo ao velo.", "success");
        router.push("/");
      }
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível criar sua conta.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="view-enter space-y-4">
        <span className="skeleton block h-3 w-28 rounded-full" />
        <span className="skeleton block h-12 w-44 rounded-full" />
        <span className="skeleton block h-3 w-full rounded-full" />
        <span className="skeleton mt-6 block h-11 w-full rounded-[12px]" />
        <span className="skeleton block h-11 w-full rounded-[12px]" />
        <span className="skeleton block h-11 w-full rounded-[12px]" />
        <span className="skeleton block h-11 w-full rounded-[12px]" />
        <span className="skeleton block h-11 w-full rounded-full" />
      </div>
    );
  }

  if (sentTo) {
    return (
      <div className="view-enter text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full border border-line bg-surface text-accent">
          <MailCheck className="size-5" strokeWidth={1.6} />
        </span>
        <p className="eyebrow mt-6 text-muted">quase lá</p>
        <h1 className="mt-2 font-editorial text-[36px] leading-[0.92] tracking-[-0.035em] sm:text-[42px]">
          Confira seu e-mail.
        </h1>
        <p className="mx-auto mt-3 max-w-[300px] text-[11.5px] leading-relaxed text-muted">
          Mandamos um link de confirmação para{" "}
          <span className="text-ink">{sentTo}</span>. Depois de confirmar, é só entrar.
        </p>
        <Link
          href="/login"
          className="mt-7 flex h-12 w-full items-center justify-center rounded-full bg-accent text-[9px] font-semibold uppercase tracking-[0.13em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper sm:h-11"
        >
          ir para o login
        </Link>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="mt-4 text-[9px] font-medium uppercase tracking-[0.1em] text-muted transition hover:text-ink"
        >
          usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <div className="view-enter">
      <p className="eyebrow text-muted">novo por aqui</p>
      <h1 className="mt-2 font-editorial text-[36px] leading-[0.92] tracking-[-0.04em] sm:text-[44px]">
        Criar conta.
      </h1>
      <p className="mt-3 text-[11px] leading-relaxed text-muted sm:text-[11.5px]">
        Um nome, um handle e um lugar para o que você vê. O resto vem com o tempo.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3.5 sm:space-y-4">
        <AuthField id="signup-name" label="seu nome" error={errors.displayName}>
          <input
            {...WORDS_INPUT_PROPS}
            autoComplete="name"
            id="signup-name"
            value={displayName}
            onChange={(event) => {
              const value = event.target.value;
              setDisplayName(value);
              if (!handleTouched) setHandle(normalizeHandle(value));
            }}
            placeholder="Como você quer ser chamado"
            maxLength={60}
            className={authInputClass}
          />
        </AuthField>

        <AuthField
          id="signup-handle"
          label="handle"
          error={errors.handle}
          hint={handle ? `@${handle}` : "só letras, números e _"}
        >
          <div className="flex h-12 items-center rounded-[12px] border border-line bg-surface pl-3.5 pr-3 transition focus-within:border-line-strong focus-within:bg-paper sm:h-11">
            <span className="text-[12px] text-muted">@</span>
            <input
              {...TECHNICAL_INPUT_PROPS}
              autoComplete="username"
              id="signup-handle"
              value={handle}
              onChange={(event) => {
                setHandleTouched(true);
                setHandle(event.target.value.toLowerCase());
              }}
              placeholder="seu_handle"
              maxLength={24}
              className="min-w-0 flex-1 bg-transparent px-1 text-[16px] text-ink outline-none placeholder:text-muted/60 sm:text-[12px]"
            />
          </div>
        </AuthField>

        <AuthField id="signup-email" label="e-mail" error={errors.email}>
          <input
            id="signup-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmail((value) => value.trim().toLowerCase())}
            placeholder="voce@email.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            className={authInputClass}
          />
        </AuthField>

        <div className="grid gap-3.5 sm:grid-cols-2 sm:gap-4">
          <AuthField
            id="signup-password"
            label="senha"
            error={errors.password}
            hint={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="flex items-center gap-1 transition hover:text-ink"
                aria-label={showPassword ? "Ocultar senhas" : "Mostrar senhas"}
              >
                {showPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              </button>
            }
          >
            <input
              {...TECHNICAL_INPUT_PROPS}
              autoComplete="new-password"
              id="signup-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8+ caracteres"
              className={authInputClass}
            />
          </AuthField>
          <AuthField id="signup-confirm" label="confirmar" error={errors.confirmPassword}>
            <input
              {...TECHNICAL_INPUT_PROPS}
              autoComplete="new-password"
              id="signup-confirm"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="repetir senha"
              className={authInputClass}
            />
          </AuthField>
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-[10px] leading-relaxed text-muted sm:text-[9.5px]">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]"
            />
            <span>
              Aceito os termos de uso e a política de privacidade do velo. Meu conteúdo segue as
              diretrizes da comunidade.
            </span>
          </label>
          {errors.terms ? (
            <p className="mt-1 text-[9.5px] text-red-500 dark:text-red-300">{errors.terms}</p>
          ) : null}
        </div>

        {formError ? (
          <p className="rounded-[10px] border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-red-500 dark:text-red-300">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[9.5px] font-semibold uppercase tracking-[0.13em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper disabled:opacity-40 sm:h-11"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          criar conta
        </button>
      </form>

      <p className="mt-6 text-center text-[9px] text-muted">
        Já tem uma conta?{" "}
        <Link href="/login" className="font-semibold text-ink underline-offset-4 hover:underline">
          entrar
        </Link>
      </p>
    </div>
  );
}
