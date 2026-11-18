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
  groqRewrite,
  isGroqConfigured,
  resolveVeloIaIdentity,
  VeloIaRequestError,
} from "@/lib/ai/server";
import { checkRateLimit, clientIp, hashRateLimitKey } from "@/lib/security/rate-limit";
import { aiRewriteSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REWRITE_WINDOW_MS = 10 * 60 * 1000;
const REWRITE_IDENTITY_LIMIT = 30;
const REWRITE_IP_LIMIT = 80;

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const identity = await resolveVeloIaIdentity(request);
  const respond = (response: ReturnType<typeof authJson>) =>
    applyVeloIaIdentity(response, identity);

  const ipLimit = checkRateLimit(
    `ai-rewrite-ip:${hashRateLimitKey(clientIp(request))}`,
    REWRITE_IP_LIMIT,
    REWRITE_WINDOW_MS,
  );
  if (!ipLimit.allowed) {
    return respond(
      authError(
        "Muitas correções deste dispositivo. Espere alguns minutos.",
        429,
        rateLimitHeaders(ipLimit),
      ),
    );
  }

  const identityLimit = checkRateLimit(
    `ai-rewrite-id:${hashRateLimitKey(identity.conversationId)}`,
    REWRITE_IDENTITY_LIMIT,
    REWRITE_WINDOW_MS,
  );
  if (!identityLimit.allowed) {
    return respond(
      authError(
        "Você já corrigiu bastante texto por agora. Respire um pouco e volte em alguns minutos.",
        429,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request, { maxBytes: 8 * 1024 });
  } catch (error) {
    return respond(
      authError(
        error instanceof Error ? error.message : "Requisição inválida.",
        400,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  const parsed = aiRewriteSchema.safeParse(body);
  if (!parsed.success) {
    return respond(
      authError(
        parsed.error.issues[0]?.message ?? "Escreva uma frase para corrigir.",
        400,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  if (!isGroqConfigured()) {
    return respond(
      authError(
        "A correção de texto precisa da Groq configurada (GROQ_API_KEY).",
        503,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  try {
    const result = await groqRewrite({ text: parsed.data.text });
    if (!result || typeof result.text !== "string" || !result.text.trim()) {
      return respond(
        authError(
          "A velo ia não conseguiu corrigir o texto agora. Tente de novo.",
          502,
          rateLimitHeaders(identityLimit),
        ),
      );
    }

    return respond(
      authJson(
        {
          ok: true,
          text: result.text.trim(),
          mock: false,
          model: result.model ?? null,
        },
        200,
        rateLimitHeaders(identityLimit),
      ),
    );
  } catch (error) {
    if (error instanceof VeloIaRequestError) {
      if (error.status === 400 || error.status === 413) {
        return respond(
          authError(
            error.message,
            error.status,
            rateLimitHeaders(identityLimit),
          ),
        );
      }
      if (error.status === 429) {
        return respond(
          authError(
            "A velo ia está recebendo muitos pedidos. Espere um pouco.",
            429,
            rateLimitHeaders(identityLimit),
          ),
        );
      }
      if (error.status === 503) {
        return respond(
          authError(
            "A correção está indisponível agora. Tente de novo em instantes.",
            503,
            rateLimitHeaders(identityLimit),
          ),
        );
      }
      if (error.status === 504) {
        return respond(
          authError(
            "A correção demorou demais. Tente de novo.",
            504,
            rateLimitHeaders(identityLimit),
          ),
        );
      }
    }

    console.error("[velo ia] falha na correção:", error);
    return respond(
      authError(
        "Não consegui corrigir o texto agora. Tente de novo.",
        502,
        rateLimitHeaders(identityLimit),
      ),
    );
  }
}
