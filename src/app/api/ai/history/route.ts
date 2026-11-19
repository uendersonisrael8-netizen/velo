import type { NextRequest } from "next/server";
import {
  authError,
  authJson,
  corsPreflight,
  isTrustedOrigin,
  withCors,
} from "@/lib/auth/api";
import {
  applyVeloIaIdentity,
  createVeloIaUserClient,
  isGroqConfigured,
  isVeloIaConfigured,
  isVeloIaMock,
  resolveVeloIaIdentity,
  veloIaClearHistory,
  veloIaHistory,
  veloIaStorageKey,
  VeloIaRequestError,
} from "@/lib/ai/server";
import {
  deleteAiConversation,
  getAiConversation,
  getLatestAiConversation,
  isMissingAiHistoryTable,
  listAiMessages,
} from "@/lib/ai/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestedConversationId(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("conversationId");
  return value && UUID_RE.test(value) ? value : null;
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

export async function GET(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const identity = await resolveVeloIaIdentity(request);
  const respond = (response: ReturnType<typeof authJson>) =>
    withCors(applyVeloIaIdentity(response, identity), request);

  // Usuário logado no caminho Groq: histórico no Supabase, compartilhado entre
  // a rede social e o app Android. Visitantes continuam no localStorage.
  if (identity.authenticated && identity.userId && isGroqConfigured()) {
    const supabase = await createVeloIaUserClient(identity);
    if (supabase) {
      try {
        const requested = requestedConversationId(request);
        const conversation = requested
          ? await getAiConversation(supabase, identity.userId, requested)
          : await getLatestAiConversation(supabase, identity.userId);
        const messages = conversation
          ? await listAiMessages(supabase, conversation.id, 60)
          : [];

        return respond(
          authJson({
            ok: true,
            configured: true,
            storage: "server",
            authenticated: true,
            storageKey: veloIaStorageKey(identity.conversationId),
            conversationId: conversation?.id ?? null,
            messages,
          }),
        );
      } catch (error) {
        if (isMissingAiHistoryTable(error)) {
          console.warn(
            "[velo ia] histórico no servidor indisponível; usando localStorage até a migração ser aplicada.",
          );
        } else {
          console.error("[velo ia] falha ao carregar histórico:", error);
        }
        // Cai para o histórico local logo abaixo, sem quebrar a conversa.
      }
    }
  }

  if (!isVeloIaConfigured()) {
    // No caminho Groq o servidor só entrega a chave isolada por conversa e a
    // lista vazia; quem guarda as mensagens é o navegador.
    return respond(
      authJson({
        ok: true,
        configured: isGroqConfigured() || isVeloIaMock(),
        storage: "local",
        authenticated: identity.authenticated,
        storageKey: veloIaStorageKey(identity.conversationId),
        conversationId: null,
        messages: [],
      }),
    );
  }

  try {
    const result = await veloIaHistory(identity.conversationId, 60);
    return respond(
      authJson({
        ok: true,
        configured: true,
        storage: "server",
        authenticated: identity.authenticated,
        storageKey: veloIaStorageKey(identity.conversationId),
        conversationId: null,
        messages: Array.isArray(result.messages) ? result.messages : [],
      }),
    );
  } catch (error) {
    if (isVeloIaMock()) {
      return respond(
        authJson({
          ok: true,
          configured: true,
          storage: "server",
          authenticated: identity.authenticated,
          storageKey: veloIaStorageKey(identity.conversationId),
          conversationId: null,
          messages: [],
        }),
      );
    }
    const status =
      error instanceof VeloIaRequestError && error.status === 504 ? 504 : 502;
    return respond(
      authError(
        status === 504
          ? "A velo ia demorou demais para carregar a conversa. Tente de novo."
          : "Não consegui carregar a conversa agora. Tente de novo.",
        status,
      ),
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const identity = await resolveVeloIaIdentity(request);
  const respond = (response: ReturnType<typeof authJson>) =>
    withCors(applyVeloIaIdentity(response, identity), request);

  if (identity.authenticated && identity.userId && isGroqConfigured()) {
    const supabase = await createVeloIaUserClient(identity);
    if (supabase) {
      try {
        const requested = requestedConversationId(request);
        const target = requested
          ? await getAiConversation(supabase, identity.userId, requested)
          : await getLatestAiConversation(supabase, identity.userId);

        const deleted = target
          ? await deleteAiConversation(supabase, identity.userId, target.id)
          : 0;

        return respond(
          authJson({
            ok: true,
            configured: true,
            storage: "server",
            authenticated: true,
            conversationId: null,
            deleted,
          }),
        );
      } catch (error) {
        if (isMissingAiHistoryTable(error)) {
          console.warn(
            "[velo ia] histórico no servidor indisponível ao limpar conversa.",
          );
        } else {
          console.error("[velo ia] falha ao limpar conversa:", error);
          return respond(
            authError("Não consegui limpar a conversa agora. Tente de novo.", 502),
          );
        }
      }
    }
  }

  if (!isVeloIaConfigured()) {
    return respond(
      authJson({
        ok: true,
        configured: isGroqConfigured() || isVeloIaMock(),
        storage: "local",
        authenticated: identity.authenticated,
        deleted: 0,
      }),
    );
  }

  try {
    const result = await veloIaClearHistory(identity.conversationId);
    return respond(
      authJson({
        ok: true,
        configured: true,
        storage: "server",
        authenticated: identity.authenticated,
        deleted: typeof result.deleted === "number" ? result.deleted : 0,
      }),
    );
  } catch (error) {
    if (isVeloIaMock()) {
      return respond(
        authJson({
          ok: true,
          configured: true,
          storage: "server",
          authenticated: identity.authenticated,
          deleted: 0,
        }),
      );
    }
    const status =
      error instanceof VeloIaRequestError && error.status === 504 ? 504 : 502;
    return respond(
      authError(
        status === 504
          ? "A velo ia demorou demais para limpar a conversa. Tente de novo."
          : "Não consegui limpar a conversa agora. Tente de novo.",
        status,
      ),
    );
  }
}
