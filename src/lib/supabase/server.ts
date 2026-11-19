import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseServerConfigured = Boolean(url && anonKey);

export async function createSupabaseServerClient() {
  if (!url || !anonKey) {
    throw new Error("Supabase não está configurado neste ambiente.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components não podem escrever cookies. Nesse caso, o proxy
          // é quem renova a sessão antes da renderização.
        }
      },
    },
  });
}

/**
 * Cliente usado por apps nativos, que não compartilham os cookies do navegador.
 * O JWT do Supabase é enviado no header Authorization e o RLS continua valendo:
 * o cliente só enxerga as linhas do próprio usuário.
 */
export function createSupabaseBearerClient(accessToken: string) {
  if (!url || !anonKey) {
    throw new Error("Supabase não está configurado neste ambiente.");
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
