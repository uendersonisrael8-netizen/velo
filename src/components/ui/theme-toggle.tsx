"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Modo claro" : "Modo escuro"}
      className={cn(
        "group flex items-center gap-3 rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink",
        withLabel ? "h-10 w-full px-3" : "size-9 justify-center",
      )}
    >
      <span className="relative flex size-4 items-center justify-center">
        <Sun
          className={cn(
            "absolute size-4 transition-all duration-300",
            isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
          )}
          strokeWidth={1.6}
        />
        <Moon
          className={cn(
            "absolute size-4 transition-all duration-300",
            isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
          )}
          strokeWidth={1.6}
        />
      </span>
      {withLabel ? (
        <span className="text-[12px] font-medium">{isDark ? "Modo claro" : "Modo escuro"}</span>
      ) : null}
    </button>
  );
}
