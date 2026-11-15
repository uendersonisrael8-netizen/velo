import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";

// O sitemap é regenerado a cada hora para incluir novos perfis públicos.
export const revalidate = 3600;

type ProfileRow = {
  handle: string;
  updated_at: string | null;
};

async function fetchProfileEntries(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return [];

  // Cliente sem cookies: o sitemap lê apenas dados públicos protegidos por RLS.
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const entries: MetadataRoute.Sitemap = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("handle, updated_at")
      .order("handle", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) break;

    const rows = (data ?? []) as ProfileRow[];
    entries.push(
      ...rows.map((row) => ({
        url: `${SITE_URL}/u/${encodeURIComponent(row.handle)}`,
        lastModified: row.updated_at ? new Date(row.updated_at) : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    );

    if (rows.length < pageSize) break;
  }

  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/explore`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  try {
    return [...staticEntries, ...(await fetchProfileEntries())];
  } catch {
    return staticEntries;
  }
}
