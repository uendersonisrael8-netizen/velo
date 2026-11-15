import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  url && anonKey && url.startsWith("https://") && anonKey.length > 20,
);

/**
 * Mensagem usada quando o app abre em modo prévia, sem as variáveis do
 * Supabase. A interface continua visível; só as ações reais ficam indisponíveis.
 */
export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "O velo ainda não está conectado ao Supabase neste ambiente. Configure as variáveis para entrar e publicar.";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured || typeof window === "undefined") return null;
  if (!browserClient) {
    browserClient = createBrowserClient(url as string, anonKey as string, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

export { authErrorMessage } from "@/lib/supabase/auth-errors";
