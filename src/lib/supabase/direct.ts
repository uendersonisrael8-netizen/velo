import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DirectConversation,
  DirectMessage,
  MediaType,
  Profile,
} from "@/lib/types";
import {
  mapPost,
  mapProfile,
  one,
  POST_SELECT,
  PROFILE_FIELDS,
  type DbPost,
  type DbProfile,
} from "@/lib/supabase/data";

/**
 * Select das mensagens com o autor e, quando houver, o post compartilhado.
 * O `POST_SELECT` já traz o autor do post, então o card no Direct consegue
 * mostrar a miniatura e a legenda sem uma segunda consulta.
 */
export const DIRECT_MESSAGE_SELECT = `id, conversation_id, sender_id, body, post_id, created_at, author:profiles!direct_messages_sender_id_fkey(${PROFILE_FIELDS}), post:posts!direct_messages_post_id_fkey(${POST_SELECT})`;

type Joined<T> = T | T[] | null;

type DbDirectMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  post_id: string | null;
  created_at: string;
  author: Joined<DbProfile>;
  post: Joined<DbPost>;
};

type DbDirectConversation = {
  conversation_id: string;
  other_id: string;
  other_handle: string;
  other_display_name: string;
  other_avatar_url: string | null;
  last_body: string | null;
  last_post_id: string | null;
  last_media_type: string | null;
  last_sender_id: string | null;
  last_at: string | null;
  unread_count: number | string | null;
};

function cleanAvatar(value: string | null) {
  if (!value || value.includes("api.dicebear.com")) return "";
  return value;
}

function mapMediaType(value: string | null): MediaType | null {
  if (value === "video" || value === "image") return value;
  return null;
}

export function mapDirectMessage(row: DbDirectMessage): DirectMessage {
  const author = mapProfile(one(row.author));
  const postRow = one(row.post);
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: { ...author, id: author.id || row.sender_id },
    body: row.body ?? "",
    post: postRow ? mapPost(postRow) : null,
    createdAt: row.created_at,
  };
}

export function mapDirectConversation(
  row: DbDirectConversation,
): DirectConversation {
  return {
    id: row.conversation_id,
    participant: {
      id: row.other_id,
      handle: row.other_handle,
      displayName: row.other_display_name,
      avatarUrl: cleanAvatar(row.other_avatar_url),
      bio: "",
    },
    lastMessage:
      row.last_sender_id && row.last_at
        ? {
            body: row.last_body ?? "",
            postId: row.last_post_id,
            mediaType: mapMediaType(row.last_media_type),
            senderId: row.last_sender_id,
            createdAt: row.last_at,
          }
        : null,
    unreadCount: Number(row.unread_count ?? 0),
    updatedAt: row.last_at ?? new Date(0).toISOString(),
  };
}

export async function fetchDirectConversations(
  supabase: SupabaseClient,
): Promise<DirectConversation[]> {
  const { data, error } = await supabase.rpc("list_direct_conversations");
  if (error) throw error;
  return ((data ?? []) as DbDirectConversation[]).map(mapDirectConversation);
}

export async function fetchDirectConversation(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<DirectConversation | null> {
  const conversations = await fetchDirectConversations(supabase);
  return conversations.find((item) => item.id === conversationId) ?? null;
}

export async function fetchDirectMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 100,
): Promise<DirectMessage[]> {
  const pageSize = Math.min(200, Math.max(1, limit));
  const { data, error } = await supabase
    .from("direct_messages")
    .select(DIRECT_MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(pageSize);
  if (error) throw error;
  return ((data ?? []) as unknown as DbDirectMessage[])
    .reverse()
    .map(mapDirectMessage);
}

export async function sendDirectMessage(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    senderId: string;
    body?: string;
    postId?: string | null;
  },
): Promise<DirectMessage> {
  const body = input.body?.trim() ?? "";
  if (!body && !input.postId) {
    throw new Error("Escreva uma mensagem ou escolha um post.");
  }

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      body: body || null,
      post_id: input.postId ?? null,
    })
    .select(DIRECT_MESSAGE_SELECT)
    .single();
  if (error) throw error;
  return mapDirectMessage(data as unknown as DbDirectMessage);
}

export async function startDirectConversation(
  supabase: SupabaseClient,
  targetUserId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("start_direct_conversation", {
    target_user_id: targetUserId,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("Não foi possível abrir a conversa.");
  }
  return data;
}

export async function markDirectRead(
  supabase: SupabaseClient,
  conversationId: string,
) {
  const { error } = await supabase.rpc("mark_direct_read", {
    target_conversation: conversationId,
  });
  if (error) throw error;
}

export async function fetchDirectUnreadCount(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("direct_unread_total");
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Busca pessoas para iniciar uma conversa. Sem termo, devolve perfis
 * recentes. Remove caracteres que quebrariam a sintaxe de filtro do
 * PostgREST antes de montar o `or`.
 */
export async function searchDirectProfiles(
  supabase: SupabaseClient,
  query: string,
  excludeId: string,
): Promise<Profile[]> {
  const term = query
    .trim()
    .replace(/[,()%\\]/g, "")
    .slice(0, 40);

  let request = supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .neq("id", excludeId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (term) {
    request = request.or(
      `handle.ilike.%${term}%,display_name.ilike.%${term}%`,
    );
  }

  const { data, error } = await request;
  if (error) throw error;
  return ((data ?? []) as unknown as DbProfile[]).map((row) => mapProfile(row));
}
