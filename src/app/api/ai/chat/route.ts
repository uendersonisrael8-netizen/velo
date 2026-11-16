import type { NextRequest } from "next/server";
import {
  authError,
  authJson,
  isTrustedOrigin,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/auth/api";
import {
  applyVeloIaIdentity,
  isVeloIaConfigured,
  resolveVeloIaIdentity,
  veloIaChat,
  VeloIaRequestError,
} from "@/lib/ai/server";
import { checkRateLimit, clientIp, hashRateLimitKey } from "@/lib/security/rate-limit";
import { aiChatSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AI_WINDOW_MS = 10 * 60 * 1000;
const AI_IDENTITY_LIMIT = 15;
const AI_IP_LIMIT = 40;

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const identity = await resolveVeloIaIdentity(request);
  const respond = (response: ReturnType<typeof authJson>) =>
    applyVeloIaIdentity(response, identity);

  const ipLimit = checkRateLimit(
    `ai-ip:${hashRateLimitKey(clientIp(request))}`,
    AI_IP_LIMIT,
    AI_WINDOW_MS,
  );
  if (!ipLimit.allowed) {
    return respond(
      authError(
        "A velo ia recebeu muitas mensagens deste dispositivo. Espere alguns minutos.",
        429,
        rateLimitHeaders(ipLimit),
      ),
    );
  }

  const identityLimit = checkRateLimit(
    `ai-id:${hashRateLimitKey(identity.conversationId)}`,
    AI_IDENTITY_LIMIT,
    AI_WINDOW_MS,
  );
  if (!identityLimit.allowed) {
    return respond(
      authError(
        "Você já mandou bastante mensagem por agora. Respire um pouco e volte em alguns minutos.",
        429,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, { maxBytes: 32 * 1024 });
  } catch (error) {
    return respond(
      authError(
        error instanceof Error ? error.message : "Requisição inválida.",
        400,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  const parsed = aiChatSchema.safeParse(body);
  if (!parsed.success) {
    return respond(
      authError(
        parsed.error.issues[0]?.message ?? "Escreva uma mensagem para a velo ia.",
        400,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  if (!isVeloIaConfigured()) {
    return respond(
      authError(
        "A velo ia ainda não está conectada neste ambiente. Configure VELO_IA_API_URL e VELO_IA_API_KEY.",
        503,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  try {
    const result = await veloIaChat({
      conversationId: identity.conversationId,
      message: parsed.data.message,
    });

    if (!result || typeof result.reply !== "string" || !result.reply.trim()) {
      return respond(
        authError(
          "A velo ia não conseguiu responder agora. Tente de novo.",
          502,
          rateLimitHeaders(identityLimit),
        ),
      );
    }

    return respond(
      authJson(
        {
          ok: true,
          reply: result.reply.trim(),
          mock: Boolean(result.mock),
          model: result.model ?? null,
        },
        200,
        rateLimitHeaders(identityLimit),
      ),
    );
  } catch (error) {
    if (error instanceof VeloIaRequestError) {
      if (error.status === 429) {
        return respond(
          authError(
            "A velo ia está recebendo muitas mensagens. Espere um pouco.",
            429,
            rateLimitHeaders(identityLimit),
          ),
        );
      }
      if (error.status === 503) {
        return respond(
          authError(
            "A velo ia está indisponível agora. Tente de novo em instantes.",
            503,
            rateLimitHeaders(identityLimit),
          ),
        );
      }
      if (error.status === 504) {
        return respond(
          authError(
            "A velo ia demorou demais para responder. Tente de novo.",
            504,
            rateLimitHeaders(identityLimit),
          ),
        );
      }
    }

    console.error("[velo ia] falha no chat:", error);
    return respond(
      authError(
        "A velo ia não conseguiu responder agora. Tente de novo.",
        502,
        rateLimitHeaders(identityLimit),
      ),
    );
  }
}
