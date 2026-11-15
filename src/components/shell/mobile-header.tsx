"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, Search } from "lucide-react";
import { Brand } from "@/components/brand";
import { useApp } from "@/components/providers/app-provider";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ANDROID_APK_URL } from "@/lib/site";

export function MobileHeader() {
  const pathname = usePathname();
  const { user } = useApp();

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-[62px] items-center justify-between border-b border-line bg-paper/90 px-4 backdrop-blur-xl md:hidden">
      <Brand compact />
      <div className="flex items-center gap-2">
        {pathname !== "/explore" ? (
          <Link
            href="/explore"
            aria-label="Explorar e buscar"
            className="flex size-9 items-center justify-center rounded-full border border-line text-muted transition hover:text-ink"
          >
            <Search className="size-4" strokeWidth={1.7} />
          </Link>
        ) : null}
        <a
          href={ANDROID_APK_URL}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Baixar app Android"
          title="Baixar app Android"
          className="flex size-9 items-center justify-center rounded-full border border-line text-muted transition hover:text-ink"
        >
          <Download className="size-4" strokeWidth={1.7} />
        </a>
        <ThemeToggle />
        <Link href={user ? "/profile" : "/login"} aria-label={user ? "Seu perfil" : "Entrar"}>
          {user ? (
            <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
          ) : (
            <span className="flex h-9 items-center rounded-full border border-line px-3 text-[10px] font-semibold uppercase tracking-[0.12em]">
              entrar
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
