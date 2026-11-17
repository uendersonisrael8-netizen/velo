import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Comment,
  MediaType,
  Post,
  Profile,
  StoryGroup,
  StoryItem,
} from "@/lib/types";
import { normalizeHandle } from "@/lib/utils";

export const PROFILE_FIELDS =
  "id, handle, display_name, avatar_url, bio, link, location";

export const POST_SELECT = `id, author_id, media_type, media_url, poster_url, caption, tags, location, audio, likes_count, comments_count, saves_count, created_at, author:profiles!posts_author_id_fkey(${PROFILE_FIELDS})`;

export const COMMENT_SELECT = `id, post_id, body, created_at, author:profiles!comments_author_id_fkey(${PROFILE_FIELDS})`;

export const STORY_SELECT = `id, media_type, media_url, poster_url, caption, created_at, author:profiles!stories_author_id_fkey(${PROFILE_FIELDS})`;

type Joined<T> = T | T[] | null;
export type DbProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  link: string | null;
  location: string | null;
};
export type DbPost = {
  id: string;
  author_id: string;
  media_type: string;
  media_url: string;
  poster_url: string | null;
  caption: string;
  tags: string[] | null;
  location: string | null;
  audio: string | null;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  created_at: string;
  author: Joined<DbProfile>;
};
type DbComment = {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author: Joined<DbProfile>;
};
type DbStory = {
  id: string;
  media_type: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
  created_at: string;
  author: Joined<DbProfile>;
};

export function one<T>(value: Joined<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function cleanAvatarUrl(value: string | null) {
  // Older builds used Dicebear as an avatar fallback. Avatars are now rendered
  // locally with initials, so those external URLs are treated as empty.
  if (!value || value.includes("api.dicebear.com")) return "";
  return value;
}

export function mapProfile(row: DbProfile | null, fallbackHandle = "velo"): Profile {
  if (!row) {
    return {
      id: "",
      handle: fallbackHandle,
      displayName: fallbackHandle,
      avatarUrl: "",
      bio: "",
    };
  }
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: cleanAvatarUrl(row.avatar_url),
    bio: row.bio ?? "",
    link: row.link,
    location: row.location,
  };
}

function mapMediaType(value: string): MediaType {
  return value === "video" ? "video" : "image";
}

export function mapPost(row: DbPost): Post {
  const author = mapProfile(one(row.author));
  return {
    id: row.id,
    author: { ...author, id: author.id || row.author_id },
    mediaType: mapMediaType(row.media_type),
    mediaUrl: row.media_url,
    posterUrl: row.poster_url,
    caption: row.caption ?? "",
    tags: row.tags ?? [],
    location: row.location,
    audio: row.audio,
    likesCount: row.likes_count ?? 0,
    commentsCount: row.comments_count ?? 0,
    savesCount: row.saves_count ?? 0,
    createdAt: row.created_at,
  };
}

export function mapComment(row: DbComment): Comment {
  const author = mapProfile(one(row.author));
  return {
    id: row.id,
    postId: row.post_id,
    author,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function mapStoryItem(row: DbStory): StoryItem {
  return {
    id: row.id,
    mediaType: mapMediaType(row.media_type),
    mediaUrl: row.media_url,
    posterUrl: row.poster_url,
    caption: row.caption,
    createdAt: row.created_at,
  };
}

export type FeedData = {
  posts: Post[];
  stories: StoryGroup[];
  likedIds: string[];
  savedIds: string[];
  followingIds: string[];
};

export async function fetchFeedData(
  supabase: SupabaseClient,
  currentUserId?: string,
): Promise<FeedData> {
  const postsQuery = supabase
    .from("posts")
    .select(POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(60);

  const storiesQuery = supabase
    .from("stories")
    .select(STORY_SELECT)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });

  const [postsResult, storiesResult] = await Promise.all([postsQuery, storiesQuery]);
  if (postsResult.error) throw postsResult.error;
  if (storiesResult.error) throw storiesResult.error;

  const posts = ((postsResult.data ?? []) as unknown as DbPost[]).map(mapPost);
  const storyRows = (storiesResult.data ?? []) as unknown as DbStory[];
  const groups = new Map<string, StoryGroup>();

  for (const row of storyRows) {
    const author = mapProfile(one(row.author));
    if (!author.id) continue;
    const existing = groups.get(author.id);
    if (existing) {
      existing.items.push(mapStoryItem(row));
    } else {
      groups.set(author.id, {
        id: author.id,
        author,
        items: [mapStoryItem(row)],
      });
    }
  }

  let likedIds: string[] = [];
  let savedIds: string[] = [];
  let followingIds: string[] = [];

  if (currentUserId) {
    const postIds = posts.map((post) => post.id);
    const [likesResult, savesResult, followsResult] = await Promise.all([
      postIds.length
        ? supabase.from("likes").select("post_id").eq("user_id", currentUserId).in("post_id", postIds)
        : Promise.resolve({ data: [], error: null }),
      postIds.length
        ? supabase.from("saves").select("post_id").eq("user_id", currentUserId).in("post_id", postIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("follows").select("following_id").eq("follower_id", currentUserId),
    ]);

    if (likesResult.error) throw likesResult.error;
    if (savesResult.error) throw savesResult.error;
    if (followsResult.error) throw followsResult.error;

    likedIds = ((likesResult.data ?? []) as { post_id: string }[]).map((row) => row.post_id);
    savedIds = ((savesResult.data ?? []) as { post_id: string }[]).map((row) => row.post_id);
    followingIds = ((followsResult.data ?? []) as { following_id: string }[]).map(
      (row) => row.following_id,
    );
  }

  return {
    posts,
    stories: [...groups.values()],
    likedIds,
    savedIds,
    followingIds,
  };
}

export async function fetchProfileById(
  supabase: SupabaseClient,
  id: string,
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return mapProfile(data as DbProfile | null);
}

export async function fetchProfileByHandle(
  supabase: SupabaseClient,
  handle: string,
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data as DbProfile) : null;
}

type AuthMetadata = {
  handle?: string;
  display_name?: string;
  full_name?: string;
  name?: string;
  preferred_username?: string;
  avatar_url?: string;
  picture?: string;
};

export type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (clean) return clean;
  }
  return "";
}

