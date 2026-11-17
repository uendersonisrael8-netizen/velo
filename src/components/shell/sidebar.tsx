"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bookmark,
  Compass,
  Download,
  Home,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  Sparkles,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { CSSProperties } from "react";
import { Brand } from "@/components/brand";
import { useApp } from "@/components/providers/app-provider";
import { useDirectUnread } from "@/components/providers/direct-provider";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ANDROID_APK_URL } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Para você", icon: Home },
  { href: "/explore", label: "Explorar", icon: Compass },
  { href: "/direct", label: "Direct", icon: MessageCircle },
  { href: "/chat", label: "velo ia", icon: Sparkles },
  { href: "/upload", label: "Publicar", icon: Plus },
  { href: "/saved", label: "Guardados", icon: Bookmark },
  { href: "/profile", label: "Perfil", icon: UserRound },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/profile") return pathname === "/profile" || pathname.startsWith("/u/");
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, signOut, volume, muted, setVolume, toggleMute } = useApp();
  const { unreadCount } = useDirectUnread();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col border-r border-line bg-paper px-6 pb-6 pt-8 md:flex">
      <Brand />

      <nav className="mt-12 flex flex-col gap-1" aria-label="Navegação principal">
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-11 items-center gap-3 rounded-[13px] px-3 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-surface text-ink"
                  : "text-muted hover:bg-surface/70 hover:text-ink",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] transition-transform group-hover:-translate-y-px",
                  active && "text-accent",
                )}
                strokeWidth={active ? 1.9 : 1.6}
              />
              <span>{item.label}</span>
              {item.href === "/direct" && unreadCount > 0 ? (
                <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[8px] font-bold tabular-nums text-[#0a0a0a]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : active ? (
                <span className="ml-auto size-1.5 rounded-full bg-accent" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/upload"
        className="mt-5 flex h-[46px] items-center justify-center gap-2 rounded-full bg-accent px-4 text-[12px] font-semibold uppercase tracking-[0.13em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
      >
        <Plus className="size-4" strokeWidth={2} />
        Novo momento
      </Link>

      <div className="mt-auto">
        <div className="mb-5 flex items-center gap-2.5 px-1">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Ativar som" : "Silenciar vídeos"}
            className="text-muted transition hover:text-ink"
          >
            {muted ? (
              <VolumeX className="size-4" strokeWidth={1.6} />
            ) : (
              <Volume2 className="size-4" strokeWidth={1.6} />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={muted ? 0 : Math.round(volume * 100)}
            onChange={(event) => setVolume(Number(event.target.value) / 100)}
            aria-label="Volume global"
            className="volume-range h-3 w-full"
            style={{ "--volume": `${muted ? 0 : Math.round(volume * 100)}%` } as CSSProperties}
          />
          <span className="w-5 text-right text-[9px] tabular-nums text-muted">
            {muted ? "—" : Math.round(volume * 100)}
          </span>
        </div>

        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="eyebrow text-[8px] text-muted">som global</span>
          <ThemeToggle />
        </div>

        <div className="thin-rule mb-4" />

        {!ready ? (
          <div className="flex items-center gap-3 px-1">
            <span className="skeleton size-10 rounded-full" />
            <span className="flex-1 space-y-2">
              <span className="skeleton block h-2.5 w-24 rounded-full" />
              <span className="skeleton block h-2 w-16 rounded-full" />
            </span>
          </div>
        ) : user ? (
          <div className="group flex items-center gap-3">
            <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={user.displayName} src={user.avatarUrl} size={38} />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold leading-tight">
                  {user.displayName}
                </span>
                <span className="block truncate text-[10px] text-muted">@{user.handle}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sair da conta"
              title="Sair"
              className="rounded-full p-2 text-muted opacity-0 transition hover:bg-surface hover:text-ink group-hover:opacity-100"
            >
              <LogOut className="size-3.5" strokeWidth={1.7} />
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 rounded-[12px] px-1 py-1 text-left transition hover:bg-surface"
          >
            <span className="flex size-9 items-center justify-center rounded-full border border-line">
              <LogIn className="size-4" strokeWidth={1.6} />
            </span>
            <span>
              <span className="block text-[12.5px] font-semibold">Entrar</span>
              <span className="block text-[10px] text-muted">salve o que importa</span>
            </span>
          </Link>
        )}

        <a
          href={ANDROID_APK_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-5 flex items-center gap-2 rounded-[10px] px-1 py-1 text-[10px] font-medium text-muted transition hover:bg-surface hover:text-ink"
        >
          <Download className="size-3.5" strokeWidth={1.7} />
          Baixar app Android
        </a>

        <p className="mt-3 text-[9px] leading-relaxed text-muted/70">
          {isSupabaseConfigured
            ? "conectado ao supabase · seus dados são protegidos por RLS"
            : "modo prévia · configure o supabase para entrar"}
        </p>
      </div>
    </aside>
  );
}
