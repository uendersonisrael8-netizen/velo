import { ANDROID_APK_URL } from "@/lib/site";
import { normalizeVersion } from "@/lib/version";

/**
 * Configuração server-side da atualização obrigatória.
 *
 * - `APP_MIN_VERSION` é a versão mínima aceita. Padrão: 1.0.0.
 * - `ANDROID_STORE_URL` é o link aberto pelo botão do modal. Se não for uma
 *   URL HTTPS válida, usamos o download direto do APK como fallback.
 *
 * O endpoint `/api/app-version` expõe apenas esses dois valores; o restante da
 * configuração do servidor nunca vai ao cliente.
 */
export const APP_MIN_VERSION = normalizeVersion(process.env.APP_MIN_VERSION) ?? "1.0.0";

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const ANDROID_STORE_URL =
  safeHttpsUrl(process.env.ANDROID_STORE_URL) ?? ANDROID_APK_URL;
