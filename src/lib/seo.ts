import type { Metadata } from "next";
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

type PageMetadataInput = {
  title: Metadata["title"];
  description?: string;
  path: string;
  ogTitle?: string;
  keywords?: string[];
  type?: "website" | "profile" | "article";
  noIndex?: boolean;
};

function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

function plainTitle(title: Metadata["title"], fallback: string) {
  if (typeof title === "string") return title;
  if (title && typeof title === "object" && "absolute" in title && title.absolute) {
    return title.absolute;
  }
  return fallback;
}

/**
 * Metadados completos por página: canonical, Open Graph, Twitter Card e
 * diretivas de indexação. O layout raiz define os padrões do site.
 */
export function buildPageMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
  ogTitle,
  keywords = [],
  type = "website",
  noIndex = false,
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const titleText = plainTitle(title, SITE_TITLE);
  const socialTitle = ogTitle ?? titleText;

  return {
    title,
    description,
    keywords: [...new Set([...SITE_KEYWORDS, ...keywords])],
    alternates: { canonical: url },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      locale: "pt_BR",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

/** Serializa JSON-LD com escape de `<` para evitar injeção de markup. */
export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
