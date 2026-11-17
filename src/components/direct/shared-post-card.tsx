"use client";

import { Image as ImageIcon, Play } from "lucide-react";
import type { Post } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SharedPostCard({
  post,
  onOpen,
  own = false,
}: {
  post: Post;
  onOpen: () => void;
  own?: boolean;
}) {
  const poster =
    post.posterUrl || (post.mediaType === "image" ? post.mediaUrl : null);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "mt-2 block w-full overflow-hidden rounded-[14px] border text-left transition active:scale-[0.99]",
        own ? "border-black/15 bg-black/[0.06]" : "border-line bg-paper",
      )}
    >
      <span className="relative block aspect-[4/5] max-h-[260px] w-full overflow-hidden bg-black/10">
        {poster ? (
          <img
            src={poster}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <video
            src={post.mediaUrl}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/15">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
            {post.mediaType === "video" ? (
              <Play className="size-4" fill="currentColor" />
            ) : (
              <ImageIcon className="size-4" strokeWidth={1.7} />
            )}
          </span>
        </span>
      </span>
      <span className="block p-3">
        <span className="line-clamp-2 block text-[12px] font-medium leading-snug">
          {post.caption || "Post do velo"}
        </span>
        <span
          className={cn(
            "mt-1 block text-[10px]",
            own ? "text-black/55" : "text-muted",
          )}
        >
          @{post.author.handle}
        </span>
      </span>
    </button>
  );
}
