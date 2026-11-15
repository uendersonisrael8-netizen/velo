import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-paper px-5 py-8 text-ink">
      <Brand />
      <div className="flex flex-1 flex-col items-start justify-center">
        <p className="eyebrow text-muted">404 · fora de quadro</p>
        <h1 className="mt-4 max-w-[620px] font-editorial text-[54px] leading-[0.9] tracking-[-0.04em] sm:text-[76px]">
          Essa página saiu de foco.
        </h1>
        <p className="mt-4 max-w-[360px] text-[12px] leading-relaxed text-muted">
          O link pode ter mudado, ou a página nunca existiu. O feed continua logo ali.
        </p>
        <Link
          href="/"
          className="mt-7 flex h-11 items-center rounded-full bg-accent px-6 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
        >
          voltar para o feed
        </Link>
      </div>
      <p className="text-[8px] uppercase tracking-[0.16em] text-muted/50">
        velo. — o mundo em movimento
      </p>
    </div>
  );
}
