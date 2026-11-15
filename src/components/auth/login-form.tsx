"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthField, authInputClass } from "@/components/auth/auth-field";
import { useApp } from "@/components/providers/app-provider";
import { useToast } from "@/components/providers/toast-provider";
import { flattenZodErrors, loginSchema } from "@/lib/validation";

export function LoginForm({ oauthError }: { oauthError?: string | null }) {
  const { ready, user, signIn } = useApp();
  const { toast } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(oauthError ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }

    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      toast("Bem-vindo de volta.", "success");
      router.push("/");
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="view-enter space-y-4">
        <span className="skeleton block h-3 w-32 rounded-full" />
        <span className="skeleton block h-12 w-48 rounded-full" />
        <span className="skeleton block h-3 w-full rounded-full" />
        <span className="skeleton mt-6 block h-11 w-full rounded-[12px]" />
        <span className="skeleton block h-11 w-full rounded-[12px]" />
        <span className="skeleton block h-11 w-full rounded-full" />
      </div>
    );
  }

  return (
    <div className="view-enter">
      <p className="eyebrow text-muted">bem-vindo de volta</p>
      <h1 className="mt-2 font-editorial text-[38px] leading-[0.92] tracking-[-0.04em] sm:text-[46px]">
        Entrar.
      </h1>
      <p className="mt-3 text-[11px] leading-relaxed text-muted sm:text-[11.5px]">
        Sua coleção, seus momentos e as pessoas que você segue esperam por aqui.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-3.5 sm:space-y-4">
        <AuthField id="login-email" label="e-mail" error={errors.email}>
          <input
            id="login-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={() => setEmail((value) => value.trim())}
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

        <AuthField
          id="login-password"
          label="senha"
          error={errors.password}
          hint={
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="flex items-center gap-1 transition hover:text-ink"
            >
              {showPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {showPassword ? "ocultar" : "mostrar"}
            </button>
          }
        >
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
            onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
            onBlur={() => setCapsLock(false)}
            placeholder="sua senha"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className={authInputClass}
          />
        </AuthField>

        {capsLock ? (
          <p className="text-[9.5px] leading-relaxed text-amber-600 dark:text-amber-300">
            Caps Lock está ativado. A senha diferencia maiúsculas de minúsculas.
          </p>
        ) : null}

        {formError ? (
          <p
            role="alert"
            className="rounded-[10px] border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-red-500 dark:text-red-300"
          >
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-[9.5px] font-semibold uppercase tracking-[0.13em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper disabled:opacity-40 sm:h-11"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          entrar
        </button>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[8px] uppercase tracking-[0.14em] text-muted/60">primeira vez</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Link
        href="/signup"
        className="mt-4 flex h-12 w-full items-center justify-center rounded-full border border-line-strong text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-surface sm:h-11"
      >
        criar uma conta
      </Link>

      <p className="mt-6 text-center text-[8.5px] leading-relaxed text-muted/60">
        Ao entrar, você concorda com os termos e a política de privacidade do velo.
      </p>
    </div>
  );
}