function metadataHandle(metadata: AuthMetadata, email?: string | null) {
  const base = normalizeHandle(
    firstText(
      metadata.handle,
      email ? email.split("@")[0] : "",
      metadata.preferred_username,
      metadata.full_name,
      metadata.name,
      "velo",
    ),
  ).slice(0, 20);

  return base.length >= 3 ? base : "velo";
}

/**
 * Perfil mínimo a partir dos metadados do Auth. É usado como fallback quando a
 * sessão entrou, mas a leitura da tabela `profiles` falhou; assim um problema
 * de RLS ou de schema não transforma um login válido em erro de senha.
 */
export function profileFromAuthUser(user: AuthUserLike): Profile {
  const metadata = (user.user_metadata ?? {}) as AuthMetadata;
  const displayName = firstText(
    metadata.display_name,
    metadata.full_name,
    metadata.name,
    metadata.preferred_username,
    user.email ? user.email.split("@")[0] : "",
    "Novo perfil",
  ).slice(0, 60);

  return {
    id: user.id,
    handle: metadataHandle(metadata, user.email),
    displayName,
    avatarUrl: firstText(metadata.avatar_url, metadata.picture),
    bio: "",
  };
}

/**
 * Garante que a conta autenticada tenha uma linha em `profiles`.
 *
 * O trigger do schema cria o perfil no signup. Este fallback cobre projetos que
 * ainda não rodaram o schema atualizado e também falhas pontuais do trigger,
 * usando os metadados do provedor (nome e foto do Google) quando disponíveis.
 */
export async function ensureProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Profile> {
  const existing = await fetchProfileById(supabase, userId);
  if (existing.id) return existing;

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const authUser = data.user;
  if (!authUser || authUser.id !== userId) {
    throw new Error("Sua sessão expirou. Entre de novo.");
  }

  const metadata = (authUser.user_metadata ?? {}) as AuthMetadata;
  const displayName = firstText(
    metadata.display_name,
    metadata.full_name,
    metadata.name,
    metadata.preferred_username,
    authUser.email ? authUser.email.split("@")[0] : "",
    "Novo perfil",
  ).slice(0, 60);
  const avatarUrl = firstText(metadata.avatar_url, metadata.picture) || null;
  const baseHandle = metadataHandle(metadata, authUser.email);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const handle =
      attempt === 0
        ? baseHandle
        : `${baseHandle.slice(0, 19)}${Math.random().toString(36).slice(2, 5)}`;

    const { data: created, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        handle,
        display_name: displayName,
        bio: "",
        avatar_url: avatarUrl,
      })
      .select(PROFILE_FIELDS)
      .single();

    if (!insertError) return mapProfile(created as DbProfile);

    if (insertError.code === "23505") {
      // O trigger pode ter criado o perfil entre a leitura e o insert.
      const raced = await fetchProfileById(supabase, userId);
      if (raced.id) return raced;
      continue;
    }

    throw insertError;
  }

  throw new Error("Não foi possível criar seu perfil. Tente entrar de novo.");
}

export async function fetchComments(
  supabase: SupabaseClient,
  postId: string,
): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as DbComment[]).map(mapComment);
}

export async function fetchCommentById(
  supabase: SupabaseClient,
  commentId: string,
): Promise<Comment | null> {
  const { data, error } = await supabase
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("id", commentId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapComment(data as unknown as DbComment) : null;
}

export type PublicProfileBundle = {
  profile: Profile;
  posts: Post[];
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
};

export async function fetchPublicProfile(
  supabase: SupabaseClient,
  handle: string,
  currentUserId?: string,
): Promise<PublicProfileBundle | null> {
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("handle", handle)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) return null;

  const profile = mapProfile(profileRow as DbProfile);
  const [postsResult, followersResult, followingResult, followResult] = await Promise.all([
    supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", profile.id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", profile.id),
    currentUserId
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", currentUserId)
          .eq("following_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (postsResult.error) throw postsResult.error;
  if (followersResult.error) throw followersResult.error;
  if (followingResult.error) throw followingResult.error;
  if (followResult.error) throw followResult.error;

  return {
    profile: {
      ...profile,
      followersCount: followersResult.count ?? 0,
      followingCount: followingResult.count ?? 0,
    },
    posts: ((postsResult.data ?? []) as unknown as DbPost[]).map(mapPost),
    followersCount: followersResult.count ?? 0,
    followingCount: followingResult.count ?? 0,
    isFollowing: Boolean(followResult.data),
  };
}

export async function uploadPublicFile(
  supabase: SupabaseClient,
  userId: string,
  file: Blob,
  extension: string,
  prefix: string,
) {
  const safePrefix = prefix.replace(/[^a-z0-9/-]/gi, "").replace(/^\/+|\/+$/g, "") || "uploads";
  const path = `${userId}/${safePrefix}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return { url: data.publicUrl, path };
}
