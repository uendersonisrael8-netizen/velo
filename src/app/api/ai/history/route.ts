import type { NextRequest } from "next/server";
import {
  authError,
  authJson,
  isTrustedOrigin,
} from "@/lib/auth/api";
import {
  applyVeloIaIdentity,
  isGroqConfigured,
  isVeloIaConfigured,
  isVeloIaMock,
  resolveVeloIaIdentity,
  veloIaClearHistory,
  veloIaHistory,
  veloIaStorageKey,
  VeloIaRequestError,
} from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const identity = await resolveVeloIaIdentity(request);
  const respond = (response: ReturnType<typeof authJson>) =>
    applyVeloIaIdentity(response, identity);

  if (!isVeloIaConfigured()) {
    // No caminho Groq o histórico fica no localStorage do navegador. O
    // servidor só entrega a chave isolada por conversa e a lista vazia.
    return respond(
      authJson({
        ok: true,
        configured: isGroqConfigured() || isVeloIaMock(),
        storage: "local",
        storageKey: veloIaStorageKey(identity.conversationId),
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
        storageKey: veloIaStorageKey(identity.conversationId),
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
          storageKey: veloIaStorageKey(identity.conversationId),
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
    applyVeloIaIdentity(response, identity);

  if (!isVeloIaConfigured()) {
    return respond(
      authJson({
        ok: true,
        configured: isGroqConfigured() || isVeloIaMock(),
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
        deleted: typeof result.deleted === "number" ? result.deleted : 0,
      }),
    );
  } catch (error) {
    if (isVeloIaMock()) {
      return respond(
        authJson({
          ok: true,
          configured: true,
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
