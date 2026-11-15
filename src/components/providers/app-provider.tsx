"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useToast } from "@/components/providers/toast-provider";
import { readLocalJSON, writeLocalJSON } from "@/lib/preferences";
import {
  compressImageFile,
  extractVideoPoster,
  extensionOf,
  getVideoDuration,
  MAX_VIDEO_SECONDS,
  validateImageFile,
  validateMediaFile,
} from "@/lib/media";
import { normalizeEmail } from "@/lib/sanitize";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabase/client";
import {
  ensureProfile,
  fetchCommentById,
  fetchComments as fetchLiveComments,
  fetchFeedData,
  mapComment,
  mapPost,
  POST_SELECT,
  profileFromAuthUser,
  uploadPublicFile,
} from "@/lib/supabase/data";
import type {
  AuthSignUpInput,
  Comment,
  NewPostInput,
  Post,
  Profile,
  ProfileUpdate,
  StoryGroup,
  StoryItem,
} from "@/lib/types";
import { normalizeHandle, normalizeTag } from "@/lib/utils";

const STORY_SEEN_KEY = "velo:stories-seen:v1";
const AUDIO_KEY = "velo:audio:v1";

type AudioPrefs = {
  volume: number;
  muted: boolean;
};

type AppContextValue = {
  ready: boolean;
  user: Profile | null;
  posts: Post[];
  stories: StoryGroup[];
  likedIds: string[];
  savedIds: string[];
  followingIds: string[];
  seenStoryIds: string[];
  volume: number;
  muted: boolean;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  ensureAuth: () => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: AuthSignUpInput) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  likePost: (postId: string) => Promise<void>;
  toggleSave: (postId: string) => Promise<boolean>;
  toggleFollow: (profileId: string) => Promise<void>;
  addComment: (postId: string, body: string) => Promise<Comment>;
  fetchComments: (postId: string) => Promise<Comment[]>;
  subscribeToComments: (postId: string, onComment: (comment: Comment) => void) => () => void;
  createPost: (input: NewPostInput) => Promise<Post>;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
  addStory: (file: File, caption: string) => Promise<void>;
  markStorySeen: (groupId: string) => void;
  refresh: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

function withUpdatedAuthor(post: Post, author: Profile): Post {
  return post.author.id === author.id ? { ...post, author } : post;
}

