import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { ConfigNotice } from "@/components/shell/config-notice";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[1.02fr_0.98fr]">
      <aside className="relative hidden overflow-hidden bg-[#0a0a0a] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(255,77,28,0.28),transparent_42%),radial-gradient(circle_at_16%_82%,rgba(255,255,255,0.07),transparent_46%)]" />

        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 size-[780px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.07]"
        />
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.09]"
        />
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 size-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/25"
        />
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 size-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.08] blur-2xl"
        />

        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-[16%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[28%] h-px bg-gradient-to-r from-accent/50 via-white/10 to-transparent"
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <Link
            href="/"
            aria-label="velo. — página inicial"
            className="inline-flex w-fit flex-col gap-1.5 text-white"
          >
            <span className="font-editorial text-[38px] leading-[0.78] tracking-[-0.055em]">
              velo<span className="text-accent">.</span>
            </span>
            <span className="eyebrow text-[8px] leading-none text-white/40">
              o mundo em movimento
            </span>
          </Link>

          <div className="max-w-[460px]">
            <p className="eyebrow text-[8px] text-white/40">uma rede social para olhar de perto</p>
            <p className="mt-5 font-editorial text-[64px] leading-[0.88] tracking-[-0.045em] text-white xl:text-[78px]">
              o mundo
              <br />
              em movimento<span className="text-accent">.</span>
            </p>
            <p className="mt-6 max-w-[310px] text-[11.5px] leading-[1.7] text-white/55">
              Vídeos curtos, fotografia e tudo o que acontece entre um scroll e outro.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <span className="h-px w-10 bg-accent" />
              <span className="text-[8.5px] uppercase tracking-[0.16em] text-white/45">
                feito para olhar devagar
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-white/12 pt-5 text-[8px] uppercase tracking-[0.16em] text-white/35">
            <span>publicado por pessoas reais</span>
            <span>velo. 2026</span>
          </div>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5 sm:py-4 lg:hidden">
          <Brand compact />
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted transition hover:text-ink"
          >
            <ArrowLeft className="size-3" strokeWidth={1.8} />
            feed
          </Link>
        </div>

        <div className="flex flex-1 flex-col justify-start px-4 py-6 sm:justify-center sm:px-6 sm:py-10 lg:py-14">
          <div className="w-full max-w-[360px] self-center sm:max-w-[378px]">
            <ConfigNotice detailed className="mb-5 rounded-[12px] sm:mb-6" />
            {children}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 text-[8px] uppercase tracking-[0.12em] text-muted/50 sm:px-8 sm:pb-6">
          <span>© {new Date().getFullYear()} velo.</span>
          <span>feito para olhar devagar</span>
        </footer>
      </main>
    </div>
  );
}
