import type { MediaType } from "@/lib/types";

// O bucket do Supabase aceita arquivos de até 50 MB (ver supabase/schema.sql).
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 180;

const VIDEO_TYPES = ["video/mp4", "video/webm"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_EXTENSIONS = ["mp4", "webm"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

export function extensionOf(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

export function mediaKindOf(file: File): MediaType | null {
  const extension = extensionOf(file);
  if (VIDEO_TYPES.includes(file.type) || VIDEO_EXTENSIONS.includes(extension)) return "video";
  if (IMAGE_TYPES.includes(file.type) || IMAGE_EXTENSIONS.includes(extension)) return "image";
  return null;
}

export function validateMediaFile(file: File) {
  const mediaType = mediaKindOf(file);
  if (!mediaType) {
    throw new Error("Escolha um vídeo MP4/WebM ou uma imagem JPG, PNG ou WebP.");
  }

  const max = mediaType === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) {
    throw new Error(
      mediaType === "video"
        ? `O vídeo passa de ${Math.round(max / (1024 * 1024))} MB. Comprima antes de publicar.`
        : `A imagem passa de ${Math.round(max / (1024 * 1024))} MB. Escolha um arquivo menor.`,
    );
  }

  if (file.size === 0) {
    throw new Error("Esse arquivo parece estar vazio.");
  }

  return mediaType;
}

export function validateImageFile(file: File, maxBytes = 2 * 1024 * 1024) {
  if (!IMAGE_TYPES.includes(file.type) && !IMAGE_EXTENSIONS.includes(extensionOf(file))) {
    throw new Error("Use uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > maxBytes) {
    throw new Error(`A imagem precisa ter no máximo ${Math.round(maxBytes / (1024 * 1024))} MB.`);
  }
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      callback();
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("Não conseguimos ler a duração do vídeo.")));
    }, 12000);

    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      finish(() => resolve(duration));
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      finish(() => reject(new Error("Não conseguimos abrir esse vídeo. Tente outro arquivo.")));
    };
  });
}

export async function extractVideoPoster(
  file: File,
  atSecond = 0.8,
): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  let settled = false;

  const cleanup = () => {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  };

  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Tempo esgotado ao gerar a capa do vídeo."));
      }, 12000);

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        cleanup();
        callback();
      };

      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      video.onloadedmetadata = () => {
        const target = Math.min(
          Math.max(atSecond, 0.2),
          Math.max((video.duration || 2) - 0.25, 0.2),
        );
        try {
          video.currentTime = target;
        } catch {
          finish(() => resolve(null));
        }
      };

      video.onseeked = () => {
        try {
          const maxWidth = 900;
          const ratio = video.videoWidth / Math.max(video.videoHeight, 1);
          const width = Math.min(maxWidth, video.videoWidth || maxWidth);
          const height = Math.round(width / (ratio || 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(width, 1);
          canvas.height = Math.max(height, 1);
          const context = canvas.getContext("2d");
          if (!context) {
            finish(() => resolve(null));
            return;
          }
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => finish(() => resolve(blob)),
            "image/jpeg",
            0.82,
          );
        } catch {
          finish(() => resolve(null));
        }
      };

      video.onerror = () => {
        finish(() => resolve(null));
      };
    });
  } catch {
    return null;
  }
}

export function readImageAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não conseguimos ler essa imagem."));
    reader.readAsDataURL(file);
  });
}

export function compressImageFile(
  file: File,
  maxDimension = 512,
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => URL.revokeObjectURL(url);

    image.onload = () => {
      try {
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          cleanup();
          reject(new Error("Não conseguimos processar essa imagem."));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error("Não conseguimos processar essa imagem."));
          },
          "image/jpeg",
          quality,
        );
      } catch {
        cleanup();
        reject(new Error("Não conseguimos processar essa imagem."));
      }
    };

    image.onerror = () => {
      cleanup();
      reject(new Error("Não conseguimos abrir essa imagem."));
    };

    image.src = url;
  });
}
