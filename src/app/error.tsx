"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Brand } from "@/components/brand";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-paper px-5 py-8 text-ink">
      <Brand />
      <div className="flex flex-1 flex-col items-start justify-center">
        <p className="eyebrow text-muted">algo saiu do eixo</p>
        <h1 className="mt-4 max-w-[640px] font-editorial text-[52px] leading-[0.9] tracking-[-0.04em] sm:text-[72px]">
          Não conseguimos abrir essa cena.
        </h1>
        <p className="mt-4 max-w-[380px] text-[12px] leading-relaxed text-muted">
          Pode ser um soluço de conexão. Tente de novo — se persistir, confira a configuração do
          Supabase.
        </p>
        {error.digest ? (
          <p className="mt-3 text-[9px] uppercase tracking-[0.12em] text-muted/50">
            código {error.digest}
          </p>
        ) : null}
        <div className="mt-7 flex items-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
          >
            <RotateCcw className="size-3.5" strokeWidth={1.9} />
            tentar de novo
          </button>
          <Link
            href="/"
            className="flex h-11 items-center rounded-full border border-line-strong px-5 text-[9px] font-semibold uppercase tracking-[0.12em] transition hover:bg-surface"
          >
            ir para o feed
          </Link>
        </div>
      </div>
      <p className="text-[8px] uppercase tracking-[0.16em] text-muted/50">
        velo. — o mundo em movimento
      </p>
    </div>
  );
}
