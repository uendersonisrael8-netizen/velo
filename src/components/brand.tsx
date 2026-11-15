import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({
  className,
  href = "/",
  compact = false,
}: {
  className?: string;
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="velo. — página inicial"
      className={cn("group inline-flex flex-col gap-1.5", className)}
    >
      <span className="font-editorial text-[36px] leading-[0.78] tracking-[-0.055em] text-ink">
        velo<span className="text-accent transition-colors group-hover:text-ink">.</span>
      </span>
      {!compact ? (
        <span className="eyebrow text-[8px] leading-none text-muted">
          o mundo em movimento
        </span>
      ) : null}
    </Link>
  );
}
