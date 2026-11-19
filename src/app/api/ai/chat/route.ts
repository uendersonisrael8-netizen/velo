import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authError,
  authJson,
  corsPreflight,
  isTrustedOrigin,
  rateLimitHeaders,
  readJsonBody,
  withCors,
} from "@/lib/auth/api";
import {
  applyVeloIaIdentity,
  createVeloIaUserClient,
  groqChat,
  isGroqConfigured,
  isVeloIaConfigured,
  isVeloIaMock,
  mockVeloIaReply,
  resolveVeloIaIdentity,
  veloIaChat,
  VeloIaRequestError,
  type VeloIaChatMessage,
} from "@/lib/ai/server";
import {
  AI_DEFAULT_TITLE,
  appendAiExchange,
  conversationTitleFromMessage,
  createAiConversation,
  deleteAiConversation,
  getAiConversation,
  isMissingAiHistoryTable,
  listAiMessages,
  renameAiConversation,
} from "@/lib/ai/store";
import { checkRateLimit, clientIp, hashRateLimitKey } from "@/lib/security/rate-limit";
import { aiChatSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AI_WINDOW_MS = 10 * 60 * 1000;
const AI_IDENTITY_LIMIT = 15;
const AI_IP_LIMIT = 40;

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const identity = await resolveVeloIaIdentity(request);
  const respond = (response: ReturnType<typeof authJson>) =>
    withCors(applyVeloIaIdentity(response, identity), request);

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
    // O chat aceita uma imagem comprimida (~2 MB). Base64 cresce ~33%, então
    // 4,5 MB cobre a foto e o histórico sem passar do limite da Vercel.
    body = await readJsonBody(request, { maxBytes: 4_500_000 });
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

  // A Groq é o caminho principal: além do modelo gratuito, é ela que tem a
  // ferramenta de busca na web. O FastAPI self-hosted fica como fallback para
  // quando GROQ_API_KEY não estiver configurada. Imagem só existe no Groq.
  const hasImage = Boolean(parsed.data.image);
  const useGroq = isGroqConfigured();
  const useFastApi = !useGroq && isVeloIaConfigured() && !hasImage;

  if (!useFastApi && !useGroq) {
    if (isVeloIaMock()) {
      const result = mockVeloIaReply(parsed.data.message);
      return respond(
        authJson(
          {
            ok: true,
            reply: result.reply,
            mock: true,
            model: result.model ?? null,
            conversationId: null,
            persisted: false,
            storage: "local",
          },
          200,
          rateLimitHeaders(identityLimit),
        ),
      );
    }

    return respond(
      authError(
        hasImage
          ? "O envio de imagens precisa da Groq configurada (GROQ_API_KEY)."
          : "A velo ia ainda não está conectada neste ambiente. Configure GROQ_API_KEY (recomendado) ou VELO_IA_API_URL e VELO_IA_API_KEY.",
        503,
        rateLimitHeaders(identityLimit),
      ),
    );
  }

  // Usuário logado no caminho Groq: o histórico do Supabase é a fonte da
  // verdade. Se a migração ainda não foi aplicada, o chat cai para o
  // localStorage sem interromper a conversa.
  let conversationId = parsed.data.conversationId ?? null;
  let conversationTitle = AI_DEFAULT_TITLE;
  let storedHistory: VeloIaChatMessage[] | null = null;
  let persistence = false;
  let createdConversationId: string | null = null;
  let userClient: SupabaseClient | null = null;

  if (useGroq && identity.authenticated && identity.userId) {
    userClient = await createVeloIaUserClient(identity);
    if (userClient) {
      try {
        let conversation = conversationId
          ? await getAiConversation(userClient, identity.userId, conversationId)
          : null;

        // Conversa apagada em outro aparelho: começa uma nova em vez de
        // devolver erro e travar o composer.
        if (!conversation) {
          conversation = await createAiConversation(userClient, identity.userId);
          createdConversationId = conversation.id;
        }

        conversationId = conversation.id;
        conversationTitle = conversation.title;
        const stored = await listAiMessages(userClient, conversationId, 20);
        storedHistory = stored.map((message) => ({
          role: message.role,
          content: message.content,
        }));
        persistence = true;
      } catch (error) {
        if (isMissingAiHistoryTable(error)) {
          console.warn(
            "[velo ia] tabelas de histórico ausentes; usando localStorage até a migração ser aplicada.",
          );
        } else {
          console.error("[velo ia] falha ao preparar histórico:", error);
        }
        conversationId = null;
        storedHistory = null;
        persistence = false;
        createdConversationId = null;
      }
    }
  }

  try {
    const result = useFastApi
      ? await veloIaChat({
          conversationId: identity.conversationId,
          message: parsed.data.message,
        })
      : await groqChat({
          message: parsed.data.message,
          history: storedHistory ?? parsed.data.history,
          image: parsed.data.image,
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

    const reply = result.reply.trim();

    if (persistence && userClient && identity.userId && conversationId) {
      try {
        await appendAiExchange(
          userClient,
          identity.userId,
          conversationId,
          parsed.data.message,
          reply,
        );

        if (conversationTitle === AI_DEFAULT_TITLE) {
          await renameAiConversation(
            userClient,
            identity.userId,
            conversationId,
            conversationTitleFromMessage(parsed.data.message),
          );
        }
        createdConversationId = null;
      } catch (error) {
        if (isMissingAiHistoryTable(error)) {
          console.warn(
            "[velo ia] não foi possível salvar a conversa: migração ausente.",
          );
        } else {
          console.error("[velo ia] falha ao salvar mensagens:", error);
        }
        persistence = false;
      }
    }

    return respond(
      authJson(
        {
          ok: true,
          reply,
          mock: Boolean(result.mock),
          model: result.model ?? null,
          searched: Boolean(result.searched),
          sources: result.sources ?? [],
          conversationId: persistence ? conversationId : null,
          persisted: persistence,
          storage: persistence ? "server" : "local",
        },
        200,
        rateLimitHeaders(identityLimit),
      ),
    );
  } catch (error) {
    // Se uma conversa vazia foi criada e a IA falhou, não deixa lixo no drawer.
    if (createdConversationId && userClient && identity.userId) {
      await deleteAiConversation(
        userClient,
        identity.userId,
        createdConversationId,
      ).catch(() => undefined);
    }

    if (
      isVeloIaMock() &&
      error instanceof VeloIaRequestError &&
      [502, 503, 504].includes(error.status)
    ) {
      const result = mockVeloIaReply(parsed.data.message);
      return respond(
        authJson(
          {
            ok: true,
            reply: result.reply,
            mock: true,
            model: result.model ?? null,
            conversationId: null,
            persisted: false,
            storage: "local",
          },
          200,
          rateLimitHeaders(identityLimit),
        ),
      );
    }

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
