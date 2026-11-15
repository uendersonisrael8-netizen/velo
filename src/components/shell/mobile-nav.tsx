"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Home, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/explore", label: "Explorar", icon: Compass },
  { href: "/upload", label: "Publicar", icon: Plus, featured: true },
  { href: "/saved", label: "Salvos", icon: Bookmark },
  { href: "/profile", label: "Perfil", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/profile") return pathname === "/profile" || pathname.startsWith("/u/");
  return pathname.startsWith(href);
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Navegação principal"
    >
      <div className="mx-auto flex h-[64px] max-w-[560px] items-center justify-around px-2">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          if (item.featured) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label="Publicar"
                aria-current={active ? "page" : undefined}
                className="relative -mt-6 flex size-12 items-center justify-center rounded-full bg-accent text-[#0a0a0a] shadow-[0_10px_30px_rgba(255,77,28,0.3)] transition active:scale-95"
              >
                <Icon className="size-5" strokeWidth={2} />
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-14 flex-col items-center gap-1 py-2 transition-colors",
                active ? "text-ink" : "text-muted",
              )}
            >
              <Icon className="size-[19px]" strokeWidth={active ? 2 : 1.6} />
              <span className="text-[8.5px] font-medium tracking-[0.02em]">{item.label}</span>
              <span
                className={cn(
                  "size-1 rounded-full bg-accent transition-opacity",
                  active ? "opacity-100" : "opacity-0",
                )}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
