import type { SupabaseClient } from "@supabase/supabase-js";

export const AI_DEFAULT_TITLE = "Nova conversa";
export const AI_TITLE_MAX = 80;
export const AI_MESSAGE_MAX = 12000;

export type AiConversation = {
  id: string;
  title: string;
  preview: string;
  created_at: string;
  updated_at: string;
};

export type AiStoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

const CONVERSATION_FIELDS = "id,title,preview,created_at,updated_at";
const MESSAGE_FIELDS = "id,role,content,created_at";

/**
 * A migração pode ainda não ter sido aplicada no Supabase. Nesse caso o app
 * continua funcionando com o localStorage em vez de quebrar o chat.
 */
export function isMissingAiHistoryTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table|relation .* does not exist/i.test(message)
  );
}

export function conversationTitleFromMessage(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return AI_DEFAULT_TITLE;
  return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
}

export function sanitizeConversationTitle(value: unknown) {
  if (typeof value !== "string") return AI_DEFAULT_TITLE;
  const clean = value.replace(/\s+/g, " ").trim().slice(0, AI_TITLE_MAX);
  return clean || AI_DEFAULT_TITLE;
}

export async function listAiConversations(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<AiConversation[]> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select(CONVERSATION_FIELDS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AiConversation[];
}

export async function getAiConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<AiConversation | null> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select(CONVERSATION_FIELDS)
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as AiConversation | null) ?? null;
}

export async function getLatestAiConversation(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiConversation | null> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select(CONVERSATION_FIELDS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as AiConversation | null) ?? null;
}

export async function createAiConversation(
  supabase: SupabaseClient,
  userId: string,
  title: string = AI_DEFAULT_TITLE,
): Promise<AiConversation> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: userId, title: sanitizeConversationTitle(title) })
    .select(CONVERSATION_FIELDS)
    .single();

  if (error) throw error;
  return data as AiConversation;
}

export async function renameAiConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  title: string,
): Promise<AiConversation | null> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .update({ title: sanitizeConversationTitle(title) })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select(CONVERSATION_FIELDS)
    .maybeSingle();

  if (error) throw error;
  return (data as AiConversation | null) ?? null;
}

export async function deleteAiConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("id");

  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

export async function listAiMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 60,
): Promise<AiStoredMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select(MESSAGE_FIELDS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  // A consulta pega as N mais recentes; devolvemos em ordem cronológica.
  return ((data ?? []) as AiStoredMessage[]).slice().reverse();
}

async function updateConversationPreview(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  preview: string,
) {
  const { error } = await supabase
    .from("ai_conversations")
    .update({ preview: preview.replace(/\s+/g, " ").trim().slice(0, 160) })
    .eq("id", conversationId)
    .eq("user_id", userId);

  // A prévia é cosmética: se falhar, a conversa continua válida.
  if (error) console.error("[velo ia] falha ao atualizar prévia:", error);
}

export async function appendAiExchange(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
) {
  const rows = [
    {
      conversation_id: conversationId,
      role: "user" as const,
      content: userMessage.slice(0, AI_MESSAGE_MAX),
    },
    {
      conversation_id: conversationId,
      role: "assistant" as const,
      content: assistantMessage.slice(0, AI_MESSAGE_MAX),
    },
  ];

  const { error } = await supabase.from("ai_messages").insert(rows);
  if (error) throw error;

  await updateConversationPreview(
    supabase,
    userId,
    conversationId,
    assistantMessage,
  );
}
