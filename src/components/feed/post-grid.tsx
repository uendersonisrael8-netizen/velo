"use client";

import { Heart, Image as ImageIcon, MessageCircle, Play } from "lucide-react";
import type { Post } from "@/lib/types";
import { cn, formatCompact } from "@/lib/utils";

export function PostGrid({
  posts,
  onSelect,
  className,
}: {
  posts: Post[];
  onSelect: (post: Post) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2.5",
        className,
      )}
    >
      {posts.map((post, index) => (
        <button
          key={post.id}
          type="button"
          onClick={() => onSelect(post)}
          aria-label={`Abrir ${post.mediaType === "video" ? "vídeo" : "foto"} de @${post.author.handle}`}
          className="group relative block aspect-[3/4] overflow-hidden rounded-[5px] border border-line/60 bg-surface text-left focus-visible:z-10"
        >
          {post.mediaType === "image" || post.posterUrl ? (
            <img
              src={post.posterUrl ?? post.mediaUrl}
              alt=""
              className="absolute inset-0 size-full object-cover transition duration-700 ease-out group-hover:scale-[1.045]"
              loading={index < 6 ? "eager" : "lazy"}
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : (
            <video
              src={post.mediaUrl}
              className="absolute inset-0 size-full object-cover opacity-70"
              muted
              playsInline
              preload="metadata"
            />
          )}

          <span className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-black/25" />

          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-1.5 py-1 text-white/80 backdrop-blur-md">
            {post.mediaType === "video" ? (
              <Play className="size-2.5" fill="currentColor" strokeWidth={0} />
            ) : (
              <ImageIcon className="size-2.5" strokeWidth={2} />
            )}
          </span>

          <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pb-2.5 pt-8 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            {post.caption ? (
              <span className="line-clamp-1 text-[10px] leading-snug text-white/90">
                {post.caption}
              </span>
            ) : null}
            <span className="mt-1.5 flex items-center gap-3 text-[9px] text-white/70">
              <span className="flex items-center gap-1">
                <Heart className="size-2.5" strokeWidth={2} />
                {formatCompact(post.likesCount)}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="size-2.5" strokeWidth={2} />
                {formatCompact(post.commentsCount)}
              </span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
