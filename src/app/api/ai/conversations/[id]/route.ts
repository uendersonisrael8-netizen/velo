import type { NextRequest } from "next/server";
import {
  authError,
  authJson,
  corsPreflight,
  isTrustedOrigin,
  readJsonBody,
  withCors,
} from "@/lib/auth/api";
import { createVeloIaUserClient, resolveVeloIaIdentity } from "@/lib/ai/server";
import {
  deleteAiConversation,
  getAiConversation,
  isMissingAiHistoryTable,
  listAiMessages,
  renameAiConversation,
  sanitizeConversationTitle,
} from "@/lib/ai/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

async function resolveUser(request: NextRequest) {
  const identity = await resolveVeloIaIdentity(request);
  if (!identity.authenticated || !identity.userId) return null;
  const supabase = await createVeloIaUserClient(identity);
  if (!supabase) return null;
  return { userId: identity.userId, supabase };
}

function unauthorized(request: NextRequest) {
  return withCors(
    authError("Entre com a sua conta da velo para acessar essa conversa.", 401),
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

function notFound(request: NextRequest) {
  return withCors(authError("Conversa não encontrada.", 404), request);
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const user = await resolveUser(request);
  if (!user) return unauthorized(request);

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound(request);

  try {
    const conversation = await getAiConversation(user.supabase, user.userId, id);
    if (!conversation) return notFound(request);

    const messages = await listAiMessages(user.supabase, id, 200);
    return withCors(
      authJson({ ok: true, conversation, messages }),
      request,
    );
  } catch (error) {
    if (isMissingAiHistoryTable(error)) return missingHistory(request);
    console.error("[velo ia] falha ao abrir conversa:", error);
    return withCors(
      authError("Não consegui abrir essa conversa agora.", 502),
      request,
    );
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const user = await resolveUser(request);
  if (!user) return unauthorized(request);

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound(request);

  let body: unknown;
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

  if (!body || typeof body !== "object" || !("title" in body)) {
    return withCors(authError("Informe um título para a conversa.", 400), request);
  }

  try {
    const conversation = await renameAiConversation(
      user.supabase,
      user.userId,
      id,
      sanitizeConversationTitle((body as { title?: unknown }).title),
    );
    if (!conversation) return notFound(request);
    return withCors(authJson({ ok: true, conversation }), request);
  } catch (error) {
    if (isMissingAiHistoryTable(error)) return missingHistory(request);
    console.error("[velo ia] falha ao renomear conversa:", error);
    return withCors(
      authError("Não consegui renomear a conversa agora.", 502),
      request,
    );
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }

  const user = await resolveUser(request);
  if (!user) return unauthorized(request);

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound(request);

  try {
    const deleted = await deleteAiConversation(user.supabase, user.userId, id);
    if (deleted === 0) return notFound(request);
    return withCors(authJson({ ok: true, deleted }), request);
  } catch (error) {
    if (isMissingAiHistoryTable(error)) return missingHistory(request);
    console.error("[velo ia] falha ao apagar conversa:", error);
    return withCors(
      authError("Não consegui apagar a conversa agora.", 502),
      request,
    );
  }
}
