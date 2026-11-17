export type Theme = "dark" | "light";
export type MediaType = "video" | "image";

export type Profile = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  link?: string | null;
  location?: string | null;
  followersCount?: number;
  followingCount?: number;
};

export type Post = {
  id: string;
  author: Profile;
  mediaType: MediaType;
  mediaUrl: string;
  posterUrl?: string | null;
  caption: string;
  tags: string[];
  location?: string | null;
  audio?: string | null;
  likesCount: number;
  commentsCount: number;
  savesCount: number;
  createdAt: string;
  aspect?: "portrait" | "landscape" | "square";
};

export type Comment = {
  id: string;
  postId: string;
  author: Profile;
  body: string;
  createdAt: string;
};

export type StoryItem = {
  id: string;
  mediaType: MediaType;
  mediaUrl: string;
  posterUrl?: string | null;
  caption?: string | null;
  createdAt: string;
};

export type StoryGroup = {
  id: string;
  author: Profile;
  items: StoryItem[];
};

export type DirectMessage = {
  id: string;
  conversationId: string;
  sender: Profile;
  body: string;
  post: Post | null;
  createdAt: string;
};

export type DirectConversation = {
  id: string;
  participant: Profile;
  lastMessage: {
    body: string;
    postId: string | null;
    mediaType: MediaType | null;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
};

export type NewPostInput = {
  file: File;
  caption: string;
  tags: string[];
  location?: string;
  audio?: string;
  posterBlob?: Blob | null;
};

export type ProfileUpdate = {
  displayName: string;
  handle: string;
  bio: string;
  link?: string;
  location?: string;
  avatarFile?: File | null;
  removeAvatar?: boolean;
};

export type AuthSignUpInput = {
  displayName: string;
  handle: string;
  email: string;
  password: string;
};

export type ToastKind = "default" | "success" | "error";
