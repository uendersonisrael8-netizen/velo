import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export function isSupabaseRouteConfigured() {
  return Boolean(url && anonKey);
}

/**
 * Cliente Supabase para Route Handlers. Diferente do cliente de Server
 * Component, ele grava os cookies de sessão diretamente na resposta HTTP.
 *
 * Os cookies do Supabase precisam ser legíveis pelo browser client para as
 * consultas autenticadas (RLS) feitas no cliente. Por isso `httpOnly` fica
 * desligado; a proteção vem de `Secure`, `SameSite=Lax`, CSP e da rotação de
 * tokens. Um cookie de sessão opaco e HttpOnly exigiria mover todas as
 * consultas para o servidor, o que este app não faz.
 */
export function createSupabaseRouteClient(request: NextRequest, response: NextResponse) {
  if (!url || !anonKey) {
    throw new Error("Supabase não está configurado neste ambiente.");
  }

  return createServerClient(url, anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}
