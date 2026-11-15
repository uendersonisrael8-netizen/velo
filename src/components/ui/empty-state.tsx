import type { ReactNode } from "react";

export function EmptyState({
  eyebrow,
  title,
  body,
  action,
  icon,
  className,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[20px] border border-line bg-surface px-8 py-14 text-center ${className ?? ""}`}
    >
      {icon ? (
        <span className="mb-5 flex size-11 items-center justify-center rounded-full border border-line bg-paper text-muted">
          {icon}
        </span>
      ) : null}
      {eyebrow ? <p className="eyebrow text-muted">{eyebrow}</p> : null}
      <p className="mt-2 max-w-[280px] font-editorial text-[27px] leading-[1.1] tracking-[-0.02em]">
        {title}
      </p>
      {body ? (
        <p className="mt-2.5 max-w-[300px] text-[11.5px] leading-relaxed text-muted">{body}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
