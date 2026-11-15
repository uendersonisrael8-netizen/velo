import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AuthField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted"
        >
          {label}
        </label>
        {hint ? <span className="text-[8.5px] text-muted/60">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className={cn("mt-1.5 text-[9.5px] leading-relaxed text-red-500 dark:text-red-300")}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const authInputClass =
  "h-12 w-full rounded-[12px] border border-line bg-surface px-3.5 text-[16px] text-ink outline-none transition placeholder:text-muted/60 focus:border-line-strong focus:bg-paper sm:h-11 sm:text-[12px]";
