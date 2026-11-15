"use client";

import { isSupabaseConfigured } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Aviso discreto para o modo prévia. A interface continua navegável; o aviso
 * só explica por que login, cadastro e publicação ainda não concluem.
 */
export function ConfigNotice({
  className,
  detailed = false,
}: {
  className?: string;
  detailed?: boolean;
}) {
  if (isSupabaseConfigured) return null;

  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 border border-line bg-surface/95 px-3.5 py-2 text-[9.5px] leading-relaxed text-muted shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl",
        className,
      )}
    >
      <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-accent" />
      <span>
        <span className="font-semibold uppercase tracking-[0.1em] text-ink/80">modo prévia</span>
        {" · "}
        {detailed
          ? "o Supabase ainda não está configurado. Você pode navegar e ver as telas; login e publicação funcionam depois de preencher as variáveis."
          : "Supabase não configurado"}
      </span>
    </p>
  );
}