function mediaExtension(file: File) {
  const ext = extensionOf(file);
  if (["mp4", "webm", "jpg", "jpeg", "png", "webp"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }
  if (file.type === "video/webm") return "webm";
  if (file.type === "video/mp4") return "mp4";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function toFriendlyDatabaseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("duplicate key") && message.includes("handle")) {
    return "Esse handle já está em uso. Escolha outro.";
  }
  if (message.includes("row-level security")) {
    return "Você não tem permissão para essa ação.";
  }
  if (message.includes("JWT") || message.includes("session")) {
    return "Sua sessão expirou. Entre de novo.";
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn("[velo] database error:", message);
  }
  return "Não foi possível concluir essa ação. Tente de novo.";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const currentUserIdRef = useRef<string | null>(null);

  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [user, setUser] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [seenStoryIds, setSeenStoryIds] = useState<string[]>([]);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(true);
  const [audioHydrated, setAudioHydrated] = useState(false);

  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // Browser-only preferences. Content and social data never live here.
  /* eslint-disable react-hooks/set-state-in-effect -- hydrate browser-only preferences on mount */
  useEffect(() => {
    try {
      const seen = readLocalJSON<string[]>(STORY_SEEN_KEY, []);
      if (Array.isArray(seen)) setSeenStoryIds(seen);
      const audio = readLocalJSON<AudioPrefs | null>(AUDIO_KEY, null);
      if (audio && typeof audio.volume === "number") {
        setVolumeState(Math.min(1, Math.max(0, audio.volume)));
        setMuted(Boolean(audio.muted));
      }
    } catch {
      // defaults are fine
    }
    setAudioHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Só grava depois de ler a preferência salva. Sem essa guarda, o primeiro
  // render (sempre mudo) sobrescreveria o localStorage antes da hidratação.
  useEffect(() => {
    if (!audioHydrated) return;
    writeLocalJSON(AUDIO_KEY, { volume, muted });
  }, [audioHydrated, muted, volume]);

  const applyFeed = useCallback(
    (data: Awaited<ReturnType<typeof fetchFeedData>>) => {
      setPosts(data.posts);
      setStories(data.stories);
      setLikedIds(data.likedIds);
      setSavedIds(data.savedIds);
      setFollowingIds(data.followingIds);
    },
    [],
  );

  // Visitantes também veem o feed real. A leitura pública é garantida pela RLS;
  // likes, saves e follows só são consultados quando existe sessão.
  const loadPublicFeed = useCallback(
    async (supabase: SupabaseClient) => {
      const feed = await fetchFeedData(supabase);
      applyFeed(feed);
    },
    [applyFeed],
  );

  const syncLiveSession = useCallback(
    async (supabase: SupabaseClient, userId: string) => {
      const profile = await ensureProfile(supabase, userId);
      setUser(profile);

      try {
        const feed = await fetchFeedData(supabase, userId);
        applyFeed(feed);
      } catch (error) {
        console.error(error);
        toast("Seu perfil carregou, mas o feed não. Tente atualizar em instantes.", "error");
      }
    },
    [applyFeed, toast],
  );

  // Restore the Supabase session, hydrate the feed and listen for auth changes.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabaseRef.current = supabase;
    let active = true;
    let authSubscription: { unsubscribe: () => void } | null = null;
    let commentsChannel: ReturnType<SupabaseClient["channel"]> | null = null;

    const boot = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!active) return;

        if (session?.user) {
          try {
            await syncLiveSession(supabase, session.user.id);
          } catch (error) {
            console.error(error);
            if (active) {
              toast(
                "Sua sessão existe, mas o perfil não carregou. Confira se o schema.sql foi aplicado.",
                "error",
              );
            }
          }
        } else {
          setUser(null);
          setLikedIds([]);
          setSavedIds([]);
          setFollowingIds([]);
          await loadPublicFeed(supabase);
        }
      } catch (error) {
        console.error(error);
        if (active) {
          toast(
            "Não foi possível falar com o Supabase. Confira a URL, a anon key e o schema.sql.",
            "error",
          );
        }
      } finally {
        if (active) setReady(true);
      }

      if (!active) return;

      commentsChannel = supabase
        .channel("velo-comments-counter")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "comments" },
          (payload) => {
            const row = payload.new as { post_id?: string; author_id?: string };
            if (!row.post_id || row.author_id === currentUserIdRef.current) return;
            setPosts((current) =>
              current.map((post) =>
                post.id === row.post_id
                  ? { ...post, commentsCount: post.commentsCount + 1 }
                  : post,
              ),
            );
          },
        )
        .subscribe();

      const { data: authData } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          setUser(null);
          setLikedIds([]);
          setSavedIds([]);
          setFollowingIds([]);
          void loadPublicFeed(supabase).catch((error) => {
            console.error(error);
          });
          return;
        }

        if (event === "SIGNED_IN" && session?.user && currentUserIdRef.current !== session.user.id) {
          void syncLiveSession(supabase, session.user.id).catch((error) => {
            console.error(error);
            toast("Não foi possível carregar sua conta.", "error");
          });
        }
      });
      authSubscription = authData.subscription;
    };

    void boot();

    return () => {
      active = false;
      authSubscription?.unsubscribe();
      if (commentsChannel) void supabase.removeChannel(commentsChannel);
    };
  }, [loadPublicFeed, syncLiveSession, toast]);

  const ensureAuth = useCallback(() => {
    if (user) return true;
    toast("Entre na sua conta para continuar.", "error");
    router.push("/login");
    return false;
  }, [router, toast, user]);

  const syncBrowserSession = useCallback(async (supabase: SupabaseClient) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return true;

    // A rota server-side já gravou os cookies, mas o storage do browser pode
    // ainda estar com o snapshot anterior. refreshSession() força a leitura do
    // refresh token recém-gravado antes de buscarmos perfil e feed.
    const refreshed = await supabase.auth.refreshSession();
    return !refreshed.error;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = supabaseRef.current ?? getSupabaseBrowserClient();
      if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: normalizeEmail(email), password }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        user?: { id: string; email: string };
      } | null;

      if (!response.ok || !payload?.ok || !payload.user?.id) {
        throw new Error(payload?.error ?? "Não foi possível entrar. Tente de novo.");
      }

      // A rota grava os cookies de sessão. getSession() lê o document.cookie
      // atualizado e garante que o browser client já enxergue o usuário antes
      // de buscarmos perfil e feed.
      if (!(await syncBrowserSession(supabase))) {
        // Último recurso: recarrega a página para o boot do AppProvider ler
        // os cookies recém-gravados. Evita mostrar erro de senha depois de
        // uma autenticação que já foi aceita pelo servidor.
        if (typeof window !== "undefined") window.location.reload();
        return;
      }

      try {
        await syncLiveSession(supabase, payload.user.id);
      } catch (profileError) {
        console.error(profileError);
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          setUser(profileFromAuthUser(authUser.user));
        } else {
          setUser({
            id: payload.user.id,
            handle: normalizeHandle(payload.user.email.split("@")[0] ?? "velo"),
            displayName: payload.user.email.split("@")[0] || "Novo perfil",
            avatarUrl: "",
            bio: "",
          });
        }
        toast(
          "Você entrou, mas seu perfil não carregou por completo. Tente atualizar a página.",
          "error",
        );
      }
      setReady(true);
    },
    [syncBrowserSession, syncLiveSession, toast],
  );

  const signUp = useCallback(
    async (input: AuthSignUpInput) => {
      const supabase = supabaseRef.current ?? getSupabaseBrowserClient();
      if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          displayName: input.displayName,
          handle: normalizeHandle(input.handle),
          email: normalizeEmail(input.email),
          password: input.password,
          confirmPassword: input.password,
          terms: true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        needsConfirmation?: boolean;
        user?: { id: string; email: string } | null;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Não foi possível criar sua conta. Tente de novo.");
      }

      if (payload.needsConfirmation || !payload.user?.id) {
        return { needsConfirmation: true };
      }

      if (!(await syncBrowserSession(supabase))) {
        if (typeof window !== "undefined") window.location.reload();
        return { needsConfirmation: false };
      }

      try {
        await syncLiveSession(supabase, payload.user.id);
      } catch (profileError) {
        console.error(profileError);
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
          setUser(profileFromAuthUser(authUser.user));
        } else {
          setUser({
            id: payload.user.id,
            handle: normalizeHandle(payload.user.email.split("@")[0] ?? "velo"),
            displayName: payload.user.email.split("@")[0] || "Novo perfil",
            avatarUrl: "",
            bio: "",
          });
        }
        toast(
          "Sua conta foi criada, mas o perfil não carregou por completo. Tente atualizar a página.",
          "error",
        );
      }
      setReady(true);
      return { needsConfirmation: false };
    },
    [syncBrowserSession, syncLiveSession, toast],
  );

  const signOut = useCallback(async () => {
    const supabase = supabaseRef.current ?? getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) toast("Saímos neste dispositivo, mas o servidor não respondeu.", "error");
    }
    setUser(null);
    setLikedIds([]);
    setSavedIds([]);
    setFollowingIds([]);

    if (supabase) {
      try {
        await loadPublicFeed(supabase);
      } catch (error) {
        console.error(error);
        setPosts([]);
        setStories([]);
      }
    } else {
      setPosts([]);
      setStories([]);
    }
  }, [loadPublicFeed, toast]);

  const setVolume = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    setVolumeState(next);
    setMuted(next === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (muted && volume === 0) setVolumeState(0.8);
    setMuted((current) => !current);
  }, [muted, volume]);

  const toggleLike = useCallback(
    async (postId: string) => {
      if (!ensureAuth()) return;
      const activeUser = user;
      if (!activeUser) return;
      const wasLiked = likedIds.includes(postId);
      const nextLiked = wasLiked
        ? likedIds.filter((id) => id !== postId)
        : [...likedIds, postId];
      setLikedIds(nextLiked);
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                likesCount: Math.max(0, post.likesCount + (wasLiked ? -1 : 1)),
              }
            : post,
        ),
      );

      const supabase = supabaseRef.current;
      if (!supabase) return;
      const result = wasLiked
        ? await supabase
            .from("likes")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", activeUser.id)
        : await supabase.from("likes").insert({ post_id: postId, user_id: activeUser.id });

      if (result.error) {
        setLikedIds(likedIds);
        setPosts((current) =>
          current.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  likesCount: Math.max(0, post.likesCount + (wasLiked ? 1 : -1)),
                }
              : post,
          ),
        );
        toast(toFriendlyDatabaseError(result.error), "error");
      }
    },
    [ensureAuth, likedIds, toast, user],
  );

  const likePost = useCallback(
    async (postId: string) => {
      if (!likedIds.includes(postId)) {
        await toggleLike(postId);
      }
    },
    [likedIds, toggleLike],
  );

  const toggleSave = useCallback(
    async (postId: string): Promise<boolean> => {
      if (!ensureAuth()) return false;
      const activeUser = user;
      if (!activeUser) return false;
      const wasSaved = savedIds.includes(postId);
      const nextSaved = wasSaved
        ? savedIds.filter((id) => id !== postId)
        : [...savedIds, postId];
      setSavedIds(nextSaved);
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                savesCount: Math.max(0, post.savesCount + (wasSaved ? -1 : 1)),
              }
            : post,
        ),
      );

      const supabase = supabaseRef.current;
      if (!supabase) return false;
      const result = wasSaved
        ? await supabase
            .from("saves")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", activeUser.id)
        : await supabase.from("saves").insert({ post_id: postId, user_id: activeUser.id });

      if (result.error) {
        setSavedIds(savedIds);
        setPosts((current) =>
          current.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  savesCount: Math.max(0, post.savesCount + (wasSaved ? 1 : -1)),
                }
              : post,
          ),
        );
        toast(toFriendlyDatabaseError(result.error), "error");
        return false;
      }

      return true;
    },
    [ensureAuth, savedIds, toast, user],
  );

  const toggleFollow = useCallback(
    async (profileId: string) => {
      if (!ensureAuth()) return;
      const activeUser = user;
      if (!activeUser || profileId === activeUser.id) return;
      const wasFollowing = followingIds.includes(profileId);
      const nextFollowing = wasFollowing
        ? followingIds.filter((id) => id !== profileId)
        : [...followingIds, profileId];
      setFollowingIds(nextFollowing);

      const supabase = supabaseRef.current;
      if (!supabase) return;
      const result = wasFollowing
        ? await supabase
            .from("follows")
            .delete()
            .eq("follower_id", activeUser.id)
            .eq("following_id", profileId)
        : await supabase.from("follows").insert({
            follower_id: activeUser.id,
            following_id: profileId,
          });

      if (result.error) {
        setFollowingIds(followingIds);
        toast(toFriendlyDatabaseError(result.error), "error");
      }
    },
    [ensureAuth, followingIds, toast, user],
  );

  const addComment = useCallback(
    async (postId: string, body: string) => {
      if (!ensureAuth()) throw new Error("Faça login para comentar.");
      const activeUser = user;
      if (!activeUser) throw new Error("Faça login para comentar.");
      const cleanBody = body.trim();
      if (!cleanBody) throw new Error("Escreva algo para comentar.");

      const supabase = supabaseRef.current;
      if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
      const { data, error } = await supabase
        .from("comments")
        .insert({ post_id: postId, author_id: activeUser.id, body: cleanBody })
        .select(
          "id, post_id, body, created_at, author:profiles!comments_author_id_fkey(id, handle, display_name, avatar_url, bio, link, location)",
        )
        .single();
      if (error) throw new Error(toFriendlyDatabaseError(error));
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? { ...post, commentsCount: post.commentsCount + 1 }
            : post,
        ),
      );
      return mapComment(data as Parameters<typeof mapComment>[0]);
    },
    [ensureAuth, user],
  );

  const fetchCommentsForPost = useCallback(async (postId: string) => {
    const supabase = supabaseRef.current;
    if (!supabase) return [];
    return fetchLiveComments(supabase, postId);
  }, []);

  const subscribeToComments = useCallback(
    (postId: string, onComment: (comment: Comment) => void) => {
      const supabase = supabaseRef.current;
      if (!supabase) return () => undefined;
      const channel = supabase
        .channel(`post-comments-${postId}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "comments",
            filter: `post_id=eq.${postId}`,
          },
          (payload) => {
            const row = payload.new as { id?: string };
            if (!row.id) return;
            void fetchCommentById(supabase, row.id)
              .then((comment) => {
                if (comment) onComment(comment);
              })
              .catch(() => undefined);
          },
        )
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },
    [],
  );

  const createPost = useCallback(
    async (input: NewPostInput) => {
      if (!ensureAuth()) throw new Error("Faça login para publicar.");
      const activeUser = user;
      if (!activeUser) throw new Error("Faça login para publicar.");
      const mediaType = validateMediaFile(input.file);
      if (mediaType === "video") {
        const duration = await getVideoDuration(input.file);
        if (duration > MAX_VIDEO_SECONDS) {
          throw new Error("Vídeos do feed têm até 3 minutos.");
        }
      }

      const caption = input.caption.trim();
      const tags = [...new Set(input.tags.map(normalizeTag).filter(Boolean))].slice(0, 8);

      const supabase = supabaseRef.current;
      if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
      const uploaded: string[] = [];

      try {
        const mediaUpload = await uploadPublicFile(
          supabase,
          activeUser.id,
          input.file,
          mediaExtension(input.file),
          "posts",
        );
        uploaded.push(mediaUpload.path);

        let posterUrl: string | null = mediaType === "image" ? mediaUpload.url : null;
        if (mediaType === "video" && input.posterBlob) {
          const posterUpload = await uploadPublicFile(
            supabase,
            activeUser.id,
            input.posterBlob,
            "jpg",
            "posters",
          );
          uploaded.push(posterUpload.path);
          posterUrl = posterUpload.url;
        }

        const { data, error } = await supabase
          .from("posts")
          .insert({
            author_id: activeUser.id,
            media_type: mediaType,
            media_url: mediaUpload.url,
            poster_url: posterUrl,
            caption,
            tags,
            location: input.location?.trim() || null,
            audio: input.audio?.trim() || null,
          })
          .select(POST_SELECT)
          .single();

        if (error) throw error;
        const post = mapPost(data as Parameters<typeof mapPost>[0]);
        setPosts((current) => [post, ...current]);
        return post;
      } catch (error) {
        if (uploaded.length) {
          await supabase.storage.from("media").remove(uploaded).catch(() => undefined);
        }
        throw new Error(toFriendlyDatabaseError(error));
      }
    },
    [ensureAuth, user],
  );

  const updateProfile = useCallback(
    async (input: ProfileUpdate) => {
      if (!ensureAuth()) throw new Error("Faça login para editar seu perfil.");
      const activeUser = user;
      if (!activeUser) throw new Error("Faça login para editar seu perfil.");

      const displayName = input.displayName.trim();
      const handle = normalizeHandle(input.handle);
      const bio = input.bio.trim();
      const link = input.link?.trim() || null;
      const location = input.location?.trim() || null;

      if (!displayName || displayName.length > 60) throw new Error("Nome inválido.");
      if (handle.length < 3) throw new Error("Escolha um handle com pelo menos 3 caracteres.");
      if (bio.length > 160) throw new Error("A bio pode ter até 160 caracteres.");

      const supabase = supabaseRef.current;
      if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
      let avatarUrl = input.removeAvatar ? null : activeUser.avatarUrl || null;

      if (input.avatarFile) {
        validateImageFile(input.avatarFile, 4 * 1024 * 1024);
        const compressed = await compressImageFile(input.avatarFile, 512, 0.85);
        const upload = await uploadPublicFile(
          supabase,
          activeUser.id,
          compressed,
          "jpg",
          "avatars",
        );
        avatarUrl = upload.url;
      }

      const { data, error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          handle,
          bio,
          link,
          location,
          avatar_url: avatarUrl,
        })
        .eq("id", activeUser.id)
        .select("id, handle, display_name, avatar_url, bio, link, location")
        .single();

      if (error) throw new Error(toFriendlyDatabaseError(error));
      const updated: Profile = {
        ...activeUser,
        displayName: data.display_name,
        handle: data.handle,
        bio: data.bio ?? "",
        link: data.link,
        location: data.location,
        avatarUrl: data.avatar_url || "",
      };
      setUser(updated);
      setPosts((current) => current.map((post) => withUpdatedAuthor(post, updated)));
      setStories((current) =>
        current.map((group) =>
          group.author.id === updated.id ? { ...group, author: updated } : group,
        ),
      );
    },
    [ensureAuth, user],
  );

  const addStory = useCallback(
    async (file: File, caption: string) => {
      if (!ensureAuth()) throw new Error("Faça login para publicar um momento.");
      const activeUser = user;
      if (!activeUser) throw new Error("Faça login para publicar um momento.");
      const mediaType = validateMediaFile(file);
      if (caption.trim().length > 120) throw new Error("A legenda do momento tem até 120 caracteres.");

      let posterBlob: Blob | null = null;
      if (mediaType === "video") {
        const duration = await getVideoDuration(file);
        if (duration > 60) throw new Error("Momentos em vídeo têm até 60 segundos.");
        posterBlob = await extractVideoPoster(file);
      }

      const cleanCaption = caption.trim() || null;

      const supabase = supabaseRef.current;
      if (!supabase) throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
      const uploaded: string[] = [];
      try {
        const mediaUpload = await uploadPublicFile(
          supabase,
          activeUser.id,
          file,
          mediaExtension(file),
          "stories",
        );
        uploaded.push(mediaUpload.path);
        let posterUrl: string | null = mediaType === "image" ? mediaUpload.url : null;
        if (mediaType === "video" && posterBlob) {
          const posterUpload = await uploadPublicFile(
            supabase,
            activeUser.id,
            posterBlob,
            "jpg",
            "story-posters",
          );
          uploaded.push(posterUpload.path);
          posterUrl = posterUpload.url;
        }
        const { data, error } = await supabase
          .from("stories")
          .insert({
            author_id: activeUser.id,
            media_type: mediaType,
            media_url: mediaUpload.url,
            poster_url: posterUrl,
            caption: cleanCaption,
          })
          .select("id, media_type, media_url, poster_url, caption, created_at")
          .single();
        if (error) throw error;
        const item: StoryItem = {
          id: data.id,
          mediaType: data.media_type === "video" ? "video" : "image",
          mediaUrl: data.media_url,
          posterUrl: data.poster_url,
          caption: data.caption,
          createdAt: data.created_at,
        };
        setStories((current) => {
          const existing = current.find((group) => group.author.id === activeUser.id);
          if (existing) {
            return current.map((group) =>
              group.author.id === activeUser.id
                ? { ...group, items: [...group.items, item] }
                : group,
            );
          }
          return [{ id: activeUser.id, author: activeUser, items: [item] }, ...current];
        });
      } catch (error) {
        if (uploaded.length) {
          await supabase.storage.from("media").remove(uploaded).catch(() => undefined);
        }
        throw new Error(toFriendlyDatabaseError(error));
      }
    },
    [ensureAuth, user],
  );

  const markStorySeen = useCallback(
    (groupId: string) => {
      const group = stories.find((item) => item.id === groupId);
      if (!group) return;
      const ids = group.items.map((item) => item.id);
      setSeenStoryIds((current) => {
        const next = [...new Set([...current, ...ids])];
        writeLocalJSON(STORY_SEEN_KEY, next);
        return next;
      });
    },
    [stories],
  );

  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const feed = await fetchFeedData(supabase, user?.id);
    applyFeed(feed);
  }, [applyFeed, user?.id]);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      user,
      posts,
      stories,
      likedIds,
      savedIds,
      followingIds,
      seenStoryIds,
      volume,
      muted,
      setVolume,
      toggleMute,
      ensureAuth,
      signIn,
      signUp,
      signOut,
      toggleLike,
      likePost,
      toggleSave,
      toggleFollow,
      addComment,
      fetchComments: fetchCommentsForPost,
      subscribeToComments,
      createPost,
      updateProfile,
      addStory,
      markStorySeen,
      refresh,
    }),
    [
      addComment,
      addStory,
      createPost,
      ensureAuth,
      fetchCommentsForPost,
      followingIds,
      likedIds,
      likePost,
      markStorySeen,
      muted,
      posts,
      ready,
      refresh,
      savedIds,
      seenStoryIds,
      setVolume,
      signIn,
      signOut,
      signUp,
      stories,
      subscribeToComments,
      toggleFollow,
      toggleLike,
      toggleMute,
      toggleSave,
      updateProfile,
      user,
      volume,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp precisa estar dentro de AppProvider.");
  return context;
}
