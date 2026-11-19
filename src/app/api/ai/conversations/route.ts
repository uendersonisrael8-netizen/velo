import type { NextRequest } from "next/server";
import {
  authError,
  authJson,
  corsPreflight,
  isTrustedOrigin,
  readJsonBody,
  withCors,
} from "@/lib/auth/api";
import {
  createVeloIaUserClient,
  resolveVeloIaIdentity,
  type VeloIaIdentity,
} from "@/lib/ai/server";
import {
  createAiConversation,
  isMissingAiHistoryTable,
  listAiConversations,
  sanitizeConversationTitle,
} from "@/lib/ai/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

function unauthorized(request: NextRequest) {
  return withCors(
    authError(
      "Entre com a sua conta da velo para ver o histórico compartilhado.",
      401,
    ),
    request,
  );
}

function missingHistory(request: NextRequest) {
  return withCors(
    authJson(
      {
        ok: false,
        code: "ai_history_unavailable",
        error:
          "O histórico compartilhado ainda não foi ativado no servidor. Aplique a migração do Supabase para sincronizar as conversas.",
      },
      503,
    ),
    request,
  );
}

async function resolveUser(request: NextRequest) {
  const identity: VeloIaIdentity = await resolveVeloIaIdentity(request);
  if (!identity.authenticated || !identity.userId) {
    return { identity, userId: null, supabase: null } as const;
  }

  const supabase = await createVeloIaUserClient(identity);
  return { identity, userId: identity.userId, supabase } as const;
}

export async function GET(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const { userId, supabase } = await resolveUser(request);
  if (!userId) return unauthorized(request);
  if (!supabase) {
    return withCors(
      authError("Não consegui validar sua conta agora. Tente de novo.", 503),
      request,
    );
  }

  try {
    const conversations = await listAiConversations(supabase, userId, 50);
    return withCors(authJson({ ok: true, conversations }), request);
  } catch (error) {
    if (isMissingAiHistoryTable(error)) return missingHistory(request);
    console.error("[velo ia] falha ao listar conversas:", error);
    return withCors(
      authError("Não consegui carregar suas conversas agora.", 502),
      request,
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const { userId, supabase } = await resolveUser(request);
  if (!userId) return unauthorized(request);
  if (!supabase) {
    return withCors(
      authError("Não consegui validar sua conta agora. Tente de novo.", 503),
      request,
    );
  }

  let body: unknown = {};
  try {
    body = await readJsonBody(request, { maxBytes: 8 * 1024 });
  } catch (error) {
    return withCors(
      authError(
        error instanceof Error ? error.message : "Requisição inválida.",
        400,
      ),
      request,
    );
  }

  const title =
    body && typeof body === "object" && "title" in body
      ? sanitizeConversationTitle((body as { title?: unknown }).title)
      : undefined;

  try {
    const conversation = await createAiConversation(
      supabase,
      userId,
      title,
    );
    return withCors(authJson({ ok: true, conversation }, 201), request);
  } catch (error) {
    if (isMissingAiHistoryTable(error)) return missingHistory(request);
    console.error("[velo ia] falha ao criar conversa:", error);
    return withCors(
      authError("Não consegui criar uma conversa agora.", 502),
      request,
    );
  }
}
