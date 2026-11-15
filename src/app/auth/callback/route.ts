import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const base = new URL("https://velo.invalid");
    const target = new URL(value, base);
    // Rejeita variações com backslash, esquema ou host que o navegador possa
    // normalizar para fora do site.
    if (target.origin !== base.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function redirect(origin: string, path: string) {
  const response = NextResponse.redirect(`${origin}${path}`);
  for (const [key, value] of Object.entries(PRIVATE_CACHE_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Usa o próprio host da requisição em vez de confiar em x-forwarded-host,
  // que poderia virar um open redirect se o header fosse forjado.
  const origin = url.origin;
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return redirect(origin, "/login?error=auth");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Falha ao trocar o código de autenticação:", error.message);
      return redirect(origin, "/login?error=auth");
    }
  } catch (error) {
    console.error("Falha no callback de autenticação:", error);
    return redirect(origin, "/login?error=auth");
  }

  return redirect(origin, next);
}
