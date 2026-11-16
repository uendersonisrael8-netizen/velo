import { NextResponse } from "next/server";
import {
  ANDROID_STORE_URL,
  APP_MIN_VERSION,
} from "@/lib/app-version";
import { WEB_APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contrato usado pelo app Android e pelo PWA:
 *   { versao_minima: "1.0.0", link_loja: "https://..." }
 *
 * O cache curto no CDN evita uma consulta por navegação, mas ainda propaga
 * uma atualização obrigatória em até um minuto.
 */
export async function GET() {
  return NextResponse.json(
    {
      versao_minima: APP_MIN_VERSION,
      link_loja: ANDROID_STORE_URL,
      versao_web: WEB_APP_VERSION,
      mensagem: "Atualize o velo para continuar.",
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
