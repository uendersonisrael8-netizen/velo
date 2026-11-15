"use client";

import { useState } from "react";
import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  size = 40,
  className,
  ring = false,
  alt,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  const sizeStyle = { width: size, height: size };

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated text-ink",
        ring && "ring-2 ring-accent ring-offset-2 ring-offset-paper",
        className,
      )}
      style={sizeStyle}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt ?? `Foto de ${name}`}
          width={size}
          height={size}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="font-semibold tracking-[-0.03em] text-muted"
          style={{ fontSize: Math.max(10, Math.round(size * 0.31)) }}
        >
          {initials(name) || "v"}
        </span>
      )}
    </span>
  );
}
