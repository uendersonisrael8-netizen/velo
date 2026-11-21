import type { NextRequest } from "next/server";
import {
  authError,
  authJson,
  corsPreflight,
  isTrustedOrigin,
  rateLimitHeaders,
  readJsonBody,
  withCors,
} from "@/lib/auth/api";
import { VeloIaRequestError } from "@/lib/ai/server";
import {
  isTranscriptionConfigured,
  transcribeAudio,
  VELO_IA_AUDIO_MAX_BYTES,
} from "@/lib/ai/transcribe";
import {
  checkRateLimit,
  clientIp,
  hashRateLimitKey,
} from "@/lib/security/rate-limit";
import { aiTranscribeSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Áudio curto de uma pergunta falada. O limite por IP evita gastar a cota do
// provedor de transcrição com upload em loop.
const VOICE_WINDOW_MS = 60 * 1000;
const VOICE_IP_LIMIT = 20;

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const respond = (response: ReturnType<typeof authJson>) =>
    withCors(response, request);

  const ipLimit = checkRateLimit(
    `ai-voice:${hashRateLimitKey(clientIp(request))}`,
    VOICE_IP_LIMIT,
    VOICE_WINDOW_MS,
  );
  if (!ipLimit.allowed) {
    return respond(
      authError(
        "Você mandou muitos áudios seguidos. Respire um pouco e tente de novo.",
        429,
        rateLimitHeaders(ipLimit),
      ),
    );
  }

  if (!isTranscriptionConfigured()) {
    return respond(
      authError(
        "A transcrição de voz não está disponível neste ambiente. Configure GROQ_API_KEY no servidor ou use a ditado por voz do navegador.",
        503,
        rateLimitHeaders(ipLimit),
      ),
    );
  }

  let body: unknown;
  try {
    // Base64 cresce ~33%: 4 MB de áudio cabem folgados neste limite.
    body = await readJsonBody(request, { maxBytes: 6_000_000 });
  } catch (error) {
    return respond(
      authError(
        error instanceof Error ? error.message : "Requisição inválida.",
        400,
        rateLimitHeaders(ipLimit),
      ),
    );
  }

  const parsed = aiTranscribeSchema.safeParse(body);
  if (!parsed.success) {
    return respond(
      authError(
        parsed.error.issues[0]?.message ?? "Não consegui ler o áudio enviado.",
        400,
        rateLimitHeaders(ipLimit),
      ),
    );
  }

  try {
    const text = await transcribeAudio({
      audioBase64: parsed.data.audio,
      mimeType: parsed.data.mimeType,
    });

    return respond(
      authJson(
        {
          ok: true,
          text,
          bytes: Math.floor((parsed.data.audio.length * 3) / 4),
          limit: VELO_IA_AUDIO_MAX_BYTES,
        },
        200,
        rateLimitHeaders(ipLimit),
      ),
    );
  } catch (error) {
    if (error instanceof VeloIaRequestError) {
      return respond(
        authError(
          error.message,
          error.status,
          rateLimitHeaders(ipLimit),
        ),
      );
    }

    console.error("[velo ia] falha ao transcrever:", error);
    return respond(
      authError(
        "Não consegui transcrever o áudio agora. Tente de novo.",
        502,
        rateLimitHeaders(ipLimit),
      ),
    );
  }
}