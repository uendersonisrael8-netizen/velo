"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBodyLock } from "@/components/ui/use-body-lock";
import { useClientMounted } from "@/components/ui/use-client-mounted";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  closeLabel?: string;
  hideClose?: boolean;
  align?: "center" | "start";
};

export function Dialog({
  open,
  onClose,
  children,
  ariaLabel,
  className,
  closeLabel = "Fechar",
  hideClose = false,
  align = "center",
}: DialogProps) {
  const mounted = useClientMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useBodyLock(open);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        "[data-autofocus], button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])",
      );
      focusable?.focus();
    }, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [onClose, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[80] flex justify-center overflow-y-auto overscroll-contain bg-black/72 p-4 backdrop-blur-[3px]",
        align === "center" ? "items-center py-8" : "items-start py-8",
        "animate-fade-in",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={cn(
          "relative my-auto w-full overflow-hidden rounded-[24px] border border-line bg-paper text-ink shadow-[0_40px_120px_rgba(0,0,0,0.45)]",
          className,
        )}
      >
        {!hideClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute right-4 top-4 z-20 flex size-9 items-center justify-center rounded-full border border-line bg-paper/80 text-ink backdrop-blur-md transition hover:border-line-strong hover:bg-elevated"
          >
            <X className="size-4" strokeWidth={1.6} />
          </button>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
