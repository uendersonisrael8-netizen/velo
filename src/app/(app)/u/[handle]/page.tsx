import type { Metadata } from "next";
import { cache } from "react";
import { PublicProfileView } from "@/components/profile/public-profile-view";
import { buildPageMetadata, serializeJsonLd } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { fetchProfileByHandle } from "@/lib/supabase/data";
import {
  createSupabaseServerClient,
  isSupabaseServerConfigured,
} from "@/lib/supabase/server";
import { normalizeHandle } from "@/lib/utils";

type Params = { handle: string };

const getProfile = cache(async (handle: string) => {
  if (!handle || !isSupabaseServerConfigured) return null;

  try {
    const supabase = await createSupabaseServerClient();
    return await fetchProfileByHandle(supabase, handle);
  } catch {
    // Metadados nunca devem derrubar a página do perfil.
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { handle: rawHandle } = await params;
  const handle = normalizeHandle(rawHandle);
  const profile = await getProfile(handle);

  if (!profile) {
    return {
      title: "Perfil não encontrado",
      description: `O perfil @${handle || "desconhecido"} não foi encontrado no velo.`,
      robots: { index: false, follow: true },
    };
  }

  return buildPageMetadata({
    title: `${profile.displayName} (@${profile.handle})`,
    description:
      profile.bio ||
      `Conheça @${profile.handle} no velo — vídeos curtos, fotografia e momentos.`,
    path: `/u/${profile.handle}`,
    ogTitle: `${profile.displayName} (@${profile.handle}) · velo.`,
    keywords: [profile.handle, profile.displayName],
    type: "profile",
  });
}

export default async function PublicProfilePage({ params }: { params: Promise<Params> }) {
  const { handle: rawHandle } = await params;
  const handle = normalizeHandle(rawHandle);
  const profile = await getProfile(handle);

  const jsonLd = profile
    ? {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        url: `${SITE_URL}/u/${profile.handle}`,
        mainEntity: {
          "@type": "Person",
          name: profile.displayName,
          alternateName: `@${profile.handle}`,
          description: profile.bio || undefined,
          image: profile.avatarUrl || undefined,
          url: `${SITE_URL}/u/${profile.handle}`,
        },
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
      <PublicProfileView handle={handle || rawHandle} />
    </>
  );
}
