"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ConfigNotice } from "@/components/shell/config-notice";
import { MobileNav } from "@/components/shell/mobile-nav";
import { MobileHeader } from "@/components/shell/mobile-header";
import { Sidebar } from "@/components/shell/sidebar";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // O feed mobile é imersivo: sem header e sem padding, para o vídeo ocupar a
  // tela inteira e a navegação ficar por conta da barra inferior.
  const immersiveFeed = pathname === "/";

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <Sidebar />
      {immersiveFeed ? null : <MobileHeader />}
      <main
        className={cn(
          "min-h-dvh md:pl-[252px]",
          immersiveFeed
            ? "pb-0 pt-0"
            : "pb-[calc(80px+env(safe-area-inset-bottom))] pt-[62px] md:pb-0 md:pt-0",
        )}
      >
        {children}
      </main>
      <MobileNav />
      <ConfigNotice className="fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-[420px] rounded-full md:inset-x-auto md:bottom-6 md:right-6 md:mx-0" />
    </div>
  );
}
